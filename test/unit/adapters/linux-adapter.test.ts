import { expect } from 'chai';

import { LinuxAdapter } from '../../../src/adapters/linux-adapter';
import os from 'os';

describe('LinuxAdapter 内部解析逻辑', () => {
  it('应基于差分快照计算 CPU 使用率', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const snapshotA = `cpu  100 20 80 1000 10 5 5 0\n` +
      `cpu0  50 10 40 500 5 2 3 0\n` +
      `cpu1  50 10 40 500 5 3 2 0\n`;
    const snapshotB = `cpu  150 30 120 1100 20 10 10 0\n` +
      `cpu0  80 15 60 550 10 4 5 0\n` +
      `cpu1  70 15 60 550 10 6 5 0\n`;

    const first = internal.parseCpuStat(snapshotA);
    const second = internal.parseCpuStat(snapshotB);
    const usage = internal.calculateCpuUsage(first, second);

    expect(usage.overall).to.be.closeTo(54.54, 0.1);
    expect(usage.user).to.be.closeTo(27.27, 0.1);
    expect(usage.system).to.be.closeTo(18.18, 0.1);
    expect(usage.idle).to.be.closeTo(45.45, 0.1);
    expect(usage.iowait).to.be.closeTo(4.54, 0.1);
    expect(usage.irq).to.be.closeTo(2.27, 0.1);
    expect(usage.softirq).to.be.closeTo(2.27, 0.1);

    expect(usage.cores).to.have.lengthOf(2);
    expect(usage.cores[0]).to.be.closeTo(56.14, 0.2);
    expect(usage.cores[1]).to.be.closeTo(52.83, 0.2);
  });

  it('应正确解析 ip addr 输出中的网卡名称与地址', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const sampleOutput = `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n` +
      `    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n` +
      `    inet 127.0.0.1/8 scope host lo\n` +
      `       valid_lft forever preferred_lft forever\n` +
      `    inet6 ::1/128 scope host \n` +
      `       valid_lft forever preferred_lft forever\n` +
      `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n` +
      `    link/ether aa:bb:cc:dd:ee:ff brd ff:ff:ff:ff:ff:ff\n` +
      `    inet 192.168.1.10/24 brd 192.168.1.255 scope global dynamic eth0\n` +
      `       valid_lft 86325sec preferred_lft 86325sec\n` +
      `    inet6 fe80::aabb:ccff:fedd:eeff/64 scope link \n` +
      `       valid_lft forever preferred_lft forever\n`;

    const interfaces = internal.parseNetworkInterfaces(sampleOutput);

    expect(interfaces).to.have.lengthOf(2);
    const loopback = interfaces[0];
    const eth0 = interfaces[1];

    expect(loopback.name).to.equal('lo');
    expect(loopback.state).to.equal('unknown');
    expect(loopback.internal).to.be.true;
    expect(loopback.addresses.map((item: any) => item.address)).to.include.members(['127.0.0.1', '::1']);

    expect(eth0.name).to.equal('eth0');
    expect(eth0.state).to.equal('up');
    expect(eth0.internal).to.be.false;
    expect(eth0.addresses.map((item: any) => item.address)).to.include('192.168.1.10');
  });

  it('应解析进程内存与启动时间', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const stat = '123 (bash) R 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 500 0 5 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
    const status = 'Name:\tbash\nThreads:\t2\nVmRSS:\t2048 kB\nVmSize:\t4096 kB\n';
    const cmdline = 'bash\0--login\0';

    const result = internal.parseProcessInfo(123, stat, status, cmdline);

    expect(result.memoryUsage).to.equal(2048 * 1024);
    expect(result.rss).to.equal(2048 * 1024);
    const now = Date.now();
    let systemUptimeMs = 0;
    try {
      systemUptimeMs = os.uptime() * 1000;
    } catch {
      systemUptimeMs = 0;
    }
    expect(result.startTime).to.be.at.most(now);
    const lowerBound = systemUptimeMs > 0 ? now - systemUptimeMs - 1000 : now - 1000;
    expect(result.startTime).to.be.at.least(lowerBound);
  });
});
