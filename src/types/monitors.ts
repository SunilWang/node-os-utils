import { DataSize, Percentage, Frequency, ProcessId } from './common';

/**
 * CPU 信息接口
 */
export interface CPUInfo {
  /**
   * CPU 型号
   */
  model: string;

  /**
   * 制造商
   */
  manufacturer: string;

  /**
   * 架构
   */
  architecture: string;

  /**
   * 物理核心数
   */
  cores: number;

  /**
   * 逻辑线程数
   */
  threads: number;

  /**
   * 基础频率（MHz）
   */
  baseFrequency: Frequency;

  /**
   * 最大频率（MHz）
   */
  maxFrequency: Frequency;

  /**
   * 缓存信息
   */
  cache: CacheInfo;

  /**
   * CPU 特性
   */
  features: string[];

  /**
   * 供应商 ID
   */
  vendorId?: string;

  /**
   * CPU 系列
   */
  family?: number;

  /**
   * 型号编号
   */
  modelNumber?: number;

  /**
   * 步进
   */
  stepping?: number;
}

/**
 * CPU 缓存信息
 */
export interface CacheInfo {
  /**
   * L1 数据缓存
   */
  l1d?: DataSize;

  /**
   * L1 指令缓存
   */
  l1i?: DataSize;

  /**
   * L2 缓存
   */
  l2?: DataSize;

  /**
   * L3 缓存
   */
  l3?: DataSize;
}

/**
 * CPU 频率信息
 */
export interface FrequencyInfo {
  /**
   * 频率类型
   */
  type: 'base' | 'max' | 'core';

  /**
   * 频率值（MHz）
   */
  frequency: Frequency;

  /**
   * 核心编号（仅当 type 为 'core' 时有效）
   */
  core?: number;
}

/**
 * CPU 使用率信息
 */
export interface CPUUsage {
  /**
   * 总体使用率
   */
  overall: Percentage;

  /**
   * 每个核心的使用率
   */
  cores: Percentage[];

  /**
   * 用户态时间百分比
   */
  user: Percentage;

  /**
   * 系统态时间百分比
   */
  system: Percentage;

  /**
   * 空闲时间百分比
   */
  idle: Percentage;

  /**
   * I/O 等待时间百分比
   */
  iowait?: Percentage;

  /**
   * 硬中断时间百分比
   */
  irq?: Percentage;

  /**
   * 软中断时间百分比
   */
  softirq?: Percentage;
}

/**
 * 负载平均值
 */
export interface LoadAverage {
  /**
   * 1 分钟负载平均值
   */
  load1: number;

  /**
   * 5 分钟负载平均值
   */
  load5: number;

  /**
   * 15 分钟负载平均值
   */
  load15: number;
}

/**
 * 内存信息接口
 */
export interface MemoryInfo {
  /**
   * 总内存
   */
  total: DataSize;

  /**
   * 可用内存
   */
  available: DataSize;

  /**
   * 已使用内存
   */
  used: DataSize;

  /**
   * 空闲内存
   */
  free: DataSize;

  /**
   * 缓存内存
   */
  cached: DataSize;

  /**
   * 缓冲区内存
   */
  buffers: DataSize;

  /**
   * 使用率百分比
   */
  usagePercentage: Percentage;

  /**
   * 内存压力
   */
  pressure?: MemoryPressure;

  /**
   * 共享内存
   */
  shared?: DataSize;

  /**
   * 可回收内存
   */
  reclaimable?: DataSize;
}

/**
 * 内存压力信息
 */
export interface MemoryPressure {
  /**
   * 压力级别
   */
  level: 'low' | 'medium' | 'high' | 'critical';

  /**
   * 压力分数（0-100）
   */
  score: Percentage;

  /**
   * 交换活动频率
   */
  swapActivity?: number;
}

/**
 * 交换空间信息
 */
export interface SwapInfo {
  /**
   * 总交换空间
   */
  total: DataSize;

  /**
   * 已使用交换空间
   */
  used: DataSize;

  /**
   * 空闲交换空间
   */
  free: DataSize;

  /**
   * 使用率百分比
   */
  usagePercentage: Percentage;

  /**
   * 换入页数
   */
  swapIn?: number;

  /**
   * 换出页数
   */
  swapOut?: number;
}

/**
 * 磁盘信息接口
 */
export interface DiskInfo {
  /**
   * 设备名称
   */
  device: string;

  /**
   * 挂载点
   */
  mountpoint: string;

  /**
   * 文件系统类型
   */
  filesystem: string;

  /**
   * 总容量
   */
  total: DataSize;

  /**
   * 已使用空间
   */
  used: DataSize;

  /**
   * 可用空间
   */
  available: DataSize;

  /**
   * 使用率百分比
   */
  usagePercentage: Percentage;

  /**
   * 磁盘类型
   */
  type?: 'HDD' | 'SSD' | 'NVMe' | 'eMMC' | 'Unknown';

  /**
   * 是否为可移动设备
   */
  removable?: boolean;
}

/**
 * 磁盘 I/O 统计
 */
export interface DiskIOStats {
  /**
   * 设备名称
   */
  device: string;

  /**
   * 读取字节数
   */
  readBytes: DataSize;

  /**
   * 写入字节数
   */
  writeBytes: DataSize;

  /**
   * 读取次数
   */
  readCount: number;

