import { MonitorError } from './errors';

/**
 * 监控结果统一返回类型
 */
export type MonitorResult<T> = {
  success: true;
  data: T;
  timestamp: number;
  cached: boolean;
  platform: string;
} | {
  success: false;
  error: MonitorError;
  platform: string;
  timestamp: number;
};

/**
 * 数据单位处理类
 */
export class DataSize {
  constructor(public readonly bytes: number) {
    if (bytes < 0) {
      throw new Error('Data size cannot be negative');
    }
  }

  /**
   * 获取字节数
   */
  toBytes(): number {
    return this.bytes;
  }

  /**
   * 转换为 KB
   */
  toKB(): number {
    return this.bytes / 1024;
  }

  /**
   * 转换为 MB
   */
  toMB(): number {
    return this.bytes / (1024 * 1024);
  }

  /**
   * 转换为 GB
   */
  toGB(): number {
    return this.bytes / (1024 * 1024 * 1024);
  }

  /**
   * 转换为 TB
   */
  toTB(): number {
    return this.bytes / (1024 * 1024 * 1024 * 1024);
  }

  /**
   * 自动选择合适的单位并格式化
   */
  toString(unit?: 'auto' | 'B' | 'KB' | 'MB' | 'GB' | 'TB'): string {
    if (unit && unit !== 'auto') {
      switch (unit) {
        case 'B':
          return `${this.bytes} B`;
        case 'KB':
          return `${this.toKB().toFixed(2)} KB`;
        case 'MB':
          return `${this.toMB().toFixed(2)} MB`;
        case 'GB':
          return `${this.toGB().toFixed(2)} GB`;
        case 'TB':
          return `${this.toTB().toFixed(2)} TB`;
      }
    }

    // 自动选择单位
    if (this.bytes < 1024) {
      return `${this.bytes} B`;
    } else if (this.bytes < 1024 * 1024) {
      return `${this.toKB().toFixed(2)} KB`;
    } else if (this.bytes < 1024 * 1024 * 1024) {
      return `${this.toMB().toFixed(2)} MB`;
    } else if (this.bytes < 1024 * 1024 * 1024 * 1024) {
      return `${this.toGB().toFixed(2)} GB`;
    } else {
      return `${this.toTB().toFixed(2)} TB`;
    }
  }

  /**
   * 创建 DataSize 实例的静态方法
   */
  static fromBytes(bytes: number): DataSize {
    return new DataSize(bytes);
  }

  static fromKB(kb: number): DataSize {
    return new DataSize(kb * 1024);
  }

  static fromMB(mb: number): DataSize {
    return new DataSize(mb * 1024 * 1024);
  }

  static fromGB(gb: number): DataSize {
    return new DataSize(gb * 1024 * 1024 * 1024);
  }
}

/**
 * 时间戳处理类
 */
export class Timestamp {
  constructor(private readonly time: number = Date.now()) {}

  /**
   * 距离现在多久（毫秒）
   */
  ago(): number {
    return Date.now() - this.time;
  }

  /**
   * 格式化为 ISO 字符串
   */
  format(): string {
    return new Date(this.time).toISOString();
  }

  /**
   * 格式化为本地时间字符串
   */
  toLocalString(): string {
    return new Date(this.time).toLocaleString();
  }

  /**
   * 获取原始时间戳
   */
  valueOf(): number {
    return this.time;
  }

  /**
   * 创建当前时间戳
   */
  static now(): Timestamp {
    return new Timestamp();
  }

  /**
   * 从特定时间创建时间戳
   */
  static from(time: number | Date): Timestamp {
    return new Timestamp(typeof time === 'number' ? time : time.getTime());
  }
}

/**
 * 监控订阅接口
 */
export interface MonitorSubscription {
  /**
   * 取消订阅
   */
  unsubscribe(): void;

  /**
   * 检查是否仍然活跃
   */
  isActive(): boolean;

  /**
   * 暂停监控
   */
  pause(): void;

  /**
   * 恢复监控
   */
  resume(): void;

  /**
   * 获取订阅状态
   */
  getStatus(): 'active' | 'paused' | 'stopped';
}

/**
 * 百分比类型
 */
export type Percentage = number; // 0-100

/**
 * 频率类型（Hz）
 */
export type Frequency = number;

/**
 * 温度类型（摄氏度）
 */
export type Temperature = number;

/**
 * 支持的平台类型
 */
export type Platform = 'linux' | 'darwin' | 'win32';

/**
 * 监控间隔类型（毫秒）
 */
export type Interval = number;

/**
 * 进程 ID 类型
 */
export type ProcessId = number;
