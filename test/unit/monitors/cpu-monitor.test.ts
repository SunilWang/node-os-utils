import { expect } from 'chai';

import { CPUMonitor } from '../../../src/monitors/cpu-monitor';
import { PlatformAdapter } from '../../../src/types/platform';
import { DataSize } from '../../../src/types/common';

describe('CPUMonitor', () => {
  const cpuInfoRaw = {
    model: 'Test CPU',
    manufacturer: 'TestVendor',
    architecture: 'arm64',
    cores: 4,
    threads: 8,
    baseFrequency: 2400,
    maxFrequency: 3200,
    cache: {
      l1d: 64 * 1024,
      l2: 512 * 1024
    },
    features: ['neon'],
    vendorId: 'VND',
    family: 6,
    modelNumber: 158,
    stepping: 10
  };

  const cpuUsageRaw = {
    overall: '50',
    cores: ['40', '60'],
    user: '30',
    system: '15',
    idle: '55',
    iowait: '5',
    irq: '0',
    softirq: '0'
  };

  const loadRaw = { load1: '0.5', load5: '0.8', load15: '1.1' };
  const temperatureRaw = [{ temperature: '45.5' }, { temp: '50.1' }];

  let cpuInfoCalls = 0;
  let cpuUsageCalls = 0;
  let temperatureCalls = 0;

  function createAdapter(): PlatformAdapter {
    cpuInfoCalls = 0;
    cpuUsageCalls = 0;
    temperatureCalls = 0;

    return {
      getPlatform: () => 'darwin',
      isSupported: (feature: string) => !feature.includes('disabled'),
      executeCommand: async () => ({ stdout: '', stderr: '', exitCode: 0, platform: 'darwin', executionTime: 0, command: '' }),
      readFile: async () => '',
      fileExists: async () => true,
      getCPUInfo: async () => {
        cpuInfoCalls += 1;
        return cpuInfoRaw;
      },
      getCPUUsage: async () => {
        cpuUsageCalls += 1;
        return cpuUsageRaw;
      },
      getCPUTemperature: async () => {
        temperatureCalls += 1;
        return temperatureRaw;
      },
      getMemoryInfo: async () => ({}),
      getMemoryUsage: async () => ({}),
      getDiskInfo: async () => ({}),
      getDiskIO: async () => ({}),
      getNetworkInterfaces: async () => ({}),
      getNetworkStats: async () => ({}),
      getProcesses: async () => ([]),
      getProcessInfo: async () => ({}),
      getSystemInfo: async () => ({}),
      getSystemLoad: async () => loadRaw,
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

  it('info 会转换 CPU 基本信息并缓存结果', async () => {
    const monitor = new CPUMonitor(createAdapter());
    const first = await monitor.info();
    if (!first.success) {
      throw new Error('expected success');
    }
    const firstData = first.data;
    expect(first.cached).to.be.false;
    expect(firstData.model).to.equal('Test CPU');
    expect(firstData.cache.l1d).to.be.instanceOf(DataSize);
    expect((firstData.cache.l1d as DataSize).toBytes()).to.equal(64 * 1024);

    const second = await monitor.info();
    if (!second.success) {
      throw new Error('expected success');
    }
    expect(second.cached).to.be.true;
    expect(cpuInfoCalls).to.equal(1);
  });

  it('usageDetailed 返回解析后的使用率数据', async () => {
    const monitor = new CPUMonitor(createAdapter());
    const result = await monitor.usageDetailed();
    if (!result.success) {
      throw new Error('expected success');
    }
    const data = result.data;
    expect(data.overall).to.equal(50);
    expect(data.cores).to.deep.equal(['40', '60']);
    expect(cpuUsageCalls).to.equal(1);
  });

  it('temperature 在配置启用后返回温度信息', async () => {
    const monitor = new CPUMonitor(createAdapter());

    const disabled = await monitor.temperature();
    expect(disabled.success).to.be.false;

    monitor.withTemperature(true);
    const enabled = await monitor.temperature();
    if (!enabled.success) {
      throw new Error('expected success');
    }
    const temperature = enabled.data;
    expect(temperature).to.deep.equal([45.5, 50.1]);
    expect(temperatureCalls).to.equal(1);
  });

  it('frequency 返回基础与最大频率信息', async () => {
    const monitor = new CPUMonitor(createAdapter());
    const result = await monitor.frequency();
    if (!result.success) {
      throw new Error('expected success');
    }
    const data = result.data;
    expect(data.map(item => item.type)).to.include.members(['base', 'max']);
  });

  it('coreCount 返回物理与逻辑核心', async () => {
    const monitor = new CPUMonitor(createAdapter());
    const result = await monitor.coreCount();
    if (!result.success) {
      throw new Error('expected success');
    }
    const data = result.data;
    expect(data.physical).to.equal(4);
    expect(data.logical).to.equal(8);
  });

  it('loadAverage 返回转换后的负载信息', async () => {
    const monitor = new CPUMonitor(createAdapter());
    const result = await monitor.loadAverage();
    if (!result.success) {
      throw new Error('expected success');
    }
    const data = result.data;
    expect(data).to.deep.equal({ load1: 0.5, load5: 0.8, load15: 1.1 });
  });
});
