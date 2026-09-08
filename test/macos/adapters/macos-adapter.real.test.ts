import { expect } from 'chai';
import { spawn } from 'child_process';
import os from 'os';
import { MacOSAdapter } from '../../../src/adapters/macos-adapter';
import { ErrorCode, MonitorError } from '../../../src/types/errors';
import { RealCommandTestBase } from '../../current/real-command-base';

/** 断言 macOS 指标为有限的非负数。 */
function expectNonNegative(value: unknown, label: string): void {
  expect(value, label).to.be.a('number');
  expect(Number.isFinite(value), label).to.equal(true);
  expect(value as number, label).to.be.at.least(0);
}

/** 断言环境受限时仅跳过正在执行的真实命令用例。 */
async function runRealCommand<T>(context: Mocha.Context, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // diskutil 明确报告 DiskManagement/DiskArbitration 框架不可用时，属于当前
    // 运行环境缺少磁盘管理能力，不把该平台限制误判为适配器解析回归。
    if (error instanceof MonitorError && error.code === ErrorCode.COMMAND_FAILED &&
      /DiskManagement framework|DiskArbitration.*unavailable/i.test(error.message)) {
      context.skip();
      throw error;
    }
    RealCommandTestBase.skipForEnvironmentalError(context, error);
    throw error;
  }
}

/** 先探测单个依赖命令，避免适配器包装错误丢失权限诊断。 */
async function runAdapterMethod<T>(
  context: Mocha.Context,
  adapter: MacOSAdapter,
  command: string,
  operation: () => Promise<T>
): Promise<T> {
  await runRealCommand(context, () => adapter.executeCommand(command));
  return operation();
}

/** CPU 使用率允许 top 不可用时回退 iostat，两个命令都受限才跳过。 */
async function runCPUUsage(context: Mocha.Context, adapter: MacOSAdapter): Promise<any> {
  try {
    await adapter.executeCommand('top -l 1 -n 0');
  } catch (topError) {
    if (!RealCommandTestBase.isEnvironmentalError(topError)) throw topError;
    await runRealCommand(context, () => adapter.executeCommand('iostat -c 1'));
  }
  return adapter.getCPUUsage();
}

/** Node uptime 受系统策略拒绝时，只跳过依赖该 API 的当前用例。 */
function requireNodeUptime(context: Mocha.Context): void {
  try {
    os.uptime();
  } catch (error: any) {
    if (error?.code === 'EPERM' || /operation not permitted|permission denied/i.test(error?.message || '')) {
      context.skip();
      return;
    }
    throw error;
  }
}

/** 等待测试创建的子进程退出，避免留下后台进程。 */
async function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

