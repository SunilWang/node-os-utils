import { expect } from 'chai';

import { AdapterFactory } from '../../../src/adapters/adapter-factory';
import { MonitorError, ErrorCode } from '../../../src/types/errors';
import { PlatformAdapter, SupportedFeatures } from '../../../src/types/platform';
import { ExecuteOptions } from '../../../src/types/config';

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
  const originalCreate = AdapterFactory.create;

  afterEach(() => {
    AdapterFactory.create = originalCreate;
    AdapterFactory.clearCache();
  });

  it('缓存已创建的平台适配器实例', () => {
    const first = AdapterFactory.create('darwin');
    const second = AdapterFactory.create('darwin');
    expect(second).to.equal(first);
  });

  it('自定义命令超时应隔离适配器实例并下发执行器默认值', () => {
    const first = AdapterFactory.create('darwin', { timeout: 15000 });
    const second = AdapterFactory.create('darwin', { timeout: 15000 });
    const differentTimeout = AdapterFactory.create('darwin', { timeout: 20000 });

    expect(second).to.not.equal(first);
    expect(differentTimeout).to.not.equal(first);
    expect((first as any).executor.getDefaultOptions().timeout).to.equal(15000);
    expect((second as any).executor.getDefaultOptions().timeout).to.equal(15000);
    expect((differentTimeout as any).executor.getDefaultOptions().timeout).to.equal(20000);
  });

  it('自定义执行选项应完整传递给底层执行器', () => {
    const adapter = AdapterFactory.create('darwin', {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      shell: false
    });
    const options = (adapter as any).executor.getDefaultOptions();

    expect(options.timeout).to.equal(15000);
    expect(options.maxBuffer).to.equal(2 * 1024 * 1024);
    expect(options.shell).to.equal(false);
  });

  it('省略命令超时应复用显式 10000ms 的默认适配器', () => {
    const implicitDefault = AdapterFactory.create('darwin');
    AdapterFactory.create('darwin', { timeout: 15000 });
    const explicitDefault = AdapterFactory.create('darwin', { timeout: 10000 });

    expect(explicitDefault).to.equal(implicitDefault);
  });

  it('同一平台切换多个命令超时不应导致缓存无界增长', () => {
    AdapterFactory.create('darwin');
    AdapterFactory.create('darwin', { timeout: 15000 });
    AdapterFactory.create('darwin', { timeout: 20000 });
    AdapterFactory.create('darwin', { timeout: 25000 });

    expect(AdapterFactory.getCacheSize()).to.equal(1);
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

  for (const timeout of [10000, 60000]) {
    it(`checkPlatformCapabilities 应继承适配器的 ${timeout}ms 默认命令预算`, async () => {
      const adapter = originalCreate.call(AdapterFactory, 'darwin', { timeout });
      const observedTimeouts: number[] = [];
      const executor = (adapter as any).executor;
      executor.executeWithTimeout = async (_command: string, options: ExecuteOptions) => {
        observedTimeouts.push(options.timeout!);
        return { stdout: '/usr/bin/test', stderr: '' };
      };
      adapter.fileExists = async () => true;
      AdapterFactory.create = () => adapter;

      const result = await AdapterFactory.checkPlatformCapabilities('darwin');

      expect(result.capabilities.commands).to.include('ps');
      expect(observedTimeouts).to.have.length(8);
      expect(observedTimeouts.every(value => value === timeout)).to.equal(true);
    });
  }

  it('命令定位返回非零退出码和 stdout 时不应标记为可用', async () => {
    const adapter = createStubAdapter();
    const executeCommand = adapter.executeCommand;
    adapter.executeCommand = async (command: string) => ({
      ...await executeCommand(command),
      exitCode: 1
    });
    AdapterFactory.create = () => adapter;

    const result = await AdapterFactory.checkPlatformCapabilities('linux');

    expect(result.supported).to.equal(true);
    expect(result.capabilities.commands).to.deep.equal([]);
    expect(result.issues).to.deep.equal([]);
  });

  it('命令定位成功但没有路径输出时不应标记为可用', async () => {
    const adapter = createStubAdapter();
    const executeCommand = adapter.executeCommand;
    adapter.executeCommand = async (command: string) => ({
      ...await executeCommand(command),
      stdout: '  '
    });
    AdapterFactory.create = () => adapter;

    const result = await AdapterFactory.checkPlatformCapabilities('linux');

    expect(result.capabilities.commands).to.deep.equal([]);
    expect(result.issues).to.have.length(9);
    expect(result.issues[0]).to.include('ps');
  });

  it('探测超时应报告 TIMEOUT 并保留平台支持状态及已成功的能力', async () => {
    const adapter = createStubAdapter();
    const executeCommand = adapter.executeCommand;
    adapter.executeCommand = async (command: string) => {
      if (command === 'which top') {
        throw new MonitorError('探测超时', ErrorCode.TIMEOUT, 'linux');
      }
      return executeCommand(command);
    };
    AdapterFactory.create = () => adapter;

    const result = await AdapterFactory.checkPlatformCapabilities('linux');

    expect(result.supported).to.equal(true);
    expect(result.capabilities.commands).to.include('ps').and.include('df').and.not.include('top');
    expect(result.capabilities.files).to.include('/proc/cpuinfo');
    expect(result.capabilities.features).to.include('cpu.info');
    expect(result.issues).to.have.length(1);
    expect(result.issues[0]).to.include('top').and.include('TIMEOUT').and.include('探测超时');
  });

  it('命令定位器异常退出应报告失败，而目标命令不存在仍按缺失能力处理', async () => {
    const adapter = createStubAdapter();
    const executeCommand = adapter.executeCommand;
    adapter.executeCommand = async (command: string) => {
      if (command === 'which ps') {
        throw MonitorError.createCommandFailed('linux', command, { exitCode: 1 });
      }
      if (command === 'which top') {
        return { ...await executeCommand(command), exitCode: 2, stderr: '定位器异常' };
      }
      if (command === 'which df') {
        throw MonitorError.createCommandFailed('linux', command, { code: 'ENOENT' });
      }
      return executeCommand(command);
    };
    AdapterFactory.create = () => adapter;

    const result = await AdapterFactory.checkPlatformCapabilities('linux');

    expect(result.capabilities.commands).to.not.include('ps').and.not.include('top').and.not.include('df');
    expect(result.capabilities.commands).to.include('free');
    expect(result.issues).to.have.length(2);
    expect(result.issues[0]).to.include('top').and.include('2');
    expect(result.issues[1]).to.include('df').and.include('COMMAND_FAILED');
  });

  it('功能枚举失败应沿用 supported 为 false 的契约并保留已成功的命令与文件', async () => {
    const adapter = createStubAdapter();
    adapter.fileExists = async (file: string) => {
      if (file === '/proc/meminfo') {
        throw new MonitorError('文件访问被拒绝', ErrorCode.PERMISSION_DENIED, 'linux');
      }
      if (file === '/proc/stat') {
        throw new MonitorError('文件不存在', ErrorCode.FILE_NOT_FOUND, 'linux');
      }
      return true;
    };
    adapter.getSupportedFeatures = () => {
      throw new Error('无法读取功能支持信息');
    };
    AdapterFactory.create = () => adapter;

    const result = await AdapterFactory.checkPlatformCapabilities('linux');

    expect(result.supported).to.equal(false);
    expect(result.capabilities.commands).to.include('ps');
    expect(result.capabilities.files).to.include('/proc/cpuinfo').and.include('/proc/uptime');
    expect(result.capabilities.files).to.not.include('/proc/meminfo').and.not.include('/proc/stat');
    expect(result.capabilities.features).to.deep.equal([]);
    expect(result.issues).to.have.length(2);
    expect(result.issues[0]).to.include('/proc/meminfo').and.include('PERMISSION_DENIED');
    expect(result.issues[1]).to.include('无法读取功能支持信息');
  });

  it('适配器初始化失败应沿用 supported 为 false 的契约并报告错误', async () => {
    AdapterFactory.create = () => {
      throw new MonitorError('初始化超时', ErrorCode.TIMEOUT, 'linux');
    };

    const result = await AdapterFactory.checkPlatformCapabilities('linux');

    expect(result.supported).to.equal(false);
    expect(result.capabilities.commands).to.deep.equal([]);
    expect(result.issues).to.have.length(1);
    expect(result.issues[0]).to.include('TIMEOUT').and.include('初始化超时');
  });

  it('getPlatformDisplayName 返回友好名称', () => {
    expect(AdapterFactory.getPlatformDisplayName('mac')).to.equal('macOS');
    expect(AdapterFactory.getPlatformDisplayName('win')).to.equal('Windows');
  });
});
