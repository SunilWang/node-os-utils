import { expect } from 'chai';

import { SystemMonitor } from '../../../src/monitors/system-monitor';

describe('SystemMonitor 服务信息处理', () => {
  const monitor = new SystemMonitor({
    getPlatform: () => 'darwin'
  } as any);

  it('应当优先使用 unit/label 作为服务名称', () => {
    const services = (monitor as any).transformServicesList([
      { unit: 'sshd.service', active: 'active', description: 'OpenSSH' },
      { label: 'com.apple.WindowServer', status: '-', pid: 95 }
    ]);

    expect(services[0].name).to.equal('sshd.service');
    expect(services[0].status).to.equal('running');
    expect(services[1].name).to.equal('com.apple.WindowServer');
    expect(services[1].status).to.equal('running');
  });

  it('应当根据 load/startType 推断启用状态', () => {
    const services = (monitor as any).transformServicesList([
      { unit: 'masked.service', load: 'masked', active: 'inactive' },
      { name: 'normal.service', StartType: 'Disabled' },
      { name: 'enabled.service', active: 'active' }
    ]);

    expect(services[0].enabled).to.be.false;
    expect(services[1].enabled).to.be.false;
    expect(services[2].enabled).to.be.true;
  });

  it('应当解析数字状态与 pid 推断运行状态', () => {
    const services = (monitor as any).transformServicesList([
      { name: 'launchd', status: 0, pid: 1 },
      { name: 'crashed', status: 1 },
      { name: 'inactive', status: '-', pid: 0 }
    ]);

    expect(services[0].status).to.equal('running');
    expect(services[1].status).to.equal('failed');
    expect(services[2].status).to.equal('stopped');
  });

  it('应当优先使用 uptimeSeconds 计算运行时间', () => {
    const normalize = (monitor as any).normalizeUptime.bind(monitor);
    expect(normalize({ uptimeSeconds: 30 })).to.equal(30000);
  });

  it('应当在仅提供毫秒 uptime 时保持原值', () => {
    const normalize = (monitor as any).normalizeUptime.bind(monitor);
    expect(normalize({ uptime: 450000 })).to.equal(450000);
  });

  it('应当根据 bootTime 计算缺省运行时间', () => {
    const normalize = (monitor as any).normalizeUptime.bind(monitor);
    const now = Date.now();
    const bootTime = now - 120000;
    expect(normalize({ bootTime })).to.be.within(119000, 121000);
  });

  it('transformSystemInfo 应包含 uptimeSeconds 与 bootTime', () => {
    const raw = {
      hostname: 'test-host',
      platform: 'linux',
      release: '5.10',
      kernel: '5.10.0',
      arch: 'x64',
      uptimeSeconds: 42,
      loadAverage: { load1: 0.1, load5: 0.2, load15: 0.3 },
      timezone: 'UTC'
    };

    const result = (monitor as any).transformSystemInfo(raw);
    expect(result.uptimeSeconds).to.equal(42);
    expect(result.bootTime).to.be.within(Date.now() - 42000 - 1000, Date.now());
    expect(result.uptime).to.equal(42000);
  });
});

describe('SystemMonitor uptime() 单位归一化（issue #47 回归）', () => {
  function createUptimeAdapter(getSystemUptime: () => Promise<any>) {
    return {
      getPlatform: () => 'linux',
      isSupported: () => true,
      getSupportedFeatures: () => ({
        cpu: { info: true, usage: true, temperature: false, frequency: false, cache: false, perCore: false, cores: true },
        memory: { info: true, usage: true, swap: false, pressure: false, detailed: false, virtual: false },
        disk: { info: true, io: false, health: false, smart: false, filesystem: true, usage: true, stats: false, mounts: false, filesystems: false },
        network: { interfaces: true, stats: true, connections: false, bandwidth: false, gateway: false },
        process: { list: true, details: false, tree: false, monitor: false, info: false, kill: false, openFiles: false, environment: false },
        system: { info: true, load: true, uptime: true, users: true, services: true }
      }),
      getSystemUptime
    } as any;
  }

  it('Linux/Windows 适配器返回毫秒时不应再放大 1000 倍', async () => {
    const uptimeSeconds = 1360; // issue #47 实测值
    const adapter = createUptimeAdapter(async () => ({
      uptimeSeconds,
      uptime: uptimeSeconds * 1000,
      bootTime: Date.now() - uptimeSeconds * 1000
    }));

    const result = await new SystemMonitor(adapter).uptime();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.uptime).to.be.within(uptimeSeconds * 1000 - 1000, uptimeSeconds * 1000 + 1000);
      expect(result.data.uptimeFormatted).to.include('22 minutes');
      expect(result.data.bootTime).to.be.within(
        Date.now() - uptimeSeconds * 1000 - 1000,
        Date.now()
      );
    }
  });

  it('旧版 Linux 契约（仅毫秒 uptime）应保持原值', async () => {
    const adapter = createUptimeAdapter(async () => ({
      uptime: 1360 * 1000,
      idleTime: 999 * 1000
    }));

    const result = await new SystemMonitor(adapter).uptime();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.uptime).to.equal(1360 * 1000);
    }
  });

  it('macOS 历史契约（uptime 为秒 + bootTime）应通过 bootTime 正确推导', async () => {
    const uptimeSeconds = 1360;
    const adapter = createUptimeAdapter(async () => ({
      uptime: uptimeSeconds, // 历史行为：macOS 返回秒
      bootTime: Date.now() - uptimeSeconds * 1000
    }));

    const result = await new SystemMonitor(adapter).uptime();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.uptime).to.be.within(uptimeSeconds * 1000 - 1000, uptimeSeconds * 1000 + 1000);
    }
  });
});
