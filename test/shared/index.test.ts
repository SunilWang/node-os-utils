import { expect } from 'chai';

import OSUtils, { OSUtils as OSUtilsClass, createOSUtils } from '../../src/index';
import { AdapterFactory } from '../../src/adapters/adapter-factory';
import { PlatformAdapter, CommandResult } from '../../src/types/platform';
import { DataSize } from '../../src/types/common';

function createAdapterStub(): PlatformAdapter {
  return {
    getPlatform: () => 'test',
    isSupported: () => true,
    executeCommand: async (command: string): Promise<CommandResult> => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
      platform: 'test',
      executionTime: 0,
      command
    }),
    readFile: async () => '',
    fileExists: async () => true,
    getCPUInfo: async () => ({}),
    getCPUUsage: async () => ({}),
    getCPUTemperature: async () => ([]),
    getMemoryInfo: async () => ({}),
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

function makeSuccessResult<T>(data: T) {
  return {
    success: true as const,
    data,
    timestamp: Date.now(),
    cached: false,
    platform: 'test'
  };
}

describe('OSUtils 入口类', () => {
  const originalCreate = AdapterFactory.create;

  beforeEach(() => {
    (AdapterFactory as any).create = () => createAdapterStub();
    AdapterFactory.clearCache();
  });

  afterEach(() => {
    (AdapterFactory as any).create = originalCreate;
    AdapterFactory.clearCache();
  });

  it('cpu/内存等监控器按需懒加载并复用实例', () => {
    const utils = new OSUtilsClass({ platform: 'test' });

    const cpu1 = utils.cpu;
    const cpu2 = utils.cpu;
    const memory = utils.memory;

    expect(cpu1).to.equal(cpu2);
    expect(memory).to.not.equal(cpu1);
  });

  it('configureCache 会重建缓存并重置监控器实例', () => {
    const utils = new OSUtilsClass({ platform: 'test' });
    const firstCpu = utils.cpu;

    utils.configureCache({ maxSize: 5, defaultTTL: 200 });

    const stats = utils.getCacheStats();
    expect(stats?.maxSize).to.equal(5);

    const secondCpu = utils.cpu;
    expect(secondCpu).to.not.equal(firstCpu);
  });

  it('overview 聚合各监控器返回的数据', async () => {
    const utils = new OSUtilsClass({ platform: 'test' });

    (utils as any)._system = {
      info: () => Promise.resolve(makeSuccessResult({ hostname: 'test-host' })),
      destroy: () => undefined
    };
    (utils as any)._cpu = {
      usage: () => Promise.resolve(makeSuccessResult(42)),
      destroy: () => undefined
    };
    (utils as any)._memory = {
      summary: () => Promise.resolve(makeSuccessResult({ total: '16 GB' })),
      destroy: () => undefined
    };
    (utils as any)._disk = {
      spaceOverview: () => Promise.resolve(makeSuccessResult({ free: '100 GB' })),
      healthCheck: () => Promise.resolve(makeSuccessResult({ status: 'healthy', issues: [] })),
      destroy: () => undefined
    };
    (utils as any)._network = {
      overview: () => Promise.resolve(makeSuccessResult({
        interfaces: 3,
        activeInterfaces: 2,
        totalRxBytes: new DataSize(1024),
        totalTxBytes: new DataSize(2048),
        totalPackets: 500,
        totalErrors: 1
      })),
      healthCheck: () => Promise.resolve(makeSuccessResult({ status: 'warning', issues: ['latency'] })),
      destroy: () => undefined
    };
    (utils as any)._process = {
      stats: () => Promise.resolve(makeSuccessResult({ running: 120 })),
      destroy: () => undefined
    };

    const overview = await utils.overview();

    expect(overview.system?.hostname).to.equal('test-host');
    expect(overview.cpu?.usage).to.equal(42);
    expect(overview.network?.totalErrors).to.equal(1);
    expect(overview.processes?.running).to.equal(120);
  });

  it('healthCheck 汇总健康状态并计算总体结果', async () => {
    const utils = new OSUtilsClass({ platform: 'test' });

    (utils as any)._system = {
      info: () => Promise.resolve(makeSuccessResult({})),
      healthCheck: () => Promise.resolve(makeSuccessResult({ status: 'healthy', issues: [] })),
      destroy: () => undefined
    };
    (utils as any)._disk = {
      healthCheck: () => Promise.resolve(makeSuccessResult({ status: 'critical', issues: ['disk failure'] })),
      destroy: () => undefined
    };
    (utils as any)._network = {
      healthCheck: () => Promise.resolve(makeSuccessResult({ status: 'warning', issues: ['latency'] })),
      destroy: () => undefined
    };

    const health = await utils.healthCheck();

    expect(health.status).to.equal('critical');
    expect(health.issues).to.include('disk failure');
    expect(health.details?.network?.status).to.equal('warning');
  });

  it('createOSUtils 工厂函数返回 OSUtils 实例', () => {
    const instance = createOSUtils({ platform: 'test', debug: true });
    expect(instance).to.be.instanceOf(OSUtilsClass);
    expect(OSUtils).to.equal(OSUtilsClass);
  });
});
