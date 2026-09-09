import os from 'os';
import { promises as fs } from 'fs';

import { BasePlatformAdapter } from '../core/platform-adapter';
import { BaseMonitor } from '../core/base-monitor';
import { SupportedFeatures } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError, ErrorCode } from '../types/errors';
import { isValidPositiveProcessId, sendProcessSignal } from '../utils/process-killer';

/**
 * macOS 平台适配器
 *
 * 实现 macOS 系统的监控功能，主要通过 sysctl、vm_stat、system_profiler 等命令
 */
export class MacOSAdapter extends BasePlatformAdapter {
  // comm 和 args 都可能含空格，分别放在各自输出的最后一列后再按 PID 合并。
  private readonly processSummaryCommand = 'ps -axww -o pid=,ppid=,%cpu=,%mem=,rss=,stat=,user=,comm=';
  private readonly processArgsCommand = 'ps -axww -o pid=,args=';

  /**
   * 创建 macOS 平台适配器。
   *
   * @param defaultExecuteOptions 底层系统命令的默认执行选项
   */
  constructor(defaultExecuteOptions: ExecuteOptions = {}) {
    super('darwin', defaultExecuteOptions);
  }

  /**
   * 读取文件内容，捕获并转换常见的权限/不存在错误
   */
  async readFile(path: string): Promise<string> {
    try {
      // 直接使用 fs API，避免经过 shell 时路径中的元字符需要转义
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
   * 检查路径是否存在；文件和目录均视为存在
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
   * 通过 sysctl 汇总 CPU 基本信息
   */
  async getCPUInfo(): Promise<any> {
    try {
      const [brand, cores, threads, freq] = await Promise.allSettled([
        this.executeCommand('sysctl -n machdep.cpu.brand_string'),
        this.executeCommand('sysctl -n hw.physicalcpu'),
        this.executeCommand('sysctl -n hw.logicalcpu'),
        this.executeCommand('sysctl -n hw.cpufrequency_max')
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : null,
        results[1].status === 'fulfilled' ? results[1].value : null,
        results[2].status === 'fulfilled' ? results[2].value : null,
        results[3].status === 'fulfilled' ? results[3].value : null
      ]);

      const info = this.parseCPUInfo(brand?.stdout || '', cores?.stdout || '', threads?.stdout || '', freq?.stdout || '');

      // 若 sysctl 命令全部失败，降级到 os.cpus() 基础数据
      if (!info.cores || !info.threads) {
        BaseMonitor.warnDegradation(
          'cpu.command_failed',
          'macOS sysctl unavailable, falling back to os.cpus() data'
        );
        const cpus = os.cpus();
        const logicalCores = cpus.length || 1;
        info.model = cpus[0]?.model || info.model || 'Unknown';
        info.cores = Math.max(1, Math.floor(logicalCores / 2));
        info.threads = logicalCores;
        info.baseFrequency = cpus[0]?.speed || 0;
        info.maxFrequency = cpus[0]?.speed || 0;
        info.architecture = os.arch();
      }

      return info;
    } catch (error) {
      throw this.createCommandError('getCPUInfo', error);
    }
  }

  /**
   * 调用 top/iostat 获取 CPU 使用率，失败时链式回退
   */
  async getCPUUsage(): Promise<any> {
    try {
      // 使用 top 命令获取 CPU 使用率
      const result = await this.executeCommand('top -l 1 -n 0');
      this.validateCommandResult(result, 'top command');
      return this.parseCPUUsageFromTop(result.stdout);
    } catch (error) {
      // 回退到 iostat
      try {
        const result = await this.executeCommand('iostat -c 1');
        this.validateCommandResult(result, 'iostat command');
        return this.parseCPUUsageFromIostat(result.stdout);
      } catch {
        throw this.createCommandError('getCPUUsage', error);
      }
    }
  }

  /**
   * 使用 powermetrics 读取温度，需要 sudo 权限
   */
  async getCPUTemperature(): Promise<any> {
    try {
      // macOS 温度监控需要第三方工具或私有 API
      // 尝试使用 powermetrics（需要 sudo）
      const result = await this.executeCommand('powermetrics -n 1 -i 1000 --samplers smc');
      return this.parseTemperatureFromPowermetrics(result.stdout);
    } catch (error) {
      // 温度监控在 macOS 上可能需要额外权限
      throw this.createUnsupportedError('cpu.temperature');
    }
  }

  /**
   * 读取 vm_stat 解析内存占用
   */
  async getMemoryInfo(): Promise<any> {
    try {
      const [vmStat, totalMem, pressure] = await Promise.allSettled([
        this.executeCommand('vm_stat'),
        this.executeCommand('sysctl -n hw.memsize'),
        this.executeCommand('memory_pressure')
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : null,
        results[1].status === 'fulfilled' ? results[1].value : null,
        results[2].status === 'fulfilled' ? results[2].value : null
      ]);

      if (vmStat) this.validateCommandResult(vmStat, 'vm_stat');
      if (totalMem) this.validateCommandResult(totalMem, 'sysctl hw.memsize');

      return this.parseMemoryInfo(vmStat?.stdout || '', totalMem?.stdout || '', pressure?.stdout || '');
    } catch (error) {
      throw this.createCommandError('getMemoryInfo', error);
    }
  }

  /**
   * 读取 vm_stat 解析内存占用
   */
  async getMemoryUsage(): Promise<any> {
    // macOS 上内存信息和使用情况来自相同来源
    return this.getMemoryInfo();
  }

  /**
   * 读取 df -Ph 解析磁盘占用（-P 保证 POSIX 单行输出，避免长设备名折行）
   */
  async getDiskInfo(): Promise<any> {
    try {
      const result = await this.executeCommand('df -Ph');
      this.validateCommandResult(result, 'df -Ph');
      return this.parseDiskInfo(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDiskInfo', error);
    }
  }

  /**
   * 读取 iostat -d 解析磁盘 I/O 统计
   */
  async getDiskIO(): Promise<any> {
    try {
      const result = await this.executeCommand('iostat -d');
      this.validateCommandResult(result, 'iostat -d');
      return this.parseDiskIO(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDiskIO', error);
    }
  }

  /**
   * 读取 ifconfig 解析网络接口列表
   */
  async getNetworkInterfaces(): Promise<any> {
    try {
      const result = await this.executeCommand('ifconfig');
      this.validateCommandResult(result, 'ifconfig');
      return this.parseNetworkInterfaces(result.stdout);
    } catch (error) {
      throw this.createCommandError('getNetworkInterfaces', error);
    }
  }

  /**
   * 读取 netstat -ib 解析网络统计信息
   */
  async getNetworkStats(): Promise<any> {
    try {
      const result = await this.executeCommand('netstat -ib');
      this.validateCommandResult(result, 'netstat -ib');
      return this.parseNetworkStats(result.stdout);
    } catch (error) {
      throw this.createCommandError('getNetworkStats', error);
    }
  }

  /**
   * 读取 ps 进程列表并解析（args 列位于末尾，避免含空格路径导致列错位）
   */
  async getProcesses(): Promise<any> {
    try {
      return await this.collectProcessList();
    } catch (error) {
      throw this.createCommandError('getProcesses', error);
    }
  }

  /**
   * 读取 ps 输出并解析特定进程信息。
   *
   * @param pid 目标进程 ID，必须为大于 0 的安全整数
   * @returns 进程信息；运行时参数非法时返回 null
   */
  async getProcessInfo(pid: number): Promise<any> {
    if (!isValidPositiveProcessId(pid)) {
      return null;
    }

    try {
      if (!this.processExists(pid)) {
        return null;
      }

      const [summaryResult, commandResult, startResult] = await Promise.all([
        this.executeCommand(`ps -p ${pid} -o pid=,ppid=,rss=,pcpu=,pmem=,state=,user=`),
        this.executeCommand(`ps -p ${pid} -o command=`),
        this.executeCommand(`ps -p ${pid} -o lstart=`)
      ]);

      this.validateCommandResult(summaryResult, `ps summary ${pid}`);
      this.validateCommandResult(commandResult, `ps command ${pid}`);
      this.validateCommandResult(startResult, `ps lstart ${pid}`);

      const summaryLine = summaryResult.stdout.split('\n').find(line => line.trim().length > 0) || '';
      const commandLine = commandResult.stdout.split('\n').find(line => line.trim().length > 0) || '';
      const lstartLine = startResult.stdout.split('\n').find(line => line.trim().length > 0) || '';

      return this.parseProcessInfo({ summary: summaryLine, command: commandLine, start: lstartLine }, pid);
    } catch (error) {
      throw this.createCommandError('getProcessInfo', error);
    }
  }

  /**
   * 读取 uname -a, uptime, sysctl -n vm.loadavg, sw_vers 解析系统信息
   */
  async getSystemInfo(): Promise<any> {
    try {
      const [uname, uptime, loadavg, osVersion] = await Promise.allSettled([
        this.executeCommand('uname -a'),
        this.executeCommand('uptime'),
        this.executeCommand('sysctl -n vm.loadavg'),
        this.executeCommand('sw_vers')
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : null,
        results[1].status === 'fulfilled' ? results[1].value : null,
        results[2].status === 'fulfilled' ? results[2].value : null,
        results[3].status === 'fulfilled' ? results[3].value : null
      ]);

      return this.parseSystemInfo(uname?.stdout || '', uptime?.stdout || '', loadavg?.stdout || '', osVersion?.stdout || null);
    } catch (error) {
      throw this.createCommandError('getSystemInfo', error);
    }
  }

  /**
   * 读取 sysctl -n vm.loadavg 解析系统负载
   */
  async getSystemLoad(): Promise<any> {
    try {
      const result = await this.executeCommand('sysctl -n vm.loadavg');
      this.validateCommandResult(result, 'sysctl vm.loadavg');
      return this.parseLoadAverage(result.stdout);
    } catch (error) {
      throw this.createCommandError('getSystemLoad', error);
    }
  }

  /**
   * 读取 sysctl -n vm.loadavg 解析系统负载
   */
  protected initializeSupportedFeatures(): SupportedFeatures {
    return {
      cpu: {
        info: true,
        usage: true,
        temperature: false, // 需要特殊权限
        frequency: true,
        cache: false,
        perCore: false,
        cores: true
      },
      memory: {
        info: true,
        usage: true,
        swap: true,
        pressure: true,
        detailed: true,
        virtual: true
      },
      disk: {
        info: true,
        io: true,
        health: false,
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
        bandwidth: false,
        gateway: true
      },
      process: {
        list: true,
        details: true,
        tree: false,
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
        services: false
      }
    };
  }

  // 私有解析方法，解析命令输出为结构化数据

  private parseCPUInfo(brand: string, cores: string, threads: string, freq: string | null): any {
    return {
      model: brand.trim(),
      manufacturer: brand.includes('Intel') ? 'Intel' : brand.includes('Apple') ? 'Apple' : 'Unknown',
      architecture: os.arch(),
      cores: this.safeParseInt(cores.trim()),
      threads: this.safeParseInt(threads.trim()),
      baseFrequency: freq ? this.safeParseInt(freq.trim()) / 1000000 : 0, // 转换为 MHz
      maxFrequency: freq ? this.safeParseInt(freq.trim()) / 1000000 : 0,
      cache: {},
      features: []
    };
  }

  /**
   * 解析 top 命令输出为 CPU 使用率
   */
  private parseCPUUsageFromTop(output: string): any {
    const lines = output.split('\n');
    const cpuLine = lines.find(line => line.includes('CPU usage:'));

    if (!cpuLine) {
      throw this.createParseError(output, 'CPU usage line not found in top output');
    }

    // 解析类似 "CPU usage: 10.81% user, 13.73% sys, 75.45% idle" 的行
    const userMatch = cpuLine.match(/([\d.]+)%\s+user/);
    const sysMatch = cpuLine.match(/([\d.]+)%\s+sys/);
    const idleMatch = cpuLine.match(/([\d.]+)%\s+idle/);

    const user = userMatch ? this.safeParseNumber(userMatch[1]) : 0;
    const system = sysMatch ? this.safeParseNumber(sysMatch[1]) : 0;
    const idle = idleMatch ? this.safeParseNumber(idleMatch[1]) : 0;

    return {
      overall: 100 - idle,
      user,
      system,
      idle,
      cores: []
    };
  }

  /**
   * 解析 iostat 命令输出为 CPU 使用率
   */
  private parseCPUUsageFromIostat(output: string): any {
    const lines = output.split('\n');
    const dataLine = lines[lines.length - 2]; // iostat 的最后一行数据

    if (!dataLine) {
      throw this.createParseError(output, 'No data line found in iostat output');
    }

    const fields = dataLine.trim().split(/\s+/);
    if (fields.length >= 3) {
      const user = this.safeParseNumber(fields[0]);
      const system = this.safeParseNumber(fields[1]);
      const idle = this.safeParseNumber(fields[2]);

      return {
        overall: 100 - idle,
        user,
        system,
        idle,
        cores: []
      };
    }

    throw this.createParseError(output, 'Unable to parse iostat CPU data');
  }

  /**
   * 解析 powermetrics 命令输出为温度
   */
  private parseTemperatureFromPowermetrics(output: string): any {
    // powermetrics 输出解析（简化版）
    const lines = output.split('\n');
    const temperatures: any[] = [];

    for (const line of lines) {
      const tempMatch = line.match(/(\w+)\s+temperature:\s+([\d.]+)/);
      if (tempMatch) {
        temperatures.push({
          sensor: tempMatch[1],
          temperature: this.safeParseNumber(tempMatch[2])
        });
      }
    }

    return temperatures;
  }

  /**
   * 解析 vm_stat 输出为内存信息
   */
  private parseMemoryInfo(vmStat: string, totalMem: string, pressure: string | null): any {
    const total = this.safeParseInt(totalMem.trim());

    // 解析 vm_stat 输出
    const vmLines = vmStat.split('\n');
    const pageSizeLine = vmLines.find(line => /page size of\s+\d+\s+bytes/i.test(line));
    const pageSizeMatch = pageSizeLine ? pageSizeLine.match(/page size of\s+(\d+)\s+bytes/i) : null;
    const detectedPageSize = pageSizeMatch && pageSizeMatch[1]
      ? this.safeParseInt(pageSizeMatch[1])
      : 0;
    const pageSize = detectedPageSize > 0 ? detectedPageSize : 4096;
    let free = 0, active = 0, inactive = 0, wired = 0, compressed = 0;

    for (const line of vmLines) {
      const match = line.match(/Pages\s+([\w\s]+):\s+(\d+)/);
      if (match) {
        const [, typeRaw, count] = match;
        const type = typeRaw.trim().toLowerCase();
        const bytes = this.safeParseInt(count) * pageSize;

        switch (type) {
          case 'free':
            free = bytes;
            break;
          case 'active':
            active = bytes;
            break;
          case 'inactive':
            inactive = bytes;
            break;
          case 'wired':
          case 'wired down':
            wired = bytes;
            break;
          case 'compressed':
          case 'occupied':
          case 'occupied by compressor':
            compressed = bytes;
            break;
        }
      }
    }

    const used = active + wired + compressed;
    const available = total - used;

    return {
      total,
      used,
      free,
      available,
      active,
      inactive,
      wired,
      compressed,
      usagePercentage: total > 0 ? (used / total) * 100 : 0,
      pressure: this.parseMemoryPressure(pressure)
    };
  }

  /**
   * 解析 memory_pressure 输出为内存压力
   */
  private parseMemoryPressure(pressure: string | null): any {
    if (!pressure) {
      return { level: 'normal', score: 0 };
    }

    // 简化的内存压力解析
    if (pressure.includes('critical')) {
      return { level: 'critical', score: 90 };
    } else if (pressure.includes('warn')) {
      return { level: 'high', score: 70 };
    } else {
      return { level: 'normal', score: 10 };
    }
  }

  /**
   * 解析 df -Ph 输出为磁盘信息（POSIX 格式共 6 列，无 inode 列；挂载点可能含空格，取剩余列拼接）
   */
  private parseDiskInfo(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const disks: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(/\s+/);
      if (fields.length >= 6) {
        const [filesystem, size, used, available, capacity] = fields;
        const mountpoint = fields.slice(5).join(' ');

        disks.push({
          filesystem,
          mountpoint,
          size: this.convertDfSizeToBytes(size),
          used: this.convertDfSizeToBytes(used),
          available: this.convertDfSizeToBytes(available),
          usagePercentage: this.safeParseNumber(capacity.replace('%', ''))
        });
      }
    }

    return disks;
  }

  /**
   * 解析 iostat -d 输出为磁盘 I/O 统计
   */
  private parseDiskIO(output: string): any {
    return this.parseIostatDisks(output).map(item => ({
      device: item.device,
      kbPerTransfer: item.kbPerTransfer,
      transfersPerSec: item.transfersPerSec,
      mbPerSec: item.mbPerSec,
      readSpeed: item.bytePerSec,
      iops: item.transfersPerSec
    }));
  }

  /**
   * 解析 ifconfig 输出为网络接口列表
   */
  private parseNetworkInterfaces(output: string): any {
    const interfaces: any[] = [];
    const blocks = output.split(/\n(?=\w)/); // 按接口分割

    for (const block of blocks) {
      const lines = block.split('\n');
      const interfaceLine = lines[0];
      if (!interfaceLine) continue;

      const nameMatch = interfaceLine.match(/^(\w+):/);
      if (!nameMatch) continue;

      const name = nameMatch[1];
      const addresses: any[] = [];
      let state = 'down';
      let mtu = 0;
      let macAddress = '';

      for (const line of lines) {
        // 状态检查
        if (line.includes('<UP,')) {
          state = 'up';
        }

        // MTU 检查
        const mtuMatch = line.match(/mtu (\d+)/);
        if (mtuMatch) {
          mtu = this.safeParseInt(mtuMatch[1]);
        }

        // MAC 地址
        const etherMatch = line.match(/ether\s+([0-9a-f:]+)/i);
        if (etherMatch) {
          macAddress = etherMatch[1].toLowerCase();
        }

        // IPv4 地址
        const inetMatch = line.match(/inet\s+([^\s]+)/);
        if (inetMatch) {
          addresses.push({
            address: inetMatch[1],
            family: 'IPv4'
          });
        }

        // IPv6 地址
        const inet6Match = line.match(/inet6\s+([^\s]+)/);
        if (inet6Match) {
          addresses.push({
            address: inet6Match[1],
            family: 'IPv6'
          });
        }
      }

      interfaces.push({
        name,
        addresses,
        state,
        mtu,
        internal: name === 'lo0',
        mac: macAddress
      });
    }

    return interfaces;
  }

  /**
   * 解析 netstat -ib/-i 输出，兼容是否包含字节列两种格式
   */
  private parseNetworkStats(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const header = lines[0].toLowerCase();
    const stats: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].trim().split(/\s+/);
      if (fields.length < 8) continue;

      // macOS netstat 会为未激活接口追加 "*"，该字符是状态标记而非接口名的一部分。
      const name = fields[0].replace(/\*$/, '');
      const mtu = this.safeParseInt(fields[1]);

      if (header.includes('ibytes') && fields.length >= 11) {
        const tail = fields.slice(-7);
        if (tail.length < 7) continue;
        const [ipkts, ierrs, ibytes, opkts, oerrs, obytes, collisions] = tail;
        stats.push({
          interface: name,
          mtu,
          rxPackets: this.safeParseInt(ipkts),
          rxErrors: this.safeParseInt(ierrs),
          rxBytes: this.safeParseInt(ibytes),
          txPackets: this.safeParseInt(opkts),
          txErrors: this.safeParseInt(oerrs),
          txBytes: this.safeParseInt(obytes),
          collisions: this.safeParseInt(collisions)
        });
        continue;
      }
      const tail = fields.slice(-5);
      if (tail.length < 5) continue;
      const [ipkts, ierrs, opkts, oerrs, collisions] = tail;
      stats.push({
        interface: name,
        mtu,
        rxPackets: this.safeParseInt(ipkts),
        rxErrors: this.safeParseInt(ierrs),
        rxBytes: 0,
        txPackets: this.safeParseInt(opkts),
        txErrors: this.safeParseInt(oerrs),
        txBytes: 0,
        collisions: this.safeParseInt(collisions)
      });
    }

    return stats;
  }

  /**
   * 并行读取进程摘要和完整命令行，再按 PID 合并。
   *
   * @returns 以 comm 为名称、args 为命令行的进程列表
   */
  private async collectProcessList(): Promise<any[]> {
    const options = { maxBuffer: 10 * 1024 * 1024 };
    const [summaryResult, argsResult] = await Promise.all([
      this.executeCommand(this.processSummaryCommand, options),
      this.executeCommand(this.processArgsCommand, options)
    ]);

    this.validateCommandResult(summaryResult, 'ps process summary');
    this.validateCommandResult(argsResult, 'ps process args');
    return this.parseProcessList(summaryResult.stdout, argsResult.stdout);
  }

  /**
   * 解析两份 ps 输出并按 PID 关联。
   *
   * comm/args 均位于各自输出的最后一列，因此路径中的空格不会破坏前置字段。
   *
   * @param summaryOutput 以 comm 结尾的进程摘要
   * @param argsOutput 以 args 结尾的 PID 与命令行列表
   * @returns 解析后的进程列表
   */
  private parseProcessList(summaryOutput: string, argsOutput: string): any[] {
    const commands = this.parseProcessCommands(argsOutput);
    const lines = summaryOutput.split('\n').filter(line => line.trim());
    const processes: any[] = [];

    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        continue;
      }

      const [, pid, ppid, pcpu, pmem, rss, state, user, comm] = match;
      const numericPid = this.safeParseInt(pid);
      const name = comm.trim();
      const command = commands.get(numericPid) || name;

      processes.push({
        pid: numericPid,
        ppid: this.safeParseInt(ppid),
        name,
        comm: name,
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
   * 将 `ps -axww -o pid=,args=` 输出转换为 PID 到完整命令行的映射。
   *
   * @param output ps 命令行输出
   * @returns PID 到完整 args 的映射
   */
  private parseProcessCommands(output: string): Map<number, string> {
    const commands = new Map<number, string>();

    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) {
        continue;
      }

      commands.set(this.safeParseInt(match[1]), match[2].trim());
    }

    return commands;
  }

  /**
   * 解析 ps 输出的进程详细信息
   */
  private parseProcessInfo(
    data: { summary: string; command: string; start: string },
    pid: number
  ): any {
    const summaryParts = data.summary.trim().split(/\s+/);

    if (summaryParts.length < 7) {
      throw new MonitorError(
        `Process ${pid} not found`,
        ErrorCode.NOT_AVAILABLE,
        this.platformName,
        { pid }
      );
    }

    const [pidStr, ppidStr, rssStr, pcpu, pmem, state, user] = summaryParts;
    const command = data.command.trim();
    const lstart = data.start.trim();

    return {
      pid: this.safeParseInt(pidStr) || pid,
      ppid: this.safeParseInt(ppidStr),
      name: command.split(' ')[0] || command,
      command,
      cpuUsage: this.safeParseNumber(pcpu),
      memoryUsage: this.safeParseInt(rssStr) * 1024,
      memoryPercentage: this.safeParseNumber(pmem),
      state,
      user,
      startTime: lstart
    };
  }

  /**
   * 解析 uname -a, uptime, sysctl -n vm.loadavg, sw_vers 输出为系统信息
   */
  private parseSystemInfo(uname: string, uptime: string, loadavg: string, osVersion: string | null): any {
    const unameFields = uname.trim().split(' ');

    const uptimeSeconds = os.uptime();
    const bootTime = Date.now() - uptimeSeconds * 1000;

    const load = this.parseLoadAverage(loadavg);
    const uptimeMs = uptimeSeconds * 1000;

    return {
      hostname: unameFields[1] || 'Unknown',
      platform: 'darwin',
      release: unameFields[2] || 'Unknown',
      // uname -a 第 4 个字段固定为 "Darwin"，不是版本号，version 只取 sw_vers 输出
      version: osVersion ? osVersion.trim() : 'Unknown',
      // uname -a 第 5 个字段是 "Kernel"（"Darwin Kernel Version ..." 开头），
      // 真实架构在输出末尾，直接用 os.arch() 更可靠
      arch: os.arch(),
      uptime: uptimeMs,
      uptimeSeconds,
      bootTime,
      loadAverage: load
    };
  }

  /**
   * 解析 sysctl -n vm.loadavg 输出为系统负载
   */
  private parseLoadAverage(output: string): any {
    const match = output.trim().match(/\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\}/);

    if (match) {
      return {
        load1: this.safeParseNumber(match[1]),
        load5: this.safeParseNumber(match[2]),
        load15: this.safeParseNumber(match[3])
      };
    }

    throw this.createParseError(output, 'Unable to parse load average');
  }

