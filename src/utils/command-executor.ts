import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { CommandResult } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError, ErrorCode } from '../types/errors';

const execAsync = promisify(exec);

/**
 * 命令执行器
 *
 * 负责在不同平台上执行系统命令，提供统一的接口和错误处理
 */
export class CommandExecutor {
  private platform: string;
  private defaultOptions: ExecuteOptions;

  constructor(platform: string, defaultOptions: ExecuteOptions = {}) {
    this.platform = platform;
    this.defaultOptions = {
      timeout: 10000,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024, // 1MB
      env: {
        ...process.env,
        LC_ALL: 'en_US.UTF-8',
        LANG: 'en_US.UTF-8',
        LANGUAGE: 'en_US:en'
      },
      ...defaultOptions
    };
  }

  /**
   * 执行命令并返回结果
   */
  async execute(command: string, options: ExecuteOptions = {}): Promise<CommandResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    try {
      const result = await this.executeWithTimeout(command, mergedOptions);
      const executionTime = Date.now() - startTime;

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: 0,
        platform: this.platform,
        executionTime,
        command
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // 处理非对象异常（如字符串、数字、null、undefined）——Deno 兼容层可能抛出这类值
      if (error === null || error === undefined || typeof error !== 'object') {
        throw new MonitorError(
          `Command failed: ${String(error)}`,
          ErrorCode.COMMAND_FAILED,
          this.platform,
          { command, executionTime, rawError: String(error) }
        );
      }

      // 处理不同类型的错误
      if (error.killed && error.signal) {
        // 超时或被杀死的进程
        throw new MonitorError(
          `Command was killed with signal ${error.signal}`,
          ErrorCode.TIMEOUT,
          this.platform,
          {
            command,
            signal: error.signal,
            killed: error.killed,
            executionTime
          }
        );
      }

      if (error.code === 'ENOENT') {
        // 命令不存在
        throw new MonitorError(
          `Command not found: ${command}`,
          ErrorCode.COMMAND_FAILED,
          this.platform,
          {
            command,
            code: error.code,
            executionTime
          }
        );
      }

      if (error.code === 'EACCES') {
        // 权限不足
        throw new MonitorError(
          `Permission denied: ${command}`,
          ErrorCode.PERMISSION_DENIED,
          this.platform,
          {
            command,
            code: error.code,
            executionTime
          }
        );
      }

      const timeoutMs = mergedOptions.timeout ?? this.defaultOptions.timeout ?? 10000;

      if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ERR_CANCELED') {
        throw new MonitorError(
          `Command timed out after ${timeoutMs}ms`,
          ErrorCode.TIMEOUT,
          this.platform,
          {
            command,
            executionTime,
            timeout: timeoutMs
          }
        );
      }

      // 命令执行失败但有输出
      const result: CommandResult = {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        platform: this.platform,
        executionTime,
        command
      };

      // 如果有标准输出，即使退出码非零也返回结果
      if (result.stdout && result.stdout.trim()) {
        return result;
      }

