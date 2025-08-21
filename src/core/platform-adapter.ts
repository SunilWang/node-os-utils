import { PlatformAdapter, CommandResult, SupportedFeatures } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError } from '../types/errors';

/**
 * 平台适配器抽象基类
 * 
 * 为不同操作系统提供统一的接口，子类需要实现具体的平台相关逻辑
 */
export abstract class BasePlatformAdapter implements PlatformAdapter {
  protected platformName: string;
  protected supportedFeatures: SupportedFeatures;

  constructor(platformName: string) {
    this.platformName = platformName;
    this.supportedFeatures = this.initializeSupportedFeatures();
  }

  /**
   * 获取平台名称
   */
  getPlatform(): string {
    return this.platformName;
  }

  /**
   * 检查是否支持特定功能
   */
  isSupported(feature: string): boolean {
    const parts = feature.split('.');
    if (parts.length !== 2) {
      return false;
    }

    const [category, featureName] = parts;
    const categoryFeatures = this.supportedFeatures[category as keyof SupportedFeatures];
    
    if (!categoryFeatures) {
      return false;
    }

    return categoryFeatures[featureName as keyof typeof categoryFeatures] === true;
  }

  /**
   * 获取支持的功能列表
   */
  getSupportedFeatures(): SupportedFeatures {
    return { ...this.supportedFeatures };
  }

  // 抽象方法 - 子类必须实现

  /**
   * 执行系统命令
   */
  abstract executeCommand(command: string, options?: ExecuteOptions): Promise<CommandResult>;

  /**
   * 读取文件内容
   */
  abstract readFile(path: string): Promise<string>;

  /**
   * 检查文件是否存在
   */
  abstract fileExists(path: string): Promise<boolean>;

  /**
   * 获取 CPU 信息
   */
  abstract getCPUInfo(): Promise<any>;

  /**
   * 获取 CPU 使用率
   */
  abstract getCPUUsage(): Promise<any>;

  /**
   * 获取 CPU 温度
   */
  abstract getCPUTemperature(): Promise<any>;

  /**
   * 获取内存信息
   */
  abstract getMemoryInfo(): Promise<any>;

  /**
   * 获取内存使用情况
   */
  abstract getMemoryUsage(): Promise<any>;

  /**
   * 获取磁盘信息
   */
  abstract getDiskInfo(): Promise<any>;

  /**
   * 获取磁盘 I/O 统计
   */
  abstract getDiskIO(): Promise<any>;

  /**
   * 获取网络接口列表
   */
  abstract getNetworkInterfaces(): Promise<any>;

  /**
   * 获取网络统计信息
   */
  abstract getNetworkStats(): Promise<any>;

  /**
   * 获取进程列表
   */
  abstract getProcesses(): Promise<any>;

  /**
   * 获取特定进程信息
   */
  abstract getProcessInfo(pid: number): Promise<any>;

  /**
   * 获取系统信息
   */
  abstract getSystemInfo(): Promise<any>;

  /**
   * 获取系统负载
   */
  abstract getSystemLoad(): Promise<any>;

  /**
   * 获取磁盘使用情况
   */
  abstract getDiskUsage(): Promise<any>;

  /**
   * 获取磁盘统计
   */
  abstract getDiskStats(): Promise<any>;

  /**
   * 获取挂载点
   */
  abstract getMounts(): Promise<any>;

  /**
   * 获取文件系统
   */
  abstract getFileSystems(): Promise<any>;

  /**
   * 获取网络连接
   */
  abstract getNetworkConnections(): Promise<any>;

  /**
   * 获取默认网关
   */
  abstract getDefaultGateway(): Promise<any>;

  /**
   * 获取进程列表
   */
  abstract getProcessList(): Promise<any>;

  /**
   * 杀死进程
   */
  abstract killProcess(pid: number, signal?: string): Promise<boolean>;

  /**
   * 获取进程打开文件
   */
  abstract getProcessOpenFiles(pid: number): Promise<string[]>;

  /**
   * 获取进程环境变量
   */
  abstract getProcessEnvironment(pid: number): Promise<Record<string, string>>;

  /**
   * 获取系统运行时间
   */
  abstract getSystemUptime(): Promise<any>;

  /**
   * 获取系统用户
   */
  abstract getSystemUsers(): Promise<any>;

  /**
   * 获取系统服务
   */
  abstract getSystemServices(): Promise<any>;

  // 受保护的辅助方法

