/**
 * node-os-utils v2.0.0
 *
 * 现代化的跨平台操作系统监控工具库
 * TypeScript 重构版本，提供全面的系统监控功能
 */

import { AdapterFactory } from './adapters/adapter-factory';
import { CacheManager } from './core/cache-manager';
import { CPUMonitor } from './monitors/cpu-monitor';
import { MemoryMonitor } from './monitors/memory-monitor';
import { DiskMonitor } from './monitors/disk-monitor';
import { NetworkMonitor } from './monitors/network-monitor';
import { ProcessMonitor } from './monitors/process-monitor';
import { SystemMonitor } from './monitors/system-monitor';
import packageJson from '../package.json';

import {
  GlobalConfig,
  PlatformAdapter
} from './types';

/**
 * OSUtils 主类
 *
 * 提供统一的系统监控 API，自动处理平台适配和缓存管理
 */
export class OSUtils {
  private adapter: PlatformAdapter;
  private cache: CacheManager;
  private config: GlobalConfig;

  // 监控器实例
  private _cpu?: CPUMonitor;
  private _memory?: MemoryMonitor;
  private _disk?: DiskMonitor;
  private _network?: NetworkMonitor;
  private _process?: ProcessMonitor;
  private _system?: SystemMonitor;

  constructor(config: Partial<GlobalConfig> = {}) {
    // 合并默认配置
    this.config = {
      platform: undefined, // 自动检测
      cacheEnabled: true,
      cacheTTL: 5000,
      timeout: 10000,
      maxCacheSize: 1000,
      debug: false,
      ...config
    };

    // 创建平台适配器
    this.adapter = AdapterFactory.create(this.config.platform);

    // 创建缓存管理器
    this.cache = new CacheManager({
      maxSize: this.config.maxCacheSize || 1000,
      defaultTTL: this.config.cacheTTL || 5000,
      enabled: this.config.cacheEnabled !== false
    });

    if (this.config.debug) {
      console.log(`OSUtils initialized for platform: ${this.adapter.getPlatform()}`);
    }
  }

  /**
   * CPU 监控器
   */
  get cpu(): CPUMonitor {
    if (!this._cpu) {
      this._cpu = new CPUMonitor(this.adapter, this.config.cpu, this.cache);
    }
    return this._cpu;
  }

  /**
   * 内存监控器
   */
  get memory(): MemoryMonitor {
    if (!this._memory) {
      this._memory = new MemoryMonitor(this.adapter, this.config.memory, this.cache);
    }
    return this._memory;
  }

  /**
   * 磁盘监控器
   */
  get disk(): DiskMonitor {
    if (!this._disk) {
      this._disk = new DiskMonitor(this.adapter, this.config.disk, this.cache);
    }
    return this._disk;
  }

  /**
   * 网络监控器
   */
  get network(): NetworkMonitor {
    if (!this._network) {
      this._network = new NetworkMonitor(this.adapter, this.config.network, this.cache);
    }
    return this._network;
  }

  /**
   * 进程监控器
   */
  get process(): ProcessMonitor {
    if (!this._process) {
      this._process = new ProcessMonitor(this.adapter, this.config.process, this.cache);
    }
    return this._process;
  }

  /**
   * 系统监控器
   */
  get system(): SystemMonitor {
    if (!this._system) {
      this._system = new SystemMonitor(this.adapter, this.config.system, this.cache);
    }
    return this._system;
  }

  /**
   * 获取平台信息
   */
  getPlatformInfo() {
    return AdapterFactory.getCurrentPlatformInfo();
  }

  /**
   * 获取支持的平台列表
   */
  getSupportedPlatforms() {
    return AdapterFactory.getSupportedPlatforms();
  }

  /**
   * 检查平台能力
   */
  async checkPlatformCapabilities() {
    return AdapterFactory.checkPlatformCapabilities();
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
    return this;
  }

  /**
   * 配置缓存
   */
  configureCache(options: {
    enabled?: boolean;
    maxSize?: number;
    defaultTTL?: number;
  }) {
    const { enabled, maxSize, defaultTTL } = options;
    const needsResize = maxSize !== undefined || defaultTTL !== undefined;

    const previousEnabled = this.cache.isEnabled();
    const targetEnabled = enabled !== undefined ? enabled : previousEnabled;

    if (needsResize) {
      const currentStats = this.cache.getStats();
      const currentTTL = this.cache.getDefaultTTL();
      const nextMaxSize = maxSize ?? currentStats.maxSize;
      const nextTTL = defaultTTL ?? currentTTL;

      this.cache.destroy();
      this.resetMonitors();

      this.cache = new CacheManager({
        maxSize: nextMaxSize,
        defaultTTL: nextTTL,
        enabled: targetEnabled
      });

      this.config.maxCacheSize = nextMaxSize;
      this.config.cacheTTL = nextTTL;
    } else if (enabled !== undefined) {
      targetEnabled ? this.cache.enable() : this.cache.disable();
    }

    this.config.cacheEnabled = targetEnabled;

    return this;
  }

