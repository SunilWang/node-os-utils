import { expect } from 'chai';

import { MemoryMonitor } from '../../../src/monitors/memory-monitor';
import { PlatformAdapter } from '../../../src/types/platform';
import { DataSize } from '../../../src/types/common';

describe('MemoryMonitor', () => {
  const GB = 1024 * 1024 * 1024;
  const memoryRaw = {
    total: 16 * GB,
    available: 8 * GB,
    free: 6 * GB,
    used: 8 * GB,
    cached: 2 * GB,
    buffers: 256 * 1024 * 1024,
    shared: 512 * 1024 * 1024,
    reclaimable: 128 * 1024 * 1024,
    pressure: { level: 'medium', score: 55 },
    swap: {
      total: 4 * GB,
      used: 1 * GB,
      swapIn: 100,
      swapOut: 200
    },
    active: 1 * GB,
    inactive: 2 * GB,
    wired: 512 * 1024 * 1024,
    compressed: 256 * 1024 * 1024,
    kernel: 128 * 1024 * 1024,
    drivers: 64 * 1024 * 1024
  };

  let memoryInfoCalls = 0;

  function createAdapter(): PlatformAdapter {
    memoryInfoCalls = 0;

    return {
      getPlatform: () => 'linux',
      isSupported: (feature: string) => !feature.includes('disabled'),
      executeCommand: async () => ({ stdout: '', stderr: '', exitCode: 0, platform: 'linux', executionTime: 0, command: '' }),
      readFile: async () => '',
      fileExists: async () => true,
      getCPUInfo: async () => ({}),
      getCPUUsage: async () => ({}),
      getCPUTemperature: async () => ([]),
      getMemoryInfo: async () => {
        memoryInfoCalls += 1;
        return memoryRaw;
      },
      getMemoryUsage: async () => ({}),
      getDiskInfo: async () => ({}),
      getDiskIO: async () => ({}),
      getNetworkInterfaces: async () => ({}),
      getNetworkStats: async () => ({}),
      getProcesses: async () => ([]),
      getProcessInfo: async () => ({}),
      getSystemInfo: async () => ({}),
      getSystemLoad: async () => ({}),
      getDiskUsage: async () => ({}),
      getDiskStats: async () => ({}),
      getMounts: async () => ({}),
      getFileSystems: async () => ({}),
      getNetworkConnections: async () => ({}),
      getDefaultGateway: async () => ({}),
      getProcessList: async () => ([]),
      killProcess: async () => true,
      getProcessOpenFiles: async () => ([]),
      getProcessEnvironment: async () => ({}),
      getSystemUptime: async () => ({}),
      getSystemUsers: async () => ([]),
      getSystemServices: async () => ([]),
      getSupportedFeatures: () => ({
        cpu: { info: true, usage: true, temperature: true, frequency: true, cache: true, perCore: true, cores: true },
        memory: { info: true, usage: true, swap: true, pressure: true, detailed: true, virtual: true },
        disk: { info: true, io: true, health: true, smart: true, filesystem: true, usage: true, stats: true, mounts: true, filesystems: true },
        network: { interfaces: true, stats: true, connections: true, bandwidth: true, gateway: true },
        process: { list: true, details: true, tree: true, monitor: true, info: true, kill: true, openFiles: true, environment: true },
        system: { info: true, load: true, uptime: true, users: true, services: true }
      })
    } as PlatformAdapter;
  }

  it('info 会转换内存信息并缓存', async () => {
    const monitor = new MemoryMonitor(createAdapter());
    const first = await monitor.info();
    if (!first.success) {
      throw new Error('expected success');
    }
    const firstData = first.data;
    expect(first.cached).to.be.false;
    expect(firstData.total).to.be.instanceOf(DataSize);
    expect(firstData.total.toBytes()).to.equal(16 * GB);

    const second = await monitor.info();
    if (!second.success) {
      throw new Error('expected success');
    }
    expect(second.cached).to.be.true;
    expect(memoryInfoCalls).to.equal(1);
  });

  it('usage 返回内存使用率百分比', async () => {
    const monitor = new MemoryMonitor(createAdapter());
    const result = await monitor.usage();
    if (!result.success) {
      throw new Error('expected success');
    }
    const data = result.data;
    expect(data).to.equal(50);
  });

  it('swap 在禁用时返回错误，启用时返回详情', async () => {
    const monitor = new MemoryMonitor(createAdapter());
    monitor.withSwap(false);

    const disabled = await monitor.swap();
    expect(disabled.success).to.be.false;

    monitor.withSwap(true);
    const enabled = await monitor.swap();
    if (!enabled.success) {
      throw new Error('expected success');
    }
    const swap = enabled.data;
    expect(swap.total.toBytes()).to.equal(4 * GB);
    expect(swap.swapIn).to.equal(100);
  });

  it('pressure 在启用后使用原始数据中的压力信息', async () => {
    const monitor = new MemoryMonitor(createAdapter());
    monitor.withPressure(true);

    const result = await monitor.pressure();
    if (!result.success) {
      throw new Error('expected success');
    }
    const pressure = result.data;
    expect(pressure.level).to.equal('medium');
    expect(pressure.score).to.equal(55);
  });

  it('summary 返回格式化后的摘要数据', async () => {
    const monitor = new MemoryMonitor(createAdapter());
    monitor.withUnit('GB');
    const result = await monitor.summary();
    if (!result.success) {
      throw new Error('expected success');
    }
    const summary = result.data;
    expect(summary.total).to.match(/GB$/);
    expect(summary.swap.usagePercentage).to.be.a('number');
  });
});
