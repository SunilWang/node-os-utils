import { EventEmitter } from 'events';
import { MonitorResult, MonitorConfig, MonitorSubscription } from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from './cache-manager';
import { MonitorError, ErrorCode } from '../types/errors';

/**
 * 监控订阅实现
 */
class MonitorSubscriptionImpl implements MonitorSubscription {
  private active: boolean = true;
  private paused: boolean = false;
  private timer?: NodeJS.Timeout;
  /** 运行锁：上一次回调未执行完成时跳过本次 tick，避免回调堆积 */
  private running: boolean = false;

  constructor(
    private callback: Function,
    private interval: number,
    private monitorFn: () => Promise<any>,
    private errorHandler?: (error: Error) => void
  ) {
    this.start();
  }

  unsubscribe(): void {
    this.stop();
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  pause(): void {
    if (this.active && !this.paused) {
      this.stop();
      this.paused = true;
    }
  }

  resume(): void {
    if (this.active && this.paused) {
      this.start();
      this.paused = false;
    }
  }

  getStatus(): 'active' | 'paused' | 'stopped' {
    if (!this.active) return 'stopped';
    return this.paused ? 'paused' : 'active';
  }

  private start(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(async () => {
      // 上一次回调尚未完成时跳过本次 tick，避免慢回调并发堆积
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        const result = await this.monitorFn();
        // pause/unsubscribe 后丢弃 in-flight 结果，不再触发用户回调
        if (this.active && !this.paused) {
          this.callback(result);
        }
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler(error as Error);
        }
      } finally {
        this.running = false;
      }
    }, this.interval);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * 基础监控器抽象类
 *
 * 提供所有监控器的通用功能，包括缓存、事件、配置管理等
 */
export abstract class BaseMonitor<T> extends EventEmitter {
  protected config: MonitorConfig;
  protected adapter: PlatformAdapter;
  protected cache: CacheManager;
  protected subscriptions: Set<MonitorSubscription> = new Set();
  /** 缓存是否由本监控器内部创建（外部注入的共享缓存不应随本监控器销毁） */
  private ownsCache: boolean;

  /** 进行中的缓存请求（key -> Promise），用于 in-flight 去重、防止缓存击穿 */
  private inflightRequests = new Map<string, Promise<MonitorResult<any>>>();

  /** 已输出过降级警告的 key 集合（进程级别去重） */
  private static readonly warnedDegradations = new Set<string>();

  /**
   * 输出首次降级警告（相同 key 仅警告一次）
   * 供适配器和监控器在命令执行失败并降级时调用
   * @param key 降级标识，格式 "{monitor}.{type}"，如 "cpu.command_failed"
   * @param reason 人类可读的降级原因
   */
  static warnDegradation(key: string, reason: string): void {
    if (!BaseMonitor.warnedDegradations.has(key)) {
      BaseMonitor.warnedDegradations.add(key);
      const monitor = key.split('.')[0];
      console.warn(
        `[node-os-utils] ${monitor} degraded: ${reason}. Some features may not be available in the current runtime environment.`
      );
    }
  }

  constructor(
    adapter: PlatformAdapter,
    config: MonitorConfig = {},
    cache?: CacheManager
  ) {
    super();
    this.adapter = adapter;
    this.config = { ...this.getDefaultConfig(), ...config };
    this.ownsCache = !cache;
    this.cache = cache || new CacheManager({
      defaultTTL: this.config.cacheTTL ?? 5000,
      enabled: this.config.cacheEnabled !== false
    });

    // 设置最大监听器数量
    this.setMaxListeners(100);
  }

  // 抽象方法 - 子类必须实现

  /**
   * 获取监控信息
   */
  abstract info(): Promise<MonitorResult<T>>;

  /**
   * 获取默认配置
   */
  protected abstract getDefaultConfig(): MonitorConfig;

  // 通用方法

  /**
   * 配置监控器
   */
  withConfig(config: Partial<MonitorConfig>): this {
    this.config = { ...this.config, ...config };

    // 子类历史上维护了独立配置对象；同步这些对象，避免 withConfig 后读取旧值。
    this.syncSubConfigs(config as Record<string, unknown>);

    // 如果缓存配置发生变化，更新缓存管理器
    if (config.cacheTTL !== undefined && this.cache) {
      this.cache.setDefaultTTL(config.cacheTTL);
    }

    return this;
  }

