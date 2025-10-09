import { expect } from 'chai'
import { ProcessMonitor } from '../../../src/monitors/process-monitor'
import { PlatformAdapter, CommandResult, SupportedFeatures } from '../../../src/types/platform'

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

  constructor(private readonly options: ProcessStubOptions = {}) {}

  getPlatform(): string {
    return 'test-platform'
  }

  isSupported(feature: string): boolean {
    return feature.startsWith('process')
  }

  async executeCommand(command: string, options?: any): Promise<CommandResult> {
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

  async killProcess(): Promise<boolean> { return true }
  async getProcessOpenFiles(): Promise<string[]> { return [] }
  async getProcessEnvironment(): Promise<Record<string, string>> { return {} }
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
})
