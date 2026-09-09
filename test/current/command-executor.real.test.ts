import { expect } from 'chai'
import { CommandExecutor } from '../../src/utils/command-executor'
import { ErrorCode, MonitorError } from '../../src/types/errors'
import { RealCommandTestBase as Base } from './real-command-base'

describe('CommandExecutor 真实命令执行', function () {
  const executor = new CommandExecutor(process.platform, { timeout: 5000 })
  const nodeCommand = (script: string): string => `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`

  it('应执行当前 Node 命令并保留 stdout、平台和执行时间', async function () {
    const result = await executor.execute(nodeCommand('process.stdout.write("real-command")'))
    expect(result.stdout).to.equal('real-command')
    expect(result.exitCode).to.equal(0)
    expect(result.platform).to.equal(process.platform)
    Base.assertNonNegative(result.executionTime, 'command.executionTime')
  })

  it('成功命令的 stderr 不应影响 exitCode 和 stdout', async function () {
    const result = await executor.execute(nodeCommand('process.stdout.write("out"); process.stderr.write("warn")'))
    expect(result.exitCode).to.equal(0)
    expect(result.stdout).to.equal('out')
    expect(result.stderr).to.equal('warn')
  })

  it('非零退出且无 stdout 时应保留退出码并返回 COMMAND_FAILED', async function () {
    try {
      await executor.execute(nodeCommand('process.exit(7)'))
      expect.fail('非零退出必须失败')
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError)
      const monitorError = error as MonitorError
      expect(monitorError.code).to.equal(ErrorCode.COMMAND_FAILED)
      expect(monitorError.details.exitCode).to.equal(7)
    }
  })

  it('非零退出但含 stdout 时应保留可解析结果', async function () {
    const result = await executor.execute(nodeCommand('process.stdout.write("partial"); process.exit(3)'))
    expect(result.exitCode).to.equal(3)
    expect(result.stdout).to.equal('partial')
  })

  it('超时命令必须返回 TIMEOUT，不能被环境跳过', async function () {
    this.timeout(5000)
    try {
      await executor.execute(nodeCommand('setTimeout(() => {}, 1000)'), { timeout: 50 })
      expect.fail('超时命令必须失败')
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError)
      expect((error as MonitorError).code).to.equal(ErrorCode.TIMEOUT)
    }
  })

  it('超过 maxBuffer 的输出必须返回 COMMAND_FAILED', async function () {
    try {
      await executor.execute(nodeCommand('process.stdout.write("x".repeat(2048))'), { maxBuffer: 1024 })
      expect.fail('maxBuffer 溢出必须失败')
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError)
      expect((error as MonitorError).code).to.equal(ErrorCode.COMMAND_FAILED)
    }
  })

  it('executeMultiple 应保留输入顺序并软化单个失败', async function () {
    const commands = [nodeCommand('process.stdout.write("first")'), nodeCommand('process.exit(2)'), nodeCommand('process.stdout.write("third")')]
    const results = await executor.executeMultiple(commands)
    expect(results.map(item => item.command)).to.deep.equal(commands)
    expect(results[0].stdout).to.equal('first')
    expect(results[1].exitCode).to.equal(1)
    expect(results[2].stdout).to.equal('third')
  })

  it('executeConcurrent 应返回每个真实命令的结果', async function () {
    const commands = [nodeCommand('process.stdout.write("a")'), nodeCommand('process.stdout.write("b")')]
    const results = await executor.executeConcurrent(commands)
    expect(results).to.have.length(2)
    expect(results.map(item => item.stdout).sort()).to.deep.equal(['a', 'b'])
  })

  it('流式执行应分别暴露 stdout 和 stderr', async function () {
    const chunks: Array<{ data: string; isError: boolean }> = []
    const result = await executor.executeStream(
      nodeCommand('process.stdout.write("out"); process.stderr.write("err")'),
      (data, isError) => chunks.push({ data, isError })
    )
    expect(result.stdout).to.equal('out')
    expect(result.stderr).to.equal('err')
    expect(chunks.some(chunk => chunk.data === 'out' && !chunk.isError)).to.equal(true)
    expect(chunks.some(chunk => chunk.data === 'err' && chunk.isError)).to.equal(true)
  })

  it('流式命令非零退出且无 stdout 时应返回 COMMAND_FAILED', async function () {
    try {
      await executor.executeStream(nodeCommand('process.stderr.write("failed"); process.exit(9)'), () => undefined)
      expect.fail('非零流式命令必须失败')
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError)
      expect((error as MonitorError).code).to.equal(ErrorCode.COMMAND_FAILED)
    }
  })

  it('流式超时应返回 TIMEOUT 并终止子进程', async function () {
    this.timeout(5000)
    try {
      await executor.executeStream(nodeCommand('setTimeout(() => {}, 1000)'), () => undefined, { timeout: 50 })
      expect.fail('流式超时必须失败')
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError)
      expect((error as MonitorError).code).to.equal(ErrorCode.TIMEOUT)
    }
  })

  it('shell 为 false 时应原样传递结构化可执行参数', async function () {
    const result = await executor.executeStream(
      {
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("no-shell")']
      },
      () => undefined,
      { shell: false }
    )
    expect(result.stdout).to.equal('no-shell')
  })

  it('自定义 env 应与默认 locale 环境合并后传递给命令', async function () {
    const result = await executor.execute(nodeCommand('process.stdout.write(process.env.REAL_COMMAND_VALUE + ":" + Boolean(process.env.LC_ALL))'), {
      env: { REAL_COMMAND_VALUE: 'env-ok' }
    })
    expect(result.stdout).to.equal('env-ok:true')
  })

  describe('命令发现与版本查询', function () {
    // Windows Runner 的首次 where 查询已出现超过 5 秒的耗时；仅为探测提供独立预算。
    const timeout = process.platform === 'win32' ? 60000 : 5000
    const discoveryExecutor = new CommandExecutor(process.platform, { timeout })
    this.timeout(timeout + 5000)

    it('应在 PATH 中检测到 Node 可执行文件', async function () {
      expect(await discoveryExecutor.isCommandAvailable('node')).to.equal(true)
    })

    it('不存在的命令应返回 false', async function () {
      expect(await discoveryExecutor.isCommandAvailable('__node_os_utils_missing_command__')).to.equal(false)
    })

    it('应获取当前 Node 命令的版本', async function () {
      expect(await discoveryExecutor.getCommandVersion('node')).to.match(/^v\d+/)
    })
  })
})
