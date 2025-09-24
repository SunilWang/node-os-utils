import { expect } from 'chai'
import { NetworkMonitor } from '../../../src/monitors/network-monitor'
import { PlatformAdapter, CommandResult, SupportedFeatures } from '../../../src/types/platform'

interface NetworkStubOptions {
  statsSequence: Array<Array<{ interface: string; rxBytes: number; txBytes: number }>>
}

const NETWORK_SUPPORTED_FEATURES: SupportedFeatures = {
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
    interfaces: true,
    stats: true,
    connections: false,
    bandwidth: true,
    gateway: false
  },
  process: {
    list: false,
    details: false,
    tree: false,
    monitor: false,
    info: false,
    kill: false,
    openFiles: false,
    environment: false
  },
  system: {
    info: false,
    load: false,
    uptime: false,
    users: false,
    services: false
  }
}

class NetworkAdapterStub implements PlatformAdapter {
  public statsCallCount = 0

  constructor(private readonly options: NetworkStubOptions) {}

  getPlatform(): string {
    return 'test-platform'
  }

  isSupported(feature: string): boolean {
    return feature.startsWith('network')
  }

  async executeCommand(command: string): Promise<CommandResult> {
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
  async getNetworkInterfaces(): Promise<any> { return {} }

  async getNetworkStats(): Promise<any> {
    const index = Math.min(this.statsCallCount, this.options.statsSequence.length - 1)
    this.statsCallCount += 1
    return this.options.statsSequence[index]
  }

  async getProcesses(): Promise<any> { return [] }
  async getProcessInfo(): Promise<any> { return null }
  async getSystemInfo(): Promise<any> { return {} }
  async getSystemLoad(): Promise<any> { return {} }
  async getDiskUsage(): Promise<any> { return [] }
  async getDiskStats(): Promise<any> { return [] }
  async getMounts(): Promise<any> { return [] }
  async getFileSystems(): Promise<any> { return [] }
  async getNetworkConnections(): Promise<any> { return [] }
  async getDefaultGateway(): Promise<any> { return null }
  async getProcessList(): Promise<any> { return [] }
  async killProcess(): Promise<boolean> { return false }
  async getProcessOpenFiles(): Promise<string[]> { return [] }
  async getProcessEnvironment(): Promise<Record<string, string>> { return {} }
  async getSystemUptime(): Promise<any> { return 0 }
  async getSystemUsers(): Promise<any> { return [] }
  async getSystemServices(): Promise<any> { return [] }

  getSupportedFeatures(): SupportedFeatures {
    return NETWORK_SUPPORTED_FEATURES
  }
}

describe('NetworkMonitor', function() {
  it('带宽计算应在缓存存在时仍触发新的统计请求', async function() {
    const adapter = new NetworkAdapterStub({
      statsSequence: [
        [{ interface: 'eth0', rxBytes: 0, txBytes: 0 }],
        [{ interface: 'eth0', rxBytes: 2048, txBytes: 1024 }],
        [{ interface: 'eth0', rxBytes: 4096, txBytes: 2048 }]
      ]
    })

    const monitor = new NetworkMonitor(adapter, {
      includeBandwidth: true,
      includeInterfaceStats: true,
      cacheEnabled: true,
      cacheTTL: 1000,
      bandwidthInterval: 10
    })

    await monitor.statsAsync()
    const baselineCalls = adapter.statsCallCount

    const result = await monitor.bandwidth()

    expect(adapter.statsCallCount).to.equal(baselineCalls + 2)
    if (!result.success || !result.data) {
      expect.fail('带宽监控应返回成功结果')
      return
    }

    expect(result.data.interfaces).to.have.lengthOf(1)
    expect(result.data.interfaces[0].rxSpeed).to.be.greaterThan(0)
  })
})
