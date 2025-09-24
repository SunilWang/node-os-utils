import { ExecuteOptions } from './config';

/**
 * 命令执行结果
 */
export interface CommandResult {
  /**
   * 标准输出
   */
  stdout: string;

  /**
   * 标准错误输出
   */
  stderr: string;

  /**
   * 退出代码
   */
  exitCode: number;

  /**
   * 执行平台
   */
  platform: string;

  /**
   * 执行时间（毫秒）
   */
  executionTime: number;

  /**
   * 命令字符串
   */
  command: string;
}

/**
 * 平台适配器接口
 */
export interface PlatformAdapter {
  /**
   * 获取平台名称
   */
  getPlatform(): string;

  /**
   * 检查是否支持特定功能
   */
  isSupported(feature: string): boolean;

  /**
   * 执行系统命令
   */
  executeCommand(command: string, options?: ExecuteOptions): Promise<CommandResult>;

  /**
   * 读取文件内容
   */
  readFile(path: string): Promise<string>;

  /**
   * 检查文件是否存在
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * 获取 CPU 信息
   */
  getCPUInfo(): Promise<any>;

  /**
   * 获取 CPU 使用率
   */
  getCPUUsage(): Promise<any>;

  /**
   * 获取 CPU 温度
   */
  getCPUTemperature(): Promise<any>;

  /**
   * 获取内存信息
   */
  getMemoryInfo(): Promise<any>;

  /**
   * 获取内存使用情况
   */
  getMemoryUsage(): Promise<any>;

  /**
   * 获取磁盘信息
   */
  getDiskInfo(): Promise<any>;

  /**
   * 获取磁盘 I/O 统计
   */
  getDiskIO(): Promise<any>;

  /**
   * 获取网络接口列表
   */
  getNetworkInterfaces(): Promise<any>;

  /**
   * 获取网络统计信息
   */
  getNetworkStats(): Promise<any>;

  /**
   * 获取进程列表
   */
  getProcesses(): Promise<any>;

  /**
   * 获取特定进程信息
   */
  getProcessInfo(pid: number): Promise<any>;

  /**
   * 获取系统信息
   */
  getSystemInfo(): Promise<any>;

  /**
   * 获取系统负载
   */
  getSystemLoad(): Promise<any>;

  /**
   * 获取磁盘使用情况
   */
  getDiskUsage(): Promise<any>;

  /**
   * 获取磁盘统计
   */
  getDiskStats(): Promise<any>;

  /**
   * 获取挂载点
   */
  getMounts(): Promise<any>;

  /**
   * 获取文件系统
   */
  getFileSystems(): Promise<any>;

  /**
   * 获取网络连接
   */
  getNetworkConnections(): Promise<any>;

  /**
   * 获取默认网关
   */
  getDefaultGateway(): Promise<any>;

  /**
   * 获取进程列表
   */
  getProcessList(): Promise<any>;

  /**
   * 杀死进程
   */
  killProcess(pid: number, signal?: string): Promise<boolean>;

  /**
   * 获取进程打开文件
   */
  getProcessOpenFiles(pid: number): Promise<string[]>;

  /**
   * 获取进程环境变量
   */
  getProcessEnvironment(pid: number): Promise<Record<string, string>>;

  /**
   * 获取系统运行时间
   */
  getSystemUptime(): Promise<any>;

  /**
   * 获取系统用户
   */
  getSystemUsers(): Promise<any>;

  /**
   * 获取系统服务
   */
  getSystemServices(): Promise<any>;

  /**
   * 获取支持的功能列表
   */
  getSupportedFeatures(): SupportedFeatures;
}

/**
 * Linux 特定命令
 */
export interface LinuxCommands {
  /**
   * CPU 信息命令
   */
  cpuInfo: string;

  /**
   * CPU 使用率命令
   */
  cpuUsage: string;

  /**
   * 内存信息命令
   */
  memoryInfo: string;

  /**
   * 磁盘信息命令
   */
  diskInfo: string;

  /**
   * 磁盘 I/O 命令
   */
  diskIO: string;

  /**
   * 网络接口命令
   */
  networkInterfaces: string;

  /**
   * 网络统计命令
   */
  networkStats: string;

  /**
   * 进程列表命令
   */
  processes: string;

