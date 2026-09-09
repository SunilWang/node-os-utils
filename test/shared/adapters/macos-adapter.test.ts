import { expect } from 'chai';
import os from 'os';
import * as fsSync from 'fs';
import path from 'path';

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

  it('CPU 信息应返回标准架构标识', () => {
    const adapter = new MacOSAdapter();
    const result = (adapter as any).parseCPUInfo('Apple CPU', '4', '8', '2400000000');
    expect(result.architecture).to.equal(os.arch());
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
      // uname -a 第 5 个字段固定为 "Kernel"，arch 必须来自 os.arch()
      expect(result.arch).to.equal(os.arch());
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

  it('应当移除 netstat 未激活接口名末尾的状态标记', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    const netstatOutput = [
      'Name  Mtu   Network  Address  Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll',
      'gif0* 1280  <Link#2> 00:00:00:00:00:00 0 0 0 0 0 0 0'
    ].join('\n');

    const stats = internal.parseNetworkStats(netstatOutput);

    expect(stats).to.have.lengthOf(1);
    expect(stats[0].interface).to.equal('gif0');
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

  it('进程相关方法应拒绝非法 PID，killProcess 仅使用 Node.js 原生 API', async () => {
    const adapter = new MacOSAdapter();
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

  it('getProcessInfo 应在进程明确不存在时返回 null 且不执行 ps', async () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    const originalKill = process.kill;
    let commandCallCount = 0;

    (process as any).kill = () => {
      const error = new Error('No such process') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    };
    internal.executeCommand = async () => {
      commandCallCount += 1;
      throw new Error('不存在的进程不应继续执行 ps');
    };

    try {
      expect(await adapter.getProcessInfo(99999999)).to.equal(null);
      expect(commandCallCount).to.equal(0);
    } finally {
      (process as any).kill = originalKill;
    }
  });

  it('T022: getCPUInfo() 在 sysctl 命令全部失败时应降级到 os.cpus() 数据而非抛出异常', async () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    // stub executeCommand 使所有 sysctl 命令失败
    internal.executeCommand = async () => {
      throw new MonitorError('sysctl 不可用', ErrorCode.COMMAND_FAILED, 'darwin');
    };

    const result = await adapter.getCPUInfo();
    expect(result).to.be.an('object');
    expect(result.cores).to.be.a('number').and.to.be.greaterThan(0);
    expect(result.threads).to.be.a('number').and.to.be.greaterThan(0);
    expect(result.model).to.be.a('string').and.to.have.length.greaterThan(0);
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

  it('读取文件权限不足时应抛出权限错误', async function () {
    // Windows 的 chmod 不会按 Unix mode bits 限制当前进程读取，无法可靠模拟 EACCES。
    if (process.platform === 'win32') {
      this.skip();
    }

    // root 用户忽略文件权限位，该用例无法复现 EACCES
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      this.skip();
    }

    const adapter = new MacOSAdapter();
    const tmpPath = path.join(os.tmpdir(), `node-os-utils-noaccess-${Date.now()}`);
    fsSync.writeFileSync(tmpPath, 'secret');
    fsSync.chmodSync(tmpPath, 0o000);

    try {
      await adapter.readFile(tmpPath);
      expect.fail('should not succeed');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      const monitorError = error as MonitorError;
      expect(monitorError.code).to.equal(ErrorCode.PERMISSION_DENIED);
      expect(monitorError.details.path).to.equal(tmpPath);
    } finally {
      fsSync.chmodSync(tmpPath, 0o600);
      fsSync.rmSync(tmpPath, { force: true });
    }
  });

  it('读取不存在的文件时应抛出 FILE_NOT_FOUND 错误', async () => {
    const adapter = new MacOSAdapter();

    try {
      await adapter.readFile('/nonexistent/path/to/file');
      expect.fail('should not succeed');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      const monitorError = error as MonitorError;
      expect(monitorError.code).to.equal(ErrorCode.FILE_NOT_FOUND);
      expect(monitorError.details.path).to.equal('/nonexistent/path/to/file');
    }
  });

  it('readFile/fileExists 应基于 fs API 正常工作', async () => {
    const adapter = new MacOSAdapter();
    const tmpPath = path.join(os.tmpdir(), `node-os-utils-readfile-${Date.now()}`);
    const tmpDirectory = path.join(os.tmpdir(), `node-os-utils-directory-${Date.now()}`);
    fsSync.writeFileSync(tmpPath, 'hello');
    fsSync.mkdirSync(tmpDirectory);

    try {
      expect(await adapter.readFile(tmpPath)).to.equal('hello');
      expect(await adapter.fileExists(tmpPath)).to.be.true;
      expect(await adapter.fileExists(tmpDirectory)).to.be.true;
      expect(await adapter.fileExists('/nonexistent/path/to/file')).to.be.false;
    } finally {
      fsSync.rmSync(tmpPath, { force: true });
      fsSync.rmSync(tmpDirectory, { recursive: true, force: true });
    }
  });

  it('解析进程列表时应以完整 comm 为名称，并保留完整 args', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const summaryOutput = [
      '  123     1  12.5  3.4  20480 S    user   /Library/My App/bin/tool',
      '  124     1   0.0  0.1   1024 R    root   /usr/sbin/syslogd'
    ].join('\n');
    const argsOutput = [
      '  123 /Library/My App/bin/tool --flag',
      '  124 custom-argv-zero --daemon'
    ].join('\n');

    const result = internal.parseProcessList(summaryOutput, argsOutput);

    expect(result).to.have.lengthOf(2);
    expect(result[0].pid).to.equal(123);
    expect(result[0].ppid).to.equal(1);
    expect(result[0].name).to.equal('/Library/My App/bin/tool');
    expect(result[0].cpuUsage).to.be.closeTo(12.5, 0.0001);
    expect(result[0].memoryUsage).to.equal(20480 * 1024);
    expect(result[0].command).to.equal('/Library/My App/bin/tool --flag');
    expect(result[1].name).to.equal('/usr/sbin/syslogd');
    expect(result[1].user).to.equal('root');
    expect(result[1].state).to.equal('R');
    expect(result[1].command).to.equal('custom-argv-zero --daemon');
  });

  it('getProcesses 应并行获取 comm 与 args 并按 PID 合并', async () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    const commands: string[] = [];

    internal.executeCommand = async (command: string) => {
      commands.push(command);
      return {
        stdout: command.includes('comm=')
          ? '  123 1 0.0 0.1 1024 S user /Applications/My App/tool\n'
          : '  123 /Applications/My App/tool --flag\n',
        stderr: '',
        exitCode: 0,
        platform: 'darwin',
        executionTime: 1,
        command
      };
    };

    const result = await adapter.getProcesses();

    expect(commands).to.have.members([internal.processSummaryCommand, internal.processArgsCommand]);
    expect(result).to.have.lengthOf(1);
    expect(result[0].name).to.equal('/Applications/My App/tool');
    expect(result[0].command).to.equal('/Applications/My App/tool --flag');
  });

  it('应当将 df -h 的 Bi/Ki/Mi/Gi/Ti 单位正确转换为字节', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    expect(internal.convertDfSizeToBytes('512Bi')).to.equal(512);
    expect(internal.convertDfSizeToBytes('0Bi')).to.equal(0);
    expect(internal.convertDfSizeToBytes('203Ki')).to.equal(203 * 1024);
    expect(internal.convertDfSizeToBytes('1.5Mi')).to.equal(1.5 * 1024 * 1024);
    expect(internal.convertDfSizeToBytes('2Gi')).to.equal(2 * 1024 * 1024 * 1024);
    expect(internal.convertDfSizeToBytes('1Ti')).to.equal(1024 * 1024 * 1024 * 1024);
  });

  it('应当解析 df -Ph 的 6 列 POSIX 输出，支持含空格的挂载点', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const output = [
      'Filesystem        Size    Used   Avail Capacity  Mounted on',
      '/dev/disk3s1s1   1.8Ti    12Gi   509Gi     3%    /',
      'devfs            203Ki   203Ki     0Bi   100%    /dev',
      '/dev/disk3s2     1.8Ti   8.5Gi   509Gi     2%    /Volumes/My Data'
    ].join('\n');

    const result = internal.parseDiskInfo(output);

    expect(result).to.have.lengthOf(3);
    expect(result[0].mountpoint).to.equal('/');
    expect(result[1].available).to.equal(0);
    expect(result[2].mountpoint).to.equal('/Volumes/My Data');
    expect(result[2].usagePercentage).to.equal(2);
  });

  it('sw_vers 不可用时 version 应为 Unknown 而不是 uname 中的 "Darwin"', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;
    const originalUptime = os.uptime;
    (os as any).uptime = () => 1234;

    try {
      const result = internal.parseSystemInfo(
        'Darwin host 23.4.0 Darwin Kernel Version 23.4.0 arm64',
        '',
        '{ 0.10 0.20 0.30 }',
        null
      );

      expect(result.version).to.equal('Unknown');
      expect(result.arch).to.equal(os.arch());
    } finally {
      (os as any).uptime = originalUptime;
    }
  });

  it('应当在 who 输出无远程主机列时将 from 置为 undefined', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const output = [
      'sunilwang console 9月  5 21:24',
      'sunilwang ttys000 9月  5 21:45 (192.168.1.10)'
    ].join('\n');

    const result = internal.parseSystemUsers(output);

    expect(result).to.have.lengthOf(2);
    expect(result[0].from).to.be.undefined;
    expect(result[0].loginTime).to.equal('9月 5 21:24');
    expect(result[1].from).to.equal('(192.168.1.10)');
    expect(result[1].loginTime).to.equal('9月 5 21:45');
  });
});
