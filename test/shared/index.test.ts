import { expect } from 'chai';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import * as path from 'path';

import OSUtils, { OSUtils as OSUtilsClass, createOSUtils } from '../../src/index';
import { AdapterFactory } from '../../src/adapters/adapter-factory';
import { PlatformAdapter, CommandResult } from '../../src/types/platform';
import { DataSize } from '../../src/types/common';
import { removePathSync } from './utils/remove-path';

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

/**
 * 使用 NodeNext 编译真实包入口的 ESM 与 CommonJS 类型消费用例。
 *
 * @param packageRoot 包根目录
 * @returns 无返回值
 * @throws TypeScript 声明或包导出条件不兼容时抛出编译错误
 */
function compilePackageEntryTypeFixtures(packageRoot: string): void {
  const fixtureDir = mkdtempSync(path.join(packageRoot, '.entry-types-'));
  const esmFixture = path.join(fixtureDir, 'consumer.mts');
  const commonjsFixture = path.join(fixtureDir, 'consumer.cts');

  try {
    writeFileSync(esmFixture, `
      import DefaultOSUtils, {
        OSUtils as NamedOSUtils,
        DataSize,
        createOSUtils,
        type GlobalConfig,
        type MonitorResult
      } from 'node-os-utils';

      const constructor: typeof NamedOSUtils = DefaultOSUtils;
      const config: Partial<GlobalConfig> = {};
      const instance: NamedOSUtils = createOSUtils(config);
      const size = new DataSize(1);
      const result = undefined as unknown as MonitorResult<number>;
      void constructor;
      void instance;
      void size;
      void result;
    `);
    writeFileSync(commonjsFixture, `
      import packageEntry = require('node-os-utils');

      const constructor: typeof packageEntry.OSUtils = packageEntry.default;
      const instance: packageEntry.OSUtils = packageEntry.createOSUtils();
      void constructor;
      void instance;
    `);

    const tscEntry = require.resolve('typescript/bin/tsc');
    execFileSync(process.execPath, [
      tscEntry,
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2020',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      esmFixture,
      commonjsFixture
    ], { cwd: packageRoot, stdio: 'inherit' });
  } finally {
    removePathSync(fixtureDir, { recursive: true, force: true });
  }
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

  it('system.overview 应复用 CPU Monitor 的 excludeIowait 口径', async () => {
    const adapter = createAdapterStub();
    adapter.getSystemInfo = async () => ({ hostname: 'test-host', platform: 'test', processCount: 1 });
    adapter.getSystemUptime = async () => ({ uptimeSeconds: 3600 });
    adapter.getSystemLoad = async () => ({ load1: 0.1, load5: 0.1, load15: 0.1 });
    adapter.getCPUInfo = async () => ({ cores: 4 });
    adapter.getCPUUsage = async () => ({ overall: 95, iowait: 20 });
    adapter.getMemoryInfo = async () => ({ total: 1000, used: 500, available: 500, free: 500 });
    adapter.getDiskUsage = async () => ([{
      device: '/dev/test',
      mountPoint: '/',
      filesystem: 'testfs',
      total: 1000,
      used: 500,
      available: 500
    }]);
    adapter.getNetworkStats = async () => ([]);
    (AdapterFactory as any).create = () => adapter;

    const utils = new OSUtilsClass({
      platform: 'test',
      cpu: { excludeIowait: true }
    });
    const cpuResult = await utils.cpu.usage();
    const systemResult = await utils.system.overview();

    expect(cpuResult.success).to.equal(true);
    expect(systemResult.success).to.equal(true);
    if (cpuResult.success && systemResult.success) {
      expect(cpuResult.data).to.equal(75);
      expect(systemResult.data.resources.cpuUsage).to.equal(cpuResult.data);
    }
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

describe('包入口兼容性', () => {
  it('原生 ESM 默认导出应为 OSUtils，且命名导出与 CommonJS 一致', () => {
    const packageRoot = path.resolve(__dirname, '../../..');
    const requireAnchor = JSON.stringify(path.join(packageRoot, 'package.json'));
    const script = `
      import assert from 'node:assert/strict';
      import defaultExport, * as esmPackage from 'node-os-utils';
      import { createRequire } from 'node:module';

      const require = createRequire(${requireAnchor});
      const commonjsPackage = require('node-os-utils');
      const commonjsNames = Object.keys(commonjsPackage)
        .filter((key) => key !== 'default')
        .sort();
      const esmNames = Object.keys(esmPackage)
        .filter((key) => key !== 'default')
        .sort();

      assert.equal(defaultExport, esmPackage.OSUtils);
      assert.equal(commonjsPackage.default, commonjsPackage.OSUtils);
      assert.deepEqual(esmNames, commonjsNames);
      assert.equal(typeof esmPackage.createOSUtils, 'function');
      console.log('ok');
    `;

    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', script],
      { cwd: packageRoot, encoding: 'utf8' }
    );

    expect(output.trim()).to.equal('ok');
  });

  it('NodeNext 应为 ESM 与 CommonJS 提供匹配的入口类型', () => {
    const packageRoot = path.resolve(__dirname, '../../..');

    compilePackageEntryTypeFixtures(packageRoot);
  });
});
