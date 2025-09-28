import os from 'os';
import { promises as fs } from 'fs';

import { BasePlatformAdapter } from '../core/platform-adapter';
import { CommandExecutor } from '../utils/command-executor';
import { CommandResult, SupportedFeatures } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError, ErrorCode } from '../types/errors';

/**
 * Windows 平台适配器
 *
 * 通过 PowerShell / WMI / Node.js 原生 API 获取系统信息
 */
export class WindowsAdapter extends BasePlatformAdapter {
  private executor: CommandExecutor;

  constructor() {
    super('win32');
    this.executor = new CommandExecutor('win32');
  }

  /**
   * 执行系统命令
   */
  async executeCommand(command: string, options?: ExecuteOptions): Promise<CommandResult> {
    return this.executor.execute(command, options);
  }

  /**
   * 读取文件内容
   */
  async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new MonitorError(
          `File not found: ${path}`,
          ErrorCode.FILE_NOT_FOUND,
          this.platformName,
          { path }
        );
      }

      if (error?.code === 'EACCES') {
        throw new MonitorError(
          `Permission denied: ${path}`,
          ErrorCode.PERMISSION_DENIED,
          this.platformName,
          { path }
        );
      }

      throw new MonitorError(
        `Failed to read file: ${path}`,
        ErrorCode.COMMAND_FAILED,
        this.platformName,
        { path, error: error?.message }
      );
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 组合 Node.js 与 WMI 数据，构建 CPU 基本信息
   */
  async getCPUInfo(): Promise<any> {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) {
      throw this.createCommandError('getCPUInfo', 'Unable to read CPU information');
    }

    const logicalCores = cpus.length;
    let physicalCores = Math.max(1, Math.floor(logicalCores / 2));
    let manufacturer = cpus[0].model.includes('Intel') ? 'Intel' : cpus[0].model.includes('AMD') ? 'AMD' : 'Unknown';
    let model = cpus[0].model;
    let maxFrequency = cpus[0].speed;

    try {
      const wmi = await this.executePowerShell(
        'Get-CimInstance Win32_Processor | Select-Object Name,Manufacturer,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed | ConvertTo-Json'
      );
      const info = this.ensureArray(wmi)[0];
      if (info) {
        physicalCores = this.safeParseInt(info.NumberOfCores, physicalCores);
        manufacturer = info.Manufacturer || manufacturer;
        model = info.Name || model;
        maxFrequency = this.safeParseInt(info.MaxClockSpeed, maxFrequency);
      }
    } catch {
      // 忽略 WMI 错误，使用 Node.js 信息
    }

    return {
      model,
      manufacturer,
      architecture: os.arch(),
      cores: physicalCores || logicalCores,
      threads: logicalCores,
      baseFrequency: cpus[0].speed,
      maxFrequency,
      cache: {},
      features: []
    };
  }

  /**
   * 获取 CPU 使用率，使用采样计算
   */
  async getCPUUsage(): Promise<any> {
    return this.sampleCpuUsage();
  }

  /** 获取 CPU 温度 */
  async getCPUTemperature(): Promise<any> {
    throw this.createUnsupportedError('cpu.temperature');
  }

  /**
   * 获取内存信息，补充物理/虚拟内存详情
   */
  async getMemoryInfo(): Promise<any> {
    const total = os.totalmem();
    const free = os.freemem();
    const used = Math.max(0, total - free);

    const memoryInfo: any = {
      total,
      available: free,
      free,
      used,
      cached: 0,
      buffers: 0,
      pressure: {
        level: 'normal',
        score: total > 0 ? (used / total) * 100 : 0
      }
    };

    try {
      const osInfo = await this.executePowerShell(
        'Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory,TotalVirtualMemorySize,FreeVirtualMemory | ConvertTo-Json'
      );
      const details = this.ensureArray(osInfo)[0];
      if (details) {
        const totalKb = this.safeParseNumber(details.TotalVisibleMemorySize) * 1024;
        const freeKb = this.safeParseNumber(details.FreePhysicalMemory) * 1024;
        const totalVirtualKb = this.safeParseNumber(details.TotalVirtualMemorySize) * 1024;
        const freeVirtualKb = this.safeParseNumber(details.FreeVirtualMemory) * 1024;

        if (totalKb > 0) {
          memoryInfo.total = totalKb;
        }
        if (freeKb >= 0) {
          memoryInfo.free = freeKb;
          memoryInfo.available = freeKb;
          memoryInfo.used = Math.max(0, memoryInfo.total - memoryInfo.available);
        }

        memoryInfo.swap = {
          total: totalVirtualKb,
          free: freeVirtualKb,
          used: Math.max(0, totalVirtualKb - freeVirtualKb)
        };
      }
    } catch {
      // 兼容性问题时忽略，保留基础信息
    }

    return memoryInfo;
  }

  /** 获取内存使用情况 */
  async getMemoryUsage(): Promise<any> {
    const info = await this.getMemoryInfo();
    const usage = info.total > 0 ? (info.used / info.total) * 100 : 0;
    return { ...info, usagePercentage: usage };
  }

  /** 获取磁盘基本信息 */
  async getDiskInfo(): Promise<any[]> {
    const drives = await this.getFileSystemDrives();
    return drives.map(drive => {
      const total = drive.used + drive.free;
      return {
        device: drive.root || `${drive.name}:`,
        name: drive.name,
        mountPoint: drive.root || `${drive.name}:`,
        filesystem: drive.filesystem || 'NTFS',
        total,
        used: drive.used,
        available: drive.free,
        usagePercentage: total > 0 ? (drive.used / total) * 100 : 0
      };
    });
  }

  /** 获取磁盘 I/O 信息 */
  async getDiskIO(): Promise<any> {
    throw this.createUnsupportedError('disk.io');
  }

  /** 获取磁盘使用情况 */
  async getDiskUsage(): Promise<any[]> {
    const info = await this.getDiskInfo();
    return info;
  }

  /** 获取磁盘统计 */
  async getDiskStats(): Promise<any> {
    throw this.createUnsupportedError('disk.stats');
  }

  /** 获取挂载点信息 */
  async getMounts(): Promise<any[]> {
    const drives = await this.getDiskInfo();
    return drives.map(drive => ({
      device: drive.device,
      mountPoint: drive.mountPoint,
      filesystem: drive.filesystem,
      options: 'rw',
      dump: 0,
      pass: 0
    }));
  }

  /** 获取文件系统信息 */
  async getFileSystems(): Promise<any[]> {
    const drives = await this.getDiskInfo();
    return drives.map(drive => ({
      name: drive.device,
      type: drive.filesystem,
      mountPoint: drive.mountPoint,
      options: 'rw'
    }));
  }

  /** 获取网络接口 */
  async getNetworkInterfaces(): Promise<any> {
    return os.networkInterfaces();
  }

  /** 获取网络统计 */
  async getNetworkStats(): Promise<any> {
    try {
      const stats = await this.executePowerShell(
        'Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes,ReceivedUnicastPackets,SentUnicastPackets,InboundErrors,OutboundErrors | ConvertTo-Json'
      );
      return this.ensureArray(stats).map((item: any) => ({
        interface: item.Name,
        rxBytes: item.ReceivedBytes,
        txBytes: item.SentBytes,
        rxPackets: item.ReceivedUnicastPackets,
        txPackets: item.SentUnicastPackets,
        rxErrors: item.InboundErrors || 0,
        txErrors: item.OutboundErrors || 0
      }));
    } catch (error) {
      throw this.createUnsupportedError('network.stats');
    }
  }

  /** 获取网络连接 */
  async getNetworkConnections(): Promise<any> {
    throw this.createUnsupportedError('network.connections');
  }

  /** 获取默认网关 */
  async getDefaultGateway(): Promise<any> {
    try {
      const result = await this.executePowerShell(
        'Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.DefaultIPGateway } | Select-Object -First 1 DefaultIPGateway,Description | ConvertTo-Json'
      );
      const gateway = this.ensureArray(result)[0];
      if (!gateway) {
        return null;
      }

      const value = Array.isArray(gateway.DefaultIPGateway)
        ? gateway.DefaultIPGateway[0]
        : gateway.DefaultIPGateway;

      return {
        gateway: value,
        interface: gateway.Description
      };
    } catch {
      return null;
    }
  }

  /** 获取进程列表 */
  async getProcessList(): Promise<any[]> {
    try {
      const processes = await this.executePowerShell(
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate,Priority,ThreadCount,WorkingSetSize | ConvertTo-Json',
        { maxBuffer: 1024 * 1024 * 10 }
      );
      return this.ensureArray(processes).map((proc: any) => this.normalizeProcess(proc));
    } catch (error) {
      throw this.createUnsupportedError('process.list');
    }
  }

  /** 获取进程信息 */
  async getProcessInfo(pid: number): Promise<any> {
    try {
      const processes = await this.executePowerShell(
        `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate,Priority,ThreadCount,WorkingSetSize | ConvertTo-Json`
      );
      const process = this.ensureArray(processes)[0];
      if (!process) {
        return null;
      }
      return this.normalizeProcess(process);
    } catch (error) {
      throw this.createUnsupportedError('process.info');
    }
  }

  /** 获取进程列表（旧接口兼容） */
  async getProcesses(): Promise<any> {
    return this.getProcessList();
  }

  /** 杀死进程 */
  async killProcess(pid: number, signal?: string): Promise<boolean> {
    const command = signal === 'SIGKILL'
      ? `taskkill /PID ${pid} /F`
      : `taskkill /PID ${pid}`;

    try {
      await this.executeCommand(command, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /** 获取进程打开文件 */
  async getProcessOpenFiles(): Promise<string[]> {
    throw this.createUnsupportedError('process.openFiles');
  }

  /** 获取进程环境变量 */
  async getProcessEnvironment(): Promise<Record<string, string>> {
    throw this.createUnsupportedError('process.environment');
  }

  /** 获取系统信息 */
  async getSystemInfo(): Promise<any> {
    const uptimeSeconds = os.uptime();
    const uptimeMs = uptimeSeconds * 1000;
    const bootTime = Date.now() - uptimeMs;
    const load = os.loadavg();

    let systemDetails: any = {};
    try {
      const info = await this.executePowerShell(
        'Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,LastBootUpTime,NumberOfProcesses | ConvertTo-Json'
      );
      systemDetails = this.ensureArray(info)[0] || {};
    } catch {
      // 忽略
    }

    return {
      hostname: os.hostname(),
      platform: 'win32',
      distro: systemDetails.Caption || 'Windows',
      release: systemDetails.Version ? `${systemDetails.Version}${systemDetails.BuildNumber ? ' (Build ' + systemDetails.BuildNumber + ')' : ''}` : os.release(),
      kernel: typeof (os as any).version === 'function' ? (os as any).version() : os.release(),
      arch: os.arch(),
      uptime: uptimeMs,
      uptimeSeconds,
      bootTime,
      loadAverage: {
        load1: load[0],
        load5: load[1],
        load15: load[2]
      },
      processCount: this.safeParseInt(systemDetails.NumberOfProcesses, 0),
      userCount: undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  /** 获取系统负载 */
  async getSystemLoad(): Promise<any> {
    const load = os.loadavg();
    return {
      load1: load[0],
      load5: load[1],
      load15: load[2]
    };
  }

  /** 获取系统运行时间 */
  async getSystemUptime(): Promise<any> {
    const uptimeSeconds = os.uptime();
    return {
      uptimeSeconds,
      uptime: uptimeSeconds * 1000,
      bootTime: Date.now() - uptimeSeconds * 1000
    };
  }

  /** 获取系统用户 */
  async getSystemUsers(): Promise<any> {
    throw this.createUnsupportedError('system.users');
  }

  /** 获取系统服务 */
  async getSystemServices(): Promise<any> {
    try {
      const services = await this.executePowerShell(
        'Get-Service | Select-Object Name,Status,StartType,DisplayName | ConvertTo-Json'
      );
      return this.ensureArray(services).map((service: any) => ({
        name: service.Name,
        status: service.Status,
        enabled: service.StartType !== 'Disabled',
        description: service.DisplayName
      }));
    } catch {
      throw this.createUnsupportedError('system.services');
    }
  }

  /** 初始化支持的功能 */
  protected initializeSupportedFeatures(): SupportedFeatures {
    return {
      cpu: {
        info: true,
        usage: true,
        temperature: false,
        frequency: true,
        cache: false,
        perCore: true,
        cores: true
      },
      memory: {
        info: true,
        usage: true,
        swap: false,
        pressure: false,
        detailed: true,
        virtual: true
      },
      disk: {
        info: true,
        io: false,
        health: false,
        smart: false,
        filesystem: true,
        usage: true,
        stats: false,
        mounts: true,
        filesystems: true
      },
      network: {
        interfaces: true,
        stats: true,
        connections: false,
        bandwidth: false,
        gateway: true
      },
      process: {
        list: true,
        details: true,
        tree: false,
        monitor: false,
        info: true,
        kill: true,
        openFiles: false,
        environment: false
      },
      system: {
        info: true,
        load: true,
        uptime: true,
        users: false,
        services: true
      }
    };
  }

  /**
   * 采样 CPU 使用率
   *
   * 通过两次读取 Node.js os.cpus() 的累积时间片来计算 delta，从而得到整体与单核的使用率
   */
  private async sampleCpuUsage(interval: number = 200): Promise<any> {
    const first = os.cpus();
    await this.delay(interval);
    const second = os.cpus();

    let totalUser = 0;
    let totalSystem = 0;
    let totalIdle = 0;
    let totalTotal = 0;
    const perCore: number[] = [];

    for (let i = 0; i < Math.min(first.length, second.length); i++) {
      const a = first[i].times;
      const b = second[i].times;

      const user = Math.max(0, b.user - a.user);
      const system = Math.max(0, b.sys - a.sys);
      const idle = Math.max(0, b.idle - a.idle);
      const nice = Math.max(0, b.nice - a.nice);
      const irq = Math.max(0, b.irq - a.irq);

      const total = user + system + idle + nice + irq;
      if (total === 0) {
        perCore.push(0);
        continue;
      }

      totalUser += user;
      totalSystem += system;
      totalIdle += idle;
      totalTotal += total;

      perCore.push(((total - idle) / total) * 100);
    }

    const overall = totalTotal > 0 ? ((totalTotal - totalIdle) / totalTotal) * 100 : 0;
    const userPct = totalTotal > 0 ? (totalUser / totalTotal) * 100 : 0;
    const systemPct = totalTotal > 0 ? (totalSystem / totalTotal) * 100 : 0;
    const idlePct = totalTotal > 0 ? (totalIdle / totalTotal) * 100 : 100;

    return {
      overall,
      user: userPct,
      system: systemPct,
      idle: idlePct,
      cores: perCore
    };
  }

  /**
   * 执行 PowerShell 命令并转换 JSON
   *
   * @param command PowerShell 脚本片段
   * @param options 执行选项，例如超时与缓冲区
   */
  private async executePowerShell(command: string, options: ExecuteOptions = {}): Promise<any> {
    const fullCommand = this.executor.buildCommand('powershell', ['-NoProfile', '-Command', command]);
    const result = await this.executeCommand(fullCommand, options);

    if (result.exitCode !== 0) {
      throw this.createCommandError(fullCommand, {
        exitCode: result.exitCode,
        stderr: result.stderr
      });
    }

    const cleaned = this.sanitizeJson(result.stdout);
    if (!cleaned) {
      return [];
    }

    return this.safeParseJSON(cleaned, []);
  }

  /**
   * 将 WMI 返回的进程信息转换为统一结构
   */
  private normalizeProcess(raw: any): any {
    const totalMemory = os.totalmem();
    const workingSet = this.safeParseNumber(raw.WorkingSetSize);
    const startTime = this.parseWmiDate(raw.CreationDate);

    return {
      pid: this.safeParseInt(raw.ProcessId),
      ppid: this.safeParseInt(raw.ParentProcessId),
      name: raw.Name || 'unknown',
      command: raw.CommandLine || raw.Name || '',
      state: 'running',
      cpuUsage: 0,
      memoryUsage: workingSet,
      memoryPercentage: totalMemory > 0 ? (workingSet / totalMemory) * 100 : 0,
      startTime,
      priority: raw.Priority,
      threads: this.safeParseInt(raw.ThreadCount)
    };
  }

  /**
   * 将 WMI/CIM 返回的日期字符串解析为 UTC 时间戳
   */
  private parseWmiDate(value?: string): number {
    if (!value) {
      return Date.now();
    }

    const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!match) {
      return Date.now();
    }

    const [ , year, month, day, hour, minute, second ] = match;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
  }

  /**
   * 获取文件系统驱动器
   *
   * 优先使用 PowerShell PSDrive，失败时回退到 WMI
   */
  private async getFileSystemDrives(): Promise<Array<{ name: string; root: string; used: number; free: number; filesystem?: string }>> {
    try {
      const result = await this.executePowerShell(
        'Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Used,Free | ConvertTo-Json'
      );
      return this.ensureArray(result).map((drive: any) => ({
        name: drive.Name,
        root: drive.Root,
        used: this.safeParseNumber(drive.Used),
        free: this.safeParseNumber(drive.Free),
        filesystem: 'NTFS'
      }));
    } catch {
      // 回退到 wmic
      try {
        const wmi = await this.executePowerShell(
          'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,FileSystem,Size,FreeSpace | ConvertTo-Json'
        );
        return this.ensureArray(wmi).map((disk: any) => ({
          name: disk.DeviceID?.replace(':', ''),
          root: disk.DeviceID,
          used: this.safeParseNumber(disk.Size) - this.safeParseNumber(disk.FreeSpace),
          free: this.safeParseNumber(disk.FreeSpace),
          filesystem: disk.FileSystem
        }));
      } catch (error) {
        throw this.createCommandError('getFileSystemDrives', error);
      }
    }
  }

  /**
   * 将对象包装为数组，防止 PowerShell 只返回单项
   */
  private ensureArray<T>(data: T | T[]): T[] {
    if (data === null || data === undefined) {
      return [];
    }
    return Array.isArray(data) ? data : [data];
  }

  /**
   * 清洗 JSON 输出，去除 BOM 并裁剪空白
   */
  private sanitizeJson(output: string): string {
    return output
      .replace(/^\uFEFF/, '')
      .trim();
  }

  /**
   * Promise 形式的延时工具
   */
  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}
