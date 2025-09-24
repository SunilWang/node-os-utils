/**
 * Node-OS-Utils 2.0 类型定义
 *
 * 这里导出所有公共类型和接口
 */

// 错误相关类型
export * from './errors';

// 通用类型
export * from './common';

// 配置相关类型
export * from './config';

// 监控器相关类型
export * from './monitors';

// 平台相关类型
export * from './platform';

// 重新导出常用类型的别名
export type {
  MonitorResult,
  MonitorSubscription,
  Percentage,
  Frequency,
  Temperature,
  Platform,
  Interval,
  ProcessId
} from './common';

export type {
  CPUInfo,
  CPUUsage,
  LoadAverage,
  MemoryInfo,
  MemoryPressure,
  SwapInfo,
  DiskInfo,
  DiskIOStats,
  DiskUsage,
  DiskStats,
  MountPoint,
  FileSystem,
  NetworkInterface,
  NetworkStats,
  ProcessInfo,
  SystemInfo
} from './monitors';

export type {
  GlobalConfig,
  MonitorConfig,
  CPUConfig,
  MemoryConfig,
  DiskConfig,
  NetworkConfig,
  ProcessConfig,
  SystemConfig,
  ExecuteOptions
} from './config';

export type {
  CommandResult,
  PlatformAdapter,
  SupportedFeatures
} from './platform';

export {
  ErrorCode,
  MonitorError
} from './errors';
