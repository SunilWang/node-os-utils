import { expect } from 'chai';

import { BaseMonitor } from '../../../src/core/base-monitor';
import { MonitorError, ErrorCode } from '../../../src/types/errors';
import { PlatformAdapter } from '../../../src/types/platform';
import { MonitorResult } from '../../../src/types';

function createAdapterStub(): PlatformAdapter {
  return {
    getPlatform: () => 'test',
    isSupported: (feature: string) => feature !== 'unsupported.feature',
    executeCommand: async () => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
      platform: 'test',
      executionTime: 0,
      command: ''
    }),
    readFile: async () => '',
    fileExists: async () => true,
    getCPUInfo: async () => ({}),
    getCPUUsage: async () => ({ overall: 10 }),
    getCPUTemperature: async () => ([]),
    getMemoryInfo: async () => ({ total: 1, available: 1 }),
    getMemoryUsage: async () => ({}),
    getDiskInfo: async () => ({}),
    getDiskIO: async () => ({}),
    getNetworkInterfaces: async () => ({}),
    getNetworkStats: async () => ({}),
    getProcesses: async () => ({}),
    getProcessInfo: async () => ({}),
    getSystemInfo: async () => ({}),
    getSystemLoad: async () => ({ load1: 0.1, load5: 0.2, load15: 0.3 }),
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

class TestMonitor extends BaseMonitor<{ value: number }> {
  private callCount = 0;

  constructor(adapter: PlatformAdapter) {
    super(adapter, { cacheTTL: 20 });
  }

  protected getDefaultConfig() {
    return {
      cacheEnabled: true,
      cacheTTL: 10
    };
  }

  async info(): Promise<MonitorResult<{ value: number }>> {
    this.callCount += 1;
    return this.createSuccessResult({ value: this.callCount });
  }

  async cachedOperation() {
    return this.executeWithCache('test', async () => {
      this.callCount += 1;
      return { value: this.callCount };
    }, 50);
  }

  handleErrorPublic(error: any) {
    return this.handleError(error);
  }

  validateFeature(feature: string) {
    this.validatePlatformSupport(feature);
  }
}

describe('BaseMonitor', () => {
  it('executeWithCache 命中缓存时返回 cached 结果', async () => {
    const monitor = new TestMonitor(createAdapterStub());

    const first = await monitor.cachedOperation();
    const second = await monitor.cachedOperation();

    expect(first.success).to.be.true;
    if (!first.success) {
      throw new Error('expected success');
    }
    expect(first.cached).to.be.false;
    expect(first.data.value).to.equal(1);

    expect(second.success).to.be.true;
    if (!second.success) {
      throw new Error('expected success');
    }
    expect(second.cached).to.be.true;
    expect(second.data.value).to.equal(first.data.value);
  });

  it('withCaching(false) 会禁用缓存', async () => {
    const monitor = new TestMonitor(createAdapterStub());

    monitor.withCaching(false);

    const first = await monitor.cachedOperation();
    const second = await monitor.cachedOperation();

    expect(first.success).to.be.true;
    if (!first.success) {
      throw new Error('expected success');
    }
    expect(first.cached).to.be.false;

    expect(second.success).to.be.true;
    if (!second.success) {
      throw new Error('expected success');
    }
    expect(second.cached).to.be.false;
    expect(second.data.value).to.equal(first.data.value + 1);
  });

  it('monitor 方法会触发回调并可取消订阅', async () => {
    const monitor = new TestMonitor(createAdapterStub());

    const values: number[] = [];

    await new Promise<void>((resolve) => {
      const subscription = monitor.monitor(10, (data) => {
        values.push(data.value);
        subscription.unsubscribe();
        resolve();
      });
    });

    expect(values).to.have.lengthOf(1);
    expect(monitor.getActiveSubscriptions()).to.equal(0);
  });

  it('handleError 会将错误包装成 MonitorError', () => {
    const monitor = new TestMonitor(createAdapterStub());
    monitor.on('error', () => undefined);
    const result = monitor.handleErrorPublic(new Error('boom'));

    expect(result.success).to.be.false;
    if (result.success) {
      throw new Error('expected failure');
    }
    expect(result.error).to.be.instanceOf(MonitorError);
    expect(result.error.code).to.equal(ErrorCode.COMMAND_FAILED);
  });

  it('validatePlatformSupport 在不支持的功能上抛出异常', () => {
    const monitor = new TestMonitor(createAdapterStub());
    expect(() => monitor.validateFeature('unsupported.feature')).to.throw(MonitorError);
  });

  it('destroy 会清理订阅与缓存', async () => {
    const monitor = new TestMonitor(createAdapterStub());
    await monitor.cachedOperation();

    monitor.monitor(5, () => undefined);
    expect(monitor.getActiveSubscriptions()).to.equal(1);

    monitor.destroy();

    expect(monitor.getActiveSubscriptions()).to.equal(0);
    expect(monitor.getCacheStats()?.size).to.equal(0);
  });
});
