/**
 * 测试配置文件
 * 统一管理所有测试相关的配置参数
 */

import * as os from 'os'

/**
 * 全局测试配置
 */
export const TestGlobalConfig = {
  // 基础超时设置
  timeouts: {
    default: 10000,        // 默认测试超时 (10秒)
    long: 30000,          // 长时间测试超时 (30秒)  
    performance: 5000,    // 性能测试最大执行时间 (5秒)
    quick: 2000          // 快速测试超时 (2秒)
  },

  // 性能基准
  performance: {
    maxMemoryIncreaseMB: 10,        // 最大内存增长 (10MB)
    maxExecutionTimeMs: 5000,       // 最大执行时间 (5秒)
    maxSyncOperationMs: 100,        // 同步操作最大时间 (100ms)
    maxAsyncOperationMs: 10000,     // 异步操作最大时间 (10秒)
    iterationCount: {
      quick: 10,                    // 快速迭代测试
      standard: 50,                 // 标准迭代测试
      stress: 100                   // 压力测试迭代
    }
  },

  // 数据验证阈值
  validation: {
    percentageRange: { min: 0, max: 100 },           // 百分比范围
    memoryToleranceMB: 100,                          // 内存值容差 (100MB)
    diskToleranceGB: 1,                              // 磁盘空间容差 (1GB)
    percentageTolerance: 0.1,                        // 百分比容差 (0.1%)
    networkStatsMinFields: ['interface', 'inputBytes', 'outputBytes']
  },

  // 重试配置
  retry: {
    maxAttempts: 3,               // 最大重试次数
    delayMs: 1000,               // 重试延迟 (1秒)
    backoffMultiplier: 2         // 延迟倍增因子
  }
}

/**
 * 平台特定配置
 */
export const PlatformConfigs = {
  linux: {
    timeouts: {
      memory: 8000,               // Linux内存测试超时
      disk: 6000,                 // Linux磁盘测试超时
      network: 8000,              // Linux网络测试超时
      cpu: 5000                   // Linux CPU测试超时
    },
    
    features: {
      procFilesystem: true,       // 支持/proc文件系统
      loadavg: true,             // 支持负载平均值
      networkInterfaces: ['lo', 'eth0', 'wlan0', 'enp', 'wlp'],
      expectedCommands: ['free', 'df', 'vmstat', 'netstat', 'ps', 'top', 'lscpu']
    },

    paths: {
      procMeminfo: '/proc/meminfo',
      procCpuinfo: '/proc/cpuinfo', 
      procStat: '/proc/stat',
      procLoadavg: '/proc/loadavg',
      procNetDev: '/proc/net/dev'
    },

    validation: {
      memoryMinMB: 512,           // 最小内存要求 (512MB)
      diskMinGB: 1,               // 最小磁盘空间 (1GB)
      cpuMinCount: 1              // 最小CPU核心数
    }
  },

  darwin: { // macOS
    timeouts: {
      memory: 10000,              // macOS内存测试超时
      disk: 12000,                // macOS磁盘测试超时  
      network: 10000,             // macOS网络测试超时
      cpu: 6000                   // macOS CPU测试超时
    },

    features: {
      procFilesystem: false,      // 不支持/proc文件系统
      loadavg: true,             // 支持负载平均值
      networkInterfaces: ['lo0', 'en0', 'en1', 'wi0', 'awdl0', 'utun'],
      expectedCommands: ['vm_stat', 'top', 'df', 'netstat', 'system_profiler', 'sysctl'],
      applesilicon: process.arch === 'arm64'  // Apple Silicon检测
    },

    paths: {
      mountPoint: '/',
      systemVolumesData: '/System/Volumes/Data',
      privatePath: '/private'
    },

    validation: {
      memoryMinMB: 4000,          // 最小内存要求 (4GB，macOS典型配置)
      diskMinGB: 10,              // 最小磁盘空间 (10GB)
      cpuMinCount: 2,             // 最小CPU核心数
      cpuModelPatterns: /(Apple|Intel|M[0-9]+|Core)/i
    }
  },

  win32: { // Windows
    timeouts: {
      memory: 15000,              // Windows内存测试超时
      disk: 15000,                // Windows磁盘测试超时
      network: 12000,             // Windows网络测试超时
      cpu: 8000                   // Windows CPU测试超时
    },

    features: {
      procFilesystem: false,      // 不支持/proc文件系统
      loadavg: false,            // 不完全支持负载平均值
      networkInterfaces: ['Ethernet', 'Wi-Fi', 'Wireless', 'Local Area Connection', 'loopback'],
      expectedCommands: ['wmic', 'tasklist', 'systeminfo', 'netstat', 'powershell'],
      unsupportedFeatures: ['loadavg', 'uptime']
    },

    paths: {
      systemDrive: 'C:',
      commonDrives: ['C:', 'D:', 'E:', 'F:']
    },

    validation: {
      memoryMinMB: 2000,          // 最小内存要求 (2GB)
      diskMinGB: 5,               // 最小磁盘空间 (5GB)
      cpuMinCount: 1,             // 最小CPU核心数
      cpuModelPatterns: /(Intel|AMD|Ryzen|Core)/i
    }
  }
}

