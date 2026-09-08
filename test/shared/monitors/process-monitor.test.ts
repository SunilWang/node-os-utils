import { expect } from 'chai'
import { ProcessMonitor } from '../../../src/monitors/process-monitor'
import { PlatformAdapter, CommandResult, SupportedFeatures } from '../../../src/types/platform'
import { ErrorCode, MonitorError } from '../../../src/types/errors'

interface ProcessStubOptions {
  processes?: any[]
  processInfo?: Record<number, any>
}

const SUPPORTED_FEATURES: SupportedFeatures = {
  cpu: {
    info: false,
    usage: false,
    temperature: false,
    frequency: false,
    cache: false,
    perCore: false,
    cores: false
  },
  memory: {
    info: false,
    usage: false,
    swap: false,
    pressure: false,
    detailed: false,
    virtual: false
  },
  disk: {
    info: false,
    io: false,
    health: false,
    smart: false,
    filesystem: false,
    usage: false,
    stats: false,
    mounts: false,
    filesystems: false
  },
  network: {
    interfaces: false,
    stats: false,
    connections: false,
    bandwidth: false,
    gateway: false
  },
  process: {
    list: true,
    details: true,
    tree: true,
    monitor: true,
    info: true,
    kill: true,
    openFiles: true,
    environment: true
  },
  system: {
    info: false,
    load: false,
    uptime: false,
    users: false,
    services: false
  }
}

class ProcessAdapterStub implements PlatformAdapter {
  public processListCalls = 0
  public processInfoCalls = 0
  public killProcessCalls: Array<{ pid: number; signal?: string }> = []
  public processOpenFilesCalls = 0
  public processEnvironmentCalls = 0

  constructor(private readonly options: ProcessStubOptions = {}) {}

  getPlatform(): string {
    return 'test-platform'
  }

  isSupported(feature: string): boolean {
    return feature.startsWith('process')
  }

  async executeCommand(command: string, _options?: any): Promise<CommandResult> {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      platform: this.getPlatform(),
      executionTime: 0,
      command
    }
  }

  async readFile(): Promise<string> { return '' }
  async fileExists(): Promise<boolean> { return false }
  async getCPUInfo(): Promise<any> { return {} }
  async getCPUUsage(): Promise<any> { return {} }
  async getCPUTemperature(): Promise<any> { return {} }
  async getMemoryInfo(): Promise<any> { return {} }
  async getMemoryUsage(): Promise<any> { return {} }
  async getDiskInfo(): Promise<any> { return [] }
  async getDiskIO(): Promise<any> { return [] }
  async getNetworkInterfaces(): Promise<any> { return [] }
  async getNetworkStats(): Promise<any> { return [] }
  async getProcesses(): Promise<any> { return this.getProcessList() }

  async getProcessInfo(pid: number): Promise<any> {
    this.processInfoCalls += 1
    if (!this.options.processInfo) {
      return null
    }
    return this.options.processInfo[pid] ?? null
  }

  async getSystemInfo(): Promise<any> { return {} }
  async getSystemLoad(): Promise<any> { return {} }
  async getDiskUsage(): Promise<any> { return [] }
  async getDiskStats(): Promise<any> { return [] }
  async getMounts(): Promise<any> { return [] }
  async getFileSystems(): Promise<any> { return [] }
  async getNetworkConnections(): Promise<any> { return [] }
  async getDefaultGateway(): Promise<any> { return null }

  async getProcessList(): Promise<any> {
    this.processListCalls += 1
    return this.options.processes ?? []
  }

  async killProcess(pid: number, signal?: string): Promise<boolean> {
    this.killProcessCalls.push({ pid, signal })
    return true
  }
  async getProcessOpenFiles(): Promise<string[]> {
    this.processOpenFilesCalls += 1
    return []
  }
  async getProcessEnvironment(): Promise<Record<string, string>> {
    this.processEnvironmentCalls += 1
    return {}
  }
  async getSystemUptime(): Promise<any> { return 0 }
  async getSystemUsers(): Promise<any> { return [] }
  async getSystemServices(): Promise<any> { return [] }

  getSupportedFeatures(): SupportedFeatures {
    return SUPPORTED_FEATURES
  }
}

