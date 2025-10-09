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
