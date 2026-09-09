import { expect } from 'chai'
import { asyncTest, longTest } from './test-base'
import { probePowerShell, queryPowerShell } from './windows-powershell'

const childProcess = require('child_process') as typeof import('child_process')
const mutableChildProcess = childProcess as any

/**
 * 创建可以验证外层预算的 Mocha 上下文替身。
 *
 * @param {number} initialTimeout 初始预算，0 表示无限
 * @returns {Mocha.Context} 仅实现 timeout 的测试上下文
 */
function createContext(initialTimeout: number): Mocha.Context {
  let timeout = initialTimeout
  return {
    /**
     * 读取或更新预算。
     * @param {number} [value] 新预算
     * @returns {number | Mocha.Context} 当前预算或上下文
     */
    timeout(value?: number): number | Mocha.Context {
      if (value === undefined) return timeout
      timeout = value
      return this as Mocha.Context
    }
  } as Mocha.Context
}

describe('真实测试的外层预算', function () {
  it('asyncTest 应覆盖默认 15 秒监控调用并保留上下文', async function () {
    const context = createContext(10000)
    let called = false
    await asyncTest(async function (this: Mocha.Context) {
      expect(this).to.equal(context)
      expect(this.timeout()).to.equal(20000)
      called = true
    }).call(context)
    expect(called).to.equal(true)
  })

  it('异步装饰器不得缩短更长或无限的预算', async function () {
    for (const decorate of [asyncTest, longTest]) {
      for (const timeout of [65000, 0]) {
        const context = createContext(timeout)
        await decorate(async () => undefined).call(context)
        expect(context.timeout()).to.equal(timeout)
      }
    }
  })

  it('异步装饰器应继续传播被测调用的失败', async function () {
    const failure = new Error('监控调用失败')
    for (const decorate of [asyncTest, longTest]) {
      let caught: unknown
      try {
        await decorate(async () => { throw failure }).call(createContext(10000))
      } catch (error) {
        caught = error
      }
      expect(caught).to.equal(failure)
    }
  })
})

describe('独立 Windows PowerShell 交叉校验', function () {
  const originalExecFile = childProcess.execFile
  const originalWarn = console.warn
  let executions: Array<{ executable: string; args: string[]; options: any }>
  let stdout: string
  let stderr: string
  let commandError: Error | undefined

  beforeEach(function () {
    executions = []
    stdout = '\uFEFF {"Caption":"Windows"}\r\n'
    stderr = ''
    commandError = undefined
    console.warn = () => undefined
    mutableChildProcess.execFile = (executable: string, args: string[], options: any, callback: Function) => {
      executions.push({ executable, args, options })
      callback(commandError, stdout, stderr)
    }
  })

  afterEach(function () {
    mutableChildProcess.execFile = originalExecFile
    console.warn = originalWarn
  })

  it('普通交叉查询应设置命令超时并只移除 BOM 和空白', async function () {
    expect(await queryPowerShell('Get-CimInstance Win32_OperatingSystem')).to.deep.equal({ Caption: 'Windows' })
    expect(executions[0].executable).to.equal('powershell')
    expect(executions[0].options.timeout).to.equal(15000)
    expect(executions[0].args).to.include('-NonInteractive')
    expect(executions[0].args[3]).to.include('ConvertTo-Json')
  })

  it('独立基线应使用 60 秒命令和至少 65 秒 hook 预算', async function () {
    for (const [initialTimeout, expectedTimeout] of [[30000, 65000], [120000, 120000], [0, 0]]) {
      const context = createContext(initialTimeout)
      expect(await probePowerShell(context)).to.equal(true)
      expect(context.timeout()).to.equal(expectedTimeout)
      expect(executions[executions.length - 1].options.timeout).to.equal(60000)
    }
  })

  it('被终止的基线应保留原始错误和输出，不能返回不可用', async function () {
    commandError = Object.assign(new Error('命令被终止'), { killed: true, signal: 'SIGTERM' })
    stderr = 'permission denied before termination'
    let caught: any
    try {
      await probePowerShell(createContext(30000))
    } catch (error) {
      caught = error
    }
    expect(caught).to.equal(commandError)
    expect(caught.signal).to.equal('SIGTERM')
    expect(caught.stderr).to.equal(stderr)
    expect(executions).to.have.length(1)
  })

  it('基线空输出和无效 JSON 不能转换为 PowerShell 不可用', async function () {
    for (const output of ['', '\uFEFF\r\n', 'not-json']) {
      stdout = output
      let caught: unknown
      try {
        await probePowerShell(createContext(30000))
      } catch (error) {
        caught = error
      }
      expect(caught).to.be.instanceOf(SyntaxError)
    }
  })

  it('未知命令失败应继续抛出，只有明确缺失或权限限制可以降级', async function () {
    for (const code of [1, 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'ENOENT', 'EACCES', 'EPERM']) {
      commandError = Object.assign(new Error('PowerShell 执行失败'), { code })
      let caught: unknown
      let available: boolean | undefined
      try {
        available = await probePowerShell(createContext(30000))
      } catch (error) {
        caught = error
      }
      const environmental = ['ENOENT', 'EACCES', 'EPERM'].includes(String(code))
      expect(caught).to.equal(environmental ? undefined : commandError)
      expect(available).to.equal(environmental ? false : undefined)
    }
  })
})
