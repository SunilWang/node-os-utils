import { expect } from 'chai';

import { BaseMonitor } from '../../../src/core/base-monitor';
import { CacheManager } from '../../../src/core/cache-manager';
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

  /** 模拟具体监控器维护的独立子配置对象，用于验证 withConfig/withCaching 的 TTL 同步 */
  cpuConfig = { cacheTTL: 10, interval: 1000 };

  constructor(adapter: PlatformAdapter, cache?: CacheManager) {
    super(adapter, { cacheTTL: 20 }, cache);
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

  async slowCachedOperation(delayMs: number) {
    return this.executeWithCache('slow', async () => {
      this.callCount += 1;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return { value: this.callCount };
    }, 50);
  }

  async timeoutOperation(delayMs: number) {
    return this.executeWithCache('timeout-test', async () => {
      this.callCount += 1;
      await new Promise(resolve => setTimeout(resolve, delayMs));
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

  it('withCaching 应同步更新缓存 TTL', () => {
    const monitor = new TestMonitor(createAdapterStub());

    monitor.withCaching(true, 123);

    expect(monitor.getConfig().cacheTTL).to.equal(123);
    expect(monitor.getCacheStats()).to.not.equal(null);
    expect((monitor as any).cache.getDefaultTTL()).to.equal(123);
    // 子配置对象中的 TTL 也应被同步，确保具体监控器读取到新值
    expect(monitor.cpuConfig.cacheTTL).to.equal(123);
  });

  it('withConfig 应同步子配置对象中的字段', () => {
    const monitor = new TestMonitor(createAdapterStub());

    monitor.withConfig({ cacheTTL: 456 });

    expect(monitor.cpuConfig.cacheTTL).to.equal(456);
  });

  it('executeWithCache 对相同 key 的并发请求会复用 in-flight Promise', async () => {
    const monitor = new TestMonitor(createAdapterStub());

    const [first, second] = await Promise.all([
      monitor.slowCachedOperation(30),
      monitor.slowCachedOperation(30)
    ]);

    expect(first.success).to.be.true;
    expect(second.success).to.be.true;
    if (!first.success || !second.success) {
      throw new Error('expected success');
    }
    // 操作只执行一次，两个调用方拿到相同结果
    expect(first.data.value).to.equal(1);
    expect(second.data.value).to.equal(1);
  });

  it('operation 超过 config.timeout 时返回 TIMEOUT 错误结果，不写入缓存且无 in-flight 残留', async () => {
    const monitor = new TestMonitor(createAdapterStub());
    monitor.withConfig({ timeout: 50 });

    const result = await monitor.timeoutOperation(200);

    expect(result.success).to.be.false;
    if (result.success) {
      throw new Error('expected failure');
    }
    expect(result.error).to.be.instanceOf(MonitorError);
    expect(result.error.code).to.equal(ErrorCode.TIMEOUT);

    // 超时结果不写入缓存
    expect(monitor.getCacheStats()?.size).to.equal(0);
    // in-flight 去重表在超时后无残留
    expect((monitor as any).inflightRequests.size).to.equal(0);

    // 超时后仍可正常重试，成功结果正常写入缓存
    const retry = await monitor.timeoutOperation(10);
    expect(retry.success).to.be.true;
    expect(monitor.getCacheStats()?.size).to.equal(1);
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

  it('destroy 不应销毁外部注入的共享 CacheManager', async () => {
    const sharedCache = new CacheManager({ defaultTTL: 1000 });
    sharedCache.set('shared-key', { value: 42 });

    const monitor = new TestMonitor(createAdapterStub(), sharedCache);
    monitor.destroy();

    // 共享缓存由调用方管理，监控器销毁后仍应可用
    expect(sharedCache.get('shared-key')).to.deep.equal({ value: 42 });

    sharedCache.destroy();
  });
});

describe('BaseMonitor.warnDegradation — Deno 兼容性降级警告', () => {
  let originalWarn: typeof console.warn;
  let warnCalls: string[];

  beforeEach(() => {
    // 重置静态 Set（访问私有静态属性）
    (BaseMonitor as any).warnedDegradations?.clear();
    originalWarn = console.warn;
    warnCalls = [];
    console.warn = (...args: any[]) => { warnCalls.push(args.join(' ')); };
  });

  afterEach(() => {
    console.warn = originalWarn;
    (BaseMonitor as any).warnedDegradations?.clear();
  });

  it('T024: 相同 key 首次调用时应触发 console.warn', () => {
    (BaseMonitor as any).warnDegradation('cpu.command_failed', 'PowerShell WMI 不可用');
    expect(warnCalls).to.have.lengthOf(1);
    expect(warnCalls[0]).to.include('[node-os-utils]');
    expect(warnCalls[0]).to.include('cpu');
  });

  it('T024: 相同 key 第二次调用时不应重复触发 console.warn', () => {
    (BaseMonitor as any).warnDegradation('cpu.command_failed', 'PowerShell WMI 不可用');
    (BaseMonitor as any).warnDegradation('cpu.command_failed', 'PowerShell WMI 不可用');
    expect(warnCalls).to.have.lengthOf(1);
  });

  it('T024: 不同 key 应各自独立触发一次 console.warn', () => {
    (BaseMonitor as any).warnDegradation('cpu.command_failed', 'CPU 降级');
    (BaseMonitor as any).warnDegradation('memory.command_failed', 'Memory 降级');
    expect(warnCalls).to.have.lengthOf(2);
  });
});
