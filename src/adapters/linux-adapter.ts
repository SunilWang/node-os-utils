import os from 'os';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { BasePlatformAdapter } from '../core/platform-adapter';
import { BaseMonitor } from '../core/base-monitor';
import { CommandExecutor } from '../utils/command-executor';
import { CommandResult, SupportedFeatures } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError, ErrorCode } from '../types/errors';

interface CpuTimes {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
  guest: number;
  guestNice: number;
}

interface CpuStatSnapshot {
  summary: CpuTimes;
  cores: CpuTimes[];
}

/**
 * Linux 平台适配器
 *
 * 实现 Linux 系统的监控功能，主要通过 /proc、/sys 文件系统和系统命令
 */
export class LinuxAdapter extends BasePlatformAdapter {
  private executor: CommandExecutor;
  private readonly containerMode: boolean;
  private readonly processListCommand = 'ps -eo pid=,ppid=,comm=,%cpu=,%mem=,rss=,stat=,user=,args=';
  private readonly cpuUsageSamplingInterval = 200;

  // Linux 系统路径常量
  private readonly paths = {
    cpuinfo: '/proc/cpuinfo',
    meminfo: '/proc/meminfo',
    stat: '/proc/stat',
    loadavg: '/proc/loadavg',
    uptime: '/proc/uptime',
    diskstats: '/proc/diskstats',
    netDev: '/proc/net/dev',
    version: '/proc/version',
    mounts: '/proc/mounts',
    thermal: '/sys/class/thermal',
    cpufreq: '/sys/devices/system/cpu'
  };

