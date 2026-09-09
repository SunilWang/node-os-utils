import { spawn } from 'child_process';
import { CommandResult } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError, ErrorCode } from '../types/errors';

/**
 * 不经 shell 执行的流式命令。
 *
 * 可执行文件与参数保持结构化传递，避免字符串拆分破坏空参数、引号或反斜杠。
 */
export interface StreamCommand {
  /** 可执行文件路径或名称 */
  executable: string;
  /** 原样传递给可执行文件的参数 */
  args?: string[];
}

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
      // 输出溢出同样需要清理进程树，但不能因此误分类为超时。
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
            stdout: error.stdout || '',
            stderr: error.stderr || '',
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
        let directChildKilled = false;
        /**
         * taskkill 不可用时至少终止直接子进程，避免连 shell 都继续运行。
         * @returns {void} 进程已经退出或无权终止时忽略清理错误
         */
        const killChild = (): void => {
          if (directChildKilled) return;
          directChildKilled = true;
          try { child.kill('SIGTERM'); } catch { /* 进程已退出或无法终止 */ }
        };
        try {
          const taskkill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
          // spawn 启动失败通过异步 error 事件上报，必须主动消费，避免清理失败导致宿主进程崩溃。
          taskkill.once('error', killChild);
          taskkill.once('exit', code => { if (code !== 0) killChild(); });
          taskkill.unref();
        } catch {
          killChild();
        }
      }
      return;
    }

    if (pid === undefined) {
      return;
    }

    try {
      // 普通和流式执行在 POSIX 上均将 shell 放入独立进程组，负 PID 可同时终止
      // shell、管道进程及其后代，避免只杀 shell 后留下孤儿进程。
      process.kill(-pid, 'SIGTERM');
    } catch {
      // 进程已退出时忽略错误
    }

    // 保持定时器存活直到完成兜底；调用方立即退出时也不能遗留忽略 SIGTERM 的后代。
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // 进程已退出时忽略错误
      }
    }, 1000);
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
   * 执行命令并流式处理输出。
   *
   * 使用 shell 时传入命令字符串；禁用 shell 时必须传入结构化命令，确保参数
   * 原样交给 spawn，不经过有损的字符串解析。
   * @param command 命令字符串或不经 shell 的结构化命令
   * @param onData 标准输出或标准错误数据回调
   * @param options 命令执行选项
   * @returns 命令执行结果
   * @throws {MonitorError} 命令配置非法、执行失败或超时时抛出
   */
  async executeStream(
    command: string | StreamCommand,
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
    const commandText = typeof command === 'string'
      ? command
      : this.formatStreamCommand(command);

    return new Promise((resolve, reject) => {
      const spawnOptions: any = {
        shell: mergedOptions.shell,
        env: mergedOptions.env,
        cwd: mergedOptions.cwd,
        // POSIX 独立进程组用于超时时终止整棵进程树；Windows 使用 taskkill /T。
        detached: process.platform !== 'win32'
      };

      let child: ReturnType<typeof spawn>;

      if (spawnOptions.shell) {
        if (typeof command !== 'string') {
          reject(new MonitorError(
            'Structured stream commands require shell to be disabled',
            ErrorCode.INVALID_CONFIG,
            this.platform,
            { command: commandText }
          ));
          return;
        }
        child = spawn(command, spawnOptions);
      } else {
        if (typeof command === 'string' || !command.executable) {
          reject(new MonitorError(
            'Shell-free stream execution requires { executable, args }',
            ErrorCode.INVALID_CONFIG,
            this.platform,
            { command: commandText }
          ));
          return;
        }

        child = spawn(command.executable, command.args ?? [], spawnOptions);
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      // 流式执行统一由该定时器负责超时，避免 spawn 内置 timeout 先杀父进程后干扰进程树清理。
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
              command: commandText
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
          command: commandText
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
            command: commandText,
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
   * 使用执行器配置的超时检查命令是否可用。
   *
   * @param {string} command 待检查的可执行文件名
   * @returns {Promise<boolean>} 定位命令以零退出码结束时返回 true，其他非超时失败返回 false
   * @throws {MonitorError} 命令名非法时抛出 INVALID_CONFIG，探测超时时保留 TIMEOUT
   */
  async isCommandAvailable(command: string): Promise<boolean> {
    this.assertValidCommandName(command);

    const testCommand = this.platform === 'win32'
      ? `where ${command}`
      : `which ${command}`;

    try {
      const result = await this.execute(testCommand);
      // execute 会为“非零退出但有 stdout”的通用解析场景保留结果；命令定位必须额外核对退出码。
      return result.exitCode === 0;
    } catch (error) {
      // 定位超时无法证明命令不存在，保留原始诊断供调用方区分这两种情况。
      if (error instanceof MonitorError && error.code === ErrorCode.TIMEOUT) throw error;
      return false;
    }
  }

  /**
   * 使用执行器配置的超时获取命令版本信息。
   *
   * @param {string} command 待查询的可执行文件名
   * @param {string} versionFlag 版本查询参数，默认为 --version
   * @returns {Promise<string>} 去除首尾空白的版本输出
   * @throws {MonitorError} 命令名非法、查询超时或命令执行失败时抛出对应错误
   */
  async getCommandVersion(command: string, versionFlag: string = '--version'): Promise<string> {
    this.assertValidCommandName(command);

    try {
      const result = await this.execute(`${command} ${versionFlag}`);
      return result.stdout.trim();
    } catch (error) {
      if (error instanceof MonitorError && error.code === ErrorCode.TIMEOUT) throw error;
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
   * 生成用于结果和错误详情的流式命令文本。
   *
   * 该文本仅用于诊断，不参与进程创建；实际参数始终以数组形式传给 spawn。
   * @param command 结构化流式命令
   * @returns 便于诊断的命令文本
   */
  private formatStreamCommand(command: StreamCommand): string {
    return [command.executable, ...(command.args ?? [])]
      .map(part => JSON.stringify(part))
      .join(' ');
  }

  /**
   * 缓冲命令输出，并在超时或输出溢出时清理整棵进程树。
   *
   * @param {string} command 待执行的命令字符串
   * @param {ExecuteOptions} options 超时、编码、输出限制及环境配置
   * @returns {Promise<{ stdout: string; stderr: string }>} 解码后的标准输出与标准错误
   * @throws {Error} 启动失败、非零退出、输出溢出或超时，由 execute 统一分类
   */
  private async executeWithTimeout(command: string, options: ExecuteOptions): Promise<{ stdout: string; stderr: string }> {
    const timeout = options.timeout ?? 0;
    const maxBuffer = options.maxBuffer ?? 1024 * 1024;
    const encoding = options.encoding ?? 'utf8';
    if (!Number.isInteger(timeout) || timeout < 0) {
      throw new RangeError('timeout must be a non-negative integer');
    }
    if (!(maxBuffer >= 0)) {
      throw new RangeError('maxBuffer must be non-negative');
    }
    if (!Buffer.isEncoding(encoding)) {
      throw new TypeError(`Unknown encoding: ${encoding}`);
    }

    // 保持原 exec 的字符串命令语义：shell:false 仍使用宿主默认 shell；
    // shell:true 沿用显式 SHELL/ComSpec 选择。不依赖 Node.js 12 缺少的 AbortController。
    const shell = options.shell === true
      ? process.platform === 'win32'
        ? process.env.ComSpec || 'cmd.exe'
        : process.env.SHELL || '/bin/bash'
      : true;

    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell,
        cwd: options.cwd,
        env: options.env,
        // exec 不会将 detached 传给内部 spawn，因此直接创建独立进程组。
        detached: process.platform !== 'win32'
      });
      const chunks: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] };
      const lengths = { stdout: 0, stderr: 0 };
      let settled = false;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      /**
       * 完成本次执行；强制结束时先清理进程树，再释放管道与等待句柄。
       * @param {Error} error 启动、退出或预算错误；省略表示正常结束
       * @param {boolean} terminate 是否主动终止进程树
       * @returns {void} Promise 仅完成一次
       */
      const finish = (error?: Error, terminate = false): void => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (terminate) {
          this.terminateProcessTree(child);
          child.stdin?.destroy();
          child.stdout?.destroy();
          child.stderr?.destroy();
          // 超时不能依赖 Windows shell 的 close 事件，也不能继续阻止宿主退出。
          child.unref();
        }
        // 按原始字节计量、合并后解码，避免多字节字符在 data 分块边界被破坏。
        const output = {
          stdout: Buffer.concat(chunks.stdout, lengths.stdout).toString(encoding),
          stderr: Buffer.concat(chunks.stderr, lengths.stderr).toString(encoding)
        };
        if (error) reject(Object.assign(error, output));
        else resolve(output);
      };

      for (const stream of ['stdout', 'stderr'] as const) {
        child[stream]?.on('data', (data: Buffer) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
          if (lengths[stream] + buffer.length > maxBuffer) {
            finish(Object.assign(new Error(`${stream} maxBuffer length exceeded`), {
              code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
            }), true);
            return;
          }
          chunks[stream].push(buffer);
          lengths[stream] += buffer.length;
        });
      }

      child.on('error', error => finish(error));
      child.on('close', (code, signal) => {
        if (code === 0 && signal === null) finish();
        else finish(Object.assign(new Error(`Command failed: ${command}`), { code, signal }));
      });
      if (timeout > 0) {
        timeoutTimer = setTimeout(() => finish(Object.assign(new Error(`Command timed out after ${timeout}ms`), {
          killed: true,
          signal: 'SIGTERM'
        }), true), timeout);
      }
    });
  }
}
