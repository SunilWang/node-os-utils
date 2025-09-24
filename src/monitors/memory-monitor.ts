import { BaseMonitor } from '../core/base-monitor';
import {
  MonitorResult,
  MemoryConfig,
  MemoryInfo,
  MemoryPressure,
  SwapInfo,
  DataSize
} from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from '../core/cache-manager';

/**
 * 内存监控器
 *
 * 提供内存相关的监控功能，包括内存使用情况、交换空间、内存压力等
 */
export class MemoryMonitor extends BaseMonitor<MemoryInfo> {
  private memoryConfig: MemoryConfig;

  constructor(
    adapter: PlatformAdapter,
    config: MemoryConfig = {},
    cache?: CacheManager
  ) {
    super(adapter, config, cache);
    this.memoryConfig = { ...this.getDefaultConfig(), ...config } as MemoryConfig;
  }

  /**
   * 获取内存基本信息
   */
  async info(): Promise<MonitorResult<MemoryInfo>> {
    const cacheKey = 'memory-info';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('memory.info');

        const rawData = await this.adapter.getMemoryInfo();
        return this.transformMemoryInfo(rawData);
      },
      this.memoryConfig.cacheTTL || 2000 // 内存信息缓存 2 秒
    );
  }

  /**
   * 获取详细内存信息
   */
  async detailed(): Promise<MonitorResult<MemoryInfo & { breakdown: any }>> {
    const cacheKey = 'memory-detailed';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('memory.detailed');

        const rawData = await this.adapter.getMemoryInfo();
        const basicInfo = this.transformMemoryInfo(rawData);
        const breakdown = this.extractDetailedBreakdown(rawData);

        return {
          ...basicInfo,
          breakdown
        };
      },
      this.memoryConfig.cacheTTL || 2000
    );
  }

  /**
   * 获取内存使用率百分比
   */
  async usage(): Promise<MonitorResult<number>> {
    const cacheKey = 'memory-usage';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getMemoryInfo();
        const memInfo = this.transformMemoryInfo(rawData);
        return memInfo.usagePercentage;
      },
      this.memoryConfig.cacheTTL || 1000
    );
  }

  /**
   * 获取可用内存
   */
  async available(): Promise<MonitorResult<DataSize>> {
    const cacheKey = 'memory-available';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getMemoryInfo();
        const memInfo = this.transformMemoryInfo(rawData);
        return memInfo.available;
      },
      this.memoryConfig.cacheTTL || 1000
    );
  }

  /**
   * 获取已用内存（异步版本）
   */
  async usedAsync(): Promise<MonitorResult<DataSize>> {
    const cacheKey = 'memory-used';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getMemoryInfo();
        const memInfo = this.transformMemoryInfo(rawData);
        return memInfo.used;
      },
      this.memoryConfig.cacheTTL || 1000
    );
  }

  /**
   * 获取交换空间信息
   */
  async swap(): Promise<MonitorResult<SwapInfo>> {
    if (!this.memoryConfig.includeSwap) {
      return this.createErrorResult(
        this.createUnsupportedError('memory.swap (disabled in config)')
      );
    }

    const cacheKey = 'memory-swap';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('memory.swap');

        const rawData = await this.adapter.getMemoryInfo();
        return this.transformSwapInfo(rawData);
      },
      this.memoryConfig.cacheTTL || 2000
    );
  }

  /**
   * 获取内存压力信息
   */
  async pressure(): Promise<MonitorResult<MemoryPressure>> {
    if (!this.memoryConfig.includePressure) {
      return this.createErrorResult(
        this.createUnsupportedError('memory.pressure (disabled in config)')
      );
    }

    const cacheKey = 'memory-pressure';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('memory.pressure');

        const rawData = await this.adapter.getMemoryInfo();
        return this.calculateMemoryPressure(rawData);
      },
      this.memoryConfig.cacheTTL || 5000
    );
  }

  /**
   * 获取缓存和缓冲区信息
   */
  async buffers(): Promise<MonitorResult<{ cached: DataSize; buffers: DataSize }>> {
    if (!this.memoryConfig.includeBuffers) {
      return this.createErrorResult(
        this.createUnsupportedError('memory.buffers (disabled in config)')
      );
    }

    const cacheKey = 'memory-buffers';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getMemoryInfo();
        return {
          cached: new DataSize(this.safeParseNumber(rawData.cached)),
          buffers: new DataSize(this.safeParseNumber(rawData.buffers))
        };
      },
      this.memoryConfig.cacheTTL || 2000
    );
  }

  /**
   * 获取总内存大小
   */
  async total(): Promise<MonitorResult<DataSize>> {
    const cacheKey = 'memory-total';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getMemoryInfo();
        return new DataSize(this.safeParseNumber(rawData.total));
      },
      this.memoryConfig.cacheTTL || 60000 // 总内存很少变化，缓存 1 分钟
    );
  }

  /**
   * 获取内存统计摘要
   */
  async summary(): Promise<MonitorResult<{
    total: string;
    used: string;
    available: string;
    usagePercentage: number;
    swap: {
      total: string;
      used: string;
      usagePercentage: number;
    };
  }>> {
    const cacheKey = 'memory-summary';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getMemoryInfo();
        const memInfo = this.transformMemoryInfo(rawData);
        const swapInfo = this.transformSwapInfo(rawData);

        return {
          total: memInfo.total.toString(this.memoryConfig.unit || 'auto'),
          used: memInfo.used.toString(this.memoryConfig.unit || 'auto'),
          available: memInfo.available.toString(this.memoryConfig.unit || 'auto'),
          usagePercentage: Math.round(memInfo.usagePercentage * 100) / 100,
          swap: {
            total: swapInfo.total.toString(this.memoryConfig.unit || 'auto'),
            used: swapInfo.used.toString(this.memoryConfig.unit || 'auto'),
            usagePercentage: Math.round(swapInfo.usagePercentage * 100) / 100
          }
        };
      },
      this.memoryConfig.cacheTTL || 2000
    );
  }

  /**
   * 配置是否包含交换空间信息
   */
  withSwap(include: boolean): this {
    this.memoryConfig.includeSwap = include;
    return this;
  }

  /**
   * 配置是否包含缓存和缓冲区信息
   */
  withBuffers(include: boolean): this {
    this.memoryConfig.includeBuffers = include;
    return this;
  }

  /**
   * 配置是否包含内存压力信息
   */
  withPressure(include: boolean): this {
    this.memoryConfig.includePressure = include;
    return this;
  }

  /**
   * 配置内存单位
   */
  withUnit(unit: 'auto' | 'B' | 'KB' | 'MB' | 'GB' | 'TB'): this {
    this.memoryConfig.unit = unit;
    return this;
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): MemoryConfig {
    return {
      interval: 1000,
      timeout: 5000,
      cacheEnabled: true,
      cacheTTL: 2000,
      samples: 1,
      includeDetails: true,
      includeSwap: true,
      includeBuffers: true,
      includePressure: false, // 默认不包含压力信息，可能需要特殊权限
      unit: 'auto'
    };
  }

  // 私有转换方法

  /**
   * 转换内存基本信息
   */
  private transformMemoryInfo(rawData: any): MemoryInfo {
    const total = new DataSize(this.safeParseNumber(rawData.total));
    const available = new DataSize(this.safeParseNumber(rawData.available || rawData.free));
    const used = new DataSize(this.safeParseNumber(rawData.used || (rawData.total - rawData.available)));
    const free = new DataSize(this.safeParseNumber(rawData.free));
    const cached = new DataSize(this.safeParseNumber(rawData.cached));
    const buffers = new DataSize(this.safeParseNumber(rawData.buffers));

    const usagePercentage = total.toBytes() > 0
      ? (used.toBytes() / total.toBytes()) * 100
      : 0;

    const memInfo: MemoryInfo = {
      total,
      available,
      used,
      free,
      cached,
      buffers,
      usagePercentage
    };

    // 添加内存压力信息（如果可用）
    if (rawData.pressure) {
      memInfo.pressure = this.transformMemoryPressure(rawData.pressure);
    }

    // 添加其他详细信息
    if (rawData.shared !== undefined) {
      memInfo.shared = new DataSize(this.safeParseNumber(rawData.shared));
    }

    if (rawData.reclaimable !== undefined) {
      memInfo.reclaimable = new DataSize(this.safeParseNumber(rawData.reclaimable));
    }

    return memInfo;
  }

  /**
   * 转换交换空间信息
   */
  private transformSwapInfo(rawData: any): SwapInfo {
    const swapData = rawData.swap || {};

    const total = new DataSize(this.safeParseNumber(swapData.total));
    const used = new DataSize(this.safeParseNumber(swapData.used));
    const free = new DataSize(this.safeParseNumber(swapData.free || (swapData.total - swapData.used)));

    const usagePercentage = total.toBytes() > 0
      ? (used.toBytes() / total.toBytes()) * 100
      : 0;

    const swapInfo: SwapInfo = {
      total,
      used,
      free,
      usagePercentage
    };

    // 添加交换活动信息（如果可用）
    if (swapData.swapIn !== undefined) {
      swapInfo.swapIn = this.safeParseNumber(swapData.swapIn);
    }

    if (swapData.swapOut !== undefined) {
      swapInfo.swapOut = this.safeParseNumber(swapData.swapOut);
    }

    return swapInfo;
  }

  /**
   * 转换内存压力信息
   */
  private transformMemoryPressure(pressureData: any): MemoryPressure {
    if (typeof pressureData === 'string') {
      // 简单的字符串压力级别
      return {
        level: this.normalizePressureLevel(pressureData),
        score: this.pressureLevelToScore(pressureData)
      };
    }

    if (typeof pressureData === 'object') {
      return {
        level: this.normalizePressureLevel(pressureData.level),
        score: this.safeParseNumber(pressureData.score || pressureData.percentage),
        swapActivity: this.safeParseNumber(pressureData.swapActivity)
      };
    }

    return {
      level: 'low',
      score: 0
    };
  }

  /**
   * 计算内存压力
   */
  private calculateMemoryPressure(rawData: any): MemoryPressure {
    // 如果已有压力信息，直接使用
    if (rawData.pressure) {
      return this.transformMemoryPressure(rawData.pressure);
    }

    // 否则基于使用率计算压力
    const total = this.safeParseNumber(rawData.total);
    const available = this.safeParseNumber(rawData.available || rawData.free);

    if (total <= 0) {
      return { level: 'low', score: 0 };
    }

    const usagePercentage = ((total - available) / total) * 100;
    let level: 'low' | 'medium' | 'high' | 'critical';

    if (usagePercentage >= 95) {
      level = 'critical';
    } else if (usagePercentage >= 85) {
      level = 'high';
    } else if (usagePercentage >= 70) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return {
      level,
      score: Math.min(100, Math.max(0, usagePercentage))
    };
  }

  /**
   * 提取详细内存分解信息
   */
  private extractDetailedBreakdown(rawData: any): any {
    const breakdown: any = {};

    // Linux 特定字段
    if (rawData.active !== undefined) {
      breakdown.active = new DataSize(this.safeParseNumber(rawData.active));
    }
    if (rawData.inactive !== undefined) {
      breakdown.inactive = new DataSize(this.safeParseNumber(rawData.inactive));
    }
    if (rawData.wired !== undefined) {
      breakdown.wired = new DataSize(this.safeParseNumber(rawData.wired));
    }
    if (rawData.compressed !== undefined) {
      breakdown.compressed = new DataSize(this.safeParseNumber(rawData.compressed));
    }

    // 内核内存
    if (rawData.kernel !== undefined) {
      breakdown.kernel = new DataSize(this.safeParseNumber(rawData.kernel));
    }

    // 设备驱动内存
    if (rawData.drivers !== undefined) {
      breakdown.drivers = new DataSize(this.safeParseNumber(rawData.drivers));
    }

    // 共享内存
    if (rawData.shared !== undefined) {
      breakdown.shared = new DataSize(this.safeParseNumber(rawData.shared));
    }

    return breakdown;
  }

  /**
   * 规范化压力级别
   */
  private normalizePressureLevel(level: string): 'low' | 'medium' | 'high' | 'critical' {
    const normalizedLevel = level.toLowerCase();

    if (normalizedLevel.includes('critical') || normalizedLevel.includes('severe')) {
      return 'critical';
    } else if (normalizedLevel.includes('high') || normalizedLevel.includes('warn')) {
      return 'high';
    } else if (normalizedLevel.includes('medium') || normalizedLevel.includes('moderate')) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 压力级别转分数
   */
  private pressureLevelToScore(level: string): number {
    const scores: Record<string, number> = {
      'low': 10,
      'normal': 10,
      'medium': 50,
      'moderate': 50,
      'high': 80,
      'warn': 80,
      'warning': 80,
      'critical': 95,
      'severe': 95
    };

    return scores[level.toLowerCase()] || 0;
  }

  /**
   * 安全解析数字
   */
  private safeParseNumber(value: any): number {
    if (typeof value === 'number') {
      return isNaN(value) ? 0 : value;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }

  // ==================== 向后兼容的同步方法 ====================

  /**
   * 获取总内存大小（同步版本，向后兼容）
   * @returns 总内存大小（字节）或 'not supported'
   */
  totalMem(): number | string {
    try {
      const os = require('os');
      return os.totalmem();
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取空闲内存大小（同步版本，向后兼容）
   * @returns 空闲内存大小（字节）或 'not supported'
   */
  free(): number | string {
    try {
      const os = require('os');
      return os.freemem();
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取已用内存大小（同步版本，向后兼容）
   * @returns 已用内存大小（字节）或 'not supported'
   */
  used(): number | string {
    try {
      const total = this.totalMem();
      const free = this.free();

      if (total === 'not supported' || free === 'not supported') {
        return 'not supported';
      }

      return (total as number) - (free as number);
    } catch (error) {
      return 'not supported';
    }
  }
}