  constructor() {
    super('linux');
    this.executor = new CommandExecutor('linux');
    this.containerMode = this.detectContainerEnvironment();
    if (this.containerMode) {
      this.supportedFeatures.system.services = false;
    }
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
      if (error.code === 'ENOENT') {
        throw new MonitorError(
          `File not found: ${path}`,
          ErrorCode.FILE_NOT_FOUND,
          this.platformName,
          { path }
        );
      }
      if (error.code === 'EACCES') {
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
        { path, error: error.message }
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
   * 读取 /proc/cpuinfo 并解析成结构化 CPU 信息
   */
  async getCPUInfo(): Promise<any> {
    try {
      const cpuinfoContent = await this.readFile(this.paths.cpuinfo);
      return this.parseCPUInfo(cpuinfoContent);
    } catch {
      // /proc/cpuinfo 不可访问（如 Deno 兼容层），降级到 os.cpus() 基础数据
      BaseMonitor.warnDegradation(
        'cpu.command_failed',
        'Linux /proc/cpuinfo unreadable, falling back to os.cpus() data'
      );
      const cpus = os.cpus();
      const logicalCores = cpus.length || 1;
      return {
        model: cpus[0]?.model || 'Unknown',
        manufacturer: 'Unknown',
        architecture: os.arch(),
        cores: Math.max(1, Math.floor(logicalCores / 2)),
        threads: logicalCores,
        baseFrequency: cpus[0]?.speed || 0,
        maxFrequency: cpus[0]?.speed || 0,
        cache: {},
        features: []
      };
    }
  }

  /**
   * 读取 /proc/stat，计算总体 CPU 使用情况
   */
  async getCPUUsage(): Promise<any> {
    try {
      const firstSnapshot = await this.captureCpuStat();
      await this.delay(this.cpuUsageSamplingInterval);
      const secondSnapshot = await this.captureCpuStat();
      return this.calculateCpuUsage(firstSnapshot, secondSnapshot);
    } catch (error) {
      throw this.createCommandError('getCPUUsage', error);
    }
  }

  /**
   * 遍历 /sys/class/thermal，聚合 CPU 温度传感器
   */
  async getCPUTemperature(): Promise<any> {
    try {
      const thermalExists = await this.fileExists(this.paths.thermal);
      if (!thermalExists) {
        throw this.createUnsupportedError('cpu.temperature');
      }

      // 尝试读取温度传感器
      const thermalZones = await this.findThermalZones();
      const temperatures: any[] = [];

      for (const zone of thermalZones) {
        try {
          const tempPath = `${this.paths.thermal}/${zone}/temp`;
          const tempContent = await this.readFile(tempPath);
          let typeContent = 'unknown';
          try {
            typeContent = await this.readFile(`${this.paths.thermal}/${zone}/type`);
          } catch {
            // 如果无法读取类型，使用默认值
          }

          const temp = this.safeParseInt(tempContent.trim()) / 1000; // 转换为摄氏度
          temperatures.push({
            zone,
            type: typeContent.trim(),
            temperature: temp
          });
        } catch {
          // 忽略无法读取的传感器
        }
      }

      return temperatures;
    } catch (error) {
      throw this.createCommandError('getCPUTemperature', error);
    }
  }

  /**
   * 读取 /proc/meminfo 解析内存占用
   */
  async getMemoryInfo(): Promise<any> {
    try {
      const meminfoContent = await this.readFile(this.paths.meminfo);
      return this.parseMemoryInfo(meminfoContent);
    } catch {
      // /proc/meminfo 不可访问（如 Deno 兼容层权限限制），降级到 os 模块基础数据
      BaseMonitor.warnDegradation(
        'memory.command_failed',
        'Linux /proc/meminfo unreadable, falling back to os.totalmem()/os.freemem() data'
      );
      const total = os.totalmem();
      const free = os.freemem();
      return {
        total: Math.round(total / 1024),
        free: Math.round(free / 1024),
        used: Math.round((total - free) / 1024),
        shared: 0,
        buffers: 0,
        cached: 0,
        available: Math.round(free / 1024)
      };
    }
  }

  /**
   * 获取内存使用情况
   */
  async getMemoryUsage(): Promise<any> {
    // Linux 上内存信息和使用情况来自同一个文件
    return this.getMemoryInfo();
  }

  /**
   * 获取磁盘信息
   */
  async getDiskInfo(): Promise<any> {
    try {
      const result = await this.executeCommand('df -h');
      // df 遇到无权限挂载点（如 /run/user/1000/doc FUSE 挂载）会以 exit code 1 退出，
      // 但 stdout 仍包含其余挂载点的完整数据。只要有可解析的输出就继续处理。
      if (!result.stdout || result.stdout.trim().split('\n').length < 2) {
        this.validateCommandResult(result, 'df -h');
      }
      return this.parseDiskInfo(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDiskInfo', error);
    }
  }

  /**
   * 获取磁盘 I/O 统计
   */
  async getDiskIO(): Promise<any> {
    try {
      const diskstatsContent = await this.readFile(this.paths.diskstats);
      return this.parseDiskStats(diskstatsContent);
    } catch (error) {
      throw this.createCommandError('getDiskIO', error);
    }
  }

  /**
   * 获取网络接口列表
   */
  async getNetworkInterfaces(): Promise<any> {
    try {
      const result = await this.executeCommand('ip addr show');
      this.validateCommandResult(result, 'ip addr show');
      return this.parseNetworkInterfaces(result.stdout);
    } catch (primaryError) {
      // 回退到 ifconfig
      try {
        const result = await this.executeCommand('ifconfig');
        this.validateCommandResult(result, 'ifconfig');
        return this.parseIfconfigOutput(result.stdout);
      } catch (fallbackError) {
        throw this.createCommandError('getNetworkInterfaces', {
          primary: this.summarizeErrorDetails(primaryError),
          fallback: this.summarizeErrorDetails(fallbackError)
        });
      }
    }
  }

  /**
   * 获取网络统计信息
   */
  async getNetworkStats(): Promise<any> {
    try {
      const netdevContent = await this.readFile(this.paths.netDev);
      return this.parseNetworkStats(netdevContent);
    } catch (error) {
      throw this.createCommandError('getNetworkStats', error);
    }
  }

  /**
   * 获取进程列表
   */
  async getProcesses(): Promise<any> {
    try {
      const result = await this.executeCommand(this.processListCommand);
      this.validateCommandResult(result, 'ps command');
      return this.parseProcessList(result.stdout);
    } catch (error) {
      throw this.createCommandError('getProcesses', error);
    }
  }

  /**
   * 获取特定进程信息
   */
  async getProcessInfo(pid: number): Promise<any> {
    try {
      const procPath = `/proc/${pid}`;
      const exists = await this.fileExists(procPath);
      if (!exists) {
        throw new MonitorError(
          `Process ${pid} not found`,
          ErrorCode.NOT_AVAILABLE,
          this.platformName,
          { pid }
        );
      }

      const [stat, status, cmdline] = await Promise.allSettled([
        this.readFile(`${procPath}/stat`),
        this.readFile(`${procPath}/status`),
        this.readFile(`${procPath}/cmdline`)
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : '',
        results[1].status === 'fulfilled' ? results[1].value : '',
        results[2].status === 'fulfilled' ? results[2].value : ''
      ]);

      const statContent = stat || await this.readFile(`${procPath}/stat`).catch(() => '');

      return this.parseProcessInfo(pid, statContent, status, cmdline);
    } catch (error) {
      throw this.createCommandError('getProcessInfo', error);
    }
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo(): Promise<any> {
    try {
      const [uname, version, uptime, loadavg, machine] = await Promise.allSettled([
        this.executeCommand('uname -a'),
        this.readFile(this.paths.version),
        this.readFile(this.paths.uptime),
        this.readFile(this.paths.loadavg),
        this.executeCommand('uname -m')
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : null,
        results[1].status === 'fulfilled' ? results[1].value : '',
        results[2].status === 'fulfilled' ? results[2].value : '',
        results[3].status === 'fulfilled' ? results[3].value : '',
        results[4].status === 'fulfilled' ? results[4].value : null
      ]);

      const unameOutput = typeof uname === 'string' ? uname : uname?.stdout || '';
      const versionOutput = typeof version === 'string' ? version : version?.stdout || '';
      const uptimeOutput = typeof uptime === 'string' ? uptime : uptime?.stdout || '';
      const loadavgOutput = typeof loadavg === 'string' ? loadavg : loadavg?.stdout || '';
      const machineOutput = typeof machine === 'string' ? machine : machine?.stdout || '';
      return this.parseSystemInfo(unameOutput, versionOutput, uptimeOutput, loadavgOutput, machineOutput);
    } catch (error) {
      throw this.createCommandError('getSystemInfo', error);
    }
  }

  /**
   * 获取系统负载
   */
  async getSystemLoad(): Promise<any> {
    try {
      const loadavgContent = await this.readFile(this.paths.loadavg);
      return this.parseLoadAverage(loadavgContent);
    } catch (error) {
      throw this.createCommandError('getSystemLoad', error);
    }
  }

  /**
   * 初始化支持的功能
   */
  protected initializeSupportedFeatures(): SupportedFeatures {
    return {
      cpu: {
        info: true,
        usage: true,
        temperature: true,
        frequency: true,
        cache: true,
        perCore: true,
        cores: true
      },
      memory: {
        info: true,
        usage: true,
        swap: true,
        pressure: false, // Linux 内存压力需要额外工具
        detailed: true,
        virtual: true
      },
      disk: {
        info: true,
        io: true,
        health: false, // 需要 smartctl
        smart: false,
        filesystem: true,
        usage: true,
        stats: true,
        mounts: true,
        filesystems: true
      },
      network: {
        interfaces: true,
        stats: true,
        connections: true,
        bandwidth: true,
        gateway: true
      },
      process: {
        list: true,
        details: true,
        tree: true,
        monitor: true,
        info: true,
        kill: true,
        openFiles: true,
        environment: true
      },
      system: {
        info: true,
        load: true,
        uptime: true,
        users: true,
        services: false // 需要 systemctl
      }
    };
  }

  // 私有解析方法

  private parseCPUInfo(content: string): any {
    const lines = content.split('\n');
    const cpus: any[] = [];
    let currentCPU: any = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (Object.keys(currentCPU).length > 0) {
          cpus.push(currentCPU);
          currentCPU = {};
        }
        continue;
      }

      const separatorIndex = trimmed.indexOf(':');
      if (separatorIndex === -1) continue;

      const key = trimmed.substring(0, separatorIndex).trim();
      const value = trimmed.substring(separatorIndex + 1).trim();

      currentCPU[key] = value;
    }

    if (Object.keys(currentCPU).length > 0) {
      cpus.push(currentCPU);
    }

    return {
      cpus,
      count: cpus.length,
      model: cpus[0]?.['model name'] || 'Unknown',
      vendor: cpus[0]?.['vendor_id'] || 'Unknown',
      architecture: cpus[0]?.['cpu family'] || 'Unknown'
    };
  }

  private async captureCpuStat(): Promise<CpuStatSnapshot> {
    const content = await this.readFile(this.paths.stat);
    return this.parseCpuStat(content);
  }

  private parseCpuStat(content: string): CpuStatSnapshot {
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const summaryLine = lines.find(line => line.startsWith('cpu '));
    if (!summaryLine) {
      throw this.createParseError(content, 'CPU usage line not found');
    }

    const summary = this.parseCpuTimesFromLine(summaryLine);
    const cores: CpuTimes[] = [];

    for (const line of lines) {
      if (line.startsWith('cpu') && !line.startsWith('cpu ')) {
        cores.push(this.parseCpuTimesFromLine(line));
      }
    }

    return {
      summary,
      cores
    };
  }

  private parseCpuTimesFromLine(line: string): CpuTimes {
    const parts = line.trim().split(/\s+/);
    parts.shift(); // 移除 cpu 标识

    const values = parts.map(value => this.safeParseInt(value));

    return {
      user: values[0] ?? 0,
      nice: values[1] ?? 0,
      system: values[2] ?? 0,
      idle: values[3] ?? 0,
      iowait: values[4] ?? 0,
      irq: values[5] ?? 0,
      softirq: values[6] ?? 0,
      steal: values[7] ?? 0,
      guest: values[8] ?? 0,
      guestNice: values[9] ?? 0
    };
  }

  private calculateCpuUsage(previous: CpuStatSnapshot, current: CpuStatSnapshot): any {
    const summaryDelta = this.diffCpuTimes(previous.summary, current.summary);
    const percentages = this.computeUsagePercentages(summaryDelta);
    const cores = this.calculateCoreUsage(previous.cores, current.cores);

    return {
      overall: percentages.overall,
      user: percentages.user,
      system: percentages.system,
      idle: percentages.idle,
      iowait: percentages.iowait,
      irq: percentages.irq,
      softirq: percentages.softirq,
      cores
    };
  }

  private calculateCoreUsage(previousCores: CpuTimes[], currentCores: CpuTimes[]): number[] {
    const coreCount = Math.min(previousCores.length, currentCores.length);
    const usages: number[] = [];

    for (let i = 0; i < coreCount; i++) {
      const delta = this.diffCpuTimes(previousCores[i], currentCores[i]);
      const total = this.getCpuTotal(delta);
      if (total <= 0) {
        usages.push(0);
        continue;
      }

      const busy = total - delta.idle;
      usages.push((busy / total) * 100);
    }

    return usages;
  }

  private diffCpuTimes(previous: CpuTimes, current: CpuTimes): CpuTimes {
    return {
      user: this.safeDiff(current.user, previous.user),
      nice: this.safeDiff(current.nice, previous.nice),
      system: this.safeDiff(current.system, previous.system),
      idle: this.safeDiff(current.idle, previous.idle),
      iowait: this.safeDiff(current.iowait, previous.iowait),
      irq: this.safeDiff(current.irq, previous.irq),
      softirq: this.safeDiff(current.softirq, previous.softirq),
      steal: this.safeDiff(current.steal, previous.steal),
      guest: this.safeDiff(current.guest, previous.guest),
      guestNice: this.safeDiff(current.guestNice, previous.guestNice)
    };
  }

  private computeUsagePercentages(delta: CpuTimes) {
    const total = this.getCpuTotal(delta);

    if (total <= 0) {
      return {
        overall: 0,
        user: 0,
        system: 0,
        idle: 0,
        iowait: 0,
        irq: 0,
        softirq: 0
      };
    }

    return {
      overall: ((total - delta.idle) / total) * 100,
      user: ((delta.user + delta.nice) / total) * 100,
      system: (delta.system / total) * 100,
      idle: (delta.idle / total) * 100,
      iowait: (delta.iowait / total) * 100,
      irq: (delta.irq / total) * 100,
      softirq: (delta.softirq / total) * 100
    };
  }

  private getCpuTotal(times: CpuTimes): number {
    return times.user + times.nice + times.system + times.idle + times.iowait + times.irq + times.softirq + times.steal + times.guest + times.guestNice;
  }

  private safeDiff(current: number, previous: number): number {
    const diff = current - previous;
    return diff > 0 ? diff : 0;
  }

  private parseMemoryInfo(content: string): any {
    const memInfo = this.parseKeyValueOutput(content);

    const total = this.convertToBytes(memInfo['MemTotal'] || '0', 'kB');
    const available = this.convertToBytes(memInfo['MemAvailable'] || memInfo['MemFree'] || '0', 'kB');
    const free = this.convertToBytes(memInfo['MemFree'] || '0', 'kB');
    const cached = this.convertToBytes(memInfo['Cached'] || '0', 'kB');
    const buffers = this.convertToBytes(memInfo['Buffers'] || '0', 'kB');
    const used = total - available;

    return {
      total,
      available,
      used,
      free,
      cached,
      buffers,
      usagePercentage: total > 0 ? (used / total) * 100 : 0,
      swap: {
        total: this.convertToBytes(memInfo['SwapTotal'] || '0', 'kB'),
        free: this.convertToBytes(memInfo['SwapFree'] || '0', 'kB'),
        used: this.convertToBytes(memInfo['SwapTotal'] || '0', 'kB') - this.convertToBytes(memInfo['SwapFree'] || '0', 'kB')
      }
    };
  }

  private parseDiskInfo(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const disks: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(/\s+/);
      if (fields.length >= 6) {
        const [filesystem, size, used, available, usagePercent, mountpoint] = fields;

        disks.push({
          filesystem,
          mountpoint,
          size: this.convertToBytes(size),
          used: this.convertToBytes(used),
          available: this.convertToBytes(available),
          usagePercentage: this.safeParseNumber(usagePercent.replace('%', ''))
        });
      }
    }

    return disks;
  }


  /**
   * 解析 ip/ifconfig 输出的网卡信息，稳定提取接口名称
   */
  private parseNetworkInterfaces(output: string): any {
    const interfaces: any[] = [];
    const lines = output.split('\n');
    let current: {
      name: string;
      addresses: any[];
      state: string;
      mtu: number;
      internal: boolean;
      loopbackDetected: boolean;
    } | null = null;

    const pushCurrent = () => {
      if (current) {
        interfaces.push({
          name: current.name,
          addresses: current.addresses,
          state: current.state,
          mtu: current.mtu,
          internal: current.internal || current.loopbackDetected
        });
      }
      current = null;
    };

    for (const rawLine of lines) {
      const headerMatch = rawLine.match(/^\s*(\d+):\s*([^:@]+)(?:@[^:]+)?:\s*(.*)$/);
      if (headerMatch) {
        pushCurrent();

        const name = headerMatch[2];
        const rest = headerMatch[3] || '';
        const stateMatch = rest.match(/\bstate\s+([A-Z]+)/i);
        const mtuMatch = rest.match(/\bmtu\s+(\d+)/i);
        const isLoopback = /\bLOOPBACK\b/i.test(rest);

        current = {
          name,
          addresses: [],
          state: stateMatch ? stateMatch[1].toLowerCase() : 'down',
          mtu: mtuMatch ? this.safeParseInt(mtuMatch[1]) : 0,
          internal: name === 'lo' || name === 'lo0',
          loopbackDetected: isLoopback
        };
        continue;
      }

      if (!current) {
        continue;
      }

      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (/loopback/i.test(line)) {
        current.loopbackDetected = true;
      }

      const inetMatch = line.match(/^inet\s+([^\s/]+)(?:\/\d+)?/);
      if (inetMatch) {
        current.addresses.push({
          address: inetMatch[1],
          family: 'IPv4'
        });
        continue;
      }

      const inet6Match = line.match(/^inet6\s+([^\s/]+)(?:\/\d+)?/);
      if (inet6Match) {
        current.addresses.push({
          address: inet6Match[1],
          family: 'IPv6'
        });
      }
    }

    pushCurrent();
    return interfaces;
  }

  private parseIfconfigOutput(output: string): any {
    // 解析 ifconfig 输出的简化版本
    const interfaces: any[] = [];
    const blocks = output.split(/\n\n/);

    for (const block of blocks) {
      const lines = block.split('\n');
      const interfaceLine = lines[0];
      if (!interfaceLine) continue;

      const nameMatch = interfaceLine.match(/^(\w+):/);
      if (!nameMatch) continue;

      const name = nameMatch[1];
      const addresses: any[] = [];

      for (const line of lines) {
        const inetMatch = line.match(/inet\s+([^\s]+)/);
        if (inetMatch) {
          addresses.push({
            address: inetMatch[1],
            family: 'IPv4'
          });
        }
      }

      interfaces.push({
        name,
        addresses,
        state: interfaceLine.includes('UP') ? 'up' : 'down'
      });
    }

    return interfaces;
  }

  /**
   * 解析 /proc/net/dev 网络统计数据
   *
   * 将原始列按接口拆分，并提取收发字节/错误/丢包等指标
   */
  private parseNetworkStats(content: string): any {
    const lines = content.split('\n');
    const stats: any[] = [];

    for (let i = 2; i < lines.length; i++) { // 跳过头部
      const line = lines[i].trim();
      if (!line) continue;

      const fields = line.split(/\s+/);
      if (fields.length >= 17) {
        const [iface, ...values] = fields;
        const name = iface.replace(':', '');

        stats.push({
          interface: name,
          rxBytes: this.safeParseInt(values[0]),
          rxPackets: this.safeParseInt(values[1]),
          rxErrors: this.safeParseInt(values[2]),
          rxDropped: this.safeParseInt(values[3]),
          txBytes: this.safeParseInt(values[8]),
          txPackets: this.safeParseInt(values[9]),
          txErrors: this.safeParseInt(values[10]),
          txDropped: this.safeParseInt(values[11])
        });
      }
    }

    return stats;
  }

  private parseProcessList(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    const processes: any[] = [];

    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
      if (!match) {
        continue;
      }

      const [, pid, ppid, comm, pcpu, pmem, rss, state, user, args] = match;
      const command = args.trim() || comm;

      processes.push({
        pid: this.safeParseInt(pid),
        ppid: this.safeParseInt(ppid),
        name: comm,
        command,
        cpuUsage: this.safeParseNumber(pcpu),
        memoryUsage: this.safeParseInt(rss) * 1024, // rss 以 KB 计，转换为字节
        memoryPercentage: this.safeParseNumber(pmem),
        state,
        user
      });
    }

    return processes;
  }

