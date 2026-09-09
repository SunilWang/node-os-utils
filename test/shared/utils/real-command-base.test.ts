import { expect } from 'chai'
import { RealCommandTestBase as Base } from '../../current/real-command-base'
import { MonitorError, ErrorCode } from '../../../src/types/errors'
import { ExecuteOptions } from '../../../src/types/config'
import { CommandExecutor } from '../../../src/utils/command-executor'

/**
 * 创建可记录超时预算和跳过次数的 Mocha 上下文替身。
 *
 * @param {number} initialTimeout 当前测试或 hook 的超时预算
 * @returns {{ context: Mocha.Context; skipCount: number }} 上下文和可观测状态
 */
function createContext(initialTimeout = 30000): { context: Mocha.Context; skipCount: number } {
  let timeout = initialTimeout
  const fixture = {
    context: {} as Mocha.Context,
    skipCount: 0
  }
  fixture.context = {
    /**
     * 读取或更新当前 runnable 的超时预算。
     * @param {number} [value] 新预算；省略时只读取
     * @returns {number | Mocha.Context} 当前预算或上下文
     */
    timeout(value?: number): number | Mocha.Context {
      if (value === undefined) return timeout
      timeout = value
      return this as Mocha.Context
    },
    /**
     * 记录环境能力限制触发的跳过。
     * @returns {void}
     */
    skip(): void {
      fixture.skipCount += 1
    }
  } as Mocha.Context
  return fixture
}

describe('RealCommandTestBase 基线初始化', function () {
  const originalPlatform = Base.platform
  const originalExecute = CommandExecutor.prototype.execute
  const originalConsoleError = console.error
  let executions: Array<{ command: string; options: ExecuteOptions }>
  let diagnostics: string[]
  let commandError: Error | undefined

  beforeEach(function () {
    executions = []
    diagnostics = []
    commandError = undefined
    Base.platform = () => 'win32'
    console.error = (message: string) => { diagnostics.push(message) }
    CommandExecutor.prototype.execute = async function (command, options = {}) {
      executions.push({ command, options })
      if (commandError) throw commandError
      return { command, platform: Base.platform(), executionTime: 0, stdout: '', stderr: '', exitCode: 0 }
    }
  })

  afterEach(function () {
    Base.platform = originalPlatform
    CommandExecutor.prototype.execute = originalExecute
    console.error = originalConsoleError
  })

  it('Windows 基线应有独立初始化预算，外层 hook 需留出错误上报时间', async function () {
    const fixture = createContext()
    await Base.requireRuntimeBaseline(fixture.context)

    expect(executions).to.have.length(1)
    expect(executions[0].command).to.include('Get-CimInstance Win32_OperatingSystem')
    expect(executions[0].options.timeout).to.equal(60000)
    expect(fixture.context.timeout()).to.equal(65000)
    expect(fixture.skipCount).to.equal(0)
  })

  it('应保留调用方更长或无限的 hook 预算', async function () {
    for (const timeout of [120000, 0]) {
      const fixture = createContext(timeout)
      await Base.requireRuntimeBaseline(fixture.context)
      expect(fixture.context.timeout()).to.equal(timeout)
      expect(executions[executions.length - 1].options.timeout).to.equal(60000)
    }
  })

  it('Linux 和 macOS 应保留原命令预算、hook 预算和自定义命令', async function () {
    for (const platform of ['linux', 'darwin'] as const) {
      Base.platform = () => platform
      const fixture = createContext()
      await Base.requireRuntimeBaseline(fixture.context, { [platform]: 'custom-baseline' })
      expect(executions[executions.length - 1]).to.deep.equal({
        command: 'custom-baseline',
        options: { timeout: 5000 }
      })
      expect(fixture.context.timeout()).to.equal(30000)
    }
  })

  it('基线持续超时仍应失败并输出诊断，不得重试或跳过', async function () {
    const fixture = createContext()
    commandError = new MonitorError('Command was killed with signal SIGTERM', ErrorCode.TIMEOUT, 'win32', {
      executionTime: 60012
    })
    let caught: unknown
    try {
      await Base.requireRuntimeBaseline(fixture.context)
    } catch (error) {
      caught = error
    }

    expect(caught).to.equal(commandError)
    expect(executions).to.have.length(1)
    expect(fixture.skipCount).to.equal(0)
    expect(diagnostics).to.have.length(1)
    expect(diagnostics[0]).to.include('Get-CimInstance Win32_OperatingSystem')
    expect(diagnostics[0]).to.include('timeout=60000ms executionTime=60012ms')
  })

  it('普通命令失败仍应抛出，只有明确的环境能力限制可以跳过', async function () {
    for (const code of [ErrorCode.COMMAND_FAILED, ErrorCode.PERMISSION_DENIED]) {
      const fixture = createContext()
      commandError = new MonitorError('baseline failed', code, 'win32')
      let caught: unknown
      try {
        await Base.requireRuntimeBaseline(fixture.context)
      } catch (error) {
        caught = error
      }
      expect(caught).to.equal(code === ErrorCode.COMMAND_FAILED ? commandError : undefined)
      expect(fixture.skipCount).to.equal(code === ErrorCode.PERMISSION_DENIED ? 1 : 0)
    }
  })
})