  /**
   * 同步子配置对象
   *
   * 遍历实例自有可枚举属性，对所有含 cacheTTL 数值字段的对象应用补丁，
   * 避免硬编码各具体监控器的配置属性名
   * @param patch 需要合并到子配置对象的字段
   */
  private syncSubConfigs(patch: Record<string, unknown>): void {
    for (const key of Object.keys(this)) {
      const value = (this as unknown as Record<string, unknown>)[key];
      if (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).cacheTTL === 'number'
      ) {
        Object.assign(value, patch);
      }
    }
  }

  /**
   * 配置缓存
   */
  withCaching(enabled: boolean, ttl?: number): this {
    this.config.cacheEnabled = enabled;
    if (!enabled && this.cache) {
      // 禁用缓存时清空旧数据，避免重新启用后在 TTL 窗口内返回禁用前的结果
      this.cache.clear();
    }
    if (ttl !== undefined) {
      this.config.cacheTTL = ttl;
      // 各具体监控器会从自己的配置对象读取 TTL，必须同步更新，确保参数真正生效。
      this.syncSubConfigs({ cacheTTL: ttl });
      if (this.cache) {
        this.cache.setDefaultTTL(ttl);
      }
    }
    return this;
  }

  /**
   * 实时监控
   */
  monitor(interval: number, callback: (data: T) => void): MonitorSubscription {
    // 非法 interval（非有限数或 <= 0）会被 setInterval 钳制成 1ms 造成热轮询，统一钳到最小值 50ms
    const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : 50;

    const monitorFn = async () => {
      const result = await this.info();
      if (result.success) {
        return result.data;
      } else {
        throw result.error;
      }
    };

    const errorHandler = (error: Error) => {
      // EventEmitter 的 error 事件无监听器时会抛异常，订阅错误应保持静默并交给调用方处理。
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      }
    };

    const subscription = new MonitorSubscriptionImpl(
      callback,
      safeInterval,
      monitorFn,
      errorHandler
    );

    this.subscriptions.add(subscription);

    // 当订阅被取消时，从集合中移除
    const originalUnsubscribe = subscription.unsubscribe.bind(subscription);
    subscription.unsubscribe = () => {
      originalUnsubscribe();
      this.subscriptions.delete(subscription);
    };

