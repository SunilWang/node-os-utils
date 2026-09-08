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

describe('SystemMonitor 健康检查', () => {
  it('应将返回失败结果的负载和运行时间检查计为 warning', async () => {
    const adapter = {
      getPlatform: () => 'linux',
      isSupported: () => true,
      getSystemLoad: async () => { throw new Error('load unavailable'); },
      getSystemUptime: async () => { throw new Error('uptime unavailable'); },
      getCPUInfo: async () => ({ cores: 4 })
    } as any;

    const result = await new SystemMonitor(adapter).healthCheck();

    expect(result.success).to.equal(true);
    if (result.success) {
      expect(result.data.status).to.equal('warning');
      expect(result.data.checks.load).to.equal(false);
      expect(result.data.checks.uptime).to.equal(false);
      expect(result.data.issues.join(' ')).to.include('load unavailable');
      expect(result.data.issues.join(' ')).to.include('uptime unavailable');
    }
  });
});

describe('SystemMonitor overview() 资源聚合', () => {
  function createOverviewAdapter(overrides: Record<string, any> = {}) {
    return Object.assign({
      getPlatform: () => 'linux',
      isSupported: () => true,
      getSystemInfo: async () => ({
        hostname: 'test-host',
        platform: 'linux',
        uptimeSeconds: 600,
        processCount: 120
      }),
      getSystemUptime: async () => ({ uptimeSeconds: 600 }),
      getSystemLoad: async () => ({ load1: 0.5, load5: 0.4, load15: 0.3 }),
      getCPUInfo: async () => ({ cores: 4 }),
      getCPUUsage: async () => ({ overall: 42 }),
      getMemoryInfo: async () => ({ total: 1000, used: 500 }),
      getDiskUsage: async () => ([{ usagePercentage: 60 }, { usePercent: 80 }]),
      getNetworkStats: async () => ([{ interface: 'eth0', rxBytes: 100, txBytes: 200 }]),
      getSystemUsers: async () => { throw new Error('users unavailable'); }
    }, overrides) as any;
  }

  it('正常聚合路径应汇总各资源使用率', async () => {
    const monitor = new SystemMonitor(createOverviewAdapter());

    const result = await monitor.overview();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.system.hostname).to.equal('test-host');
      expect(result.data.system.loadStatus).to.equal('low');
      expect(result.data.resources.cpuUsage).to.equal(42);
      expect(result.data.resources.memoryUsage).to.equal(50);
      // diskUsage 取所有磁盘百分比的最大值，兼容 usagePercentage/usePercent 两种字段
      expect(result.data.resources.diskUsage).to.equal(80);
      // 首次采样无网络基线，应视为无活动
      expect(result.data.resources.networkActivity).to.be.false;
      expect(result.data.counts.processes).to.equal(120);
      // 用户信息默认未启用，应降级为 0
      expect(result.data.counts.users).to.equal(0);
    }
  });

  it('部分监控器失败时仍应返回成功结果并降级对应指标', async () => {
    const monitor = new SystemMonitor(createOverviewAdapter({
      getCPUUsage: async () => { throw new Error('cpu fail'); },
      getDiskUsage: async () => { throw new Error('disk fail'); }
    }));

    const result = await monitor.overview();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.resources.cpuUsage).to.equal(0);
      expect(result.data.resources.diskUsage).to.equal(0);
      // 未受影响的指标仍应正常聚合
      expect(result.data.resources.memoryUsage).to.equal(50);
      expect(result.data.system.hostname).to.equal('test-host');
    }
  });
});

describe('SystemMonitor detectNetworkActivity()', () => {
  // 共享同一实例，利用 previousNetworkCounters 在多次调用间累积基线
  const monitor = new SystemMonitor({ getPlatform: () => 'linux' } as any);
  const detect = (stats: any[]) => (monitor as any).detectNetworkActivity(stats);

  it('首次采样无基线时应视为无活动', () => {
    expect(detect([{ interface: 'eth0', rxBytes: 100, txBytes: 100 }])).to.be.false;
  });

  it('计数器增长时应检测为活跃', () => {
    expect(detect([{ interface: 'eth0', rxBytes: 200, txBytes: 100 }])).to.be.true;
  });

  it('计数器回退（如接口重置）时应视为无活动', () => {
    expect(detect([{ interface: 'eth0', rxBytes: 50, txBytes: 50 }])).to.be.false;
  });

  it('计数器持平不变时应视为无活动', () => {
    expect(detect([{ interface: 'eth0', rxBytes: 50, txBytes: 50 }])).to.be.false;
  });
});

