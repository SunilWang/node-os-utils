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

  it('应正确解析包含空格和右括号的进程名', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;
    const stat = '123 (worker name) R 7 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 500 0 5 0 0 0 0';
    const status = 'Name:\tworker name\nThreads:\t1\nVmRSS:\t1 kB\n';
    const result = internal.parseProcessInfo(123, stat, status, 'worker name\\0');
    expect(result.name).to.equal('worker name');
    expect(result.state).to.equal('R');
    expect(result.ppid).to.equal(7);

    const rightParen = '124 (worker )name) S 9 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 500 0 5 0 0 0 0';
    const resultWithRightParen = internal.parseProcessInfo(124, rightParen, 'Name:\tworker )name\n', '');
    expect(resultWithRightParen.name).to.equal('worker )name');
    expect(resultWithRightParen.state).to.equal('S');
    expect(resultWithRightParen.ppid).to.equal(9);
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

  it('进程相关方法应拒绝非法 PID，killProcess 仅使用 Node.js 原生 API', async () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;
    const originalKill = process.kill;
    const nativeCalls: Array<{ pid: number; signal?: string | number }> = [];
    let commandCallCount = 0;

    (process as any).kill = (pid: number, signal?: string | number) => {
      nativeCalls.push({ pid, signal });
      return true;
    };
    internal.executeCommand = async () => {
      commandCallCount += 1;
      throw new Error('killProcess 不应调用 shell 命令');
    };

    try {
      expect(await adapter.killProcess(123, 'TERM')).to.be.true;
      expect(await adapter.killProcess(123, 'TERM;unexpected')).to.be.false;
      expect(await adapter.killProcess('123;unexpected' as unknown as number, 'TERM')).to.be.false;
      expect(await adapter.getProcessInfo('123;unexpected' as unknown as number)).to.be.null;
      expect(await adapter.getProcessOpenFiles('123;unexpected' as unknown as number)).to.deep.equal([]);
      expect(await adapter.getProcessEnvironment('123;unexpected' as unknown as number)).to.deep.equal({});
      expect(nativeCalls).to.deep.equal([{ pid: 123, signal: 'SIGTERM' }]);
      expect(commandCallCount).to.equal(0);
    } finally {
      (process as any).kill = originalKill;
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

  it('getMemoryInfo() 降级路径应返回字节单位且字段形状与正常路径一致', async () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    // stub readFile 使 /proc/meminfo 读取失败，触发降级路径
    internal.readFile = async () => {
      throw new MonitorError('/proc/meminfo 不可访问', ErrorCode.COMMAND_FAILED, 'linux');
    };

    const result = await adapter.getMemoryInfo();
    const total = os.totalmem();
    const free = os.freemem();

    expect(result.total).to.equal(total);
    expect(result.free).to.equal(free);
    expect(result.used).to.equal(total - free);
    expect(result.available).to.equal(free);
    expect(result.shared).to.equal(0);
    expect(result.buffers).to.equal(0);
    expect(result.cached).to.equal(0);
    expect(result.usagePercentage).to.be.closeTo(((total - free) / total) * 100, 0.0001);
    expect(result.swap).to.deep.equal({ total: 0, free: 0, used: 0 });
  });

  it('getProcessInfo() 在进程不存在时应透传 NOT_AVAILABLE，不包装成 COMMAND_FAILED', async () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    internal.fileExists = async () => false;

    try {
      await adapter.getProcessInfo(999999);
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.code).to.equal(ErrorCode.NOT_AVAILABLE);
    }
  });

  it('应解析 ifconfig 输出中含连字符的接口名（如 Docker 网桥）', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    const output = [
      'br-3f2a1b0c9d8e: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500',
      '        inet 172.18.0.1  netmask 255.255.0.0  broadcast 172.18.255.255',
      '',
      'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
      '        inet 192.168.1.10  netmask 255.255.255.0  broadcast 192.168.1.255'
    ].join('\n');

    const interfaces = internal.parseIfconfigOutput(output);

    expect(interfaces).to.have.lengthOf(2);
    expect(interfaces[0].name).to.equal('br-3f2a1b0c9d8e');
    expect(interfaces[0].state).to.equal('up');
    expect(interfaces[0].addresses[0].address).to.equal('172.18.0.1');
    expect(interfaces[1].name).to.equal('eth0');
  });

  it('非容器环境应声明支持 system.services', () => {
    const adapter = new LinuxAdapter();
    const internal = adapter as any;

    expect(internal.initializeSupportedFeatures().system.services).to.be.true;
  });

  // ——— #37 修复：df 遇到无权限挂载点时不应整体失败 ———

  it('getDiskInfo() 在 df 遇到权限错误但 stdout 有效时应正常返回磁盘列表', async () => {
    const adapter = new LinuxAdapter();

    (adapter as any).executeCommand = async () => ({
      stdout: [
        'Filesystem      Size  Used Avail Use% Mounted on',
        '/dev/sda1        50G   20G   30G  40% /',
        '/dev/sdb1       100G   60G   40G  60% /data',
        '/dev/sdc1        10G    1G    9G  10% /mnt/my data'
      ].join('\n'),
      stderr: 'df: /run/user/1000/doc: Operation not permitted',
      exitCode: 1,
      platform: 'linux',
      executionTime: 5,
      command: 'df -Ph'
    });

    const result = await adapter.getDiskInfo();
    expect(result).to.be.an('array').with.lengthOf(3);
    expect(result[0].mountpoint).to.equal('/');
    expect(result[1].mountpoint).to.equal('/data');
    expect(result[2].mountpoint).to.equal('/mnt/my data');
  });

  it('getDiskInfo() 在 df stdout 为空时应抛出错误', async () => {
    const adapter = new LinuxAdapter();

    (adapter as any).executeCommand = async () => ({
      stdout: '',
      stderr: 'df: command not found',
      exitCode: 127,
      platform: 'linux',
      executionTime: 0,
      command: 'df -Ph'
    });

    try {
      await adapter.getDiskInfo();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
    }
  });

  it('getDiskUsage() 在 df 遇到权限错误但 stdout 有效时应正常返回磁盘列表', async () => {
    const adapter = new LinuxAdapter();

    (adapter as any).executeCommand = async () => ({
      stdout: [
        'Filesystem     1B-blocks       Used  Available Use% Mounted on',
        '/dev/sda1     53687091200 21474836480 32212254720  40% /',
        '/dev/sdb1    107374182400 64424509440 42949672960  60% /data'
      ].join('\n'),
      stderr: 'df: /run/user/1000/doc: Operation not permitted',
      exitCode: 1,
      platform: 'linux',
      executionTime: 5,
      command: 'df -PB1'
    });

    const result = await adapter.getDiskUsage();
    expect(result).to.be.an('array').with.lengthOf(2);
    expect(result[0].mountPoint).to.equal('/');
    expect(result[1].mountPoint).to.equal('/data');
    expect(result[0].usagePercentage).to.equal(40);
  });

  it('getDiskUsage() 在 df stdout 为空时应抛出错误', async () => {
    const adapter = new LinuxAdapter();

    (adapter as any).executeCommand = async () => ({
      stdout: '',
      stderr: 'df: command not found',
      exitCode: 127,
      platform: 'linux',
      executionTime: 0,
      command: 'df -PB1'
    });

    try {
      await adapter.getDiskUsage();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
    }
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
