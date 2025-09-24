/**
 * 错误代码枚举
 */
export enum ErrorCode {
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED', // 当前平台不支持该功能
  COMMAND_FAILED = 'COMMAND_FAILED',                 // 系统命令执行失败
  PARSE_ERROR = 'PARSE_ERROR',                       // 命令输出或数据解析失败
  PERMISSION_DENIED = 'PERMISSION_DENIED',           // 权限不足无法完成操作
  TIMEOUT = 'TIMEOUT',                               // 操作超过设定超时时间
  INVALID_CONFIG = 'INVALID_CONFIG',                 // 提供的配置无效
  NOT_AVAILABLE = 'NOT_AVAILABLE',                   // 指标暂时不可用
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',                 // 依赖的文件或路径不存在
  NETWORK_ERROR = 'NETWORK_ERROR'                    // 网络操作失败
}

/**
 * 监控错误类
 */
export class MonitorError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly platform: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MonitorError';

    // 确保堆栈跟踪正确显示
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MonitorError);
    }
  }

  /**
   * 转换为 JSON 对象
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      platform: this.platform,
      details: this.details,
      stack: this.stack
    };
  }

  /**
   * 创建平台不支持错误
   */
  static createPlatformNotSupported(platform: string, feature: string): MonitorError {
    return new MonitorError(
      `Feature '${feature}' is not supported on platform '${platform}'`,
      ErrorCode.PLATFORM_NOT_SUPPORTED,
      platform,
      { feature }
    );
  }

  /**
   * 创建命令执行失败错误
   */
  static createCommandFailed(platform: string, command: string, details?: any): MonitorError {
    return new MonitorError(
      `Command execution failed: ${command}`,
      ErrorCode.COMMAND_FAILED,
      platform,
      { command, ...details }
    );
  }

  /**
   * 创建解析错误
   */
  static createParseError(platform: string, data: string, reason?: string): MonitorError {
    return new MonitorError(
      `Failed to parse data: ${reason || 'Unknown parsing error'}`,
      ErrorCode.PARSE_ERROR,
      platform,
      { data: data.substring(0, 100) + (data.length > 100 ? '...' : ''), reason }
    );
  }
}
