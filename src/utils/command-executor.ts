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
    const mergedOptions: ExecuteOptions = {
      ...this.defaultOptions,
      ...options,
      // env 深合并，避免调用方传入 env 时整体覆盖内置的 LC_ALL/LANG 等 locale 设置
      env: { ...this.defaultOptions.env, ...options.env }
    };
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
      // maxBuffer 溢出：exec 会杀死子进程并附带 maxBuffer 相关错误，需优先识别，不能误分类为超时
      if (
        error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ||
        (typeof error.message === 'string' && error.message.includes('maxBuffer'))
      ) {
        throw new MonitorError(
          `Command output exceeded maxBuffer (${mergedOptions.maxBuffer} bytes): ${command}. Consider increasing the maxBuffer option.`,
          ErrorCode.COMMAND_FAILED,
          this.platform,
          {
            command,
            maxBuffer: mergedOptions.maxBuffer,
            executionTime
          }
        );
      }

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
   * 终止子进程及其进程树
   *
   * Windows 使用 taskkill /T /F 杀整棵进程树；POSIX 先发送 SIGTERM，
   * 1 秒后仍未退出再发送 SIGKILL 兜底（shell 子进程可能脱离父进程存活）
   * @param child 需要终止的子进程
   */
  private terminateProcessTree(child: ReturnType<typeof spawn>): void {
    const pid = child.pid;

    // 进程终止方式取决于实际宿主系统；platform 仅用于标识适配器和错误来源。
    if (process.platform === 'win32') {
      if (pid !== undefined) {
        try {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }).unref();
        } catch {
          // 进程已退出时忽略错误
        }
      }
      return;
    }

    try {
      child.kill('SIGTERM');
    } catch {
      // 进程已退出时忽略错误
    }

    // 1 秒后仍未退出则 SIGKILL 兜底；unref 避免该定时器阻止进程退出
    const forceKillTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // 进程已退出时忽略错误
      }
    }, 1000);
    if (typeof forceKillTimer.unref === 'function') {
      forceKillTimer.unref();
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
    const mergedOptions: ExecuteOptions = {
      ...this.defaultOptions,
      ...options,
      // env 深合并，避免调用方传入 env 时整体覆盖内置的 LC_ALL/LANG 等 locale 设置
      env: { ...this.defaultOptions.env, ...options.env }
    };
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
      let timedOut = false;
      let settled = false;
      // 流式执行不会经过 execAsync 的超时机制，因此在子进程层补充定时终止。
      const timeoutTimer = mergedOptions.timeout && mergedOptions.timeout > 0
        ? setTimeout(() => {
          timedOut = true;
          this.terminateProcessTree(child);
          // Windows 的 shell 进程可能迟迟不触发 close；超时语义不能依赖该事件。
          settled = true;
          reject(new MonitorError(
            `Command timed out after ${mergedOptions.timeout}ms`,
            ErrorCode.TIMEOUT,
            this.platform,
            {
              stdout,
              stderr,
              exitCode: 1,
              platform: this.platform,
              executionTime: Date.now() - startTime,
              command
            }
          ));
        }, mergedOptions.timeout)
        : undefined;

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
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (settled) return;
        settled = true;
        const executionTime = Date.now() - startTime;
        // shell 被 kill 后通常以 null code 结束，使用标志位区分超时与正常退出。
        const exitCode = code === null ? (timedOut ? 1 : 0) : code;
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode,
          platform: this.platform,
          executionTime,
          command
        };

        if (timedOut) {
          reject(new MonitorError(
            `Command timed out after ${mergedOptions.timeout}ms`,
            ErrorCode.TIMEOUT,
            this.platform,
            result
          ));
        } else if (code === 0 || stdout.trim()) {
          // 部分系统命令可能因单个资源权限异常返回非零码，但仍产出可用结果。
          // 保持与 execute() 一致：有有效标准输出时交由调用方继续解析。
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
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (settled) return;
        settled = true;
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
   * 校验命令名合法性，防止 shell 注入
   *
   * 仅允许字母、数字、点、下划线和连字符，不合法时直接抛出 MonitorError
   * @param command 待校验的命令名
   * @throws {MonitorError} 命令名包含非法字符时抛出 INVALID_CONFIG 错误
   */
  private assertValidCommandName(command: string): void {
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      throw new MonitorError(
        `Invalid command name: ${command}`,
        ErrorCode.INVALID_CONFIG,
        this.platform,
        { command }
      );
    }
  }

  /**
   * 检查命令是否可用。
   *
   * @param command 待检查的可执行文件名
   * @returns 定位命令以零退出码结束时返回 true，否则返回 false
   */
  async isCommandAvailable(command: string): Promise<boolean> {
    this.assertValidCommandName(command);

    const testCommand = this.platform === 'win32'
      ? `where ${command}`
      : `which ${command}`;

    try {
      const result = await this.execute(testCommand, { timeout: 5000 });
      // execute 会为“非零退出但有 stdout”的通用解析场景保留结果；命令定位必须额外核对退出码。
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取命令的版本信息
   */
  async getCommandVersion(command: string, versionFlag: string = '--version'): Promise<string> {
    this.assertValidCommandName(command);

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
   *
   * 命令执行的 shell 由当前 Node 运行平台决定，而 `platform` 字段只是
   * 适配器的标识（单元测试也可能传入自定义值），不能用来选择引号规则。
   * @param arg 待转义的命令参数
   * @returns 适用于当前运行平台 shell 的参数字符串
   */
  escapeArgument(arg: string): string {
    if (process.platform === 'win32') {
      // Windows 命令行转义；结尾连续反斜杠需加倍，
      // 否则包裹双引号后 \" 会被解析为转义引号，导致引号提前闭合
      return `"${arg.replace(/"/g, '""').replace(/(\\+)$/, '$1$1')}"`;
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

  /**
   * 将已构建的命令字符串拆分为 spawn 所需的参数。
   *
   * Windows 参数可能使用连续双引号表示参数中的字面量双引号，不能用
   * 简单的正则按空白切分，否则 Node 的 `-e` 脚本会被拆成多个参数。
   * @param command 待解析的命令字符串
   * @returns 可传给 spawn 的参数列表
   */
  private tokenizeCommand(command: string): string[] {
    const tokens: string[] = [];
    let token = '';
    let quoteChar: '"' | "'" | null = null;

    for (let index = 0; index < command.length; index += 1) {
      const char = command[index];

      if (char === '"' || char === "'") {
        if (quoteChar === '"' && char === '"' && command[index + 1] === '"') {
          token += '"';
          index += 1;
        } else if (quoteChar === null) {
          quoteChar = char;
        } else if (quoteChar === char) {
          quoteChar = null;
        } else {
          token += char;
        }
        continue;
      }

      if (char === '\\' && command[index + 1] === '"' && quoteChar === '"') {
        token += '"';
        index += 1;
        continue;
      }

      if (/\s/.test(char) && quoteChar === null) {
        if (token) {
          tokens.push(token);
          token = '';
        }
        continue;
      }

      token += char;
    }

    if (token) {
      tokens.push(token);
    }

    return tokens;
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