  /**
   * 系统信息命令
   */
  systemInfo: string;

  /**
   * 负载平均值命令
   */
  loadAverage: string;

  /**
   * 温度信息命令
   */
  temperature: string;
}

/**
 * macOS 特定命令
 */
export interface MacOSCommands {
  /**
   * CPU 信息命令
   */
  cpuInfo: string;

  /**
   * CPU 使用率命令
   */
  cpuUsage: string;

  /**
   * 内存信息命令
   */
  memoryInfo: string;

  /**
   * 磁盘信息命令
   */
  diskInfo: string;

  /**
   * 磁盘 I/O 命令
   */
  diskIO: string;

  /**
   * 网络接口命令
   */
  networkInterfaces: string;

  /**
   * 网络统计命令
   */
  networkStats: string;

  /**
   * 进程列表命令
   */
  processes: string;

  /**
   * 系统信息命令
   */
  systemInfo: string;

  /**
   * 负载平均值命令
   */
  loadAverage: string;

  /**
   * 温度信息命令
   */
  temperature: string;

  /**
   * 虚拟内存统计命令
   */
  vmStat: string;

  /**
   * 系统配置命令
   */
  sysctl: string;
}

/**
 * Windows 特定命令
 */
export interface WindowsCommands {
  /**
   * CPU 信息命令
   */
  cpuInfo: string;

  /**
   * CPU 使用率命令
   */
  cpuUsage: string;

  /**
   * 内存信息命令
   */
  memoryInfo: string;

  /**
   * 磁盘信息命令
   */
  diskInfo: string;

  /**
   * 磁盘 I/O 命令
   */
  diskIO: string;

  /**
   * 网络接口命令
   */
  networkInterfaces: string;

  /**
   * 网络统计命令
   */
  networkStats: string;

  /**
   * 进程列表命令
   */
  processes: string;

  /**
   * 系统信息命令
   */
  systemInfo: string;

  /**
   * 负载平均值命令
   */
  loadAverage: string;

  /**
   * 温度信息命令
   */
  temperature: string;
}

/**
 * 平台特定的文件路径
 */
export interface PlatformPaths {
  /**
   * CPU 信息文件路径
   */
  cpuInfo?: string;

  /**
   * 内存信息文件路径
   */
  memInfo?: string;

  /**
   * 磁盘统计文件路径
   */
  diskStats?: string;

  /**
   * 网络统计文件路径
   */
  netStats?: string;

  /**
   * 负载平均值文件路径
   */
  loadavg?: string;

  /**
   * 运行时间文件路径
   */
  uptime?: string;

  /**
   * 进程目录路径
   */
  procDir?: string;

  /**
   * 系统目录路径
   */
  sysDir?: string;

  /**
   * 温度传感器路径
   */
  thermalDir?: string;
}

/**
 * 支持的功能列表
 */
export interface SupportedFeatures {
  /**
   * CPU 监控功能
   */
  cpu: {
    info: boolean;
    usage: boolean;
    temperature: boolean;
    frequency: boolean;
    cache: boolean;
    perCore: boolean;
    cores: boolean; // 新增
  };

  /**
   * 内存监控功能
   */
  memory: {
    info: boolean;
    usage: boolean;
    swap: boolean;
    pressure: boolean;
    detailed: boolean;
    virtual: boolean; // 新增
  };

  /**
   * 磁盘监控功能
   */
  disk: {
    info: boolean;
    io: boolean;
    health: boolean;
    smart: boolean;
    filesystem: boolean;
    usage: boolean; // 新增
    stats: boolean; // 新增
    mounts: boolean; // 新增
    filesystems: boolean; // 新增
  };

  /**
   * 网络监控功能
   */
  network: {
    interfaces: boolean;
    stats: boolean;
    connections: boolean;
    bandwidth: boolean;
    gateway: boolean; // 新增
  };

  /**
   * 进程监控功能
   */
  process: {
    list: boolean;
    details: boolean;
    tree: boolean;
    monitor: boolean;
    info: boolean; // 新增
    kill: boolean; // 新增
    openFiles: boolean; // 新增
    environment: boolean; // 新增
  };

  /**
   * 系统监控功能
   */
  system: {
    info: boolean;
    load: boolean;
    uptime: boolean;
    users: boolean;
    services: boolean;
  };
}