  /**
   * 综合 /proc/[pid] 下多份文件，拼装进程详细信息
   */
  private parseProcessInfo(pid: number, stat: string, status: string, cmdline: string): any {
    const statusInfo = this.parseKeyValueOutput(status, '\t');
    const statFields = stat.split(' ');
    const startTimeTicks = this.safeParseInt(statFields[21]);
    const sysconf = (os as any).constants?.sysconf;
    const hertz = typeof sysconf?.SC_CLK_TCK === 'number' && sysconf.SC_CLK_TCK > 0
      ? sysconf.SC_CLK_TCK
      : 100;

    let uptimeMs = 0;
    try {
      uptimeMs = os.uptime() * 1000;
    } catch {
      uptimeMs = 0;
    }

    const bootTimeMs = uptimeMs > 0 ? Date.now() - uptimeMs : Date.now();
    // 通过时钟节拍 + 开机时间估算进程启动时间，兼容无法访问 uptime 的环境
    const computedStartTime = startTimeTicks > 0
      ? bootTimeMs + (startTimeTicks / hertz) * 1000
      : bootTimeMs;
    const startTime = Math.min(computedStartTime, Date.now());
    const rssPages = this.safeParseInt(statFields[23]);
    const pageSize = typeof sysconf?.SC_PAGESIZE === 'number' && sysconf.SC_PAGESIZE > 0
      ? sysconf.SC_PAGESIZE
      : 4096;
    const rssBytesFromStat = rssPages > 0 ? rssPages * pageSize : 0;

    const vmRssRaw = statusInfo['VmRSS'] ?? statusInfo['VmRSS:'] ?? '0';
    const vmSizeRaw = statusInfo['VmSize'] ?? statusInfo['VmSize:'] ?? '0';
    const threadsRaw = statusInfo['Threads'] ?? statusInfo['Threads:'];

    // 优先使用 /proc/[pid]/status 中的 KiB 数值，缺失时回退到 stat 的页数
    const rssFromStatus = this.convertToBytes(vmRssRaw, 'kB');
    const memoryUsage = rssFromStatus > 0 ? rssFromStatus : rssBytesFromStat;

    return {
      pid,
      name: statusInfo['Name'] || 'Unknown',
      command: cmdline.replace(/\0/g, ' ').trim(),
      state: statFields[2] || 'Unknown',
      ppid: this.safeParseInt(statFields[3]),
      threads: this.safeParseInt(threadsRaw),
      vmSize: this.convertToBytes(vmSizeRaw, 'kB'),
      vmRSS: memoryUsage,
      memoryUsage,
      memory: memoryUsage,
      rss: memoryUsage,
      startTime
    };
  }

