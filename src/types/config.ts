import { Interval } from './common';

/**
 * 全局配置接口
 */
export interface GlobalConfig {
  /**
   * 目标平台（undefined表示自动检测）
   */
  platform?: string;

  /**
   * 是否启用缓存
   */
  cacheEnabled?: boolean;

  /**
   * 缓存生存时间（毫秒）
   */
  cacheTTL?: number;

  /**
   * 默认超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 最大缓存大小
   */
  maxCacheSize?: number;

  /**
   * 调试模式
   */
  debug?: boolean;

  /**
   * CPU监控器配置
   */
  cpu?: CPUConfig;

  /**
   * 内存监控器配置
   */
  memory?: MemoryConfig;

  /**
   * 磁盘监控器配置
   */
  disk?: DiskConfig;

  /**
   * 网络监控器配置
   */
  network?: NetworkConfig;

  /**
   * 进程监控器配置
   */
  process?: ProcessConfig;

  /**
   * 系统监控器配置
   */
  system?: SystemConfig;
}

/**
 * 基础监控器配置
 */
export interface MonitorConfig {
  /**
   * 监控间隔（毫秒）
   */
  interval?: Interval;

  /**
   * 超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 是否启用缓存
   */
  cacheEnabled?: boolean;

  /**
   * 缓存生存时间（毫秒）
   */
  cacheTTL?: number;

  /**
   * 采样次数
   */
  samples?: number;

  /**
   * 是否包含详细信息
   */
  includeDetails?: boolean;
}

/**
 * CPU 监控器配置
 */
export interface CPUConfig extends MonitorConfig {
  /**
   * 采样间隔（毫秒）
   */
  samplingInterval?: number;

  /**
   * 是否包含温度信息
   */
  includeTemperature?: boolean;

  /**
   * 是否包含频率信息
   */
  includeFrequency?: boolean;

  /**
   * 是否包含缓存信息
   */
  includeCache?: boolean;

  /**
   * 是否按核心监控
   */
  perCore?: boolean;

  /**
   * 负载平均值时间窗口（分钟）
   */
  loadAverageWindows?: number[];

  /**
   * 计算 overall CPU 使用率时是否排除 I/O 等待时间（iowait）
   *
   * - `false`（默认）：iowait 计入 overall，与大多数传统监控工具行为一致
   * - `true`：iowait 从 overall 中剔除，反映 CPU 实际计算负载（适合 I/O 密集型场景）
   */
  excludeIowait?: boolean;
}

/**
 * 内存监控器配置
 */
export interface MemoryConfig extends MonitorConfig {
  /**
   * 是否包含交换空间信息
   */
  includeSwap?: boolean;

  /**
   * 是否包含缓存和缓冲区详情
   */
  includeBuffers?: boolean;

  /**
   * 是否包含内存压力信息
   */
  includePressure?: boolean;

  /**
   * 内存单位
   */
  unit?: 'auto' | 'B' | 'KB' | 'MB' | 'GB' | 'TB';
}

/**
 * 磁盘监控器配置
 */
export interface DiskConfig extends MonitorConfig {
  /**
   * 是否包含 I/O 统计
   */
  includeIO?: boolean;

  /**
   * 是否包含健康状态
   */
  includeHealth?: boolean;

  /**
   * 是否包含文件系统信息
   */
  includeFilesystem?: boolean;

  /**
   * 目标磁盘设备（为空则监控所有）
   */
  devices?: string[];

  /**
   * 是否包含统计信息
   */
  includeStats?: boolean;

  /**
   * 要排除的文件系统类型
   */
  excludeTypes?: string[];

  /**
   * 要监控的挂载点
   */
  mountPoints?: string[];

  /**
   * 磁盘空间单位
   */
  unit?: 'auto' | 'B' | 'KB' | 'MB' | 'GB' | 'TB';
}

/**
 * 网络监控器配置
 */
export interface NetworkConfig extends MonitorConfig {
  /**
   * 是否包含接口统计
   */
  includeInterfaceStats?: boolean;

  /**
   * 是否包含连接信息
   */
  includeConnections?: boolean;

  /**
   * 是否包含带宽监控
   */
  includeBandwidth?: boolean;

  /**
   * 目标网络接口（为空则监控所有）
   */
  interfaces?: string[];

  /**
   * 带宽监控间隔（毫秒）
   */
  bandwidthInterval?: number;

  /**
   * 数据单位
   */
  unit?: 'auto' | 'B' | 'KB' | 'MB' | 'GB' | 'TB';
}

/**
 * 进程监控器配置
 */
export interface ProcessConfig extends MonitorConfig {
  /**
   * 是否包含子进程
   */
  includeChildren?: boolean;

  /**
   * 是否包含线程信息
   */
  includeThreads?: boolean;

  /**
   * 是否包含环境变量
   */
  includeEnvironment?: boolean;

  /**
   * 是否包含打开文件
   */
  includeOpenFiles?: boolean;

  /**
   * 目标进程 ID 列表
   */
  pids?: number[];

  /**
   * 进程名称过滤
   */
  nameFilter?: string;

  /**
   * 最大返回进程数
   */
  maxResults?: number;
}

/**
 * 系统监控器配置
 */
export interface SystemConfig extends MonitorConfig {
  /**
   * 是否包含系统负载
   */
  includeLoad?: boolean;

  /**
   * 是否包含运行时间
   */
  includeUptime?: boolean;

  /**
   * 是否包含系统信息
   */
  includeSystemInfo?: boolean;

  /**
   * 是否包含用户信息
   */
  includeUsers?: boolean;

  /**
   * 是否包含服务状态
   */
  includeServices?: boolean;
}

/**
 * 命令执行配置
 */
export interface ExecuteOptions {
  /**
   * 超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 是否使用 shell
   */
  shell?: boolean;

  /**
   * 环境变量
   */
  env?: Record<string, string>;

  /**
   * 工作目录
   */
  cwd?: string;

  /**
   * 编码格式
   */
  encoding?: BufferEncoding;

  /**
   * 最大缓冲区大小
   */
  maxBuffer?: number;
}
