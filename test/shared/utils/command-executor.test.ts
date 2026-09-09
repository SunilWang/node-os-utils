/**
 * CommandExecutor单元测试
 * 测试命令执行器的核心功能和错误处理
 */

import { expect } from 'chai'
import { EventEmitter } from 'events'
import { CommandExecutor } from '../../../src/utils/command-executor'
import { MonitorError, ErrorCode } from '../../../src/types/errors'

const childProcess = require('child_process') as typeof import('child_process')
const mutableChildProcess = childProcess as any

describe('CommandExecutor Unit Tests', function() {
  let executor: CommandExecutor

  beforeEach(function() {
    executor = new CommandExecutor('test-platform', {
      timeout: 5000,
      encoding: 'utf8'
    })
  })

  describe('基本命令执行', function() {
    it('应该能够执行简单的系统命令', async function() {
      // 使用跨平台兼容的命令
      const command = process.platform === 'win32' ? 'echo hello' : 'echo "hello"'
      const result = await executor.execute(command)

      expect(result.stdout.trim()).to.equal('hello')
      expect(result.stderr).to.equal('')
      expect(result.exitCode).to.equal(0)
      expect(result.platform).to.equal('test-platform')
      expect(result.command).to.equal(command)
      expect(result.executionTime).to.be.a('number')
    })

    it('应该正确处理命令执行失败', async function() {
      try {
        await executor.execute('nonexistent-command-12345')
        // 如果没有抛出错误，则测试失败
        expect.fail('应该抛出错误')
      } catch (error: any) {
        expect(error).to.be.an('error')
        // 检查是否是MonitorError
        if (error.code) {
          expect(error.code).to.be.oneOf([ErrorCode.COMMAND_FAILED, ErrorCode.FILE_NOT_FOUND])
        }
      }
    })

    it('应该正确处理有stderr输出但成功的命令', async function() {
      // 某些命令会向stderr输出信息但仍然成功
      const command = process.platform === 'win32'
        ? 'echo error>&2 & echo success'
        : 'echo "error" >&2; echo "success"'

      const result = await executor.execute(command)

      expect(result.stdout.trim()).to.include('success')
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('超时处理', function() {
    it('普通执行在 POSIX 超时后应清理 shell 的后代', async function() {
      if (process.platform === 'win32') this.skip()
      this.timeout(8000)

      const internal = executor as any
      const originalExecuteWithTimeout = internal.executeWithTimeout.bind(executor)
      let descendantPid = 0
      internal.executeWithTimeout = async (...args: any[]) => {
        try {
          return await originalExecuteWithTimeout(...args)
        } catch (error: any) {
          descendantPid = Number(String(error.stdout).trim())
          throw error
        }
      }
      const command = executor.buildCommand(process.execPath, [
        '-e', 'process.stdout.write(String(process.pid));setInterval(() => {}, 1000)'
      ]) + ' & wait'

      try {
        let caught: any
        try {
          await executor.execute(command, { timeout: 1000 })
        } catch (error) {
          caught = error
        }
        expect(caught).to.be.instanceOf(MonitorError)
        expect(caught.code).to.equal(ErrorCode.TIMEOUT)
        expect(descendantPid).to.be.greaterThan(0)

        // 允许 SIGTERM 与兜底 SIGKILL 完成，但不能留下继续运行的后代。
        const deadline = Date.now() + 2000
        let alive = true
        while (alive && Date.now() < deadline) {
          try {
            process.kill(descendantPid, 0)
            await new Promise<void>(resolve => setTimeout(resolve, 50))
          } catch (error: any) {
            if (error.code !== 'ESRCH') throw error
            alive = false
          }
        }
        expect(alive, '命令超时后仍有后代进程存活').to.equal(false)
      } finally {
        // 回归失败时也只清理本测试明确记录的进程，避免污染后续测试。
        if (descendantPid > 0) {
          try { process.kill(descendantPid, 'SIGKILL') } catch { /* 进程已退出 */ }
        }
      }
    })

    it('普通执行在 Windows 超时后应调用 taskkill 且无需等待 close', async function() {
      const originalSpawn = childProcess.spawn
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
      const child = new EventEmitter() as any
      child.pid = 43210
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdout.destroy = () => undefined
      child.stderr.destroy = () => undefined
      child.unref = () => undefined
      const killSignals: string[] = []
      child.kill = (signal: string) => killSignals.push(signal)
      const taskkill = new EventEmitter() as any
      taskkill.unref = () => undefined
      const calls: any[][] = []
      mutableChildProcess.spawn = (...args: any[]) => {
        calls.push(args)
        return args[0] === 'taskkill' ? taskkill : child
      }
      try {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
        let caught: any
        try {
          await executor.execute('ignored-command', { timeout: 20 })
        } catch (error) {
          caught = error
        }
        expect(caught).to.be.instanceOf(MonitorError)
        expect(caught.code).to.equal(ErrorCode.TIMEOUT)
        expect(calls[0][1]).to.include({ detached: false })
        expect(calls[0][1]).not.to.have.property('timeout')
        expect(calls[1]).to.deep.equal(['taskkill', ['/pid', '43210', '/T', '/F'], { stdio: 'ignore' }])
        expect(() => taskkill.emit('error', new Error('taskkill unavailable'))).not.to.throw()
        taskkill.emit('exit', 1)
        expect(killSignals).to.deep.equal(['SIGTERM'])
        // 超时之后迟到的事件必须被安全消费，不能重复完成 Promise。
        child.emit('error', new Error('late error'))
        child.emit('close', 0)
      } finally {
        mutableChildProcess.spawn = originalSpawn
        if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor)
      }
    })

    it('Windows taskkill 非零退出时应至少终止直接子进程', function() {
      const originalSpawn = childProcess.spawn
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
      const taskkill = new EventEmitter() as any
      taskkill.unref = () => undefined
      mutableChildProcess.spawn = () => taskkill
      const signals: string[] = []
      try {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
        ;(executor as any).terminateProcessTree({ pid: 43210, kill: (signal: string) => signals.push(signal) })
        taskkill.emit('exit', 1)
        expect(signals).to.deep.equal(['SIGTERM'])
      } finally {
        mutableChildProcess.spawn = originalSpawn
        if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor)
      }
    })

    it('应该在超时后终止命令', async function() {
      this.timeout(3000) // 设置测试超时

      const shortTimeout = new CommandExecutor('test-platform', { timeout: 100 })

      // 创建一个会运行较长时间的命令
      const command = process.platform === 'win32'
        ? 'ping -n 10 127.0.0.1'
        : 'sleep 5'

      try {
        await shortTimeout.execute(command)
        expect.fail('应该抛出超时错误')
      } catch (error: any) {
        expect(error).to.be.an('error')
        if (error.code) {
          expect(error.code).to.equal(ErrorCode.TIMEOUT)
        }
      }
    })
  })

  describe('输出处理', function() {
    it('普通执行应完整解码跨分块的字符并保留独立 stderr', async function() {
      const command = executor.buildCommand(process.execPath, ['-e',
        'const b=Buffer.from([0xe4,0xb8,0xad]);process.stdout.write(b.slice(0,1));setTimeout(()=>{process.stdout.write(b.slice(1));process.stderr.write(b)},20)'
      ])
      const result = await executor.execute(command, { maxBuffer: 3 })
      expect(result.stdout).to.equal('中')
      expect(result.stderr).to.equal('中')

      const encoded = await executor.execute(command, { encoding: 'hex', maxBuffer: 3 })
      expect(encoded.stdout).to.equal('e4b8ad')
      expect(encoded.stderr).to.equal('e4b8ad')
    })

    for (const stream of ['stdout', 'stderr']) {
      it(`普通执行应按字节限制 ${stream} 的多字节输出`, async function() {
        const command = executor.buildCommand(process.execPath, ['-e',
          `process.${stream}.write(Buffer.from([0xe4,0xb8,0xad]))`
        ])
        let caught: any
        try {
          await executor.execute(command, { maxBuffer: 2 })
        } catch (error) {
          caught = error
        }
        expect(caught).to.be.instanceOf(MonitorError)
        expect(caught.code).to.equal(ErrorCode.COMMAND_FAILED)
        expect(caught.message).to.include('maxBuffer')
      })
    }

    it('应该正确处理大量输出', async function() {
      // 生成大量输出的命令
      const command = process.platform === 'win32'
        ? 'for /L %i in (1,1,10) do @echo Line %i'
        : 'for i in {1..10}; do echo "Line $i"; done'

      const result = await executor.execute(command)

      const lines = result.stdout.trim().split('\n')
      expect(lines.length).to.be.at.least(5) // 至少有一些行
      expect(result.exitCode).to.equal(0)
    })

    it('应该正确处理空输出', async function() {
      const command = process.platform === 'win32' ? 'echo.' : 'true'
      const result = await executor.execute(command)

      expect(result.exitCode).to.equal(0)
    })
  })

  describe('平台特定命令', function() {
    it('应该能够执行平台特定的系统信息命令', async function() {
      let command: string

      switch (process.platform) {
        case 'darwin':
          command = 'uname -s'
          break
        case 'linux':
          command = 'uname -s'
          break
        case 'win32':
          command = 'ver'
          break
        default:
          this.skip()
          return
      }

      const result = await executor.execute(command)

      expect(result.stdout).to.be.a('string')
      expect(result.stdout.length).to.be.greaterThan(0)
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('配置选项', function() {
    it('应该使用自定义配置', async function() {
      const customExecutor = new CommandExecutor('custom-platform', {
        timeout: 1000,
        encoding: 'utf8'
      })

      const command = process.platform === 'win32' ? 'echo test' : 'echo "test"'
      const result = await customExecutor.execute(command)

      expect(result.stdout.trim()).to.equal('test')
      expect(result.platform).to.equal('custom-platform')
    })
  })

  describe('参数转义', function() {
    it('应根据实际运行平台转义参数，而不是适配器标识', function() {
      const customExecutor = new CommandExecutor('test-platform')
      const escaped = customExecutor.escapeArgument('console.log("hello world")')

      if (process.platform === 'win32') {
        expect(escaped).to.equal('"console.log(""hello world"")"')
      } else {
        expect(escaped).to.equal("'console.log(\"hello world\")'")
      }
    })
  })

  describe('并发执行', function() {
    it('应该能够并发执行多个命令', async function() {
      const commands = [
        process.platform === 'win32' ? 'echo 1' : 'echo "1"',
        process.platform === 'win32' ? 'echo 2' : 'echo "2"',
        process.platform === 'win32' ? 'echo 3' : 'echo "3"'
      ]

      const promises = commands.map(cmd => executor.execute(cmd))
      const results = await Promise.all(promises)

      results.forEach((result, index) => {
        expect(result.stdout.trim()).to.equal((index + 1).toString())
        expect(result.exitCode).to.equal(0)
      })
    })
  })

  describe('流式执行', function() {
    it('应该在禁用 shell 时正确处理包含空格的命令', async function() {
      const script = 'console.log("stream output")'

      const chunks: string[] = []
      const result = await executor.executeStream({
        executable: process.execPath,
        args: ['-e', script]
      }, (data) => {
        chunks.push(data)
      }, { shell: false })

      expect(result.exitCode).to.equal(0)
      expect(chunks.join('')).to.contain('stream output')
    })

    it('禁用 shell 时应原样保留空参数和尾反斜杠', async function() {
      const expected = ['', 'C:\\temp\\']
      const script = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))'

      const result = await executor.executeStream({
        executable: process.execPath,
        args: ['-e', script, ...expected]
      }, () => undefined, { shell: false })

      expect(JSON.parse(result.stdout)).to.deep.equal(expected)
    })

    it('流式执行不应向 spawn 传递内置 timeout', async function() {
      const originalSpawn = childProcess.spawn
      const child = new EventEmitter() as any
      let capturedOptions: Record<string, unknown> | undefined

      child.pid = 12345
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()

      mutableChildProcess.spawn = (...args: any[]) => {
        capturedOptions = args[1]
        return child
      }

      try {
        const pending = executor.executeStream('ignored-command', () => undefined, { timeout: 5000 })
        child.emit('close', 0)
        await pending

        expect(capturedOptions).to.not.have.property('timeout')
      } finally {
        mutableChildProcess.spawn = originalSpawn
      }
    })

    it('Windows taskkill 启动失败的 error 事件应被消费', function() {
      const originalSpawn = childProcess.spawn
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
      const taskkill = new EventEmitter() as any
      let listenerCountAtUnref = 0
      let capturedArgs: any[] = []

      taskkill.unref = () => {
        listenerCountAtUnref = taskkill.listenerCount('error')
        return taskkill
      }
      mutableChildProcess.spawn = (...args: any[]) => {
        capturedArgs = args
        return taskkill
      }

      try {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
        ;(executor as any).terminateProcessTree({ pid: 43210 })

        expect(capturedArgs).to.deep.equal([
          'taskkill',
          ['/pid', '43210', '/T', '/F'],
          { stdio: 'ignore' }
        ])
        expect(listenerCountAtUnref).to.equal(1)
        expect(() => taskkill.emit('error', new Error('taskkill unavailable'))).not.to.throw()
      } finally {
        mutableChildProcess.spawn = originalSpawn
        if (platformDescriptor) {
          Object.defineProperty(process, 'platform', platformDescriptor)
        }
      }
    })

    it('超时后应终止进程并抛出 TIMEOUT 错误', async function() {
      this.timeout(8000)

      const command = process.platform === 'win32'
        ? 'ping -n 10 127.0.0.1'
        : 'sleep 5'

      try {
        await executor.executeStream(command, () => undefined, { timeout: 200 })
        expect.fail('应该抛出超时错误')
      } catch (error: any) {
        expect(error).to.be.instanceOf(MonitorError)
        expect(error.code).to.equal(ErrorCode.TIMEOUT)
      }
    })

    it('POSIX 超时后应终止管道中的子进程', async function() {
      if (process.platform === 'win32') this.skip()
      this.timeout(5000)

      const script = 'console.log(process.pid);setInterval(() => {}, 1000)'
      const command = `${executor.buildCommand(process.execPath, ['-e', script])} | cat`

      try {
        await executor.executeStream(command, () => undefined, { timeout: 300 })
        expect.fail('应该抛出超时错误')
      } catch (error: any) {
        expect(error).to.be.instanceOf(MonitorError)
        expect(error.code).to.equal(ErrorCode.TIMEOUT)

        const descendantPid = Number(String(error.details.stdout).trim())
        expect(descendantPid).to.be.a('number').and.greaterThan(0)

        await new Promise<void>(resolve => setTimeout(resolve, 100))
        expect(() => process.kill(descendantPid, 0)).to.throw()
      }
    })
  })

  describe('env 选项深合并', function() {
    it('传入自定义 env 时不应丢失内置的 LC_ALL locale 设置', async function() {
      const script = 'console.log((process.env.LC_ALL || "") + "|" + (process.env.MY_TEST_VAR || ""))'
      const command = executor.buildCommand(process.execPath, ['-e', script])

      const result = await executor.execute(command, { env: { MY_TEST_VAR: '1' } })

      const [lcAll, custom] = result.stdout.trim().split('|')
      expect(lcAll).to.equal('en_US.UTF-8')
      expect(custom).to.equal('1')
    })
  })

  describe('maxBuffer 溢出错误分类', function() {
    it('输出超过 maxBuffer 时应抛出 COMMAND_FAILED 而非 TIMEOUT', async function() {
      this.timeout(5000)

      const command = executor.buildCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(200000))'])

      try {
        await executor.execute(command, { maxBuffer: 1024 })
        expect.fail('应该抛出 maxBuffer 错误')
      } catch (error: any) {
        expect(error).to.be.instanceOf(MonitorError)
        expect(error.code).to.equal(ErrorCode.COMMAND_FAILED)
        expect(error.message).to.include('maxBuffer')
      }
    })
  })

  describe('命令可用性检查', function() {
    it('命令发现和版本查询应遵循执行器配置的超时', async function() {
      const configuredExecutor = new CommandExecutor('win32', { timeout: 60000 })
      const timeouts: number[] = []
      const internal = configuredExecutor as any
      internal.executeWithTimeout = async (_command: string, options: { timeout: number }) => {
        timeouts.push(options.timeout)
        return { stdout: 'v20.20.2', stderr: '' }
      }

      expect(await configuredExecutor.isCommandAvailable('node')).to.equal(true)
      expect(await configuredExecutor.getCommandVersion('node')).to.equal('v20.20.2')
      configuredExecutor.setDefaultOptions({ timeout: 1000 })
      expect(await configuredExecutor.isCommandAvailable('node')).to.equal(true)
      expect(await configuredExecutor.getCommandVersion('node')).to.equal('v20.20.2')
      expect(timeouts).to.deep.equal([60000, 60000, 1000, 1000])
    })

    it('命令发现和版本查询应保留 TIMEOUT 及原始诊断', async function() {
      const configuredExecutor = new CommandExecutor('win32')
      const internal = configuredExecutor as any
      const timeoutError = new MonitorError('Command was killed with signal SIGTERM', ErrorCode.TIMEOUT, 'win32', {
        command: 'where node', executionTime: 5018, signal: 'SIGTERM'
      })
      let calls = 0
      internal.execute = async () => {
        calls += 1
        throw timeoutError
      }

      for (const operation of [
        () => configuredExecutor.isCommandAvailable('node'),
        () => configuredExecutor.getCommandVersion('node')
      ]) {
        let caught: unknown
        try {
          await operation()
        } catch (error) {
          caught = error
        }
        expect(caught).to.equal(timeoutError)
      }
      expect(calls).to.equal(2)
    })

    it('定位命令确认失败且无 stdout 时仍应返回 false', async function() {
      const internal = executor as any
      internal.executeWithTimeout = async () => {
        throw Object.assign(new Error('not found'), { code: 1, stdout: '', stderr: 'not found' })
      }
      expect(await executor.isCommandAvailable('missing-command')).to.equal(false)
    })

    it('定位命令非零退出但含 stdout 时仍应返回 false', async function() {
      const internal = executor as any
      const originalExecute = internal.execute
      internal.execute = async () => ({ stdout: 'not found', stderr: '', exitCode: 1 })

      try {
        expect(await executor.isCommandAvailable('missing-command')).to.equal(false)
      } finally {
        internal.execute = originalExecute
      }
    })
  })
})

describe('CommandExecutor — Deno 兼容性：非标准异常处理', function() {
  it('T023: 应将字符串类型的非标准异常统一捕获为 MonitorError(COMMAND_FAILED)', async function() {
    const executor = new CommandExecutor('test-platform')
    const internal = executor as any

    // 模拟 Deno 兼容层抛出非 Error 实例（字符串）
    internal.executeWithTimeout = async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'Deno compat layer: exec failed unexpectedly'
    }

    try {
      await executor.execute('echo test')
      expect.fail('应该抛出错误')
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError)
      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED)
    }
  })

  it('T023: 应将自定义对象类型的非标准异常统一捕获为 MonitorError(COMMAND_FAILED)', async function() {
    const executor = new CommandExecutor('test-platform')
    const internal = executor as any

    // 模拟 Deno 兼容层抛出普通对象（非 Error 实例）
    internal.executeWithTimeout = async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw { message: 'DENO_EXEC_ERROR', code: 'ERR_DENO_COMPAT' }
    }

    try {
      await executor.execute('echo test')
      expect.fail('应该抛出错误')
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError)
      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED)
    }
  })
})