  /**
   * 安全执行命令
   */
  protected async safeExecute(command: string, options?: ExecuteOptions): Promise<CommandResult> {
    try {
      return await this.executeCommand(command, options);
    } catch (error) {
      // 返回失败的结果而不是抛出异常
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        platform: this.platformName,
        executionTime: 0,
        command
      };
    }
  }

  /**
   * 创建不支持功能的错误
   */
  protected createUnsupportedError(feature: string): MonitorError {
    return MonitorError.createPlatformNotSupported(this.platformName, feature);
  }

  /**
   * 创建命令执行失败错误
   */
  protected createCommandError(command: string, details?: any): MonitorError {
    return MonitorError.createCommandFailed(this.platformName, command, details);
  }

  /**
   * 创建解析错误
   */
  protected createParseError(data: string, reason?: string): MonitorError {
    return MonitorError.createParseError(this.platformName, data, reason);
  }

  /**
   * 验证命令执行结果
   */
  protected validateCommandResult(result: CommandResult, command: string): void {
    if (result.exitCode !== 0) {
      throw this.createCommandError(command, {
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout
      });
    }

    if (!result.stdout || result.stdout.trim().length === 0) {
      throw this.createCommandError(command, {
        reason: 'Empty output',
        stderr: result.stderr
      });
    }
  }

  /**
   * 安全解析 JSON
   */
  protected safeParseJSON(data: string, fallback: any = null): any {
    try {
      return JSON.parse(data);
    } catch (error) {
      return fallback;
    }
  }

  /**
   * 安全解析数字
   */
  protected safeParseNumber(value: string | number, fallback: number = 0): number {
    if (typeof value === 'number') {
      return isNaN(value) ? fallback : value;
    }

    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * 安全解析整数
   */
  protected safeParseInt(value: string | number, fallback: number = 0, radix: number = 10): number {
    if (typeof value === 'number') {
      return isNaN(value) ? fallback : Math.floor(value);
    }

    const parsed = parseInt(value, radix);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * 解析键值对格式的输出
   */
  protected parseKeyValueOutput(output: string, separator: string = ':'): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const separatorIndex = trimmed.indexOf(separator);
      if (separatorIndex === -1) continue;

      const key = trimmed.substring(0, separatorIndex).trim();
      const value = trimmed.substring(separatorIndex + separator.length).trim();
      
      if (key && value) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 解析表格格式的输出
   */
  protected parseTableOutput(output: string, hasHeader: boolean = true): Record<string, string>[] {
    const lines = output.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length === 0) return [];

    let dataLines = lines;
    let headers: string[] = [];

    if (hasHeader && lines.length > 0) {
      headers = this.splitTableRow(lines[0]);
      dataLines = lines.slice(1);
    }

    const result: Record<string, string>[] = [];

    for (const line of dataLines) {
      const values = this.splitTableRow(line);
      if (values.length === 0) continue;

      const row: Record<string, string> = {};
      
      if (headers.length > 0) {
        // 使用表头作为键
        for (let i = 0; i < Math.min(headers.length, values.length); i++) {
          row[headers[i]] = values[i];
        }
      } else {
        // 使用索引作为键
        for (let i = 0; i < values.length; i++) {
          row[i.toString()] = values[i];
        }
      }

      result.push(row);
    }

    return result;
  }

  /**
   * 分割表格行
   */
  protected splitTableRow(row: string): string[] {
    // 支持多种分隔符：空格、制表符等
    return row.split(/\s+/).filter(cell => cell.length > 0);
  }

  /**
   * 字节单位转换
   */
  protected convertToBytes(value: string | number, unit?: string): number {
    const num = typeof value === 'string' ? this.safeParseNumber(value) : value;
    
    if (!unit) {
      // 尝试从值中提取单位
      if (typeof value === 'string') {
        const match = value.match(/^([\d.]+)\s*([a-zA-Z]+)$/);
        if (match) {
          return this.convertToBytes(match[1], match[2]);
        }
      }
      return num;
    }

    const multipliers: Record<string, number> = {
      'b': 1,
      'byte': 1,
      'bytes': 1,
      'k': 1024,
      'kb': 1024,
      'kib': 1024,
      'kilobyte': 1024,
      'kilobytes': 1024,
      'm': 1024 * 1024,
      'mb': 1024 * 1024,
      'mib': 1024 * 1024,
      'megabyte': 1024 * 1024,
      'megabytes': 1024 * 1024,
      'g': 1024 * 1024 * 1024,
      'gb': 1024 * 1024 * 1024,
      'gib': 1024 * 1024 * 1024,
      'gigabyte': 1024 * 1024 * 1024,
      'gigabytes': 1024 * 1024 * 1024,
      't': 1024 * 1024 * 1024 * 1024,
      'tb': 1024 * 1024 * 1024 * 1024,
      'tib': 1024 * 1024 * 1024 * 1024,
      'terabyte': 1024 * 1024 * 1024 * 1024,
      'terabytes': 1024 * 1024 * 1024 * 1024
    };

    const multiplier = multipliers[unit.toLowerCase()] || 1;
    return num * multiplier;
  }

  /**
   * 初始化支持的功能 - 子类可以重写
   */
  protected abstract initializeSupportedFeatures(): SupportedFeatures;
}