      // 否则抛出错误
      throw new MonitorError(
        `Command failed with exit code ${result.exitCode}: ${result.stderr || 'Unknown error'}`,
        ErrorCode.COMMAND_FAILED,
        this.platform,
        {
          command,
          exitCode: result.exitCode,
          stderr: result.stderr,
          stdout: result.stdout,
          executionTime
        }
      );
    }
  }

  /**
   * 执行多个命令
   */
  async executeMultiple(commands: string[], options: ExecuteOptions = {}): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const command of commands) {
      try {
        const result = await this.execute(command, options);
        results.push(result);
      } catch (error) {
        // 继续执行其他命令，但记录错误
        const errorResult: CommandResult = {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          platform: this.platform,
          executionTime: 0,
          command
        };
        results.push(errorResult);
      }
    }

    return results;
  }

  /**
   * 并发执行多个命令
   */
  async executeConcurrent(commands: string[], options: ExecuteOptions = {}): Promise<CommandResult[]> {
    const promises = commands.map(command =>
      this.execute(command, options).catch(error => {
        // 转换错误为结果对象
        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          platform: this.platform,
          executionTime: 0,
          command
        } as CommandResult;
      })
    );

    return Promise.all(promises);
  }

  /**
   * 执行命令并流式处理输出
   */
  async executeStream(
    command: string,
    onData: (data: string, isError: boolean) => void,
    options: ExecuteOptions = {}
  ): Promise<CommandResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const spawnOptions: any = {
        shell: mergedOptions.shell,
        env: mergedOptions.env,
        cwd: mergedOptions.cwd,
        timeout: mergedOptions.timeout
      };

      let child: ReturnType<typeof spawn>;

      if (spawnOptions.shell) {
        child = spawn(command, spawnOptions);
      } else {
        const tokens = this.tokenizeCommand(command);
        const executable = tokens.shift();

        if (!executable) {
          reject(new MonitorError(
            'Invalid command provided for execution',
            ErrorCode.INVALID_CONFIG,
            this.platform,
            { command }
          ));
          return;
        }

        child = spawn(executable, tokens, spawnOptions);
      }

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        onData(text, false);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        onData(text, true);
      });

      child.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: code || 0,
          platform: this.platform,
          executionTime,
          command
        };

        if (code === 0 || stdout.trim()) {
          resolve(result);
        } else {
          reject(new MonitorError(
            `Command failed with exit code ${code}`,
            ErrorCode.COMMAND_FAILED,
            this.platform,
            result
          ));
        }
      });

      child.on('error', (error) => {
        const executionTime = Date.now() - startTime;
        reject(new MonitorError(
          `Command execution error: ${error.message}`,
          ErrorCode.COMMAND_FAILED,
          this.platform,
          {
            command,
            error: error.message,
            executionTime
          }
        ));
      });
    });
  }

  /**
   * 检查命令是否可用
   */
  async isCommandAvailable(command: string): Promise<boolean> {
    const testCommand = this.platform === 'win32'
      ? `where ${command}`
      : `which ${command}`;

    try {
      await this.execute(testCommand, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取命令的版本信息
   */
  async getCommandVersion(command: string, versionFlag: string = '--version'): Promise<string> {
    try {
      const result = await this.execute(`${command} ${versionFlag}`, { timeout: 5000 });
      return result.stdout.trim();
    } catch (error) {
      throw new MonitorError(
        `Failed to get version for command: ${command}`,
        ErrorCode.COMMAND_FAILED,
        this.platform,
        { command, versionFlag, error }
      );
    }
  }

  /**
   * 设置默认选项
   */
  setDefaultOptions(options: Partial<ExecuteOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 获取默认选项
   */
  getDefaultOptions(): ExecuteOptions {
    return { ...this.defaultOptions };
  }

  /**
   * 转义命令参数
   */
  escapeArgument(arg: string): string {
    if (this.platform === 'win32') {
      // Windows 命令行转义
      return `"${arg.replace(/"/g, '""')}"`;
    } else {
      // Unix-like 系统转义
      return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }
  }

  /**
   * 构建安全的命令字符串
   */
  buildCommand(command: string, args: string[] = []): string {
    const escapedArgs = args.map(arg => this.escapeArgument(arg));
    return [command, ...escapedArgs].join(' ');
  }

  private tokenizeCommand(command: string): string[] {
    const matches = command.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|[^\s]+/g);
    if (!matches) {
      return [];
    }

    return matches.map(token => {
      const startsWithQuote = token.startsWith('"') || token.startsWith("'");
      const endsWithQuote = token.endsWith('"') || token.endsWith("'");

      if (startsWithQuote && endsWithQuote && token.length >= 2) {
        const unquoted = token.slice(1, -1);
        return unquoted.replace(/\\([\\'" ])/g, '$1');
      }

      return token;
    });
  }

  /**
   * 带超时执行命令
   */
  private async executeWithTimeout(command: string, options: ExecuteOptions): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

    try {
      const execOptions: any = {
        ...options,
        signal: controller.signal
      };

      // 确保 shell 选项在不同平台下正确设置
      if (execOptions.shell === true) {
        if (process.platform === 'win32') {
          execOptions.shell = process.env.ComSpec || 'cmd.exe';
        } else {
          // 尝试使用当前 SHELL，若不存在再回退到常见 POSIX shell
          const fallbackShells = [process.env.SHELL, '/bin/bash', '/bin/sh'];
          execOptions.shell = fallbackShells.find(Boolean);
        }
      }

      const result = await execAsync(command, execOptions);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