  /**
   * 解析 df -h 输出的大小格式转换
   *
   * macOS df -h 会输出 Ki/Mi/Gi/Ti 及 Bi（如 0Bi、512Bi），B 或无单位时按字节处理
   */
  private convertDfSizeToBytes(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)([KMGTB]?)i?$/);
    if (!match) return 0;

    const value = this.safeParseNumber(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      '': 1,
      'B': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
  }

  // 实现抽象方法，获取结构化数据

  /**
   * 获取磁盘使用情况，解析 df -Pk 输出为磁盘使用情况（-P 保证 POSIX 单行输出）
   */
  async getDiskUsage(): Promise<any> {
    try {
      const result = await this.executeCommand('df -Pk');
      return this.parseDiskUsage(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDiskUsage', error);
    }
  }

  /**
   * 获取磁盘统计，解析 iostat -d 输出为磁盘统计
   */
  async getDiskStats(): Promise<any> {
    try {
      const result = await this.executeCommand('iostat -d');
      return this.parseDiskStats(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDiskStats', error);
    }
  }

  /**
   * 获取挂载点，解析 mount 输出为挂载点
   */
  async getMounts(): Promise<any> {
    try {
      const result = await this.executeCommand('mount');
      return this.parseMounts(result.stdout);
    } catch (error) {
      throw this.createCommandError('getMounts', error);
    }
  }

  /**
   * 获取文件系统，解析 diskutil list 输出为文件系统
   */
  async getFileSystems(): Promise<any> {
    try {
      const result = await this.executeCommand('diskutil list');
      return this.parseFileSystems(result.stdout);
    } catch (error) {
      throw this.createCommandError('getFileSystems', error);
    }
  }

  /**
   * 获取网络连接，解析 netstat -an 输出为网络连接
   */
  async getNetworkConnections(): Promise<any> {
    try {
      const result = await this.executeCommand('netstat -an');
      return this.parseNetworkConnections(result.stdout);
    } catch (error) {
      throw this.createCommandError('getNetworkConnections', error);
    }
  }

  /**
   * 获取默认网关，解析 route -n get default 输出为默认网关
   */
  async getDefaultGateway(): Promise<any> {
    try {
      const result = await this.executeCommand('route -n get default');
      return this.parseDefaultGateway(result.stdout);
    } catch (error) {
      throw this.createCommandError('getDefaultGateway', error);
    }
  }

  /**
   * 获取进程列表，解析 ps 输出（args 列位于末尾，避免含空格路径导致列错位）
   */
  async getProcessList(): Promise<any> {
    try {
      return await this.collectProcessList();
    } catch (error) {
      throw this.createCommandError('getProcessList', error);
    }
  }

  /**
   * 不经过 shell，向指定进程发送信号。
   *
   * @param pid 目标进程 ID
   * @param signal 信号名称或十进制编号，默认 TERM
   * @returns 信号发送成功时返回 true，否则返回 false
   */
  async killProcess(pid: number, signal: string = 'TERM'): Promise<boolean> {
    return sendProcessSignal(pid, signal);
  }

  /**
   * 获取进程打开文件并解析 lsof 输出。
   *
   * @param pid 目标进程 ID，必须为大于 0 的安全整数
   * @returns 打开的文件路径；运行时参数非法时返回空数组
   */
  async getProcessOpenFiles(pid: number): Promise<string[]> {
    if (!isValidPositiveProcessId(pid)) {
      return [];
    }

    try {
      const result = await this.executeCommand(`lsof -p ${pid} +c0 -Fn`);
      return this.parseOpenFiles(result.stdout);
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取进程环境变量并解析 ps 输出。
   *
   * @param pid 目标进程 ID，必须为大于 0 的安全整数
   * @returns 环境变量；运行时参数非法时返回空对象
   */
  async getProcessEnvironment(pid: number): Promise<Record<string, string>> {
    if (!isValidPositiveProcessId(pid)) {
      return {};
    }

    try {
      const result = await this.executeCommand(`ps eww ${pid}`);
      return this.parseEnvironment(result.stdout);
    } catch (error) {
      return {};
    }
  }

  /**
   * 获取系统运行时间
   */
  async getSystemUptime(): Promise<any> {
    try {
      const uptimeSeconds = os.uptime();
      return {
        uptimeSeconds, // 秒
        uptime: uptimeSeconds * 1000, // 毫秒，与 Linux/Windows 适配器保持同一契约
        bootTime: Date.now() - uptimeSeconds * 1000
      };
    } catch (error) {
      throw this.createCommandError('getSystemUptime', error);
    }
  }

  /**
   * 获取系统用户，解析 who 输出为系统用户
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
   * 获取系统服务，解析 launchctl list 输出为系统服务
   */
  async getSystemServices(): Promise<any> {
    try {
      const result = await this.executeCommand('launchctl list');
      return this.parseSystemServices(result.stdout);
    } catch (error) {
      throw this.createCommandError('getSystemServices', error);
    }
  }

  // 私有解析方法，解析命令输出为结构化数据

  private parseDiskUsage(output: string): any[] {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const disks: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      // df -Pk 为 POSIX 6 列格式，无 inode 列；挂载点可能含空格，取剩余列拼接
      if (fields.length >= 6) {
        const usedPercent = fields[4].replace('%', '');
        disks.push({
          device: fields[0],
          total: this.safeParseInt(fields[1]) * 1024, // KB to bytes
          used: this.safeParseInt(fields[2]) * 1024,
          available: this.safeParseInt(fields[3]) * 1024,
          usagePercentage: this.safeParseNumber(usedPercent),
          mountPoint: fields.slice(5).join(' ')
        });
      }
    }

    return disks;
  }

  /**
   * 解析 iostat -d 输出为磁盘统计
   */
  private parseDiskStats(output: string): any[] {
    return this.parseIostatDisks(output).map(item => ({
      device: item.device,
      readBytes: item.bytePerSec,
      writeBytes: 0,
      readCount: item.transfersPerSec,
      writeCount: 0,
      readTime: 0,
      writeTime: 0,
      ioTime: 0,
      readSpeed: item.bytePerSec,
      writeSpeed: 0,
      iops: item.transfersPerSec
    }));
  }

  /**
   * 解析 mount 输出为挂载点
   */
  private parseMounts(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const mounts: any[] = [];

    for (const line of lines) {
      const match = line.match(/^(.+?)\s+on\s+(.+?)\s+\((.+?)\)$/);
      if (match) {
        const [, device, mountPoint, options] = match;
        const optionsArray = options.split(',').map(opt => opt.trim());

        mounts.push({
          device: device.trim(),
          mountPoint: mountPoint.trim(),
          filesystem: optionsArray[0] || 'unknown',
          options: optionsArray,
          dump: 0,
          pass: 0
        });
      }
    }

    return mounts;
  }

  /**
   * 解析 diskutil list 输出为文件系统
   */
  private parseFileSystems(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const filesystems: any[] = [];

    for (const line of lines) {
      if (line.includes('GUID_partition_scheme') || line.includes('Apple_HFS') ||
          line.includes('Apple_APFS') || line.includes('Microsoft Basic Data')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          filesystems.push({
            name: parts[2] || 'unknown',
            type: parts[1] || 'unknown',
            supported: true
          });
        }
      }
    }

    return filesystems;
  }

  /**
   * 解析 netstat -an 输出为网络连接
   */
  private parseNetworkConnections(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const connections: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 6 && (fields[0].includes('tcp') || fields[0].includes('udp'))) {
        connections.push({
          protocol: fields[0],
          localAddress: fields[3] || '*',
          foreignAddress: fields[4] || '*',
          state: fields[5] || 'unknown'
        });
      }
    }

    return connections;
  }

  /**
   * 解析 route -n get default 输出为默认网关
   */
  private parseDefaultGateway(output: string): any {
    const lines = output.split('\n');
    let gateway: string | null = null;
    let interfaceName: string | null = null;

    for (const line of lines) {
      if (line.includes('gateway:')) {
        const match = line.match(/gateway:\s*(.+)/);
        if (match) gateway = match[1].trim();
      }
      if (line.includes('interface:')) {
        const match = line.match(/interface:\s*(.+)/);
        if (match) interfaceName = match[1].trim();
      }
    }

    return gateway ? { gateway, interface: interfaceName || 'unknown' } : null;
  }

  /**
   * 解析 lsof -p ${pid} +c0 -Fn 输出为进程打开文件
   */
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

  /**
   * 解析 ps eww ${pid} 输出为进程环境变量
   */
  private parseEnvironment(output: string): Record<string, string> {
    const env: Record<string, string> = {};
    if (!output) {
      return env;
    }

    const pattern = /(^|\s)([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*?)(?=(\s+[A-Za-z_][A-Za-z0-9_]*=)|$)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(output)) !== null) {
      const key = match[2];
      if (key === 'PID') {
        continue;
      }

      const value = match[3].replace(/\s+$/u, '');
      env[key] = value;
    }

    return env;
  }

  private parseIostatDisks(output: string): Array<{
    device: string;
    kbPerTransfer: number;
    transfersPerSec: number;
    mbPerSec: number;
    bytePerSec: number;
  }> {
    const lines = output.split('\n').map(line => line.trimEnd());
    const deviceLineIndex = lines.findIndex(line => /disk\w+/i.test(line));
    if (deviceLineIndex === -1) {
      return [];
    }

    const deviceLine = lines[deviceLineIndex];
    const deviceNames = (deviceLine.match(/disk[^\s]*/gi) || []).map(name => name.trim());
    if (deviceNames.length === 0) {
      return [];
    }

    const dataLines = lines.slice(deviceLineIndex + 1).filter(line => line && /[\d.]/.test(line));
    if (dataLines.length === 0) {
      return [];
    }

    const tokens = dataLines[0].trim().split(/\s+/);
    const metricsPerDevice = 3;
    const result: Array<{ device: string; kbPerTransfer: number; transfersPerSec: number; mbPerSec: number; bytePerSec: number; }> = [];

    deviceNames.forEach((device, index) => {
      const offset = index * metricsPerDevice;
      if (tokens.length >= offset + metricsPerDevice) {
        const kbPerTransfer = this.safeParseNumber(tokens[offset]);
        const transfersPerSec = this.safeParseNumber(tokens[offset + 1]);
        const mbPerSec = this.safeParseNumber(tokens[offset + 2]);
        const bytePerSec = mbPerSec * 1024 * 1024;

        result.push({
          device,
          kbPerTransfer,
          transfersPerSec,
          mbPerSec,
          bytePerSec
        });
      }
    });

    return result;
  }

  /**
   * 使用 Node.js 原生信号 0 判断进程是否存在，不向目标进程发送实际信号。
   *
   * @param pid 目标进程 ID
   * @returns 进程存在或因权限无法探测时返回 true，明确不存在时返回 false
   * @throws 遇到 ESRCH、EPERM 之外的系统错误时透传原异常
   */
  private processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ESRCH') {
        return false;
      }
      if (code === 'EPERM') {
        return true;
      }
      throw error;
    }
  }

  /**
   * 解析 who 输出为系统用户
   *
   * 本地登录（如 console/ttys）只有 5 个字段，没有远程主机列；
   * 仅当字段数 >= 6 时才把最后一列视为 from，避免把登录时间误当主机
   */
  private parseSystemUsers(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const users: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 5) {
        const hasRemoteHost = fields.length >= 6;
        users.push({
          user: fields[0],
          terminal: fields[1],
          loginTime: hasRemoteHost ? fields.slice(2, -1).join(' ') : fields.slice(2).join(' '),
          from: hasRemoteHost ? fields[fields.length - 1] : undefined
        });
      }
    }

    return users;
  }

  /**
   * 解析 launchctl list 输出为系统服务
   */
  private parseSystemServices(output: string): any[] {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const services: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 3) {
        services.push({
          pid: fields[0] === '-' ? null : this.safeParseInt(fields[0]),
          status: fields[1],
          label: fields[2]
        });
      }
    }

    return services;
  }
}
