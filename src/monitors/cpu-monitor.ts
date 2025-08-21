import { BaseMonitor } from '../core/base-monitor';
import { 
  MonitorResult, 
  CPUConfig,
  CPUInfo, 
  CPUUsage, 
  LoadAverage,
  DataSize,
  Temperature,
  FrequencyInfo
} from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from '../core/cache-manager';

/**
 * CPU 监控器
 * 
 * 提供 CPU 相关的监控功能，包括基本信息、使用率、温度、频率等
 */
export class CPUMonitor extends BaseMonitor<CPUInfo> {
  private cpuConfig: CPUConfig;

  constructor(
    adapter: PlatformAdapter,
    config: CPUConfig = {},
    cache?: CacheManager
  ) {
    super(adapter, config, cache);
    this.cpuConfig = { ...this.getDefaultConfig(), ...config } as CPUConfig;
  }

  /**
   * 获取 CPU 基本信息
   */
  async info(): Promise<MonitorResult<CPUInfo>> {
    const cacheKey = 'cpu-info';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.info');
        
        const rawData = await this.adapter.getCPUInfo();
        return this.transformCPUInfo(rawData);
      },
      this.cpuConfig.cacheTTL || 30000 // CPU 信息缓存 30 秒
    );
  }

  /**
   * 获取 CPU 使用率
   */
  async usage(): Promise<MonitorResult<number>> {
    const cacheKey = `cpu-usage-${this.cpuConfig.samplingInterval || 1000}`;
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.usage');
        
        const rawData = await this.adapter.getCPUUsage();
        const usageData = this.transformCPUUsage(rawData);
        return usageData.overall;
      },
      this.cpuConfig.cacheTTL || 1000 // 使用率缓存较短
    );
  }

  /**
   * 获取详细的 CPU 使用率信息
   */
  async usageDetailed(): Promise<MonitorResult<CPUUsage>> {
    const cacheKey = `cpu-usage-detailed-${this.cpuConfig.samplingInterval || 1000}`;
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.usage');
        
        const rawData = await this.adapter.getCPUUsage();
        return this.transformCPUUsage(rawData);
      },
      this.cpuConfig.cacheTTL || 1000
    );
  }

  /**
   * 获取每个 CPU 核心的使用率
   */
  async usageByCore(): Promise<MonitorResult<number[]>> {
    const cacheKey = `cpu-usage-cores-${this.cpuConfig.samplingInterval || 1000}`;
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.perCore');
        
        const rawData = await this.adapter.getCPUUsage();
        const usageData = this.transformCPUUsage(rawData);
        return usageData.cores || [];
      },
      this.cpuConfig.cacheTTL || 1000
    );
  }

  /**
   * 获取系统负载平均值
   */
  async loadAverage(): Promise<MonitorResult<LoadAverage>> {
    const cacheKey = 'cpu-loadavg';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.usage');
        
        const rawData = await this.adapter.getSystemLoad();
        return this.transformLoadAverage(rawData);
      },
      this.cpuConfig.cacheTTL || 5000
    );
  }

  /**
   * 获取 CPU 温度
   */
  async temperature(): Promise<MonitorResult<Temperature[]>> {
    if (!this.cpuConfig.includeTemperature) {
      return this.createErrorResult(
        this.createUnsupportedError('cpu.temperature (disabled in config)')
      );
    }

    const cacheKey = 'cpu-temperature';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.temperature');
        
        const rawData = await this.adapter.getCPUTemperature();
        return this.transformTemperature(rawData);
      },
      this.cpuConfig.cacheTTL || 5000
    );
  }

  /**
   * 获取 CPU 频率信息
   */
  async frequency(): Promise<MonitorResult<FrequencyInfo[]>> {
    if (!this.cpuConfig.includeFrequency) {
      return this.createErrorResult(
        this.createUnsupportedError('cpu.frequency (disabled in config)')
      );
    }

    const cacheKey = 'cpu-frequency';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.frequency');
        
        // 频率信息通常在 CPU 基本信息中包含
        const rawData = await this.adapter.getCPUInfo();
        return this.extractFrequencyInfo(rawData);
      },
      this.cpuConfig.cacheTTL || 10000
    );
  }

  /**
   * 获取 CPU 缓存信息
   */
  async getCacheInfo(): Promise<MonitorResult<any>> {
    if (!this.cpuConfig.includeCache) {
      return this.createErrorResult(
        this.createUnsupportedError('cpu.cache (disabled in config)')
      );
    }

    const cacheKey = 'cpu-cache';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('cpu.cache');
        
        const rawData = await this.adapter.getCPUInfo();
        return this.extractCacheInfo(rawData);
      },
      this.cpuConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取 CPU 核心数
   */
  async coreCount(): Promise<MonitorResult<{ physical: number; logical: number }>> {
    const cacheKey = 'cpu-core-count';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        const rawData = await this.adapter.getCPUInfo();
        return {
          physical: rawData.cores || rawData.count || 1,
          logical: rawData.threads || rawData.count || 1
        };
      },
      this.cpuConfig.cacheTTL || 60000 // 核心数很少变化，缓存 1 分钟
    );
  }

  /**
   * 配置采样间隔
   */
  withSamplingInterval(interval: number): this {
    this.cpuConfig.samplingInterval = interval;
    return this;
  }

  /**
   * 配置是否包含温度信息
   */
  withTemperature(include: boolean): this {
    this.cpuConfig.includeTemperature = include;
    return this;
  }

  /**
   * 配置是否包含频率信息
   */
  withFrequency(include: boolean): this {
    this.cpuConfig.includeFrequency = include;
    return this;
  }

  /**
   * 配置是否包含缓存信息
   */
  withCacheInfo(include: boolean): this {
    this.cpuConfig.includeCache = include;
    return this;
  }

  /**
   * 配置是否按核心监控
   */
  withPerCore(enable: boolean): this {
    this.cpuConfig.perCore = enable;
    return this;
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): CPUConfig {
    return {
      interval: 1000,
      timeout: 10000,
      cacheEnabled: true,
      cacheTTL: 5000,
      samples: 1,
      includeDetails: true,
      samplingInterval: 1000,
      includeTemperature: false, // 默认不包含温度，可能需要特殊权限
      includeFrequency: true,
      includeCache: true,
      perCore: false,
      loadAverageWindows: [1, 5, 15]
    };
  }

  // 私有转换方法

  /**
   * 转换 CPU 基本信息
   */
  private transformCPUInfo(rawData: any): CPUInfo {
    return {
      model: rawData.model || 'Unknown',
      manufacturer: rawData.manufacturer || rawData.vendor || 'Unknown',
      architecture: rawData.architecture || rawData.arch || 'Unknown',
      cores: rawData.cores || rawData.count || 1,
      threads: rawData.threads || rawData.cores || rawData.count || 1,
      baseFrequency: rawData.baseFrequency || rawData.frequency || 0,
      maxFrequency: rawData.maxFrequency || rawData.frequency || 0,
      cache: this.transformCacheInfo(rawData.cache || {}),
      features: rawData.features || [],
      vendorId: rawData.vendorId || rawData.vendor_id,
      family: rawData.family,
      modelNumber: rawData.modelNumber || rawData.model_number,
      stepping: rawData.stepping
    };
  }

  /**
   * 转换 CPU 使用率信息
   */
  private transformCPUUsage(rawData: any): CPUUsage {
    return {
      overall: this.safeParseNumber(rawData.overall || rawData.usage),
      cores: rawData.cores || [],
      user: this.safeParseNumber(rawData.user),
      system: this.safeParseNumber(rawData.system || rawData.sys),
      idle: this.safeParseNumber(rawData.idle),
      iowait: this.safeParseNumber(rawData.iowait),
      irq: this.safeParseNumber(rawData.irq),
      softirq: this.safeParseNumber(rawData.softirq)
    };
  }

  /**
   * 转换负载平均值
   */
  private transformLoadAverage(rawData: any): LoadAverage {
    return {
      load1: this.safeParseNumber(rawData.load1),
      load5: this.safeParseNumber(rawData.load5),
      load15: this.safeParseNumber(rawData.load15)
    };
  }

  /**
   * 转换温度信息
   */
  private transformTemperature(rawData: any): Temperature[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(item => 
      this.safeParseNumber(item.temperature || item.temp || 0)
    );
  }

  /**
   * 转换缓存信息
   */
  private transformCacheInfo(rawCache: any): any {
    const cache: any = {};

    if (rawCache.l1d !== undefined) {
      cache.l1d = new DataSize(this.safeParseNumber(rawCache.l1d));
    }
    if (rawCache.l1i !== undefined) {
      cache.l1i = new DataSize(this.safeParseNumber(rawCache.l1i));
    }
    if (rawCache.l2 !== undefined) {
      cache.l2 = new DataSize(this.safeParseNumber(rawCache.l2));
    }
    if (rawCache.l3 !== undefined) {
      cache.l3 = new DataSize(this.safeParseNumber(rawCache.l3));
    }

    return cache;
  }

  /**
   * 提取频率信息
   */
  private extractFrequencyInfo(rawData: any): FrequencyInfo[] {
    const frequencies: FrequencyInfo[] = [];

    if (rawData.baseFrequency) {
      frequencies.push({
        type: 'base',
        frequency: this.safeParseNumber(rawData.baseFrequency)
      });
    }

    if (rawData.maxFrequency) {
      frequencies.push({
        type: 'max',
        frequency: this.safeParseNumber(rawData.maxFrequency)
      });
    }

    // 如果有每核心频率信息
    if (rawData.cores && Array.isArray(rawData.cores)) {
      rawData.cores.forEach((core: any, index: number) => {
        if (core.frequency) {
          frequencies.push({
            type: 'core',
            core: index,
            frequency: this.safeParseNumber(core.frequency)
          });
        }
      });
    }

    return frequencies;
  }

  /**
   * 提取缓存信息
   */
  private extractCacheInfo(rawData: any): any {
    const cache: any = {};

    // 尝试从不同字段提取缓存信息
    if (rawData.cache) {
      return this.transformCacheInfo(rawData.cache);
    }

    // 如果是 CPU 数组，取第一个 CPU 的缓存信息
    if (rawData.cpus && Array.isArray(rawData.cpus) && rawData.cpus.length > 0) {
      const firstCpu = rawData.cpus[0];
      
      // Linux /proc/cpuinfo 格式
      if (firstCpu['cache size']) {
        const cacheSize = this.parseCacheSize(firstCpu['cache size']);
        if (cacheSize > 0) {
          cache.l3 = new DataSize(cacheSize);
        }
      }
    }

    return cache;
  }

  /**
   * 解析缓存大小字符串
   */
  private parseCacheSize(cacheStr: string): number {
    const match = cacheStr.match(/(\d+)\s*([KMGT]?B?)/i);
    if (!match) return 0;

    const value = this.safeParseNumber(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
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
   * 获取系统负载平均值（同步版本，向后兼容）
   * @returns 负载平均值数组 [1分钟, 5分钟, 15分钟] 或 'not supported'
   */
  loadavg(): number[] | string {
    try {
      // 尝试使用 Node.js 内置的 os.loadavg() 
      const os = require('os');
      return os.loadavg();
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取指定时间窗口的负载平均值（同步版本，向后兼容）
   * @param minutes 时间窗口（1, 5, 或 15 分钟）
   * @returns 指定时间窗口的负载平均值或 'not supported'
   */
  loadavgTime(minutes: 1 | 5 | 15): number | string {
    try {
      const loads = this.loadavg();
      if (loads === 'not supported') {
        return 'not supported';
      }
      
      const loadArray = loads as number[];
      switch (minutes) {
        case 1: return loadArray[0];
        case 5: return loadArray[1];
        case 15: return loadArray[2];
        default: return 'not supported';
      }
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取 CPU 平均信息（同步版本，向后兼容）
   * @returns CPU 平均信息对象或 'not supported'
   */
  average(): any {
    try {
      // 这个方法在旧版本中可能返回负载平均值或其他统计信息
      const loads = this.loadavg();
      if (loads === 'not supported') {
        return 'not supported';
      }

      return {
        loadavg: loads,
        usage: 0 // 同步方法无法获取实时使用率，返回 0
      };
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取 CPU 型号（同步版本，向后兼容）
   * @returns CPU 型号字符串或 'not supported'
   */
  model(): string {
    try {
      const os = require('os');
      const cpus = os.cpus();
      return cpus && cpus.length > 0 ? cpus[0].model : 'Unknown';
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取 CPU 核心数（同步版本，向后兼容）
   * @returns CPU 核心数或 'not supported'
   */
  count(): number | string {
    try {
      const os = require('os');
      return os.cpus().length;
    } catch (error) {
      return 'not supported';
    }
  }
}