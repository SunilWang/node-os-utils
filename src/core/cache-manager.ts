/**
 * 缓存项接口
 */
interface CacheItem<T> {
  /**
   * 缓存值
   */
  value: T;

  /**
   * 过期时间戳
   */
  expiry: number;

  /**
   * 创建时间戳
   */
  created: number;

  /**
   * 访问次数
   */
  accessCount: number;

  /**
   * 最后访问时间
   */
  lastAccessed: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /**
   * 缓存项数量
   */
  size: number;

  /**
   * 缓存命中次数
   */
  hits: number;

  /**
   * 缓存未命中次数
   */
  misses: number;

  /**
   * 命中率
   */
  hitRate: number;

  /**
   * 总内存使用（估算）
   */
  memoryUsage: number;

  /**
   * 过期清理次数
   */
  evictions: number;

  /**
   * 最大缓存大小
   */
  maxSize: number;
}

/**
 * 缓存管理器配置
 */
export interface CacheManagerConfig {
  defaultTTL?: number;
  maxSize?: number;
  cleanupInterval?: number;
  enabled?: boolean;
}

/**
 * 缓存管理器
 *
 * 负责管理监控数据的缓存，提高性能并减少系统调用
 */
export class CacheManager {
  private cache = new Map<string, CacheItem<any>>();
  private defaultTTL: number;
  private maxSize: number;
  private stats: CacheStats;
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupInterval: number;
  private enabled: boolean = true;

  constructor(config: CacheManagerConfig = {}) {
    this.defaultTTL = config.defaultTTL || 5000;
    this.maxSize = config.maxSize || 1000;
    this.cleanupInterval = config.cleanupInterval || 30000;
    this.enabled = config.enabled !== false;
    this.stats = {
      size: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      memoryUsage: 0,
      evictions: 0,
      maxSize: this.maxSize
    };

    // 启动定期清理
    if (this.enabled) {
      this.startCleanup();
    }
  }

  /**
   * 获取缓存值
   */
  get<T>(key: string): T | undefined {
    if (!this.enabled) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    const item = this.cache.get(key);

    if (!item) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateStats();
      return undefined;
    }

    // 更新访问统计
    item.accessCount++;
    item.lastAccessed = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return item.value;
  }

  /**
   * 设置缓存值
   */
  set<T>(key: string, value: T, ttl?: number): void {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    const timeToLive = ttl || this.defaultTTL;

    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const item: CacheItem<T> = {
      value,
      expiry: now + timeToLive,
      created: now,
      accessCount: 1,
      lastAccessed: now
    };

    this.cache.set(key, item);
    this.updateStats();
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.updateStats();
    }
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.stats.evictions += previousSize;
    this.updateStats();
  }

  /**
   * 检查是否存在缓存项
   */
  has(key: string): boolean {
    if (!this.enabled) {
      return false;
    }

    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.updateStats();
      return false;
    }

    return true;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats, maxSize: this.maxSize };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      size: this.cache.size,
      hits: 0,
      misses: 0,
      hitRate: 0,
      memoryUsage: this.estimateMemoryUsage(),
      evictions: 0,
      maxSize: this.maxSize
    };
  }

  /**
   * 获取所有缓存键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存项的详细信息
   */
  getItemInfo(key: string): {
    exists: boolean;
    created?: number;
    expiry?: number;
    accessCount?: number;
    lastAccessed?: number;
    ttl?: number;
  } {
    const item = this.cache.get(key);
    if (!item) {
      return { exists: false };
    }

    const now = Date.now();
    return {
      exists: true,
      created: item.created,
      expiry: item.expiry,
      accessCount: item.accessCount,
      lastAccessed: item.lastAccessed,
      ttl: Math.max(0, item.expiry - now)
    };
  }

  /**
   * 设置默认 TTL
   */
  setDefaultTTL(ttl: number): void {
    this.defaultTTL = ttl;
  }

  /**
   * 获取默认 TTL
   */
  getDefaultTTL(): number {
    return this.defaultTTL;
  }

  /**
   * 启用缓存
   */
  enable(): void {
    this.enabled = true;
    this.startCleanup();
  }

  /**
   * 禁用缓存
   */
  disable(): void {
    this.enabled = false;
    this.clear(); // 清空现有缓存
    this.stopCleanup();
  }

  /**
   * 检查缓存是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 关闭缓存管理器
   */
  destroy(): void {
    this.stopCleanup();
    this.clear();
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    if (this.cleanupTimer || !this.enabled) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // 避免定时器阻止进程退出
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止定期清理
   */
  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 清理过期项
   */
  private cleanup(): void {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of this.cache) {
      if (now > item.expiry) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
      this.stats.evictions += keysToDelete.length;
      this.updateStats();
    }
  }

  /**
   * LRU 淘汰策略
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, item] of this.cache) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.updateStats();
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.stats.memoryUsage = this.estimateMemoryUsage();
    this.updateHitRate();
  }

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * 估算内存使用量
   */
  private estimateMemoryUsage(): number {
    let size = 0;
    for (const [key, item] of this.cache) {
      // 粗略估算：key 长度 + value 序列化长度 + 元数据
      size += key.length * 2; // UTF-16 字符
      try {
        const serialized = JSON.stringify(item.value);
        if (typeof serialized === 'string') {
          size += serialized.length * 2;
        }
      } catch {
        // 无法序列化时忽略该项大小
      }
      size += 64; // 元数据估算
    }
    return size;
  }
}
