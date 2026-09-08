import { expect } from 'chai';
import { ChildProcess, spawn } from 'child_process';
import os from 'os';
import { LinuxAdapter } from '../../../src/adapters/linux-adapter';
import { ErrorCode, MonitorError } from '../../../src/types/errors';
import { RealCommandTestBase } from '../../current/real-command-base';

/** 断言数值是有限的非负系统指标。 */
function expectNonNegative(value: unknown, label: string): void {
  expect(value, label).to.be.a('number');
  expect(Number.isFinite(value), label).to.be.true;
  expect(value as number, label).to.be.at.least(0);
}

/** 断言系统指标符合百分比公共 API 的范围。 */
function expectPercentage(value: unknown, label: string): void {
  expectNonNegative(value, label);
  expect(value as number, label).to.be.at.most(100);
}

/** 断言异步调用以指定的 MonitorError 错误码失败。 */
async function expectMonitorError(operation: () => Promise<unknown>, code: ErrorCode): Promise<void> {
  try {
    await operation();
    expect.fail(`应抛出 ${code} 错误`);
  } catch (error) {
    expect(error).to.be.instanceOf(MonitorError);
    expect((error as MonitorError).code).to.equal(code);
  }
}

/**
 * 确认至少一个候选命令可真实执行。
 *
 * 仅在直接执行的每个候选命令均明确缺失、无权限或受容器限制时跳过；
 * 其他 COMMAND_FAILED 和所有超时错误均保留为失败。
 */
async function requireOneCommand(target: LinuxAdapter, context: Mocha.Context, commands: string[]): Promise<void> {
  let lastError: unknown;
  for (const command of commands) {
    try {
      await target.executeCommand(command);
      return;
    } catch (error) {
      lastError = error;
      if (!RealCommandTestBase.isEnvironmentalError(error)) throw error;
    }
  }
  RealCommandTestBase.skipForEnvironmentalError(context, lastError);
}

/** 等待测试创建的子进程退出，确保测试不会留下后台进程。 */
function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
  });
}

/** 仅在真实 Linux 主机运行，避免在其他平台伪造 Linux 命令结果。 */
function requireLinux(): void {
  if (process.platform !== 'linux') {
    return;
  }
}

