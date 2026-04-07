import { expect } from 'chai';

import { LinuxAdapter } from '../../../src/adapters/linux-adapter';
import { MonitorError, ErrorCode } from '../../../src/types/errors';
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

  it('应优先使用 uname -m 解析体系结构', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const uname = 'Linux test-host 5.15.0-89-generic #99-Ubuntu SMP PREEMPT Fri x86_64 x86_64 x86_64 GNU/Linux';
    const version = 'Ubuntu 5.15.0-89-generic';
    const uptime = '12345.67 4567.89';
    const loadavg = '0.10 0.20 0.30 1/234 567';
    const machine = 'x86_64\n';

    const info = internal.parseSystemInfo(uname, version, uptime, loadavg, machine);
    expect(info.arch).to.equal('x86_64');
  });

  it('在缺少 uname -m 时仍能推断常见架构', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const uname = 'Linux test 6.5.0-21 #1 SMP PREEMPT_DYNAMIC Wed aarch64 GNU/Linux';
    const version = '#1 SMP PREEMPT';
    const uptime = '1000.00 2000.00';
    const loadavg = '0.50 0.60 0.70 1/1 2';

    const info = internal.parseSystemInfo(uname, version, uptime, loadavg, '');
    expect(info.arch.toLowerCase()).to.equal('aarch64');
  });

  it('应正确解析多种默认网关格式', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const viaOutput = 'default via 192.168.1.1 dev eth0 proto dhcp metric 100';
    const directOutput = 'default dev ppp0 scope link';

    const viaResult = internal.parseDefaultGateway(viaOutput);
    expect(viaResult).to.deep.equal({ gateway: '192.168.1.1', interface: 'eth0' });

    const directResult = internal.parseDefaultGateway(directOutput);
    expect(directResult).to.deep.equal({ gateway: null, interface: 'ppp0' });
  });

  it('网络命令回退失败时应保留主次错误', async () => {
    const adapter = new LinuxAdapter();
    let callCount = 0;

    (adapter as any).executeCommand = async (command: string) => {
      callCount += 1;
      if (command === 'ip addr show') {
        throw MonitorError.createCommandFailed('linux', command, { reason: 'ip missing' });
      }
      throw MonitorError.createCommandFailed('linux', command, { reason: 'ifconfig missing' });
    };

    try {
      await adapter.getNetworkInterfaces();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.details.primary.details.reason).to.equal('ip missing');
    expect(error.details.fallback.details.reason).to.equal('ifconfig missing');
    }

    expect(callCount).to.equal(2);
  });

  it('容器环境应禁用系统服务能力', async () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    internal.containerMode = true;
    internal.supportedFeatures.system.services = false;
    internal.executeCommand = async () => {
      throw new Error('systemctl should not be called in container mode');
    };

    expect(adapter.getSupportedFeatures().system.services).to.be.false;

    try {
      await adapter.getSystemServices();
      expect.fail('should throw MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED);
    }
  });

  it('T022: getCPUInfo() 在读取 /proc/cpuinfo 失败时应降级到 os.cpus() 数据而非抛出异常', async () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    // stub readFile 使 /proc/cpuinfo 读取失败
    internal.readFile = async () => {
      throw new MonitorError('/proc/cpuinfo 不可访问', ErrorCode.COMMAND_FAILED, 'linux');
    };

    const result = await adapter.getCPUInfo();
    expect(result).to.be.an('object');
    expect(result.cores).to.be.a('number').and.to.be.greaterThan(0);
    expect(result.threads).to.be.a('number').and.to.be.greaterThan(0);
    expect(result.model).to.be.a('string').and.to.have.length.greaterThan(0);
  });

  it('应在 ss 不可用时回退到 netstat 解析连接', async () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;
    const commands: string[] = [];

    internal.executeCommand = async (command: string) => {
      commands.push(command);

      if (command === 'ss -tuln') {
        throw MonitorError.createCommandFailed('linux', command, { reason: 'missing ss' });
      }

      if (command === 'netstat -tuln') {
        return {
          stdout: 'Proto Recv-Q Send-Q Local Address           Foreign Address         State\n' +
            'tcp   0      0 0.0.0.0:22              0.0.0.0:*               LISTEN\n',
          stderr: '',
          exitCode: 0,
          platform: 'linux',
          executionTime: 1,
          command
        };
      }

      return {
        stdout: '',
        stderr: 'unsupported',
        exitCode: 1,
        platform: 'linux',
        executionTime: 0,
        command
      };
    };

    const results = await adapter.getNetworkConnections();
    expect(results).to.have.lengthOf(1);
    expect(results[0].protocol).to.equal('tcp');
    expect(results[0].state).to.equal('listen');
    expect(results[0].localAddress).to.equal('0.0.0.0:22');
    expect(results[0].foreignAddress).to.equal('0.0.0.0:*');
    expect(commands).to.deep.equal(['ss -tuln', 'netstat -tuln']);
  });
});
