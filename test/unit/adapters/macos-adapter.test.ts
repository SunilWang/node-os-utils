import { expect } from 'chai';
import os from 'os';

import { MacOSAdapter } from '../../../src/adapters/macos-adapter';
import { MonitorError, ErrorCode } from '../../../src/types/errors';

describe('MacOSAdapter 内部解析逻辑', () => {
  it('应当将 RSS 转换为字节并保留内存百分比', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const data = {
      summary: '123 1 20480 12.5 3.4 R user',
      command: '/usr/bin/example --flag',
      start: 'Mon Mar 11 10:00:00 2024'
    };

    const result = internal.parseProcessInfo(data, 123);

    expect(result.pid).to.equal(123);
    expect(result.ppid).to.equal(1);
    expect(result.command).to.equal('/usr/bin/example --flag');
    expect(result.memoryUsage).to.equal(20480 * 1024);
    expect(result.memoryPercentage).to.be.closeTo(3.4, 0.0001);
    expect(result.cpuUsage).to.be.closeTo(12.5, 0.0001);
    expect(result.state).to.equal('R');
  });

  it('应当根据 vm_stat 中的页面大小正确计算内存', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const vmStatOutput = [
      'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
      'Pages free:                               100.',
      'Pages active:                             200.',
      'Pages inactive:                           300.',
      'Pages wired down:                         400.',
      'Pages occupied by compressor:             50.',
      ''
    ].join('\n');

    const totalMem = (16 * 1024 * 1024 * 1024).toString();
    const pressureOutput = 'System-wide memory pressure: warn';

    const result = internal.parseMemoryInfo(vmStatOutput, totalMem, pressureOutput);

    const pageSize = 16384;
    expect(result.total).to.equal(16 * 1024 * 1024 * 1024);
    expect(result.free).to.equal(100 * pageSize);
    expect(result.active).to.equal(200 * pageSize);
    expect(result.inactive).to.equal(300 * pageSize);
    expect(result.wired).to.equal(400 * pageSize);
    expect(result.compressed).to.equal(50 * pageSize);
    expect(result.used).to.equal((200 + 400 + 50) * pageSize);
    expect(result.available).to.equal(result.total - result.used);
    expect(result.pressure.level).to.equal('high');
  });

  it('应当正确解析 iostat 输出的磁盘数据', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const iostatOutput = `
            disk0           disk1
    KB/t tps  MB/s     KB/t tps  MB/s
    16.00   1  0.01    32.00   2  0.06
    `;

    const ioResult = internal.parseDiskIO(iostatOutput);
    const statsResult = internal.parseDiskStats(iostatOutput);

    expect(ioResult).to.have.lengthOf(2);
    expect(ioResult[0].device).to.equal('disk0');
    expect(ioResult[0].kbPerTransfer).to.be.closeTo(16, 0.001);
    expect(ioResult[0].mbPerSec).to.be.closeTo(0.01, 0.0001);
    expect(ioResult[0].readSpeed).to.be.closeTo(0.01 * 1024 * 1024, 1e-6);
    expect(statsResult[0].device).to.equal('disk0');
    expect(statsResult[0].readCount).to.equal(1);
    expect(statsResult[0].readSpeed).to.be.closeTo(0.01 * 1024 * 1024, 1e-6);
    expect(statsResult[0].writeBytes).to.equal(0);
  });

  it('应当在解析进程环境变量时保留带空格的值', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const envOutput = [
      '123 ?? Ss 0:00.01 /usr/bin/node --inspect',
      'PATH=/usr/bin:/bin HOME=/Users/test PID=1234 APP_NAME=My App With Spaces LANG=en_US.UTF-8',
      'LOG_LEVEL="debug mode" EMPTY_VAR= NEXT=final'
    ].join('\n');

    const result = internal.parseEnvironment(envOutput);

    expect(result.PATH).to.equal('/usr/bin:/bin');
    expect(result.HOME).to.equal('/Users/test');
    expect(result).to.not.have.property('PID');
    expect(result.APP_NAME).to.equal('My App With Spaces');
    expect(result.LANG).to.equal('en_US.UTF-8');
    expect(result.LOG_LEVEL).to.equal('"debug mode"');
    expect(result.EMPTY_VAR).to.equal('');
    expect(result.NEXT).to.equal('final');
  });

  it('应当从 ifconfig 输出中提取 MAC 地址', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const ifconfigOutput = [
      'lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384',
      '\tinet 127.0.0.1 netmask 0xff000000',
      'en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500',
      '\tether f0:18:98:73:ad:10',
      '\tinet 192.168.1.2 netmask 0xffffff00 broadcast 192.168.1.255',
      '\tinet6 fe80::c86:abcd:ef12%en0 prefixlen 64'
    ].join('\n');

    const result = internal.parseNetworkInterfaces(ifconfigOutput);
    const en0 = result.find((iface: any) => iface.name === 'en0');
    expect(en0).to.exist;
    expect(en0.mac).to.equal('f0:18:98:73:ad:10');
    expect(en0.addresses).to.have.lengthOf(2);
  });

  it('应当解析系统信息并计算启动时间', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const originalUptime = os.uptime;
    (os as any).uptime = () => 1234;

    try {
      const uname = 'Darwin MacBook-Pro 23.4.0 Darwin Kernel Version';
      const uptime = ' 10:22 up  3:24,  2 users, load averages: 1.23 0.56 0.42';
      const loadavg = '{ 1.23 0.56 0.42 }';
      const swVers = 'ProductName: macOS\nProductVersion: 14.4\nBuildVersion: 23E214';

      const result = internal.parseSystemInfo(uname, uptime, loadavg, swVers);

      expect(result.platform).to.equal('darwin');
      expect(result.version).to.equal(swVers.trim());
      expect(result.loadAverage.load1).to.be.closeTo(1.23, 0.0001);
      expect(result.uptimeSeconds).to.equal(1234);
      expect(result.bootTime).to.be.closeTo(Date.now() - 1234 * 1000, 50);
    } finally {
      (os as any).uptime = originalUptime;
    }
  });

  it('应当解析 netstat 输出中的收发字节统计', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const netstatOutput = [
      'Name  Mtu   Net/Dest  Address             Ibytes  Obytes  Ipackets  Ierrs  Opackets  Oerrs  Collisions',
      'en0   1500  link#5    f0:18:98:73:ad:10   42      1       4096      84     0         8192    2'
    ].join('\n');

    const stats = internal.parseNetworkStats(netstatOutput);
    expect(stats).to.have.lengthOf(1);
    expect(stats[0].interface).to.equal('en0');
    expect(stats[0].rxPackets).to.equal(42);
    expect(stats[0].rxErrors).to.equal(1);
    expect(stats[0].rxBytes).to.equal(4096);
    expect(stats[0].txPackets).to.equal(84);
    expect(stats[0].txBytes).to.equal(8192);
    expect(stats[0].collisions).to.equal(2);
  });

  it('应当从 route 输出中解析默认网关', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const routeOutput = [
      '   route to: default',
      'destination: default',
      '       mask: default',
      '    gateway: 192.168.1.1',
      '  interface: en0',
      '      flags: <UP,GATEWAY,DONE,STATIC>'
    ].join('\n');

    const result = internal.parseDefaultGateway(routeOutput);
    expect(result).to.deep.equal({ gateway: '192.168.1.1', interface: 'en0' });
  });

  it('在 top 失败时应回退到 iostat 获取 CPU 使用率', async () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    const commands: string[] = [];

    internal.executeCommand = async (command: string) => {
      commands.push(command);
      if (command.startsWith('top')) {
        throw new Error('top failed');
      }
      if (command.startsWith('iostat')) {
        return {
          stdout: '          cpu\n us sy id\n 12 5 83\n',
          stderr: '',
          exitCode: 0,
          platform: 'darwin',
          executionTime: 1,
          command
        };
      }
      throw new Error(`unexpected command: ${command}`);
    };

    const usage = await adapter.getCPUUsage();

    expect(commands).to.deep.equal(['top -l 1 -n 0', 'iostat -c 1']);
    expect(usage.overall).to.be.closeTo(17, 0.0001);
    expect(usage.user).to.be.closeTo(12, 0.0001);
    expect(usage.system).to.be.closeTo(5, 0.0001);
    expect(usage.idle).to.be.closeTo(83, 0.0001);
  });

  it('powermetrics 无法执行时应返回不支持错误', async () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    internal.executeCommand = async () => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    };

    try {
      await adapter.getCPUTemperature();
      expect.fail('should not succeed');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      const monitorError = error as MonitorError;
      expect(monitorError.code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED);
      expect(monitorError.platform).to.equal('darwin');
    }
  });

  it('读取文件权限不足时应抛出权限错误', async () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    internal.executeCommand = async () => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    };

    try {
      await adapter.readFile('/private/secret');
      expect.fail('should not succeed');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      const monitorError = error as MonitorError;
      expect(monitorError.code).to.equal(ErrorCode.PERMISSION_DENIED);
      expect(monitorError.details.path).to.equal('/private/secret');
    }
  });
});