  /**
   * 配置调试模式
   */
  setDebug(enabled: boolean) {
    this.config.debug = enabled;
    return this;
  }

  /**
   * 获取系统总览信息
   */
  async overview() {
    const [
      systemInfo,
      cpuUsage,
      memoryInfo,
      diskOverview,
      networkOverview,
      processStats
    ] = await Promise.allSettled([
      this.system.info(),
      this.cpu.usage(),
      this.memory.summary(),
      this.disk.spaceOverview(),
      this.network.overview(),
      this.process.stats()
    ]);

    return {
      platform: this.adapter.getPlatform(),
      timestamp: Date.now(),
      system: systemInfo.status === 'fulfilled' && systemInfo.value.success ?
        systemInfo.value.data : null,
      cpu: {
        usage: cpuUsage.status === 'fulfilled' && cpuUsage.value.success ?
          cpuUsage.value.data : null
      },
      memory: memoryInfo.status === 'fulfilled' && memoryInfo.value.success ?
        memoryInfo.value.data : null,
      disk: diskOverview.status === 'fulfilled' && diskOverview.value.success ?
        diskOverview.value.data : null,
      network: networkOverview.status === 'fulfilled' && networkOverview.value.success ?
        networkOverview.value.data : null,
      processes: processStats.status === 'fulfilled' && processStats.value.success ?
        processStats.value.data : null
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    const [
      systemHealth,
      diskHealth,
      networkHealth
    ] = await Promise.allSettled([
      this.system.healthCheck(),
      this.disk.healthCheck(),
      this.network.healthCheck()
    ]);

    const allIssues: string[] = [];
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    // 合并所有健康检查结果
    [systemHealth, diskHealth, networkHealth].forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success && result.value.data) {
        const health = result.value.data;
        allIssues.push(...health.issues);

        if (health.status === 'critical') {
          overallStatus = 'critical';
        } else if (health.status === 'warning' && overallStatus !== 'critical') {
          overallStatus = 'warning';
        }
      }
    });

    return {
      status: overallStatus,
      issues: allIssues,
      timestamp: Date.now(),
      details: {
        system: systemHealth.status === 'fulfilled' && systemHealth.value.success ?
          systemHealth.value.data : null,
        disk: diskHealth.status === 'fulfilled' && diskHealth.value.success ?
          diskHealth.value.data : null,
        network: networkHealth.status === 'fulfilled' && networkHealth.value.success ?
          networkHealth.value.data : null
      }
    };
  }

  /**
   * 销毁实例，清理资源
   */
  destroy() {
    this.resetMonitors();

    // 销毁缓存管理器（清理定时器）
    if (this.cache) {
      this.cache.destroy();
    }
  }

  private resetMonitors(): void {
    if (this._cpu) {
      this._cpu.destroy();
      this._cpu = undefined;
    }
    if (this._memory) {
      this._memory.destroy();
      this._memory = undefined;
    }
    if (this._disk) {
      this._disk.destroy();
      this._disk = undefined;
    }
    if (this._network) {
      this._network.destroy();
      this._network = undefined;
    }
    if (this._process) {
      this._process.destroy();
      this._process = undefined;
    }
    if (this._system) {
      this._system.destroy();
      this._system = undefined;
    }
  }
}

/**
 * 创建 OSUtils 实例的工厂函数
 */
export function createOSUtils(config?: Partial<GlobalConfig>): OSUtils {
  return new OSUtils(config);
}

// 导出所有类型和接口
export * from './types';

// 导出监控器类
export {
  CPUMonitor,
  MemoryMonitor,
  DiskMonitor,
  NetworkMonitor,
  ProcessMonitor,
  SystemMonitor
};

// 导出核心组件
export {
  AdapterFactory,
  CacheManager
};

// 默认导出主类
export default OSUtils;

// 库信息
export const version = packageJson.version;
export const name = packageJson.name;