  /**
   * 写入次数
   */
  writeCount: number;

  /**
   * 读取时间（毫秒）
   */
  readTime: number;

  /**
   * 写入时间（毫秒）
   */
  writeTime: number;

  /**
   * I/O 等待时间（毫秒）
   */
  ioTime: number;

  /**
   * 读取速度（字节/秒）
   */
  readSpeed?: number;

  /**
   * 写入速度（字节/秒）
   */
  writeSpeed?: number;

  /**
   * IOPS（每秒 I/O 操作次数）
   */
  iops?: number;
}

/**
 * 网络接口信息
 */
export interface NetworkInterface {
  /**
   * 接口名称
   */
  name: string;

  /**
   * IP 地址列表
   */
  addresses: NetworkAddress[];

  /**
   * MAC 地址
   */
  mac: string;

  /**
   * 接口状态
   */
  state: 'up' | 'down' | 'unknown';

  /**
   * 接口类型
   */
  type: 'ethernet' | 'wifi' | 'loopback' | 'virtual' | 'other';

  /**
   * 最大传输单元
   */
  mtu: number;

  /**
   * 是否为内部接口
   */
  internal: boolean;

  /**
   * 连接速度（Mbps）
   */
  speed?: number;

  /**
   * 双工模式
   */
  duplex?: 'full' | 'half' | 'unknown';
}

/**
 * 网络地址信息
 */
export interface NetworkAddress {
  /**
   * IP 地址
   */
  address: string;

  /**
   * 网络掩码
   */
  netmask: string;

  /**
   * 地址族
   */
  family: 'IPv4' | 'IPv6';

  /**
   * 是否为内部地址
   */
  internal: boolean;

  /**
   * 作用域 ID（IPv6）
   */
  scopeid?: number;
}

/**
 * 网络统计信息
 */
export interface NetworkStats {
  /**
   * 接口名称
   */
  interface: string;

  /**
   * 接收字节数
   */
  rxBytes: DataSize;

  /**
   * 发送字节数
   */
  txBytes: DataSize;

  /**
   * 接收包数
   */
  rxPackets: number;

  /**
   * 发送包数
   */
  txPackets: number;

  /**
   * 接收错误数
   */
  rxErrors: number;

  /**
   * 发送错误数
   */
  txErrors: number;

  /**
   * 接收丢包数
   */
  rxDropped: number;

  /**
   * 发送丢包数
   */
  txDropped: number;

  /**
   * 接收速度（字节/秒）
   */
  rxSpeed?: number;

  /**
   * 发送速度（字节/秒）
   */
  txSpeed?: number;
}

/**
 * 进程信息
 */
export interface ProcessInfo {
  /**
   * 进程 ID
   */
  pid: ProcessId;

  /**
   * 父进程 ID
   */
  ppid: ProcessId;

  /**
   * 进程名称
   */
  name: string;

  /**
   * 命令行
   */
  command: string;

  /**
   * 进程状态
   */
  state: 'running' | 'sleeping' | 'waiting' | 'zombie' | 'stopped' | 'unknown';

  /**
   * CPU 使用率
   */
  cpuUsage: Percentage;

  /**
   * 内存使用量
   */
  memoryUsage: DataSize;

  /**
   * 内存使用率
   */
  memoryPercentage: Percentage;

  /**
   * 启动时间
   */
  startTime: number;

  /**
   * 运行时间（毫秒）
   */
  runtime: number;

  /**
   * 进程优先级
   */
  priority?: number;

  /**
   * Nice 值
   */
  nice?: number;

  /**
   * 线程数
   */
  threads?: number;

  /**
   * 用户 ID
   */
  uid?: number;

  /**
   * 组 ID
   */
  gid?: number;

  /**
   * 用户名
   */
  username?: string;
}

/**
 * 系统信息
 */
export interface SystemInfo {
  /**
   * 主机名
   */
  hostname: string;

  /**
   * 操作系统类型
   */
  platform: string;

  /**
   * 操作系统发行版
   */
  distro: string;

  /**
   * 操作系统版本
   */
  release: string;

  /**
   * 内核版本
   */
  kernel: string;

  /**
   * 系统架构
   */
  arch: string;

  /**
   * 系统运行时间（毫秒）
   */
  uptime: number;

  /**
   * 系统负载
   */
  loadAverage: LoadAverage;

  /**
   * 当前用户数
   */
  userCount?: number;

  /**
   * 总进程数
   */
  processCount?: number;

  /**
   * 系统时间
   */
  time: number;

  /**
   * 时区
   */
  timezone?: string;
}

/**
 * 磁盘使用情况（兼容性别名）
 */
export type DiskUsage = DiskInfo;

/**
 * 磁盘统计信息（兼容性别名）
 */
export type DiskStats = DiskIOStats;

/**
 * 挂载点信息
 */
export interface MountPoint {
  /**
   * 设备路径
   */
  device: string;

  /**
   * 挂载点路径
   */
  mountpoint: string;

  /**
   * 文件系统类型
   */
  filesystem: string;

  /**
   * 挂载选项
   */
  options: string;
}

/**
 * 文件系统信息
 */
export interface FileSystem {
  /**
   * 文件系统名称
   */
  name: string;

  /**
   * 文件系统类型
   */
  type: string;

  /**
   * 是否支持
   */
  supported: boolean;
}