describe('SystemMonitor parseLoginTime()', () => {
  const monitor = new SystemMonitor({ getPlatform: () => 'linux' } as any);

  it('无法解析的登录时间应返回 undefined 而不是当前时间', () => {
    const users = (monitor as any).transformUsersList([
      { username: 'a', loginTime: 'not-a-date' },
      { username: 'b' }
    ]);

    expect(users[0].loginTime).to.be.undefined;
    expect(users[1].loginTime).to.be.undefined;
  });

  it('合法登录时间应正常解析', () => {
    const users = (monitor as any).transformUsersList([
      { username: 'a', loginTime: 1700000000 },          // 秒时间戳
      { username: 'b', loginTime: 1700000000000 },       // 毫秒时间戳
      { username: 'c', loginTime: '2026-09-01T00:00:00Z' } // 可解析字符串
    ]);

    expect(users[0].loginTime).to.equal(1700000000 * 1000);
    expect(users[1].loginTime).to.equal(1700000000000);
    expect(users[2].loginTime).to.equal(Date.parse('2026-09-01T00:00:00Z'));
  });
});

describe('SystemMonitor healthCheck() resources 检查', () => {
  function createHealthAdapter(overrides: Record<string, any> = {}) {
    return Object.assign({
      getPlatform: () => 'linux',
      isSupported: () => true,
      getSystemInfo: async () => ({ hostname: 'test-host', platform: 'linux', uptimeSeconds: 86400 }),
      // 运行时间超过 1 小时、负载低，避免其他检查项干扰 resources 断言
      getSystemUptime: async () => ({ uptimeSeconds: 86400 }),
      getSystemLoad: async () => ({ load1: 0.1, load5: 0.1, load15: 0.1 }),
      getCPUInfo: async () => ({ cores: 4 }),
      getCPUUsage: async () => ({ overall: 30 }),
      getMemoryInfo: async () => ({ total: 1000, used: 400 }),
      getDiskUsage: async () => ([{ usagePercentage: 60 }]),
      getNetworkStats: async () => ([])
    }, overrides) as any;
  }

  it('CPU 使用率 >= 90% 时 resources 应置 false 并记入 issues', async () => {
    const monitor = new SystemMonitor(createHealthAdapter({
      getCPUUsage: async () => ({ overall: 95 })
    }));

    const result = await monitor.healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.checks.resources).to.be.false;
      expect(result.data.issues.join(' ')).to.include('High CPU usage: 95.0%');
      expect(result.data.status).to.equal('warning');
    }
  });

  it('内存或最差磁盘分区 >= 90% 时 resources 应置 false', async () => {
    const monitor = new SystemMonitor(createHealthAdapter({
      getMemoryInfo: async () => ({ total: 1000, used: 950 }),
      getDiskUsage: async () => ([{ usagePercentage: 40 }, { usagePercentage: 92 }])
    }));

    const result = await monitor.healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.checks.resources).to.be.false;
      expect(result.data.issues.join(' ')).to.include('High memory usage: 95.0%');
      expect(result.data.issues.join(' ')).to.include('High disk usage: 92.0%');
    }
  });

  it('资源使用率均低于阈值时 resources 应保持 true', async () => {
    const monitor = new SystemMonitor(createHealthAdapter());

    const result = await monitor.healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.checks.resources).to.be.true;
      expect(result.data.status).to.equal('healthy');
    }
  });

  it('资源数据全部不可用时保守视为正常', async () => {
    const monitor = new SystemMonitor(createHealthAdapter({
      getCPUUsage: async () => { throw new Error('cpu unavailable'); },
      getMemoryInfo: async () => { throw new Error('memory unavailable'); },
      getDiskUsage: async () => { throw new Error('disk unavailable'); }
    }));

    const result = await monitor.healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.checks.resources).to.be.true;
    }
  });
});
