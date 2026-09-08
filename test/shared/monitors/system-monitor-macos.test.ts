import { expect } from 'chai';

import { SystemMonitor } from '../../../src/monitors/system-monitor';

function createMacAdapter(overrides: Partial<Record<string, any>> = {}) {
  const adapter: any = {
    getPlatform: () => 'darwin',
    isSupported: () => true,
    getSupportedFeatures: () => ({
      cpu: { info: true, usage: true, temperature: false, frequency: true, cache: false, perCore: false, cores: true },
      memory: { info: true, usage: true, swap: false, pressure: false, detailed: false, virtual: false },
      disk: { info: true, io: true, health: false, smart: false, filesystem: true, usage: true, stats: true, mounts: true, filesystems: true },
      network: { interfaces: true, stats: true, connections: true, bandwidth: false, gateway: true },
      process: { list: true, details: true, tree: false, monitor: false, info: true, kill: true, openFiles: false, environment: false },
      system: { info: true, load: true, uptime: true, users: true, services: true }
    }),
    getSystemInfo: async () => ({
      hostname: 'macbook-pro',
      platform: 'darwin',
      release: '23.4.0',
      kernel: 'Darwin Kernel Version',
      arch: 'arm64',
      uptimeSeconds: 3600,
      bootTime: Date.now() - 3600 * 1000,
      loadAverage: { load1: 1.2, load5: 0.8, load15: 0.6 },
      processCount: 250
    }),
    getSystemLoad: async () => ({ load1: 1.2, load5: 0.8, load15: 0.6 }),
    getCPUInfo: async () => ({ cores: 4 }),
    getSystemUptime: async () => ({ uptime: 3600 * 1000, bootTime: Date.now() - 3600 * 1000 }),
    getSystemUsers: async () => ([
      { username: 'user', terminal: 'ttys000', host: 'localhost', loginTime: Date.now() - 2000 }
    ])
  };

  return Object.assign(adapter, overrides);
}

describe('SystemMonitor (macOS)', () => {
  it('info() 应缓存 macOS 系统信息', async () => {
    let infoCalls = 0;
    const adapter = createMacAdapter({
      getSystemInfo: async () => {
        infoCalls += 1;
        return {
          hostname: 'macbook-pro',
          platform: 'darwin',
          release: '23.4.0',
          kernel: 'Darwin Kernel Version',
          arch: 'arm64',
          uptimeSeconds: 7200,
          bootTime: Date.now() - 7200 * 1000,
          loadAverage: { load1: 1.1, load5: 0.9, load15: 0.7 },
          processCount: 400
        };
      }
    });

    const monitor = new SystemMonitor(adapter as any);

    const first = await monitor.info();
    expect(first.success).to.be.true;
    if (first.success) {
      expect(first.data.hostname).to.equal('macbook-pro');
    }
    expect(infoCalls).to.equal(1);

    const second = await monitor.info();
    expect(second.success).to.be.true;
    if (second.success) {
      expect(second.cached).to.be.true;
    }
    expect(infoCalls).to.equal(1);
  });

  it('load() 应使用 CPU 核心数规范化负载', async () => {
    const adapter = createMacAdapter({
      getSystemLoad: async () => ({ load1: 3.0, load5: 2.0, load15: 1.0 }),
      getCPUInfo: async () => ({ cores: 1 })
    });

    const monitor = new SystemMonitor(adapter as any);
    const result = await monitor.load();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.normalized.load1).to.equal(3.0);
      expect(result.data.status).to.equal('critical');
    }
  });

  it('overview() 应在高负载时报告健康问题', async () => {
    const adapter = createMacAdapter({
      getSystemInfo: async () => ({
        hostname: 'macbook-pro',
        platform: 'darwin',
        release: '23.4.0',
        kernel: 'Darwin Kernel Version',
        arch: 'arm64',
        uptimeSeconds: 7200,
        bootTime: Date.now() - 7200 * 1000,
        loadAverage: { load1: 6.0, load5: 4.0, load15: 2.0 },
        processCount: 1500
      }),
      getSystemLoad: async () => ({ load1: 6.0, load5: 4.0, load15: 2.0 }),
      getCPUInfo: async () => ({ cores: 2 }),
      getSystemUsers: async () => ([
        { username: 'admin', terminal: 'ttys000', host: 'localhost', loginTime: Date.now() - 5000 }
      ])
    });

    const monitor = new SystemMonitor(adapter as any);
    monitor.withUsers(true);

    const result = await monitor.overview();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.health.status).to.equal('critical');
      expect(result.data.health.issues).to.include('Critical system load detected');
      expect(result.data.health.issues).to.include('High number of processes detected');
      expect(result.data.counts.processes).to.equal(1500);
      expect(result.data.counts.users).to.equal(1);
    }
  });
});