    return subscription;
  }

  /**
   * 获取配置
   */
  getConfig(): MonitorConfig {
    return { ...this.config };
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cache ? this.cache.getStats() : null;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * 停止所有监控订阅
   */
  stopAllMonitoring(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
  }

  /**
   * 获取活跃订阅数量
   */
  getActiveSubscriptions(): number {
    return Array.from(this.subscriptions).filter(sub => sub.isActive()).length;
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.stopAllMonitoring();
    // 外部注入的共享 CacheManager 由调用方统一管理，仅销毁内部创建的缓存
    if (this.cache && this.ownsCache) {
      this.cache.destroy();
    }
    this.removeAllListeners();
  }

  // 受保护的辅助方法

  /**
   * 获取缓存结果
   */
  protected getCachedResult<R>(key: string): R | undefined {
    if (!this.config.cacheEnabled || !this.cache) {
      return undefined;
    }
    return this.cache.get<R>(key);
  }

  /**
   * 设置缓存结果
   */
  protected setCachedResult<R>(key: string, result: R, ttl?: number): void {
    if (!this.config.cacheEnabled || !this.cache) {
      return;
    }
    this.cache.set(key, result, ttl);
  }

  /**
   * 创建成功结果
   */
  protected createSuccessResult<R>(data: R, cached: boolean = false): MonitorResult<R> {
    return {
      success: true,
      data,
      timestamp: Date.now(),
      cached,
      platform: this.adapter.getPlatform()
    };
  }

  /**
   * 创建失败结果
   */
  protected createErrorResult<R>(error: MonitorError): MonitorResult<R> {
    return {
      success: false,
      error,
      platform: this.adapter.getPlatform(),
      timestamp: Date.now()
    };
  }

  /**
   * 处理错误并转换为 MonitorResult
   */
  protected handleError<R>(error: any): MonitorResult<R> {
    let monitorError: MonitorError;

    if (error instanceof MonitorError) {
      monitorError = error;
    } else if (error instanceof Error) {
      monitorError = new MonitorError(
        error.message,
        ErrorCode.COMMAND_FAILED,
        this.adapter.getPlatform(),
        { originalError: error }
      );
    } else {
      monitorError = new MonitorError(
        'Unknown error occurred',
        ErrorCode.COMMAND_FAILED,
        this.adapter.getPlatform(),
        { error }
      );
    }

    // 发射错误事件
    // EventEmitter 对无监听器的 error 事件会直接抛异常，不能破坏返回 MonitorResult 的契约。
    if (this.listenerCount('error') > 0) {
      this.emit('error', monitorError);
    }

    return this.createErrorResult(monitorError);
  }

  /**
   * 执行带缓存的操作
   *
   * 相同 key 的并发请求复用 in-flight Promise，防止缓存击穿；
   * operation 受 config.timeout 超时约束（默认 10000ms），
   * 超时返回 ErrorCode.TIMEOUT 的失败结果，且错误结果不写入缓存
   * @param cacheKey 缓存键
   * @param operation 实际执行的操作
   * @param ttl 可选的缓存 TTL
   * @returns 包装后的监控结果
   */
  protected async executeWithCache<R>(
    cacheKey: string,
    operation: () => Promise<R>,
    ttl?: number
  ): Promise<MonitorResult<R>> {
    // 尝试从缓存获取
    const cached = this.getCachedResult<R>(cacheKey);
    if (cached !== undefined) {
      return this.createSuccessResult(cached, true);
    }

    // 相同 key 已有进行中的请求时直接复用该 Promise，防止缓存击穿
    const inflight = this.inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<MonitorResult<R>>;
    }

    const request = this.executeAndCache(cacheKey, operation, ttl);
    this.inflightRequests.set(cacheKey, request);

    try {
      return await request;
    } finally {
      // 请求完成后从去重表中移除，后续请求重新走缓存/执行流程
      if (this.inflightRequests.get(cacheKey) === request) {
        this.inflightRequests.delete(cacheKey);
      }
    }
  }

  /**
   * 执行操作并写入缓存（executeWithCache 的内部实现）
   * @param cacheKey 缓存键
   * @param operation 实际执行的操作
   * @param ttl 可选的缓存 TTL
   * @returns 包装后的监控结果
   */
  private async executeAndCache<R>(
    cacheKey: string,
    operation: () => Promise<R>,
    ttl?: number
  ): Promise<MonitorResult<R>> {
    try {
      // 执行操作；config.timeout 在监控操作层生效（默认 10000ms），超时抛出 MonitorError(TIMEOUT)
      const result = await this.executeWithTimeout(operation);

      // 仅缓存成功结果，超时等错误结果不写入缓存
      this.setCachedResult(cacheKey, result, ttl);

      return this.createSuccessResult(result, false);
    } catch (error) {
      return this.handleError<R>(error);
    }
  }

  /**
   * 验证平台支持
   */
  protected validatePlatformSupport(feature: string): void {
    if (!this.adapter.isSupported(feature)) {
      throw MonitorError.createPlatformNotSupported(
        this.adapter.getPlatform(),
        feature
      );
    }
  }

  /**
   * 创建不支持功能的错误
   */
  protected createUnsupportedError(feature: string): MonitorError {
    return MonitorError.createPlatformNotSupported(
      this.adapter.getPlatform(),
      feature
    );
  }

  /**
   * 安全执行异步操作
   */
  protected async safeExecute<R>(
    operation: () => Promise<R>,
    fallback?: R
  ): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw error;
    }
  }

  /**
   * 创建超时 Promise
   */
  protected createTimeoutPromise<R>(timeoutMs: number, errorMessage?: string): Promise<R> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        const error = new MonitorError(
          errorMessage || `Operation timed out after ${timeoutMs}ms`,
          ErrorCode.TIMEOUT,
          this.adapter.getPlatform(),
          { timeout: timeoutMs }
        );
        reject(error);
      }, timeoutMs);
    });
  }

  /**
   * 带超时执行操作
   *
   * 超时时间优先取 timeoutMs，其次 config.timeout，默认 10000ms；
   * 超时时 reject MonitorError(ErrorCode.TIMEOUT)。
   * executeWithCache 通过本方法让 config.timeout 对监控操作生效
   */
  protected async executeWithTimeout<R>(
    operation: () => Promise<R>,
    timeoutMs?: number
  ): Promise<R> {
    const timeout = timeoutMs ?? this.config.timeout ?? 10000;
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<R>((_, reject) => {
      timer = setTimeout(() => {
        reject(new MonitorError(
          `Operation timed out after ${timeout}ms`,
          ErrorCode.TIMEOUT,
          this.adapter.getPlatform(),
          { timeout }
        ));
      }, timeout);
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      // 无论操作成功、失败还是超时，都清理定时器，避免长时间占用事件循环。
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