describe('CommandExecutor 短命调用方的进程树清理', function() {
  it('调用方结束前应完成对忽略 SIGTERM 后代的 SIGKILL 兜底', async function() {
    if (process.platform === 'win32') this.skip()
    this.timeout(10000)

    const executorModule = require.resolve('../../../src/utils/command-executor')
    // 单独的调用方捕获 TIMEOUT 后自然结束，不能借助 Mocha 的活动句柄维持兜底定时器。
    // 后代先注册信号处理再上报 PID；即使诊断异常导致无法取得 PID，也会在 10 秒后自行退出。
    const descendantScript = 'process.on("SIGTERM",()=>{});process.stdout.write(String(process.pid));setTimeout(()=>{},10000)'
    const callerScript = `
      const { CommandExecutor } = require(${JSON.stringify(executorModule)});
      (async () => {
        const executor = new CommandExecutor(process.platform);
        const command = executor.buildCommand(process.execPath, ['-e', ${JSON.stringify(descendantScript)}]) + ' & wait';
        try {
          await executor.execute(command, { timeout: 1000 });
        } catch (error) {
          console.log(JSON.stringify({ code: error.code, pid: Number(String(error.details.stdout).trim()) }));
        }
      })();
    `
    let descendantPid = 0

    try {
      const caller = childProcess.spawnSync(process.execPath, ['-e', callerScript], {
        encoding: 'utf8',
        timeout: 5000
      })
      const diagnostic = JSON.parse(String(caller.stdout).trim())
      descendantPid = Number(diagnostic.pid)
      expect(caller.error, String(caller.stderr)).to.equal(undefined)
      expect(caller.status, String(caller.stderr)).to.equal(0)
      expect(diagnostic.code).to.equal(ErrorCode.TIMEOUT)
      expect(descendantPid).to.be.greaterThan(0)

      // 即使调用方提前退出，也给原定的 SIGKILL 宽限期留足时间，再判定是否泄漏。
      const deadline = Date.now() + 2000
      let alive = true
      while (alive && Date.now() < deadline) {
        try {
          process.kill(descendantPid, 0)
          await new Promise<void>(resolve => setTimeout(resolve, 50))
        } catch (error: any) {
          if (error.code !== 'ESRCH') throw error
          alive = false
        }
      }
      expect(alive, '短命调用方退出后仍留下忽略 SIGTERM 的后代').to.equal(false)
    } finally {
      if (descendantPid > 0) {
        try { process.kill(descendantPid, 'SIGKILL') } catch { /* 进程已退出 */ }
      }
    }
  })
})
