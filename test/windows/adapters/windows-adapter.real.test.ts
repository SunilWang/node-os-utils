import { spawn } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import { expect } from 'chai';
import { WindowsAdapter } from '../../../src/adapters/windows-adapter';
import { ErrorCode, MonitorError } from '../../../src/types/errors';
import { probePowerShell, queryPowerShell } from '../../shared/utils/windows-powershell';

/** 将 PowerShell 的单对象或数组结果统一为数组。 */
function asArray<T>(value: T | T[] | null): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** 断言调用返回平台不支持错误。 */
async function expectUnsupported(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
    expect.fail('应抛出不支持错误');
  } catch (error) {
    expect(error).to.be.instanceOf(MonitorError);
    expect((error as MonitorError).code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED);
  }
}

/** Windows 真实 PowerShell/WMI 适配器测试：仅在 win32 上执行。 */
describe('WindowsAdapter 真实系统命令', function () {
  this.timeout(30000);

  const adapter = new WindowsAdapter();
  let powerShellAvailable = false;

  before(async function () {
    if (process.platform !== 'win32') this.skip();

    // 明确的环境限制只影响依赖 PowerShell 的用例，其他 API 仍继续验证。
    powerShellAvailable = await probePowerShell(this);
  });

  /** PowerShell 命令可用时才执行真实命令交叉校验。 */
  function requirePowerShell(context: Mocha.Context): void {
    if (!powerShellAvailable) context.skip();
  }

  it('getPlatform 应返回 win32', () => {
    expect(adapter.getPlatform()).to.equal('win32');
  });

  it('getSupportedFeatures 应声明 CPU 信息能力', () => {
    expect(adapter.getSupportedFeatures().cpu.info).to.equal(true);
  });

  it('isSupported 应声明 CPU 温度不支持', () => {
    expect(adapter.isSupported('cpu.temperature')).to.equal(false);
  });

  it('executeCommand 应真实执行 PowerShell 命令', async function () {
    requirePowerShell(this);
    const result = await adapter.executeCommand('powershell -NoProfile -NonInteractive -Command "Write-Output node-os-utils-real"');
    expect(result.exitCode).to.equal(0);
    expect(result.stdout.trim()).to.equal('node-os-utils-real');
    expect(result.platform).to.equal('win32');
  });

  it('readFile 应读取当前已编译测试文件', async () => {
    const content = await adapter.readFile(__filename);
    expect(content).to.include('WindowsAdapter');
  });

  it('readFile 读取不存在文件时应返回 FILE_NOT_FOUND', async () => {
    try {
      await adapter.readFile(`${__filename}.missing`);
      expect.fail('读取不存在文件应失败');
    } catch (error) {
      expect(error).to.be.instanceOf(MonitorError);
      expect((error as MonitorError).code).to.equal(ErrorCode.FILE_NOT_FOUND);
    }
  });

  it('fileExists 应识别当前已编译测试文件', async () => {
    expect(existsSync(__filename)).to.equal(true);
    expect(await adapter.fileExists(__filename)).to.equal(true);
  });

  it('fileExists 应识别不存在文件', async () => {
    expect(await adapter.fileExists(`${__filename}.missing`)).to.equal(false);
  });

  it('getCPUInfo 应与 Node.js 的逻辑核心数一致', async () => {
    const info = await adapter.getCPUInfo();
    expect(info.threads).to.equal(os.cpus().length);
    expect(info.cores).to.be.within(1, info.threads);
  });

  it('getCPUInfo 应与 CIM 的物理核心数交叉校验', async function () {
    requirePowerShell(this);
    const [info, processor] = await Promise.all([
      adapter.getCPUInfo(),
      queryPowerShell<{ NumberOfCores: number }>('Get-CimInstance Win32_Processor | Select-Object -First 1 NumberOfCores')
    ]);
    expect(info.cores).to.equal(Number(processor.NumberOfCores));
  });

  it('getCPUInfo 应与 CIM 的处理器名称交叉校验', async function () {
    requirePowerShell(this);
    const [info, processor] = await Promise.all([
      adapter.getCPUInfo(),
      queryPowerShell<{ Name: string }>('Get-CimInstance Win32_Processor | Select-Object -First 1 Name')
    ]);
    expect(info.model).to.equal(processor.Name);
  });

  it('getCPUInfo 在 PowerShell 不可用时应回退到 os.cpus', async function () {
    if (powerShellAvailable) this.skip();
    const info = await adapter.getCPUInfo();
    expect(info.threads).to.equal(os.cpus().length);
    expect(info.model).to.equal(os.cpus()[0].model);
  });

  it('getCPUUsage 应返回范围合法的总体使用率', async () => {
    const usage = await adapter.getCPUUsage();
    expect(usage.overall).to.be.within(0, 100);
  });

  it('getCPUUsage 应为每个逻辑核心返回采样值', async () => {
    const usage = await adapter.getCPUUsage();
    expect(usage.cores).to.have.length(os.cpus().length);
    usage.cores.forEach((value: number) => expect(value).to.be.within(0, 100));
  });

  it('getCPUTemperature 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getCPUTemperature());
  });

  it('getMemoryInfo 应与 CIM 的物理内存总量交叉校验', async function () {
    requirePowerShell(this);
    const [info, system] = await Promise.all([
      adapter.getMemoryInfo(),
      queryPowerShell<{ TotalVisibleMemorySize: number }>('Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 TotalVisibleMemorySize')
    ]);
    expect(info.total).to.equal(Number(system.TotalVisibleMemorySize) * 1024);
  });

  it('getMemoryInfo 应保持已用内存和可用内存的守恒关系', async () => {
    const info = await adapter.getMemoryInfo();
    expect(info.used).to.equal(info.total - info.available);
    expect(info.total).to.be.greaterThan(0);
  });

  it('getMemoryInfo 在 PowerShell 不可用时应回退到 os 模块', async function () {
    if (powerShellAvailable) this.skip();
    const info = await adapter.getMemoryInfo();
    expect(info.total).to.equal(os.totalmem());
    expect(info.available).to.equal(os.freemem());
  });

  it('getMemoryUsage 应根据内存快照计算百分比', async () => {
    const usage = await adapter.getMemoryUsage();
    expect(usage.usagePercentage).to.equal(usage.total > 0 ? (usage.used / usage.total) * 100 : 0);
    expect(usage.usagePercentage).to.be.within(0, 100);
  });

  it('getDiskInfo 应包含 PowerShell PSDrive 返回的文件系统盘符', async function () {
    requirePowerShell(this);
    const [disks, drives] = await Promise.all([
      adapter.getDiskInfo(),
      queryPowerShell<Array<{ Name: string }>>('Get-PSDrive -PSProvider FileSystem | Select-Object Name')
    ]);
    const names = new Set(disks.map((disk: any) => disk.name));
    asArray(drives).forEach(drive => expect(names.has(drive.Name)).to.equal(true));
  });

  it('getDiskInfo 应计算非负的空间和使用率', async function () {
    requirePowerShell(this);
    const disks = await adapter.getDiskInfo();
    expect(disks).to.not.be.empty;
    disks.forEach((disk: any) => {
      expect(disk.total).to.be.at.least(0);
      expect(disk.used).to.be.at.least(0);
      expect(disk.available).to.be.at.least(0);
      expect(disk.usagePercentage).to.be.within(0, 100);
    });
  });

  it('getDiskUsage 应包含 PowerShell PSDrive 返回的文件系统盘符', async function () {
    requirePowerShell(this);
    const [usage, drives] = await Promise.all([
      adapter.getDiskUsage(),
      queryPowerShell<Array<{ Name: string }>>('Get-PSDrive -PSProvider FileSystem | Select-Object Name')
    ]);
    const names = new Set(usage.map((disk: any) => disk.name));
    asArray(drives).forEach(drive => expect(names.has(drive.Name)).to.equal(true));
  });

  it('getMounts 应包含 PSDrive 的根目录', async function () {
    requirePowerShell(this);
    const [mounts, drives] = await Promise.all([
      adapter.getMounts(),
      queryPowerShell<Array<{ Root: string }>>('Get-PSDrive -PSProvider FileSystem | Select-Object Root')
    ]);
    const roots = new Set(mounts.map((mount: any) => mount.mountPoint));
    asArray(drives).forEach(drive => expect(roots.has(drive.Root)).to.equal(true));
  });

  it('getFileSystems 应包含可写的文件系统选项', async function () {
    requirePowerShell(this);
    const fileSystems = await adapter.getFileSystems();
    expect(fileSystems).to.not.be.empty;
    fileSystems.forEach((fileSystem: any) => expect(fileSystem.options).to.equal('rw'));
  });

  it('getDiskIO 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getDiskIO());
  });

  it('getDiskStats 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getDiskStats());
  });

  it('getNetworkInterfaces 应与 Node.js 网络接口名称一致', async () => {
    const interfaces = await adapter.getNetworkInterfaces();
    const names = Object.keys(os.networkInterfaces());
    expect(interfaces.map((item: any) => item.name)).to.have.members(names);
  });

  it('getNetworkInterfaces 应将回环接口标记为 internal', async () => {
    const interfaces = await adapter.getNetworkInterfaces();
    const loopback = interfaces.find((item: any) => item.addresses.some((address: any) => address.internal));
    expect(loopback).to.exist;
    expect(loopback.internal).to.equal(true);
  });

  it('getNetworkStats 应包含 NetAdapterStatistics 的网卡名称', async function () {
    requirePowerShell(this);
    const [stats, rawStats] = await Promise.all([
      adapter.getNetworkStats(),
      queryPowerShell<Array<{ Name: string }>>('Get-NetAdapterStatistics | Select-Object Name')
    ]);
    const names = new Set(stats.map((item: any) => item.interface));
    asArray(rawStats).forEach(item => expect(names.has(item.Name)).to.equal(true));
  });

  it('getNetworkStats 应返回非负的字节计数', async function () {
    requirePowerShell(this);
    const stats = await adapter.getNetworkStats();
    stats.forEach((item: any) => {
      expect(Number(item.rxBytes)).to.be.at.least(0);
      expect(Number(item.txBytes)).to.be.at.least(0);
    });
  });

  it('getNetworkConnections 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getNetworkConnections());
  });

  it('getDefaultGateway 应与 CIM 默认网关查询保持一致', async function () {
    requirePowerShell(this);
    const [gateway, raw] = await Promise.all([
      adapter.getDefaultGateway(),
      queryPowerShell<Array<{ DefaultIPGateway: string[] | string; Description: string }>>('Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.DefaultIPGateway } | Select-Object DefaultIPGateway,Description')
    ]);
    const expected = asArray(raw)[0];
    if (!expected) {
      expect(gateway).to.equal(null);
      return;
    }
    const value = Array.isArray(expected.DefaultIPGateway) ? expected.DefaultIPGateway[0] : expected.DefaultIPGateway;
    expect(gateway).to.deep.equal({ gateway: value, interface: expected.Description });
  });

  it('getProcessList 应包含当前 Node.js 进程', async function () {
    requirePowerShell(this);
    const processes = await adapter.getProcessList();
    expect(processes.some((item: any) => item.pid === process.pid)).to.equal(true);
  });

  it('getProcesses 应保持旧接口与进程列表一致', async function () {
    requirePowerShell(this);
    const processes = await adapter.getProcesses();
    expect(processes.some((item: any) => item.pid === process.pid)).to.equal(true);
  });

  it('getProcessInfo 应与 CIM 的当前进程 ID 交叉校验', async function () {
    requirePowerShell(this);
    const [info, raw] = await Promise.all([
      adapter.getProcessInfo(process.pid),
      queryPowerShell<{ ProcessId: number }>(`Get-CimInstance Win32_Process -Filter "ProcessId = ${process.pid}" | Select-Object ProcessId`)
    ]);
    expect(info.pid).to.equal(Number(raw.ProcessId));
  });

  it('getProcessInfo 对零 PID 应返回 null', async () => {
    expect(await adapter.getProcessInfo(0)).to.equal(null);
  });

  it('killProcess 对负 PID 应安全返回 false', async () => {
    expect(await adapter.killProcess(-1)).to.equal(false);
  });

  it('killProcess 应只终止新建的子进程', async function () {
    requirePowerShell(this);
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true });
    try {
      expect(child.pid).to.be.a('number').and.greaterThan(0);
      expect(await adapter.killProcess(child.pid!, 'SIGKILL')).to.equal(true);
    } finally {
      if (child.pid && !child.killed) child.kill('SIGKILL');
    }
  });

  it('getProcessOpenFiles 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getProcessOpenFiles(process.pid));
  });

  it('getProcessEnvironment 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getProcessEnvironment(process.pid));
  });

  it('getSystemInfo 应与 Node.js 主机名一致', async () => {
    const info = await adapter.getSystemInfo();
    expect(info.hostname).to.equal(os.hostname());
    expect(info.platform).to.equal('win32');
  });

  it('getSystemInfo 应与 CIM 的 Windows 标题交叉校验', async function () {
    requirePowerShell(this);
    const [info, raw] = await Promise.all([
      adapter.getSystemInfo(),
      queryPowerShell<{ Caption: string }>('Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 Caption')
    ]);
    expect(info.distro).to.equal(raw.Caption);
  });

  it('getSystemInfo 在 PowerShell 不可用时应使用 Node.js 系统版本', async function () {
    if (powerShellAvailable) this.skip();
    const info = await adapter.getSystemInfo();
    expect(info.distro).to.equal('Windows');
    expect(info.release).to.equal(os.release());
  });

  it('getSystemLoad 应与 Node.js loadavg 返回值一致', async () => {
    const load = await adapter.getSystemLoad();
    expect(load).to.deep.equal({ load1: os.loadavg()[0], load5: os.loadavg()[1], load15: os.loadavg()[2] });
  });

  it('getSystemUptime 应返回正的运行时间', async () => {
    const uptime = await adapter.getSystemUptime();
    expect(uptime.uptimeSeconds).to.be.greaterThan(0);
    expect(uptime.uptime).to.equal(uptime.uptimeSeconds * 1000);
  });

  it('getSystemUsers 应返回 PLATFORM_NOT_SUPPORTED', async () => {
    await expectUnsupported(() => adapter.getSystemUsers());
  });

  it('getSystemServices 应包含 PowerShell Get-Service 的服务名', async function () {
    requirePowerShell(this);
    const [services, raw] = await Promise.all([
      adapter.getSystemServices(),
      queryPowerShell<Array<{ Name: string }>>('Get-Service | Select-Object -First 5 Name')
    ]);
    const names = new Set(services.map((service: any) => service.name));
    asArray(raw).forEach(service => expect(names.has(service.Name)).to.equal(true));
  });
});