/** macOS 真实命令适配器测试：每个用例只因自身所依赖命令不可用而跳过。 */
describe('MacOSAdapter 真实系统命令', function () {
  this.timeout(15000);
  const adapter = new MacOSAdapter();

  before(function () {
    if (process.platform !== 'darwin') this.skip();
  });

  it('应报告 darwin 平台名称', () => {
    expect(adapter.getPlatform()).to.equal('darwin');
  });

  it('应声明 CPU 信息能力', () => {
    expect(adapter.isSupported('cpu.info')).to.equal(true);
  });

  it('应声明 CPU 温度能力关闭', () => {
    expect(adapter.isSupported('cpu.temperature')).to.equal(false);
  });

  it('应声明磁盘与网络核心能力', () => {
    const features = adapter.getSupportedFeatures();
    expect(features.disk.filesystems).to.equal(true);
    expect(features.network.interfaces).to.equal(true);
    expect(features.network.gateway).to.equal(true);
  });

  it('应声明进程终止和系统服务能力边界', () => {
    const features = adapter.getSupportedFeatures();
    expect(features.process.kill).to.equal(true);
    expect(features.system.services).to.equal(false);
  });

  it('executeCommand 应真实返回 uname 命令元数据', async function () {
    const result = await runRealCommand(this, () => adapter.executeCommand('uname -s'));
    expect(result.command).to.equal('uname -s');
    expect(result.platform).to.equal('darwin');
    expect(result.exitCode).to.equal(0);
    expect(result.stdout.trim()).to.equal('Darwin');
    expectNonNegative(result.executionTime, 'executionTime');
  });

  it('executeCommand 应真实读取 sysctl 逻辑 CPU 数', async function () {
    const result = await runRealCommand(this, () => adapter.executeCommand('sysctl -n hw.logicalcpu'));
    expect(Number(result.stdout.trim())).to.be.greaterThan(0);
  });

  it('readFile 应真实读取 hosts 文件', async function () {
    const content = await runRealCommand(this, () => adapter.readFile('/etc/hosts'));
    expect(content).to.be.a('string').and.not.empty;
  });

  it('fileExists 应确认 hosts 文件存在', async function () {
    expect(await adapter.fileExists('/etc/hosts')).to.equal(true);
  });

  it('fileExists 应确认不存在的文件不存在', async function () {
    expect(await adapter.fileExists('/private/tmp/node-os-utils-real-command-missing')).to.equal(false);
  });

  it('readFile 应将不存在文件映射为 FILE_NOT_FOUND', async () => {
    try {
      await adapter.readFile('/private/tmp/node-os-utils-real-command-missing');
      expect.fail('读取不存在文件应失败');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      expect((error as MonitorError).code).to.equal(ErrorCode.FILE_NOT_FOUND);
    }
  });

  it('getCPUInfo 应与 hw.physicalcpu 交叉校验核心数', async function () {
    const [info, physical] = await runRealCommand(this, async () => Promise.all([
      adapter.getCPUInfo(), adapter.executeCommand('sysctl -n hw.physicalcpu'),
    ]));
    expect(info.cores).to.equal(Number(physical.stdout.trim()));
  });

  it('getCPUInfo 应与 hw.logicalcpu 交叉校验线程数', async function () {
    const [info, logical] = await runRealCommand(this, async () => Promise.all([
      adapter.getCPUInfo(), adapter.executeCommand('sysctl -n hw.logicalcpu'),
    ]));
    expect(info.threads).to.equal(Number(logical.stdout.trim()));
  });

  it('getCPUInfo 应返回 sysctl CPU 型号', async function () {
    const [info, brand] = await runRealCommand(this, async () => Promise.all([
      adapter.getCPUInfo(), adapter.executeCommand('sysctl -n machdep.cpu.brand_string'),
    ]));
    expect(info.model).to.equal(brand.stdout.trim());
  });

  it('getCPUInfo 应返回 Node 识别的架构', async function () {
    const info = await runRealCommand(this, () => adapter.getCPUInfo());
    expect(info.architecture).to.equal(os.arch());
  });

  it('getCPUUsage 应从 top 或 iostat 返回百分比', async function () {
    const usage = await runCPUUsage(this, adapter);
    for (const key of ['overall', 'user', 'system', 'idle']) expect(usage[key], key).to.be.within(0, 100);
  });

  it('getCPUTemperature 应返回明确的不支持错误', async () => {
    try {
      await adapter.getCPUTemperature();
      expect.fail('应抛出不支持错误');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      expect((error as MonitorError).code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED);
    }
  });

  it('getMemoryInfo 应与 hw.memsize 交叉校验总内存', async function () {
    const [info, total] = await runRealCommand(this, async () => Promise.all([
      adapter.getMemoryInfo(), adapter.executeCommand('sysctl -n hw.memsize'),
    ]));
    expect(info.total).to.equal(Number(total.stdout.trim()));
  });

  it('getMemoryInfo 应从 vm_stat 返回页级内存指标', async function () {
    const info = await runRealCommand(this, () => adapter.getMemoryInfo());
    for (const key of ['free', 'active', 'inactive', 'wired', 'compressed']) expectNonNegative(info[key], key);
  });

  it('getMemoryInfo 应保持已用与可用内存的总量关系', async function () {
    const info = await runRealCommand(this, () => adapter.getMemoryInfo());
    expectNonNegative(info.used, 'used');
    expectNonNegative(info.available, 'available');
    expect(info.usagePercentage).to.be.within(0, 100);
    expect(info.used + info.available).to.equal(info.total);
  });

  it('getMemoryUsage 应复用真实内存数据契约', async function () {
    const usage = await runRealCommand(this, () => adapter.getMemoryUsage());
    expect(usage.total).to.be.greaterThan(0);
    expect(usage.usagePercentage).to.be.within(0, 100);
  });

  it('getDiskInfo 应从 df 找到根挂载点', async function () {
    const disks = await runRealCommand(this, () => adapter.getDiskInfo());
    expect(disks).to.be.an('array').and.not.empty;
    expect(disks.some((disk: any) => disk.mountpoint === '/')).to.equal(true);
  });

  it('getDiskInfo 应返回 df 解析出的容量和百分比', async function () {
    const disks = await runRealCommand(this, () => adapter.getDiskInfo());
    for (const disk of disks) {
      expectNonNegative(disk.size, 'disk.size');
      expectNonNegative(disk.used, 'disk.used');
      expect(disk.usagePercentage).to.be.within(0, 100);
    }
  });

  it('getDiskUsage 应从 df -Pk 找到根挂载点', async function () {
    const usage = await runRealCommand(this, () => adapter.getDiskUsage());
    expect(usage).to.be.an('array').and.not.empty;
    expect(usage.some((disk: any) => disk.mountPoint === '/')).to.equal(true);
  });

  it('getDiskUsage 应保持已用与总容量关系', async function () {
    const usage = await runRealCommand(this, () => adapter.getDiskUsage());
    for (const disk of usage) {
      expectNonNegative(disk.total, 'disk.total');
      expectNonNegative(disk.used, 'disk.used');
      expect(disk.used).to.be.at.most(disk.total);
      expect(disk.usagePercentage).to.be.within(0, 100);
    }
  });

  it('getDiskIO 应解析 iostat 磁盘传输指标', async function () {
    const io = await runAdapterMethod(this, adapter, 'iostat -d', () => adapter.getDiskIO());
    expect(io).to.be.an('array');
    for (const disk of io) {
      expect(disk.device).to.be.a('string').and.not.empty;
      expectNonNegative(disk.iops, 'disk.iops');
      expectNonNegative(disk.readSpeed, 'disk.readSpeed');
    }
  });

  it('getDiskStats 应解析 iostat 磁盘字节统计', async function () {
    const stats = await runAdapterMethod(this, adapter, 'iostat -d', () => adapter.getDiskStats());
    expect(stats).to.be.an('array');
    for (const disk of stats) {
      expect(disk.device).to.be.a('string').and.not.empty;
      expectNonNegative(disk.readBytes, 'disk.readBytes');
      expectNonNegative(disk.iops, 'disk.iops');
    }
  });

  it('getMounts 应从 mount 找到根挂载点', async function () {
    const mounts = await runRealCommand(this, () => adapter.getMounts());
    expect(mounts).to.be.an('array').and.not.empty;
    expect(mounts.some((mount: any) => mount.mountPoint === '/')).to.equal(true);
  });

  it('getMounts 应保留真实设备和文件系统字段', async function () {
    const mounts = await runRealCommand(this, () => adapter.getMounts());
    for (const mount of mounts) {
      expect(mount.device).to.be.a('string').and.not.empty;
      expect(mount.filesystem).to.be.a('string').and.not.empty;
      expect(mount.options).to.be.an('array');
    }
  });

  it('getFileSystems 应执行 diskutil 并返回结构化数组', async function () {
    const filesystems = await runAdapterMethod(this, adapter, 'diskutil list', () => adapter.getFileSystems());
    expect(filesystems).to.be.an('array');
    for (const filesystem of filesystems) {
      expect(filesystem.name).to.be.a('string').and.not.empty;
      expect(filesystem.type).to.be.a('string').and.not.empty;
    }
  });

  it('getNetworkInterfaces 应从 ifconfig 找到 lo0', async function () {
    const interfaces = await runRealCommand(this, () => adapter.getNetworkInterfaces());
    expect(interfaces).to.be.an('array').and.not.empty;
    expect(interfaces.some((item: any) => item.name === 'lo0')).to.equal(true);
  });

  it('getNetworkInterfaces 应返回接口状态、MTU 和地址列表', async function () {
    const interfaces = await runRealCommand(this, () => adapter.getNetworkInterfaces());
    for (const item of interfaces) {
      expect(item.name).to.be.a('string').and.not.empty;
      expect(item.state).to.be.oneOf(['up', 'down']);
      expectNonNegative(item.mtu, 'interface.mtu');
      expect(item.addresses).to.be.an('array');
    }
  });

  it('getNetworkStats 应解析 netstat 接收和发送计数', async function () {
    const stats = await runRealCommand(this, () => adapter.getNetworkStats());
    expect(stats).to.be.an('array');
    for (const item of stats) {
      expect(item.interface).to.be.a('string').and.not.empty;
      for (const key of ['rxPackets', 'rxBytes', 'txPackets', 'txBytes']) expectNonNegative(item[key], key);
    }
  });

  it('getNetworkStats 的接口应可在 ifconfig 结果中定位', async function () {
    const [interfaces, stats] = await runRealCommand(this, async () => Promise.all([
      adapter.getNetworkInterfaces(), adapter.getNetworkStats(),
    ]));
    const names = new Set(interfaces.map((item: any) => item.name));
    expect(stats.every((item: any) => names.has(item.interface))).to.equal(true);
  });

  it('getNetworkConnections 应解析 netstat 连接字段', async function () {
    const connections = await runRealCommand(this, () => adapter.getNetworkConnections());
    expect(connections).to.be.an('array');
    for (const connection of connections) {
      expect(connection.protocol).to.match(/^(tcp|udp)/);
      expect(connection.localAddress).to.be.a('string');
      expect(connection.foreignAddress).to.be.a('string');
    }
  });

  it('getDefaultGateway 应解析 route 的网关与接口', async function () {
    const gateway = await runAdapterMethod(this, adapter, 'route -n get default', () => adapter.getDefaultGateway());
    if (gateway !== null) {
      expect(gateway.gateway).to.be.a('string').and.not.empty;
      expect(gateway.interface).to.be.a('string').and.not.empty;
    }
  });

  it('getProcesses 应从 ps 找到当前 Node 进程', async function () {
    const processes = await runAdapterMethod(this, adapter, 'ps -axo pid=,ppid=,%cpu=,%mem=,rss=,stat=,user=,args=', () => adapter.getProcesses());
    expect(processes).to.be.an('array').and.not.empty;
    expect(processes.some((item: any) => item.pid === process.pid)).to.equal(true);
  });

  it('getProcesses 应解析 CPU、内存和命令字段', async function () {
    const processes = await runAdapterMethod(this, adapter, 'ps -axo pid=,ppid=,%cpu=,%mem=,rss=,stat=,user=,args=', () => adapter.getProcesses());
    const current = processes.find((item: any) => item.pid === process.pid);
    expect(current).to.exist;
    expect(current.command).to.be.a('string').and.not.empty;
    expectNonNegative(current.cpuUsage, 'current.cpuUsage');
    expectNonNegative(current.memoryUsage, 'current.memoryUsage');
  });

  it('getProcessInfo 应从 ps 返回当前进程详情', async function () {
    const info = await runAdapterMethod(this, adapter, `ps -p ${process.pid} -o pid=,ppid=,rss=,pcpu=,pmem=,state=,user=`, () => adapter.getProcessInfo(process.pid));
    expect(info.pid).to.equal(process.pid);
    expect(info.command).to.be.a('string').and.not.empty;
    expect(info.ppid).to.be.a('number');
    expectNonNegative(info.memoryUsage, 'memoryUsage');
  });

  it('getProcessInfo 应拒绝零和负数 PID', async () => {
    expect(await adapter.getProcessInfo(0)).to.equal(null);
    expect(await adapter.getProcessInfo(-1)).to.equal(null);
  });

  it('getProcessList 应与 getProcesses 找到同一当前进程', async function () {
    const processes = await runAdapterMethod(this, adapter, 'ps -axo pid=,ppid=,%cpu=,%mem=,rss=,stat=,user=,args=', () => adapter.getProcessList());
    expect(processes.some((item: any) => item.pid === process.pid)).to.equal(true);
  });

  it('getProcessOpenFiles 应从 lsof 返回数组', async () => {
    const files = await adapter.getProcessOpenFiles(process.pid);
    expect(files).to.be.an('array');
  });

  it('getProcessEnvironment 应从 ps 返回对象', async () => {
    const environment = await adapter.getProcessEnvironment(process.pid);
    expect(environment).to.be.an('object');
  });

  it('进程文件和环境查询应拒绝非法 PID', async () => {
    expect(await adapter.getProcessOpenFiles(0)).to.deep.equal([]);
    expect(await adapter.getProcessEnvironment(-1)).to.deep.equal({});
  });

  it('killProcess 应拒绝非法 PID', async () => {
    expect(await adapter.killProcess(0)).to.equal(false);
    expect(await adapter.killProcess(-1)).to.equal(false);
  });

  it('killProcess 只能终止测试创建的子进程', async function () {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', () => resolve());
        child.once('error', reject);
      });
      expect(child.pid).to.be.a('number').and.greaterThan(0);
      expect(await adapter.killProcess(child.pid!)).to.equal(true);
      await waitForExit(child);
      expect(child.signalCode).to.equal('SIGTERM');
    } catch (error) {
      RealCommandTestBase.skipForEnvironmentalError(this, error);
      throw error;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });

  it('getSystemInfo 应与 uname 返回 darwin 平台', async function () {
    const info = await runAdapterMethod(this, adapter, 'sysctl -n vm.loadavg', () => adapter.getSystemInfo());
    expect(info.platform).to.equal('darwin');
    expect(info.hostname).to.equal(os.hostname());
    expect(info.arch).to.equal(os.arch());
  });

  it('getSystemLoad 应解析 sysctl vm.loadavg', async function () {
    const load = await runAdapterMethod(this, adapter, 'sysctl -n vm.loadavg', () => adapter.getSystemLoad());
    for (const key of ['load1', 'load5', 'load15']) expectNonNegative(load[key], key);
  });

  it('getSystemUptime 应与 Node uptime 保持秒和毫秒契约', async function () {
    requireNodeUptime(this);
    const uptime = await adapter.getSystemUptime();
    expectNonNegative(uptime.uptimeSeconds, 'uptimeSeconds');
    expect(uptime.uptime).to.equal(uptime.uptimeSeconds * 1000);
    expect(uptime.bootTime).to.be.at.most(Date.now());
  });

  it('getSystemUsers 应解析 who 返回的用户数组', async function () {
    const users = await runRealCommand(this, () => adapter.getSystemUsers());
    expect(users).to.be.an('array');
    for (const user of users) {
      expect(user.user).to.be.a('string').and.not.empty;
      expect(user.terminal).to.be.a('string').and.not.empty;
    }
  });

  it('getSystemServices 应与 launchctl 的可用性保持一致', async function () {
    try {
      const services = await runAdapterMethod(this, adapter, 'launchctl list', () => adapter.getSystemServices());
      expect(services).to.be.an('array');
      for (const service of services) {
        expect(service.status).to.be.a('string');
        expect(service.label).to.be.a('string').and.not.empty;
      }
    } catch (error) {
      // launchctl 在无 launchd 用户域的 runner 中只返回 Unknown error；
      // 该诊断明确表示命令能力缺失，其他 COMMAND_FAILED 继续暴露。
      if (error instanceof MonitorError && error.code === ErrorCode.COMMAND_FAILED && /Unknown error/i.test(error.message)) {
        this.skip();
        return;
      }
      throw error;
    }
  });
});
