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
      try {
        const result = await this.monitorFn();
        this.callback(result);
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler(error as Error);
        }
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

  constructor(
    adapter: PlatformAdapter,
    config: MonitorConfig = {},
    cache?: CacheManager
  ) {
    super();
    this.adapter = adapter;
    this.config = { ...this.getDefaultConfig(), ...config };
    this.cache = cache || new CacheManager({
      defaultTTL: this.config.cacheTTL || 5000,
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
    
    // 如果缓存配置发生变化，更新缓存管理器
    if (config.cacheTTL && this.cache) {
      this.cache.setDefaultTTL(config.cacheTTL);
    }

    return this;
  }

  /**
   * 配置缓存
   */
  withCaching(enabled: boolean, ttl?: number): this {
    this.config.cacheEnabled = enabled;
    if (ttl !== undefined) {
      this.config.cacheTTL = ttl;
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
    const monitorFn = async () => {
      const result = await this.info();
      if (result.success) {
        return result.data;
      } else {
        throw result.error;
      }
    };

    const errorHandler = (error: Error) => {
      this.emit('error', error);
    };

    const subscription = new MonitorSubscriptionImpl(
      callback,
      interval,
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
    if (this.cache) {
      this.cache.destroy();
    }
    this.removeAllListeners();
  }

  // 受保护的辅助方法

  /**
   * 获取缓存结果
   */
  protected getCachedResult<R>(key: string): R | null {
    if (!this.config.cacheEnabled || !this.cache) {
      return null;
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
    this.emit('error', monitorError);

    return this.createErrorResult(monitorError);
  }

  /**
   * 执行带缓存的操作
   */
  protected async executeWithCache<R>(
    cacheKey: string,
    operation: () => Promise<R>,
    ttl?: number
  ): Promise<MonitorResult<R>> {
    try {
      // 尝试从缓存获取
      const cached = this.getCachedResult<R>(cacheKey);
      if (cached !== null) {
        return this.createSuccessResult(cached, true);
      }

      // 执行操作
      const result = await operation();

      // 缓存结果
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
   */
  protected async executeWithTimeout<R>(
    operation: () => Promise<R>,
    timeoutMs?: number
  ): Promise<R> {
    const timeout = timeoutMs || this.config.timeout || 10000;
    
    return Promise.race([
      operation(),
      this.createTimeoutPromise<R>(timeout)
    ]);
  }
}