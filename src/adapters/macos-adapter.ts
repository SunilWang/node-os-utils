import { BasePlatformAdapter } from '../core/platform-adapter';
import { CommandExecutor } from '../utils/command-executor';
import { CommandResult, SupportedFeatures } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { MonitorError, ErrorCode } from '../types/errors';

/**
 * macOS 平台适配器
 *
 * 实现 macOS 系统的监控功能，主要通过 sysctl、vm_stat、system_profiler 等命令
 */
export class MacOSAdapter extends BasePlatformAdapter {
  private executor: CommandExecutor;

  constructor() {
    super('darwin');
    this.executor = new CommandExecutor('darwin');
  }

  /**
   * 执行系统命令
   */
  async executeCommand(command: string, options?: ExecuteOptions): Promise<CommandResult> {
    return this.executor.execute(command, options);
  }

  /**
   * 读取文件内容，捕获并转换常见的权限/不存在错误
   */
  async readFile(path: string): Promise<string> {
    try {
      const result = await this.executeCommand(`cat "${path}"`);
      this.validateCommandResult(result, `cat ${path}`);
      return result.stdout;
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { code?: string };
      const errorCode = err?.code === 'EACCES'
        ? ErrorCode.PERMISSION_DENIED
        : err?.code === 'ENOENT'
          ? ErrorCode.FILE_NOT_FOUND
          : ErrorCode.COMMAND_FAILED;

      throw new MonitorError(
        `Failed to read file: ${path}`,
        errorCode,
        this.platformName,
        { path, error: err?.message, code: err?.code }
      );
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      const result = await this.executeCommand(`test -f "${path}"`);
      return result.exitCode === 0;
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

      return this.parseCPUInfo(brand?.stdout || '', cores?.stdout || '', threads?.stdout || '', freq?.stdout || '');
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
   * 读取 df -h 解析磁盘占用
   */
  async getDiskInfo(): Promise<any> {
    try {
      const result = await this.executeCommand('df -h');
      this.validateCommandResult(result, 'df -h');
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
   * 读取 ps -eo pid,ppid,command,pcpu,pmem,state,user 解析进程列表
   */
  async getProcesses(): Promise<any> {
    try {
      const result = await this.executeCommand('ps -eo pid,ppid,command,pcpu,pmem,state,user');
      this.validateCommandResult(result, 'ps command');
      return this.parseProcessList(result.stdout);
    } catch (error) {
      throw this.createCommandError('getProcesses', error);
    }
  }

  /**
   * 读取 ps -p pid -o pid,ppid,command,pcpu,pmem,state,user,lstart 解析特定进程信息
   */
  async getProcessInfo(pid: number): Promise<any> {
    try {
      const result = await this.executeCommand(`ps -p ${pid} -o pid,ppid,command,pcpu,pmem,state,user,lstart`);
      this.validateCommandResult(result, `ps -p ${pid}`);
      return this.parseProcessInfo(result.stdout, pid);
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
      architecture: 'Unknown',
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
    const pageSize = 4096; // macOS 页面大小通常是 4KB
    let free = 0, active = 0, inactive = 0, wired = 0, compressed = 0;

    for (const line of vmLines) {
      const match = line.match(/Pages\s+(\w+):\s+(\d+)/);
      if (match) {
        const [, type, count] = match;
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
            wired = bytes;
            break;
          case 'occupied':
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
   * 解析 df -h 输出为磁盘信息
   */
  private parseDiskInfo(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const disks: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(/\s+/);
      if (fields.length >= 9) {
        const [filesystem, size, used, available, capacity, /* iused */, /* ifree */, /* iusedPercent */, mountpoint] = fields;

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
    const lines = output.split('\n').filter(line => line.trim());
    const devices: any[] = [];

    // 跳过头部，查找设备行
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('disk')) {
        const fields = line.trim().split(/\s+/);
        if (fields.length >= 3) {
          const [device, kbPerTransfer, transfersPerSec, mbPerSec] = fields;

          devices.push({
            device,
            kbPerTransfer: this.safeParseNumber(kbPerTransfer),
            transfersPerSec: this.safeParseNumber(transfersPerSec),
            mbPerSec: this.safeParseNumber(mbPerSec)
          });
        }
      }
    }

    return devices;
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
        internal: name === 'lo0'
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

      const name = fields[0];
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
   * 解析 ps -eo pid,ppid,command,pcpu,pmem,state,user 输出为进程列表
   */
  private parseProcessList(output: string): any {
    const lines = output.split('\n').filter(line => line.trim());
    const processes: any[] = [];

    for (let i = 1; i < lines.length; i++) { // 跳过头部
      const line = lines[i];
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+(\w+)\s+(\w+)$/);

      if (match) {
        const [, pid, ppid, command, pcpu, pmem, state, user] = match;

        processes.push({
          pid: this.safeParseInt(pid),
          ppid: this.safeParseInt(ppid),
          command: command.trim(),
          cpuUsage: this.safeParseNumber(pcpu),
          memoryUsage: this.safeParseNumber(pmem),
          state,
          user
        });
      }
    }

    return processes;
  }

  /**
   * 解析 ps -p pid -o pid,ppid,command,pcpu,pmem,state,user,lstart 输出为特定进程信息
   */
  private parseProcessInfo(output: string, pid: number): any {
    const lines = output.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new MonitorError(
        `Process ${pid} not found`,
        ErrorCode.NOT_AVAILABLE,
        this.platformName,
        { pid }
      );
    }

    const dataLine = lines[1]; // 第一行是头部
    const match = dataLine.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+(\w+)\s+(\w+)\s+(.+)$/);

    if (match) {
      const [, , ppid, command, pcpu, pmem, state, user, lstart] = match;

      return {
        pid,
        ppid: this.safeParseInt(ppid),
        name: command.split(' ')[0],
        command: command.trim(),
        cpuUsage: this.safeParseNumber(pcpu),
        memoryUsage: this.safeParseNumber(pmem),
        state,
        user,
        startTime: lstart.trim()
      };
    }

    throw this.createParseError(output, 'Unable to parse process info');
  }

  /**
   * 解析 uname -a, uptime, sysctl -n vm.loadavg, sw_vers 输出为系统信息
   */
  private parseSystemInfo(uname: string, uptime: string, loadavg: string, osVersion: string | null): any {
    const unameFields = uname.trim().split(' ');

    // 解析 uptime 获取启动时间
    const uptimeMatch = uptime.match(/up\s+(.+?),/);
    const uptimeStr = uptimeMatch ? uptimeMatch[1] : '';

    // 解析负载平均值
    const loadMatch = loadavg.match(/\{([\d.]+)\s+([\d.]+)\s+([\d.]+)\}/);
    const load = loadMatch ? {
      load1: this.safeParseNumber(loadMatch[1]),
      load5: this.safeParseNumber(loadMatch[2]),
      load15: this.safeParseNumber(loadMatch[3])
    } : { load1: 0, load5: 0, load15: 0 };

    return {
      hostname: unameFields[1] || 'Unknown',
      platform: 'darwin',
      release: unameFields[2] || 'Unknown',
      version: osVersion ? osVersion.trim() : unameFields[3] || 'Unknown',
      arch: unameFields[4] || 'Unknown',
      uptime: uptimeStr,
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
   */
  private convertDfSizeToBytes(sizeStr: string): number {
    // df -h 输出的大小格式转换
    const match = sizeStr.match(/^([\d.]+)([KMGT]?)i?$/);
    if (!match) return 0;

    const value = this.safeParseNumber(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      '': 1024, // df 默认单位是 KB
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1024);
  }

  // 实现抽象方法，获取结构化数据

  /**
   * 获取磁盘使用情况，解析 df -k 输出为磁盘使用情况
   */
  async getDiskUsage(): Promise<any> {
    try {
      const result = await this.executeCommand('df -k');
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
   * 获取进程列表，解析 ps -eo pid,ppid,comm,%cpu,%mem,stat,user,lstart,args 输出为进程列表
   */
  async getProcessList(): Promise<any> {
    try {
      const result = await this.executeCommand('ps -eo pid,ppid,comm,%cpu,%mem,stat,user,lstart,args');
      return this.parseProcessList(result.stdout);
    } catch (error) {
      throw this.createCommandError('getProcessList', error);
    }
  }

  /**
   * 杀死进程，解析 kill -${signal} ${pid} 输出为杀死进程
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
   * 获取进程打开文件，解析 lsof -p ${pid} +c0 -Fn 输出为进程打开文件
   */
  async getProcessOpenFiles(pid: number): Promise<string[]> {
    try {
      const result = await this.executeCommand(`lsof -p ${pid} +c0 -Fn`);
      return this.parseOpenFiles(result.stdout);
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取进程环境变量，解析 ps eww ${pid} 输出为进程环境变量
   */
  async getProcessEnvironment(pid: number): Promise<Record<string, string>> {
    try {
      const result = await this.executeCommand(`ps eww ${pid}`);
      return this.parseEnvironment(result.stdout);
    } catch (error) {
      return {};
    }
  }

  /**
   * 获取系统运行时间，解析 uptime 输出为系统运行时间
   */
  async getSystemUptime(): Promise<any> {
    try {
      const result = await this.executeCommand('uptime');
      return this.parseSystemUptime(result.stdout);
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
      if (fields.length >= 9) {
        const usedPercent = fields[4].replace('%', '');
        disks.push({
          device: fields[0],
          total: this.safeParseInt(fields[1]) * 1024, // KB to bytes
          used: this.safeParseInt(fields[2]) * 1024,
          available: this.safeParseInt(fields[3]) * 1024,
          usagePercentage: this.safeParseNumber(usedPercent),
          mountPoint: fields[8]
        });
      }
    }

    return disks;
  }

  /**
   * 解析 iostat -d 输出为磁盘统计
   */
  private parseDiskStats(output: string): any[] {
    const lines = output.split('\n').slice(2); // 跳过标题行
    const stats: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 6) {
        stats.push({
          device: fields[0],
          reads: this.safeParseNumber(fields[1]),
          writes: this.safeParseNumber(fields[2]),
          readKB: this.safeParseNumber(fields[3]),
          writeKB: this.safeParseNumber(fields[4])
        });
      }
    }

    return stats;
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
    const lines = output.split('\n');

    for (const line of lines) {
      const variables = line.split(/\s+/);
      for (const variable of variables) {
        const equalIndex = variable.indexOf('=');
        if (equalIndex > 0 && !variable.startsWith('PID=')) {
          const key = variable.substring(0, equalIndex);
          const value = variable.substring(equalIndex + 1);
          env[key] = value;
        }
      }
    }

    return env;
  }

  /**
   * 解析 uptime 输出为系统运行时间
   */
  private parseSystemUptime(output: string): any {
    const uptimeMatch = output.match(/up\s+(.+?),/);
    const loadMatch = output.match(/load averages:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);

    return {
      uptime: uptimeMatch ? uptimeMatch[1].trim() : 'unknown',
      loadAverage: loadMatch ? {
        load1: this.safeParseNumber(loadMatch[1]),
        load5: this.safeParseNumber(loadMatch[2]),
        load15: this.safeParseNumber(loadMatch[3])
      } : { load1: 0, load5: 0, load15: 0 }
    };
  }

  /**
   * 解析 who 输出为系统用户
   */
  private parseSystemUsers(output: string): any[] {
    const lines = output.split('\n').filter(line => line.trim());
    const users: any[] = [];

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length >= 5) {
        users.push({
          user: fields[0],
          terminal: fields[1],
          loginTime: fields.slice(2, -1).join(' '),
          from: fields[fields.length - 1]
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