describe('ProcessMonitor', function() {
  it('缓存命中时仍应返回空进程结果', async function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter)

    const first = await monitor.byPid(99999)
    const second = await monitor.byPid(99999)

    if (!first.success) {
      expect.fail('第一次调用应成功返回')
      return
    }
    expect(first.data).to.be.null

    if (!second.success) {
      expect.fail('第二次调用应成功返回缓存结果')
      return
    }
    expect(second.data).to.be.null
    expect(second.cached).to.be.true
    expect(adapter.processInfoCalls).to.equal(1)
  })

  it('topByCpu 应忽略 maxResults 限制以返回真实的高占用进程', async function() {
    const processes = Array.from({ length: 5 }).map((_, index) => ({
      pid: index + 1,
      ppid: 0,
      name: `process-${index}`,
      command: `process-${index}`,
      state: 'running',
      cpuUsage: index * 20,
      memoryUsage: (index + 1) * 1024,
      memoryPercentage: index * 5,
      startTime: Date.now() - 1000
    }))

    const adapter = new ProcessAdapterStub({ processes })
    const monitor = new ProcessMonitor(adapter, { maxResults: 2 })

    const topResult = await monitor.topByCpu(1)

    if (!topResult.success || !topResult.data) {
      expect.fail('获取Top进程失败')
      return
    }
    expect(topResult.data).to.have.lengthOf(1)
    expect(topResult.data[0].pid).to.equal(5)
    expect(adapter.processListCalls).to.equal(1)
  })

  it('kill 应将合法参数传递给平台适配器', async function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter)

    const result = await monitor.kill(123, 'SIGTERM')

    expect(result.success).to.be.true
    if (result.success) {
      expect(result.data).to.be.true
    }
    expect(adapter.killProcessCalls).to.deep.equal([{ pid: 123, signal: 'SIGTERM' }])
  })

  it('kill 应拒绝 0 和负数 PID，避免发送进程组信号', async function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter)

    const zeroResult = await monitor.kill(0, '0')
    const negativeResult = await monitor.kill(-123, 'SIGTERM')

    expect(zeroResult.success && zeroResult.data).to.equal(false)
    expect(negativeResult.success && negativeResult.data).to.equal(false)
    expect(adapter.killProcessCalls).to.be.empty
  })

  it('kill 应在平台调用前拒绝包含非法字符的信号', async function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter)

    const result = await monitor.kill(123, 'TERM;unexpected')

    expect(result.success).to.be.true
    if (result.success) {
      expect(result.data).to.be.false
    }
    expect(adapter.killProcessCalls).to.be.empty
  })

  it('kill 应在平台调用前拒绝运行时传入的非数字 PID', async function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter)
    const runtimePid = '123;unexpected' as unknown as number

    const result = await monitor.kill(runtimePid, 'SIGTERM')

    expect(result.success).to.be.true
    if (result.success) {
      expect(result.data).to.be.false
    }
    expect(adapter.killProcessCalls).to.be.empty
  })

  it('基于 PID 的查询应在平台调用前拒绝运行时非法参数', async function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter, {
      includeOpenFiles: true,
      includeEnvironment: true
    })
    const runtimePid = '123;unexpected' as unknown as number

    const infoResult = await monitor.byPid(runtimePid)
    const filesResult = await monitor.openFiles(runtimePid)
    const environmentResult = await monitor.environment(runtimePid)

    expect(infoResult.success && infoResult.data).to.be.null
    expect(filesResult.success && filesResult.data).to.deep.equal([])
    expect(environmentResult.success && environmentResult.data).to.deep.equal({})
    expect(adapter.processInfoCalls).to.equal(0)
    expect(adapter.processOpenFilesCalls).to.equal(0)
    expect(adapter.processEnvironmentCalls).to.equal(0)
  })

  it('exists 应保留进程查询失败，不能误报为进程不存在', async function() {
    const adapter = new ProcessAdapterStub()
    adapter.getProcessInfo = async () => {
      throw new MonitorError('查询失败', ErrorCode.COMMAND_FAILED, 'test-platform')
    }
    const monitor = new ProcessMonitor(adapter)

    const result = await monitor.exists(123)

    expect(result.success).to.equal(false)
    if (!result.success) {
      expect(result.error.code).to.equal(ErrorCode.COMMAND_FAILED)
    }
  })

  it('parseStartTime 无法解析时应返回 undefined 且 runtime 不产生 NaN', function() {
    const adapter = new ProcessAdapterStub()
    const monitor = new ProcessMonitor(adapter)

    const transform = (monitor as any).transformProcessInfo.bind(monitor)

    // 无法解析的启动时间：startTime/runtime 均降级为 undefined
    const unknownStart = transform({ pid: 1, ppid: 0, name: 'a', startTime: 'not-a-date' })
    expect(unknownStart.startTime).to.be.undefined
    expect(unknownStart.runtime).to.be.undefined

    // 缺失启动时间字段：同样降级为 undefined
    const missingStart = transform({ pid: 2, ppid: 0, name: 'b' })
    expect(missingStart.startTime).to.be.undefined
    expect(missingStart.runtime).to.be.undefined

    // 非有限数值不应传播 NaN
    const nanStart = transform({ pid: 3, ppid: 0, name: 'c', startTime: NaN })
    expect(nanStart.startTime).to.be.undefined
    expect(nanStart.runtime).to.be.undefined

    // 合法毫秒时间戳：正常计算 runtime
    const now = Date.now()
    const valid = transform({ pid: 4, ppid: 0, name: 'd', startTime: now - 5000 })
    expect(valid.startTime).to.equal(now - 5000)
    expect(valid.runtime).to.be.within(5000, 6000)

    // 合法秒时间戳：自动放大为毫秒
    const secondsStart = transform({ pid: 5, ppid: 0, name: 'e', startTime: 1700000000 })
    expect(secondsStart.startTime).to.equal(1700000000 * 1000)
  })
})