  private parseSystemInfo(uname: string, version: string, uptime: string, loadavg: string, machine?: string): any {
    const unameFields = uname.trim().split(' ');
    const uptimeFields = uptime.trim().split(' ');
    const loadFields = loadavg.trim().split(' ');

    const uptimeSeconds = this.safeParseNumber(uptimeFields[0]);
    const uptimeMs = uptimeSeconds * 1000;
    const bootTime = Date.now() - uptimeMs;

    const architecture = this.resolveArchitecture(unameFields, machine);

    return {
      hostname: unameFields[1] || 'Unknown',
      platform: 'linux', // 统一返回标准平台名称，与 os.platform() 保持一致
      release: unameFields[2] || 'Unknown',
      version: version.trim(),
      arch: architecture,
      uptime: uptimeMs,
      uptimeSeconds,
      bootTime,
      loadAverage: {
        load1: this.safeParseNumber(loadFields[0]),
        load5: this.safeParseNumber(loadFields[1]),
        load15: this.safeParseNumber(loadFields[2])
      }
    };
  }

  private parseLoadAverage(content: string): any {
    const fields = content.trim().split(' ');
    return {
      load1: this.safeParseNumber(fields[0]),
      load5: this.safeParseNumber(fields[1]),
      load15: this.safeParseNumber(fields[2]),
      processes: {
        active: this.safeParseInt(fields[3]?.split('/')[0]),
        total: this.safeParseInt(fields[3]?.split('/')[1])
      }
    };
  }

