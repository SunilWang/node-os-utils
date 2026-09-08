import { expect } from 'chai';

import { AdapterFactory } from '../../../src/adapters/adapter-factory';
import { MonitorError, ErrorCode } from '../../../src/types/errors';
import { PlatformAdapter, SupportedFeatures } from '../../../src/types/platform';

function createStubSupportedFeatures(): SupportedFeatures {
  return {
    cpu: {
      info: true,
      usage: true,
      temperature: true,
      frequency: true,
      cache: true,
      perCore: true,
      cores: true
    },
    memory: {
      info: true,
      usage: true,
      swap: true,
      pressure: true,
      detailed: true,
      virtual: true
    },
    disk: {
      info: true,
      io: true,
      health: true,
      smart: true,
      filesystem: true,
      usage: true,
      stats: true,
      mounts: true,
      filesystems: true
    },
    network: {
      interfaces: true,
      stats: true,
      connections: true,
      bandwidth: true,
      gateway: true
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
      info: true,
      load: true,
      uptime: true,
      users: true,
      services: true
    }
  };
}

function createStubAdapter(): PlatformAdapter {
  const features = createStubSupportedFeatures();

  return {
    getPlatform: () => 'linux',
    isSupported: () => true,
    executeCommand: async (command: string) => ({
      stdout: `/usr/bin/${command.split(/\s+/).pop()}`,
      stderr: '',
      exitCode: 0,
      platform: 'linux',
      executionTime: 1,
      command
    }),
    readFile: async () => '',
    fileExists: async () => true,
    getCPUInfo: async () => ({}),
    getCPUUsage: async () => ({}),
    getCPUTemperature: async () => ({}),
    getMemoryInfo: async () => ({}),
    getMemoryUsage: async () => ({}),
    getDiskInfo: async () => ({}),
    getDiskIO: async () => ({}),
    getNetworkInterfaces: async () => ({}),
    getNetworkStats: async () => ({}),
    getProcesses: async () => ({}),
    getProcessInfo: async () => ({}),
    getSystemInfo: async () => ({}),
    getSystemLoad: async () => ({}),
    getDiskUsage: async () => ({}),
    getDiskStats: async () => ({}),
    getMounts: async () => ({}),
    getFileSystems: async () => ({}),
    getNetworkConnections: async () => ({}),
    getDefaultGateway: async () => ({}),
    getProcessList: async () => ({}),
    killProcess: async () => true,
    getProcessOpenFiles: async () => [],
    getProcessEnvironment: async () => ({}),
    getSystemUptime: async () => ({}),
    getSystemUsers: async () => ({}),
    getSystemServices: async () => ({}),
    getSupportedFeatures: () => features
  } as PlatformAdapter;
}

describe('AdapterFactory', () => {
  afterEach(() => {
    AdapterFactory.clearCache();
  });

  it('缓存已创建的平台适配器实例', () => {
    const first = AdapterFactory.create('darwin');
    const second = AdapterFactory.create('darwin');
    expect(second).to.equal(first);
  });

  it('不支持的平台会抛出 MonitorError', () => {
    expect(() => AdapterFactory.create('solaris')).to.throw(MonitorError)
      .and.have.property('code', ErrorCode.PLATFORM_NOT_SUPPORTED);
  });

  it('支持常见平台别名转换', () => {
    const adapter = AdapterFactory.create('macos');
    expect(adapter.getPlatform()).to.equal('darwin');
  });

  it('checkPlatformCapabilities 能汇总适配器能力', async () => {
    const originalCreate = AdapterFactory.create.bind(AdapterFactory);

    (AdapterFactory as any).create = () => createStubAdapter();

    try {
      const result = await AdapterFactory.checkPlatformCapabilities('linux');

      expect(result.supported).to.be.true;
      expect(result.capabilities.features).to.include('cpu.info');
      expect(result.capabilities.commands).to.include('ps');
      expect(result.capabilities.files).to.include('/proc/cpuinfo');
    } finally {
      (AdapterFactory as any).create = originalCreate;
    }
  });

  it('checkPlatformCapabilities 在不支持的平台返回问题列表', async () => {
    const result = await AdapterFactory.checkPlatformCapabilities('aix');

    expect(result.supported).to.be.false;
    expect(result.issues[0]).to.include('not supported');
  });

  it('getPlatformDisplayName 返回友好名称', () => {
    expect(AdapterFactory.getPlatformDisplayName('mac')).to.equal('macOS');
    expect(AdapterFactory.getPlatformDisplayName('win')).to.equal('Windows');
  });
});