/**
 * 获取当前平台的配置
 */
export function getCurrentPlatformConfig() {
  const platform = os.platform() as keyof typeof PlatformConfigs
  return PlatformConfigs[platform] || PlatformConfigs.linux // 默认使用Linux配置
}

/**
 * 获取平台特定的超时时间
 */
export function getPlatformTimeout(category: string): number {
  const config = getCurrentPlatformConfig()
  const timeoutKey = category as keyof typeof config.timeouts
  return config.timeouts[timeoutKey] || TestGlobalConfig.timeouts.default
}

/**
 * 检查功能是否在当前平台上支持
 */
export function isFeatureSupported(feature: string): boolean {
  const config = getCurrentPlatformConfig()
  
  if ('unsupportedFeatures' in config && config.unsupportedFeatures && Array.isArray(config.unsupportedFeatures)) {
    return !config.unsupportedFeatures.includes(feature)
  }
  
  // 默认支持所有功能
  return true
}

/**
 * 获取平台特定的验证阈值
 */
export function getPlatformValidation() {
  const config = getCurrentPlatformConfig()
  return {
    ...TestGlobalConfig.validation,
    ...config.validation
  }
}

/**
 * CI/CD 环境检测和配置
 */
export const CIConfig = {
  isCI: !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.TRAVIS ||
    process.env.JENKINS_URL
  ),
  
  // CI环境下的特殊配置
  adjustments: {
    timeoutMultiplier: 2,         // CI环境超时时间加倍
    maxMemoryIncreaseMB: 20,      // CI环境允许更大内存增长
    retryAttempts: 5,             // CI环境增加重试次数
    skipPerformanceTests: true    // CI环境可能跳过性能测试
  }
}

/**
 * 应用CI环境调整
 */
export function getAdjustedConfig() {
  if (!CIConfig.isCI) {
    return TestGlobalConfig
  }

  return {
    ...TestGlobalConfig,
    timeouts: {
      ...TestGlobalConfig.timeouts,
      default: TestGlobalConfig.timeouts.default * CIConfig.adjustments.timeoutMultiplier,
      long: TestGlobalConfig.timeouts.long * CIConfig.adjustments.timeoutMultiplier,
      performance: TestGlobalConfig.timeouts.performance * CIConfig.adjustments.timeoutMultiplier
    },
    performance: {
      ...TestGlobalConfig.performance,
      maxMemoryIncreaseMB: CIConfig.adjustments.maxMemoryIncreaseMB
    },
    retry: {
      ...TestGlobalConfig.retry,
      maxAttempts: CIConfig.adjustments.retryAttempts
    }
  }
}