  private async findThermalZones(): Promise<string[]> {
    try {
      const items = await fs.readdir(this.paths.thermal);
      return items.filter(item => item.startsWith('thermal_zone'));
    } catch {
      return [];
    }
  }

  // 实现抽象方法

  /**
   * 获取磁盘使用情况
   */
  async getDiskUsage(): Promise<any> {
    try {
      const result = await this.executeCommand('df -B1');
      // 同 getDiskInfo：df 遇到无权限挂载点时 exit code 为 1，但 stdout 数据仍有效
      if (!result.stdout || result.stdout.trim().split('\n').length < 2) {
        this.validateCommandResult(result, 'df -B1');
      }
      return this.parseDiskUsage(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDiskUsage', error);
    }
  }

  /**
   * 获取磁盘统计
   */
  async getDiskStats(): Promise<any> {
    try {
      const diskstatsContent = await this.readFile(this.paths.diskstats);
      return this.parseDiskStats(diskstatsContent);
    } catch (error) {
      throw this.createCommandError('getDiskStats', error);
    }
  }

  /**
   * 获取挂载点
   */
  async getMounts(): Promise<any> {
    try {
      const mountsContent = await this.readFile(this.paths.mounts);
      return this.parseMounts(mountsContent);
    } catch (error) {
      throw this.createCommandError('getMounts', error);
    }
  }

  /**
   * 获取文件系统
   */
  async getFileSystems(): Promise<any> {
    try {
      const result = await this.executeCommand('cat /proc/filesystems');
      return this.parseFileSystems(result.stdout);
    } catch (error) {
      throw this.createCommandError('getFileSystems', error);
    }
  }

  /**
   * 获取网络连接
   */
  async getNetworkConnections(): Promise<any> {
    try {
      const result = await this.executeCommand('ss -tuln');
      return this.parseNetworkConnections(result.stdout);
    } catch (primaryError) {
      try {
        const result = await this.executeCommand('netstat -tuln');
        this.validateCommandResult(result, 'netstat -tuln');
        return this.parseNetstatConnections(result.stdout);
      } catch (fallbackError) {
        throw this.createCommandError('getNetworkConnections', {
          primary: this.summarizeErrorDetails(primaryError),
          fallback: this.summarizeErrorDetails(fallbackError)
        });
      }
    }
  }

  /**
   * 获取默认网关
   */
  async getDefaultGateway(): Promise<any> {
    try {
      const result = await this.executeCommand('ip route show default');
      return this.parseDefaultGateway(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDefaultGateway', error);
    }
  }

  /**
   * 获取进程列表
   */
  async getProcessList(): Promise<any> {
    try {
      const result = await this.executeCommand(this.processListCommand);
      this.validateCommandResult(result, 'ps command');
      return this.parseProcessList(result.stdout);
    } catch (error) {
      throw this.createCommandError('getProcessList', error);
    }
  }

  /**
   * 杀死进程
   */
  async killProcess(pid: number, signal: string = 'TERM'): Promise<boolean> {
    try {
      const result = await this.executeCommand(`kill -${signal} ${pid}`);
      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取进程打开文件
   */
  async getProcessOpenFiles(pid: number): Promise<string[]> {
    try {
      const result = await this.executeCommand(`lsof -p ${pid} -Fn`);
      return this.parseOpenFiles(result.stdout);
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取进程环境变量
   */
  async getProcessEnvironment(pid: number): Promise<Record<string, string>> {
    try {
      const environContent = await this.readFile(`/proc/${pid}/environ`);
      return this.parseEnvironment(environContent);
    } catch (error) {
      return {};
    }
  }

  /**
   * 获取系统运行时间
   */
  async getSystemUptime(): Promise<any> {
    try {
      const uptimeContent = await this.readFile(this.paths.uptime);
      const uptimeFields = uptimeContent.trim().split(' ');
      return {
        uptime: this.safeParseNumber(uptimeFields[0]) * 1000, // 转换为毫秒
        idleTime: this.safeParseNumber(uptimeFields[1]) * 1000 // 转换为毫秒
      };
    } catch (error) {
      throw this.createCommandError('getSystemUptime', error);
    }
  }

  /**
   * 获取系统用户
   */
  async getSystemUsers(): Promise<any> {
    try {
      const result = await this.executeCommand('who');
      return this.parseSystemUsers(result.stdout);
    } catch (error) {
      throw this.createCommandError('getSystemUsers', error);
    }
  }

  /**
   * 获取系统服务
   */
  async getSystemServices(): Promise<any> {
    if (this.containerMode) {
      throw this.createUnsupportedError('system.services (container)');
    }
    try {
      const result = await this.executeCommand('systemctl list-units --type=service --no-pager');
      return this.parseSystemServices(result.stdout);
    } catch (error) {
      throw this.createCommandError('getSystemServices', error);
    }
  }

  // 私有解析方法

  private parseDiskUsage(output: string): any[] {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const disks: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 6) {
        disks.push({
          device: fields[0],
          total: this.safeParseInt(fields[1]),
          used: this.safeParseInt(fields[2]),
          available: this.safeParseInt(fields[3]),
          usagePercentage: this.safeParseNumber(fields[4].replace('%', '')),
          mountPoint: fields[5]
        });
      }
    }

    return disks;
  }

  private parseDiskStats(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim());
    const stats: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 14) {
        stats.push({
          device: fields[2],
          reads: this.safeParseInt(fields[3]),
          readsMerged: this.safeParseInt(fields[4]),
          readSectors: this.safeParseInt(fields[5]),
          readTime: this.safeParseInt(fields[6]),
          writes: this.safeParseInt(fields[7]),
          writesMerged: this.safeParseInt(fields[8]),
          writeSectors: this.safeParseInt(fields[9]),
          writeTime: this.safeParseInt(fields[10]),
          ioInProgress: this.safeParseInt(fields[11]),
          ioTime: this.safeParseInt(fields[12]),
          weightedIOTime: this.safeParseInt(fields[13])
        });
      }
    }

    return stats;
  }

  private parseMounts(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim());
    const mounts: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 6) {
        mounts.push({
          device: fields[0],
          mountPoint: fields[1],
          filesystem: fields[2],
          options: fields[3].split(','),
          dump: this.safeParseInt(fields[4]),
          pass: this.safeParseInt(fields[5])
        });
      }
    }

    return mounts;
  }

  private parseFileSystems(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const filesystems: any[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        const isNodev = trimmed.startsWith('nodev\t');
        const name = isNodev ? trimmed.substring(6) : trimmed;
        filesystems.push({
          name,
          supported: !isNodev
        });
      }
    }

    return filesystems;
  }

  private parseNetworkConnections(output: string): any[] {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const connections: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 5) {
        connections.push({
          protocol: fields[0],
          state: fields[1],
          localAddress: fields[4],
          foreignAddress: fields[5] || '*:*'
        });
      }
    }

    return connections;
  }

  private parseNetstatConnections(output: string): any[] {
    const lines = output.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('Proto') && !trimmed.startsWith('Active');
    });

    const connections: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 5) {
        continue;
      }

      const protocol = fields[0].toLowerCase();
      const hasState = fields.length >= 6;
      const localFieldIndex = 3;
      const foreignFieldIndex = 4;

      connections.push({
        protocol,
        state: hasState ? fields[5].toLowerCase() : 'unknown',
        localAddress: fields[localFieldIndex],
        foreignAddress: fields[foreignFieldIndex] || '*:*'
      });
    }

    return connections;
  }

  private parseDefaultGateway(output: string): any {
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('default')) {
        continue;
      }

      const fields = trimmed.split(/\s+/);
      if (fields.length === 0) {
        continue;
      }

      let gateway: string | null = null;
      let interfaceName: string | null = null;

      for (let i = 0; i < fields.length; i++) {
        const token = fields[i];
        if (token === 'via' && fields[i + 1]) {
          gateway = fields[i + 1];
        } else if (token === 'dev' && fields[i + 1]) {
          interfaceName = fields[i + 1];
        }
      }

      if (!gateway && fields.length > 1) {
        const candidate = fields[1];
        if (candidate && candidate !== 'dev' && candidate !== 'proto' && candidate !== 'metric' && candidate !== 'scope') {
          gateway = candidate;
        }
      }

      if (gateway !== null || interfaceName !== null) {
        return {
          gateway: gateway ?? null,
          interface: interfaceName ?? 'unknown'
        };
      }
    }
    return null;
  }

  private parseOpenFiles(output: string): string[] {
    const lines = output.split('\n');
    const files: string[] = [];

    for (const line of lines) {
      if (line.startsWith('n')) {
        files.push(line.substring(1));
      }
    }

    return files;
  }

  private parseEnvironment(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const variables = content.split('\0').filter(v => v);

    for (const variable of variables) {
      const equalIndex = variable.indexOf('=');
      if (equalIndex > 0) {
        const key = variable.substring(0, equalIndex);
        const value = variable.substring(equalIndex + 1);
        env[key] = value;
      }
    }

    return env;
  }

  private parseSystemUsers(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const users: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 3) {
        users.push({
          user: fields[0],
          terminal: fields[1],
          loginTime: fields.slice(2).join(' ')
        });
      }
    }

    return users;
  }

  private parseSystemServices(output: string): any[] {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const services: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 4) {
        services.push({
          unit: fields[0],
          load: fields[1],
          active: fields[2],
          sub: fields[3],
          description: fields.slice(4).join(' ')
        });
      }
    }

    return services;
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  /**
   * 推断主机架构
   *
   * 同时考虑 `uname -m`、`uname -a` 末尾字段与 `os.arch()`，过滤掉 `SMP` 等噪声标记，
   * 尽可能返回准确的 CPU 架构标识。
   */
  private resolveArchitecture(unameFields: string[], machineOutput?: string): string {
    const archPattern = /^(x86_64|amd64|arm64|aarch64|armv\d+l?|i[3-6]86|ppc64le|ppc64|s390x|mips64el|mips64|mipsel|loongarch\d*|riscv\d+|sparc64)$/i;
    const normalize = (value?: string | null) => value?.trim() || '';

    const candidates: Array<string | undefined> = [];

    const normalizedMachine = normalize(machineOutput);
    if (normalizedMachine) {
      candidates.push(normalizedMachine);
    }

    for (let i = unameFields.length - 1; i >= 0; i--) {
      const token = normalize(unameFields[i]);
      if (token) {
        candidates.push(token);
      }
    }

    try {
      const runtimeArch = normalize(os.arch());
      if (runtimeArch) {
        candidates.push(runtimeArch);
      }
    } catch {
      // ignore runtime arch fetch errors
    }

    for (const candidate of candidates) {
      if (candidate && archPattern.test(candidate)) {
        return candidate;
      }
    }

    return 'Unknown';
  }

  /**
   * 归纳命令执行阶段的错误信息
   *
   * 便于在调用栈中保留主、次命令的失败原因，帮助上层监控器输出更具可读性的诊断数据。
   */
  private summarizeErrorDetails(error: unknown): Record<string, any> {
    if (!error) {
      return { message: 'Unknown error' };
    }

    if (error instanceof MonitorError) {
      return {
        code: error.code,
        message: error.message,
        details: error.details || null
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message
      };
    }

    return { message: String(error) };
  }

  /**
   * 检测当前进程是否运行在容器环境中
   *
   * 通过常见标记文件和 cgroup 信息判断，若命中则代表部分系统能力（如 systemd）不可用。
   */
  private detectContainerEnvironment(): boolean {
    try {
      const indicatorPaths = ['/.dockerenv', '/run/.containerenv'];
      for (const path of indicatorPaths) {
        if (fsSync.existsSync(path)) {
          return true;
        }
      }

      const cgroupPath = '/proc/1/cgroup';
      if (fsSync.existsSync(cgroupPath)) {
        const content = fsSync.readFileSync(cgroupPath, 'utf8');
        if (/(docker|containerd|kubepods|lxc|podman)/i.test(content)) {
          return true;
        }
      }

      const envIndicators = ['CONTAINER', 'KUBERNETES_SERVICE_HOST'];
      if (envIndicators.some(key => process.env[key])) {
        return true;
      }
    } catch {
      // 检测失败时默认视为非容器环境
    }

    return false;
  }
}