describe('LinuxAdapter 真实系统调用', function () {
  this.timeout(15000);
  let adapter: LinuxAdapter;

  before(function () {
    if (process.platform !== 'linux') this.skip();
    requireLinux();
    adapter = new LinuxAdapter();
  });

  it('应真实执行命令并返回 Linux 元数据', async () => {
    const result = await adapter.executeCommand('printf linux-real-command');
    expect(result.platform).to.equal('linux');
    expect(result.command).to.equal('printf linux-real-command');
    expect(result.stdout).to.equal('linux-real-command');
    expect(result.exitCode).to.equal(0);
    expectNonNegative(result.executionTime, 'executionTime');
  });

  it('应真实读取 /proc 文件并区分不存在文件', async () => {
    const content = await adapter.readFile('/proc/cpuinfo');
    expect(content).to.include('processor');
    expect(await adapter.fileExists('/proc/cpuinfo')).to.equal(true);
    expect(await adapter.fileExists('/proc/does-not-exist')).to.equal(false);
    try {
      await adapter.readFile('/proc/does-not-exist');
      expect.fail('读取不存在文件应失败');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      expect((error as MonitorError).code).to.equal(ErrorCode.FILE_NOT_FOUND);
    }
  });

  it('应从真实 /proc/cpuinfo 获取 CPU 信息', async () => {
    const info = await adapter.getCPUInfo();
    expect(info.count).to.be.greaterThan(0);
    expect(info.cpus).to.be.an('array').with.length(info.count);
    expect(info.model).to.be.a('string').and.not.empty;
    expect(info.architecture).to.equal(os.arch());
  });

  it('应通过两次真实 /proc/stat 采样计算 CPU 使用率', async () => {
    const usage = await adapter.getCPUUsage();
    for (const key of ['overall', 'user', 'system', 'idle', 'iowait', 'irq', 'softirq']) {
      expectNonNegative(usage[key], key);
      expect(usage[key]).to.be.at.most(100);
    }
    expect(usage.cores).to.be.an('array').with.length.greaterThan(0);
  });

  it('应真实读取内存并与 /proc/meminfo 的 MemTotal 对齐', async () => {
    const info = await adapter.getMemoryInfo();
    const meminfo = await adapter.readFile('/proc/meminfo');
    const match = meminfo.match(/^MemTotal:\s+(\d+)\s+kB/m);
    expect(match).to.not.equal(null);
    expect(info.total).to.equal(Number(match![1]) * 1024);
    expect(info.used).to.equal(info.total - info.available);
    expectNonNegative(info.available, 'available');
    expect(info.usagePercentage).to.be.within(0, 100);
    const usage = await adapter.getMemoryUsage();
    // getMemoryUsage 会重新采样 /proc/meminfo，动态字段不应与上一次快照做深相等比较。
    expect(usage.total).to.equal(info.total);
    expect(usage.used).to.equal(usage.total - usage.available);
    expectNonNegative(usage.available, 'usage.available');
    expectPercentage(usage.usagePercentage, 'usage.usagePercentage');
  });

  it('应真实读取磁盘、挂载点和文件系统', async () => {
    const [info, usage, stats, mounts, filesystems] = await Promise.all([
      adapter.getDiskInfo(), adapter.getDiskUsage(), adapter.getDiskStats(),
      adapter.getMounts(), adapter.getFileSystems()
    ]);
    expect(info).to.be.an('array').with.length.greaterThan(0);
    expect(info.some((item: any) => item.mountpoint === '/')).to.equal(true);
    for (const disk of info) {
      expectNonNegative(disk.size, 'disk.size');
      expect(disk.usagePercentage).to.be.within(0, 100);
    }
    expect(usage).to.be.an('array').with.length.greaterThan(0);
    expect(usage.some((item: any) => item.mountPoint === '/')).to.equal(true);
    expect(stats).to.be.an('array').with.length.greaterThan(0);
    expect(mounts).to.be.an('array').with.length.greaterThan(0);
    expect(mounts.some((item: any) => item.mountPoint === '/')).to.equal(true);
    expect(filesystems).to.be.an('array').with.length.greaterThan(0);
  });

  it('应真实读取网络接口和 /proc/net/dev 统计', async () => {
    const [interfaces, stats] = await Promise.all([
      adapter.getNetworkInterfaces(), adapter.getNetworkStats()
    ]);
    expect(interfaces).to.be.an('array').with.length.greaterThan(0);
    expect(interfaces.some((item: any) => item.name === 'lo')).to.equal(true);
    expect(stats).to.be.an('array').with.length.greaterThan(0);
    for (const item of stats) {
      expect(item.interface).to.be.a('string').and.not.empty;
      for (const key of ['rxBytes', 'txBytes', 'rxPackets', 'txPackets']) expectNonNegative(item[key], key);
    }
  });

  it('应真实读取连接和默认网关（网关不存在时允许返回 null）', async () => {
    const connections = await adapter.getNetworkConnections();
    expect(connections).to.be.an('array');
    const gateway = await adapter.getDefaultGateway();
    if (gateway !== null) {
      expect(gateway).to.have.keys(['gateway', 'interface']);
      expect(gateway.interface).to.be.a('string');
    }
  });

  it('应真实读取进程列表和当前进程详情', async () => {
    const [list, detail] = await Promise.all([
      adapter.getProcessList(), adapter.getProcessInfo(process.pid)
    ]);
    expect(list).to.be.an('array').with.length.greaterThan(0);
    expect(list.some((item: any) => item.pid === process.pid)).to.equal(true);
    expect(detail.pid).to.equal(process.pid);
    expect(detail.name).to.be.a('string').and.not.empty;
    expect(detail.ppid).to.be.a('number');
    expectNonNegative(detail.memoryUsage, 'memoryUsage');
    expect(await adapter.getProcessInfo(0)).to.equal(null);
    expect(await adapter.getProcessEnvironment(process.pid)).to.have.property('PATH');
  });

  it('应对进程打开文件和非法终止参数执行安全处理', async () => {
    const files = await adapter.getProcessOpenFiles(process.pid);
    expect(files).to.be.an('array');
    expect(await adapter.getProcessOpenFiles(-1)).to.deep.equal([]);
    expect(await adapter.killProcess(-1)).to.equal(false);
  });

  it('应真实获取系统信息、负载、运行时间和用户', async () => {
    const [info, load, uptime, users] = await Promise.all([
      adapter.getSystemInfo(), adapter.getSystemLoad(), adapter.getSystemUptime(), adapter.getSystemUsers()
    ]);
    expect(info.platform).to.equal('linux');
    expect(info.hostname).to.be.a('string').and.not.empty;
    expect(info.arch).to.equal(os.arch());
    expectNonNegative(info.uptimeSeconds, 'uptimeSeconds');
    for (const key of ['load1', 'load5', 'load15']) expectNonNegative(load[key], key);
    expectNonNegative(uptime.uptimeSeconds, 'uptimeSeconds');
    expect(uptime.uptime).to.be.greaterThan(0);
    expect(users).to.be.an('array');
  });

  it('支持能力声明应反映真实 Linux 特性', async () => {
    const features = adapter.getSupportedFeatures();
    expect(features.cpu.info).to.equal(true);
    expect(features.memory.info).to.equal(true);
    expect(features.disk.filesystems).to.equal(true);
    expect(features.network.interfaces).to.equal(true);
    expect(features.process.kill).to.equal(true);
    expect(features.system.info).to.equal(true);
    if (!features.system.services) {
      try {
        await adapter.getSystemServices();
        expect.fail('不支持 system.services 时不应成功');
      } catch (error) {
        expect(error).to.be.instanceOf(MonitorError);
        expect((error as MonitorError).code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED);
      }
    }
  });

  it('应分别声明 CPU、内存和磁盘统计能力', () => {
    expect(adapter.isSupported('cpu.usage')).to.equal(true);
    expect(adapter.isSupported('memory.swap')).to.equal(true);
    expect(adapter.isSupported('disk.io')).to.equal(true);
  });

  it('应分别声明网络路由、进程环境和系统运行时间能力', () => {
    expect(adapter.isSupported('network.gateway')).to.equal(true);
    expect(adapter.isSupported('process.environment')).to.equal(true);
    expect(adapter.isSupported('system.uptime')).to.equal(true);
  });

  it('CPU 数量应与 /proc/cpuinfo 的 processor 条目一致', async () => {
    const [info, content] = await Promise.all([adapter.getCPUInfo(), adapter.readFile('/proc/cpuinfo')]);
    expect(info.count).to.equal(content.match(/^processor\s*:/gm)?.length ?? 0);
  });

  it('CPU 型号和厂商应是非空的真实信息', async () => {
    const info = await adapter.getCPUInfo();
    expect(info.model).to.be.a('string').and.not.empty;
    expect(info.vendor).to.be.a('string').and.not.empty;
  });

  it('CPU 架构应与当前 Node.js 运行时一致', async () => {
    expect((await adapter.getCPUInfo()).architecture).to.equal(os.arch());
  });

  it('CPU 总体使用率的每个公共字段应在百分比范围内', async () => {
    const usage = await adapter.getCPUUsage();
    for (const key of ['overall', 'user', 'system', 'idle', 'iowait', 'irq', 'softirq']) {
      expectPercentage(usage[key], key);
    }
  });

  it('CPU 每核使用率应来自真实 /proc/stat 两次采样', async () => {
    const usage = await adapter.getCPUUsage();
    expect(usage.cores).to.be.an('array').with.length.greaterThan(0);
    usage.cores.forEach((value: unknown, index: number) => expectPercentage(value, `cores[${index}]`));
  });

  it('温度目录缺失时应返回明确的适配器错误', async () => {
    if (!await adapter.fileExists('/sys/class/thermal')) {
      await expectMonitorError(() => adapter.getCPUTemperature(), ErrorCode.COMMAND_FAILED);
      return;
    }
    expect(await adapter.getCPUTemperature()).to.be.an('array');
  });

  it('内存已用量应等于总量减去可用量', async () => {
    const info = await adapter.getMemoryInfo();
    expect(info.used).to.equal(info.total - info.available);
  });

  it('内存的 free、buffers 和 cached 应为非负字节数', async () => {
    const info = await adapter.getMemoryInfo();
    expectNonNegative(info.free, 'free');
    expectNonNegative(info.buffers, 'buffers');
    expectNonNegative(info.cached, 'cached');
  });

  it('内存使用率应处于百分比范围内', async () => {
    expectPercentage((await adapter.getMemoryInfo()).usagePercentage, 'usagePercentage');
  });

  it('swap 已用量应等于总量减去空闲量', async () => {
    const swap = (await adapter.getMemoryInfo()).swap;
    expectNonNegative(swap.total, 'swap.total');
    expectNonNegative(swap.free, 'swap.free');
    expect(swap.used).to.equal(swap.total - swap.free);
  });

  it('getMemoryUsage 应返回真实内存使用结构', async () => {
    const usage = await adapter.getMemoryUsage();
    expectNonNegative(usage.total, 'total');
    expectPercentage(usage.usagePercentage, 'usagePercentage');
  });

  it('df -Ph 的每条磁盘记录应有有效容量和使用率', async () => {
    const disks = await adapter.getDiskInfo();
    disks.forEach((disk: any) => {
      expectNonNegative(disk.size, `${disk.mountpoint}.size`);
      expectNonNegative(disk.used, `${disk.mountpoint}.used`);
      expectNonNegative(disk.available, `${disk.mountpoint}.available`);
      expectPercentage(disk.usagePercentage, `${disk.mountpoint}.usagePercentage`);
    });
  });

  it('df -PB1 的每条磁盘记录应满足已用与可用之和不超过总量', async () => {
    const disks = await adapter.getDiskUsage();
    disks.forEach((disk: any) => {
      expectNonNegative(disk.total, `${disk.mountPoint}.total`);
      expectNonNegative(disk.used, `${disk.mountPoint}.used`);
      expectNonNegative(disk.available, `${disk.mountPoint}.available`);
      // df 的 available 不包含文件系统保留块，因此 total 可以大于 used + available。
      expect(disk.used + disk.available).to.be.at.most(disk.total);
    });
  });

  it('应从 /proc/diskstats 返回磁盘 I/O 设备', async () => {
    const io = await adapter.getDiskIO();
    expect(io).to.be.an('array').with.length.greaterThan(0);
    expect(io[0].device).to.be.a('string').and.not.empty;
  });

  it('getDiskStats 应返回非负的读写计数', async () => {
    const stats = await adapter.getDiskStats();
    stats.forEach((item: any) => {
      expectNonNegative(item.reads, `${item.device}.reads`);
      expectNonNegative(item.writes, `${item.device}.writes`);
    });
  });

  it('挂载点应保留根目录记录', async () => {
    const mounts = await adapter.getMounts();
    expect(mounts.some((item: any) => item.mountPoint === '/')).to.equal(true);
  });

  it('文件系统清单应包含 proc', async () => {
    const filesystems = await adapter.getFileSystems();
    expect(filesystems.some((item: any) => item.name === 'proc')).to.equal(true);
  });

  it('应通过 ip 或 ifconfig 返回具名网络接口', async function () {
    await requireOneCommand(adapter, this, ['ip addr show', 'ifconfig']);
    const interfaces = await adapter.getNetworkInterfaces();
    expect(interfaces).to.be.an('array').with.length.greaterThan(0);
    expect(interfaces.every((item: any) => typeof item.name === 'string' && item.name.length > 0)).to.equal(true);
  });

  it('网络接口应包含 loopback', async function () {
    await requireOneCommand(adapter, this, ['ip addr show', 'ifconfig']);
    const interfaces = await adapter.getNetworkInterfaces();
    expect(interfaces.some((item: any) => item.name === 'lo' || item.internal)).to.equal(true);
  });

  it('网络统计应包含 loopback 接口', async () => {
    const stats = await adapter.getNetworkStats();
    expect(stats.some((item: any) => item.interface === 'lo')).to.equal(true);
  });

  it('网络收发字节、包和错误计数应为非负数', async () => {
    const stats = await adapter.getNetworkStats();
    stats.forEach((item: any) => {
      for (const key of ['rxBytes', 'txBytes', 'rxPackets', 'txPackets', 'rxErrors', 'txErrors']) {
        expectNonNegative(item[key], `${item.interface}.${key}`);
      }
    });
  });

  it('应通过 ss 或 netstat 返回网络连接数组', async function () {
    await requireOneCommand(adapter, this, ['ss -tuln', 'netstat -tuln']);
    expect(await adapter.getNetworkConnections()).to.be.an('array');
  });

  it('网络连接记录应使用非空协议和地址字段', async function () {
    await requireOneCommand(adapter, this, ['ss -tuln', 'netstat -tuln']);
    const connections = await adapter.getNetworkConnections();
    connections.forEach((connection: any) => {
      expect(connection.protocol).to.be.a('string').and.not.empty;
      expect(connection.localAddress).to.be.a('string').and.not.empty;
      expect(connection.foreignAddress).to.be.a('string').and.not.empty;
    });
  });

  it('应通过 ip route 返回默认网关或 null', async function () {
    await requireOneCommand(adapter, this, ['ip route show default']);
    const gateway = await adapter.getDefaultGateway();
    expect(gateway === null || typeof gateway === 'object').to.equal(true);
    if (gateway) expect(gateway.interface).to.be.a('string').and.not.empty;
  });

  it('getProcesses 的记录应包含当前进程', async () => {
    const processes = await adapter.getProcesses();
    expect(processes.some((item: any) => item.pid === process.pid)).to.equal(true);
  });

  it('getProcessList 的记录应包含当前进程', async () => {
    const processes = await adapter.getProcessList();
    expect(processes.some((item: any) => item.pid === process.pid)).to.equal(true);
  });

  it('当前进程详情应包含 PID、父 PID 和内存使用量', async () => {
    const info = await adapter.getProcessInfo(process.pid);
    expect(info.pid).to.equal(process.pid);
    expect(info.ppid).to.be.a('number');
    expectNonNegative(info.memoryUsage, 'memoryUsage');
  });

  it('非法 PID 不应访问 /proc', async () => {
    expect(await adapter.getProcessInfo(-1)).to.equal(null);
    expect(await adapter.getProcessInfo(Number.NaN)).to.equal(null);
  });

  it('不存在的正 PID 应返回 NOT_AVAILABLE', async () => {
    await expectMonitorError(() => adapter.getProcessInfo(2147483647), ErrorCode.NOT_AVAILABLE);
  });

  it('当前进程环境应含有 PATH', async () => {
    expect(await adapter.getProcessEnvironment(process.pid)).to.have.property('PATH');
  });

  it('非法 PID 的环境和打开文件应为空', async () => {
    expect(await adapter.getProcessEnvironment(-1)).to.deep.equal({});
    expect(await adapter.getProcessOpenFiles(-1)).to.deep.equal([]);
  });

  it('当前进程的打开文件查询应返回数组', async () => {
    expect(await adapter.getProcessOpenFiles(process.pid)).to.be.an('array');
  });

  it('killProcess 应拒绝 0、负数和 NaN，避免发送进程组信号', async () => {
    expect(await adapter.killProcess(0)).to.equal(false);
    expect(await adapter.killProcess(-1)).to.equal(false);
    expect(await adapter.killProcess(Number.NaN)).to.equal(false);
  });

  it('killProcess 只终止测试创建的子进程，并始终 finally 清理', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    try {
      expect(child.pid).to.be.a('number').and.greaterThan(0);
      expect((await adapter.getProcessInfo(child.pid!)).pid).to.equal(child.pid);
      expect(await adapter.killProcess(child.pid!)).to.equal(true);
      await waitForExit(child);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForExit(child);
      }
    }
  });

  it('系统信息的 hostname、version 和 arch 应来自 Linux 主机', async () => {
    const info = await adapter.getSystemInfo();
    expect(info.hostname).to.equal(os.hostname());
    expect(info.version).to.be.a('string').and.not.empty;
    expect(info.arch).to.equal(os.arch());
  });

  it('系统信息应以毫秒换算 uptime 和 bootTime', async () => {
    const info = await adapter.getSystemInfo();
    expect(info.uptime).to.equal(info.uptimeSeconds * 1000);
    expect(info.bootTime).to.be.closeTo(Date.now() - info.uptime, 5000);
  });

  it('系统负载应包含三段负载和进程数', async () => {
    const load = await adapter.getSystemLoad();
    expectNonNegative(load.load1, 'load1');
    expectNonNegative(load.load5, 'load5');
    expectNonNegative(load.load15, 'load15');
    expect(load.processes.total).to.be.at.least(load.processes.active);
  });

  it('系统运行时间应同时返回秒和毫秒', async () => {
    const uptime = await adapter.getSystemUptime();
    expect(uptime.uptimeSeconds).to.be.greaterThan(0);
    expect(uptime.uptime).to.equal(uptime.uptimeSeconds * 1000);
    expectNonNegative(uptime.idleTime, 'idleTime');
  });

  it('系统用户应是数组，非空项应有用户和终端', async () => {
    const users = await adapter.getSystemUsers();
    expect(users).to.be.an('array');
    users.forEach((user: any) => {
      expect(user.user).to.be.a('string').and.not.empty;
      expect(user.terminal).to.be.a('string').and.not.empty;
    });
  });
});
