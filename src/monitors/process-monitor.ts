import { BaseMonitor } from '../core/base-monitor';
import {
  MonitorResult,
  ProcessConfig,
  ProcessInfo,
  ProcessId,
  DataSize
} from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from '../core/cache-manager';

/**
 * 进程监控器
 *
 * 提供进程相关的监控功能，包括进程列表、进程信息、资源使用等
 */
export class ProcessMonitor extends BaseMonitor<ProcessInfo[]> {
  private processConfig: ProcessConfig;

  constructor(
    adapter: PlatformAdapter,
    config: ProcessConfig = {},
    cache?: CacheManager
  ) {
    super(adapter, config, cache);
    this.processConfig = { ...this.getDefaultConfig(), ...config } as ProcessConfig;
  }

  /**
   * 获取进程信息（实现抽象方法）
   */
  async info(): Promise<MonitorResult<ProcessInfo[]>> {
    return this.list();
  }

  /**
   * 获取所有进程列表
   */
  async list(options: { skipLimit?: boolean } = {}): Promise<MonitorResult<ProcessInfo[]>> {
    const limitKey = options.skipLimit ? 'all' : (this.processConfig.maxResults || 'all');
    const cacheKey = `process-list-${limitKey}`;

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('process.list');

        const rawData = await this.adapter.getProcessList();
        const processes = this.transformProcessList(rawData);

        // 应用过滤和限制
        const filteredProcesses = this.applyFilters(processes, options);

        return filteredProcesses;
      },
      this.processConfig.cacheTTL || 5000
    );
  }

  /**
   * 根据 PID 获取进程信息
   */
  async byPid(pid: ProcessId): Promise<MonitorResult<ProcessInfo | null>> {
    const cacheKey = `process-${pid}`;

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('process.info');

        const rawData = await this.adapter.getProcessInfo(pid);

        if (!rawData) {
          return null;
        }

        return this.transformProcessInfo(rawData);
      },
      this.processConfig.cacheTTL || 2000
    );
  }

  /**
   * 根据进程名称搜索进程
   */
  async byName(name: string): Promise<MonitorResult<ProcessInfo[]>> {
    const listResult = await this.list({ skipLimit: true });

    if (!listResult.success || !listResult.data) {
      return listResult;
    }

    const matchingProcesses = listResult.data.filter(process =>
      process.name.toLowerCase().includes(name.toLowerCase()) ||
      process.command.toLowerCase().includes(name.toLowerCase())
    );

    return this.createSuccessResult(matchingProcesses);
  }

  /**
   * 获取当前进程信息
   */
  async current(): Promise<MonitorResult<ProcessInfo | null>> {
    return this.byPid(process.pid);
  }

  /**
   * 获取子进程列表
   */
  async children(parentPid: ProcessId): Promise<MonitorResult<ProcessInfo[]>> {
    if (!this.processConfig.includeChildren) {
      return this.createErrorResult(
        this.createUnsupportedError('process.children (disabled in config)')
      );
    }

    const listResult = await this.list({ skipLimit: true });

    if (!listResult.success || !listResult.data) {
      return listResult;
    }

    const childProcesses = listResult.data.filter(process => process.ppid === parentPid);
    return this.createSuccessResult(childProcesses);
  }

  /**
   * 获取进程树
   */
  async tree(rootPid?: ProcessId): Promise<MonitorResult<any>> {
    const listResult = await this.list({ skipLimit: true });

    if (!listResult.success || !listResult.data) {
      return listResult as MonitorResult<any>;
    }

    const processTree = this.buildProcessTree(listResult.data, rootPid);
    return this.createSuccessResult(processTree);
  }

  /**
   * 获取最占用 CPU 的进程
   */
  async topByCpu(limit: number = 10): Promise<MonitorResult<ProcessInfo[]>> {
    const listResult = await this.list({ skipLimit: true });

    if (!listResult.success || !listResult.data) {
      return listResult;
    }

    const sortedProcesses = listResult.data
      .filter(process => process.cpuUsage > 0)
      .sort((a, b) => b.cpuUsage - a.cpuUsage)
      .slice(0, limit);

    return this.createSuccessResult(sortedProcesses);
  }

  /**
   * 获取最占用内存的进程
   */
  async topByMemory(limit: number = 10): Promise<MonitorResult<ProcessInfo[]>> {
    const listResult = await this.list({ skipLimit: true });

    if (!listResult.success || !listResult.data) {
      return listResult;
    }

    const sortedProcesses = listResult.data
      .filter(process => process.memoryUsage.toBytes() > 0)
      .sort((a, b) => b.memoryUsage.toBytes() - a.memoryUsage.toBytes())
      .slice(0, limit);

    return this.createSuccessResult(sortedProcesses);
  }

  /**
   * 获取进程统计信息
   */
  async stats(): Promise<MonitorResult<{
    total: number;
    running: number;
    sleeping: number;
    waiting: number;
    zombie: number;
    stopped: number;
    unknown: number;
    totalCpuUsage: number;
    totalMemoryUsage: DataSize;
  }>> {
    const cacheKey = 'process-stats';

    return this.executeWithCache(
      cacheKey,
      async () => {
    const listResult = await this.list({ skipLimit: true });

        if (!listResult.success || !listResult.data) {
          throw new Error('Failed to get process list for statistics');
        }

        const processes = listResult.data;
        const stats = {
          total: processes.length,
          running: 0,
          sleeping: 0,
          waiting: 0,
          zombie: 0,
          stopped: 0,
          unknown: 0,
          totalCpuUsage: 0,
          totalMemoryUsage: new DataSize(0)
        };

        let totalMemoryBytes = 0;

        for (const process of processes) {
          // 按状态计数
          switch (process.state) {
            case 'running':
              stats.running++;
              break;
            case 'sleeping':
              stats.sleeping++;
              break;
            case 'waiting':
              stats.waiting++;
              break;
            case 'zombie':
              stats.zombie++;
              break;
            case 'stopped':
              stats.stopped++;
              break;
            default:
              stats.unknown++;
          }

          // 累计资源使用
          stats.totalCpuUsage += process.cpuUsage;
          totalMemoryBytes += process.memoryUsage.toBytes();
        }

        stats.totalMemoryUsage = new DataSize(totalMemoryBytes);

        return stats;
      },
      this.processConfig.cacheTTL || 5000
    );
  }

  /**
   * 检查进程是否存在
   */
  async exists(pid: ProcessId): Promise<MonitorResult<boolean>> {
    try {
      const processResult = await this.byPid(pid);
      return this.createSuccessResult(processResult.success && processResult.data !== null);
    } catch (error) {
      return this.createSuccessResult(false);
    }
  }

  /**
   * 杀死进程
   */
  async kill(pid: ProcessId, signal: string = 'SIGTERM'): Promise<MonitorResult<boolean>> {
    try {
      this.validatePlatformSupport('process.kill');

      const result = await this.adapter.killProcess(pid, signal);
      return this.createSuccessResult(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取进程的打开文件
   */
  async openFiles(pid: ProcessId): Promise<MonitorResult<string[]>> {
    if (!this.processConfig.includeOpenFiles) {
      return this.createErrorResult(
        this.createUnsupportedError('process.openFiles (disabled in config)')
      );
    }

    const cacheKey = `process-openfiles-${pid}`;

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('process.openFiles');

        const rawData = await this.adapter.getProcessOpenFiles(pid);
        return rawData || [];
      },
      this.processConfig.cacheTTL || 10000
    );
  }

  /**
   * 获取进程的环境变量
   */
  async environment(pid: ProcessId): Promise<MonitorResult<Record<string, string>>> {
    if (!this.processConfig.includeEnvironment) {
      return this.createErrorResult(
        this.createUnsupportedError('process.environment (disabled in config)')
      );
    }

    const cacheKey = `process-env-${pid}`;

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('process.environment');

        const rawData = await this.adapter.getProcessEnvironment(pid);
        return rawData || {};
      },
      this.processConfig.cacheTTL || 30000
    );
  }

  /**
   * 配置是否包含子进程
   */
  withChildren(include: boolean): this {
    this.processConfig.includeChildren = include;
    return this;
  }

  /**
   * 配置是否包含线程信息
   */
  withThreads(include: boolean): this {
    this.processConfig.includeThreads = include;
    return this;
  }

  /**
   * 配置是否包含环境变量
   */
  withEnvironment(include: boolean): this {
    this.processConfig.includeEnvironment = include;
    return this;
  }

  /**
   * 配置是否包含打开文件
   */
  withOpenFiles(include: boolean): this {
    this.processConfig.includeOpenFiles = include;
    return this;
  }

  /**
   * 配置进程名称过滤
   */
  withNameFilter(filter: string): this {
    this.processConfig.nameFilter = filter;
    return this;
  }

  /**
   * 配置最大返回结果数
   */
  withMaxResults(max: number): this {
    this.processConfig.maxResults = max;
    return this;
  }

  /**
   * 配置目标进程 ID 列表
   */
  withPids(pids: number[]): this {
    this.processConfig.pids = pids;
    return this;
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): ProcessConfig {
    return {
      interval: 5000,
      timeout: 15000,
      cacheEnabled: true,
      cacheTTL: 3000,
      samples: 1,
      includeDetails: true,
      includeChildren: false,
      includeThreads: false,
      includeEnvironment: false,
      includeOpenFiles: false,
      maxResults: 100 // 默认限制返回进程数以提高性能
    };
  }

  // 私有转换方法

  /**
   * 转换进程列表
   */
  private transformProcessList(rawData: any[]): ProcessInfo[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(process => this.transformProcessInfo(process));
  }

  /**
   * 转换进程信息
   */
  private transformProcessInfo(rawProcess: any): ProcessInfo {
    const startTime = this.parseStartTime(rawProcess.startTime || rawProcess.start_time);
    const currentTime = Date.now();
    const runtime = currentTime - startTime;

    return {
      pid: this.safeParseNumber(rawProcess.pid),
      ppid: this.safeParseNumber(rawProcess.ppid),
      name: rawProcess.name || rawProcess.comm || 'unknown',
      command: rawProcess.command || rawProcess.cmd || rawProcess.args || '',
      state: this.normalizeProcessState(rawProcess.state || rawProcess.status),
      cpuUsage: this.safeParseNumber(rawProcess.cpuUsage || rawProcess.cpu),
      memoryUsage: new DataSize(this.safeParseNumber(rawProcess.memoryUsage || rawProcess.memory || rawProcess.rss)),
      memoryPercentage: this.safeParseNumber(rawProcess.memoryPercentage || rawProcess.mem),
      startTime,
      runtime,
      priority: rawProcess.priority || rawProcess.pri,
      nice: rawProcess.nice,
      threads: rawProcess.threads || rawProcess.nlwp,
      uid: rawProcess.uid,
      gid: rawProcess.gid,
      username: rawProcess.username || rawProcess.user
    };
  }

  /**
   * 应用过滤器
   */
  private applyFilters(processes: ProcessInfo[], options: { skipLimit?: boolean } = {}): ProcessInfo[] {
    let filtered = [...processes];

    // PID 过滤
    if (this.processConfig.pids && this.processConfig.pids.length > 0) {
      filtered = filtered.filter(process =>
        this.processConfig.pids!.includes(process.pid)
      );
    }

    // 名称过滤
    if (this.processConfig.nameFilter) {
      const filter = this.processConfig.nameFilter.toLowerCase();
      filtered = filtered.filter(process =>
        process.name.toLowerCase().includes(filter) ||
        process.command.toLowerCase().includes(filter)
      );
    }

    // 限制结果数量
    if (!options.skipLimit && this.processConfig.maxResults && this.processConfig.maxResults > 0) {
      filtered = filtered.slice(0, this.processConfig.maxResults);
    }

    return filtered;
  }

  /**
   * 构建进程树
   */
  private buildProcessTree(processes: ProcessInfo[], rootPid?: ProcessId): any {
    const processMap = new Map<ProcessId, ProcessInfo>();
    const childrenMap = new Map<ProcessId, ProcessInfo[]>();

    // 建立进程映射
    for (const process of processes) {
      processMap.set(process.pid, process);

      if (!childrenMap.has(process.ppid)) {
        childrenMap.set(process.ppid, []);
      }
      childrenMap.get(process.ppid)!.push(process);
    }

    // 递归构建树
    const buildNode = (pid: ProcessId): any => {
      const process = processMap.get(pid);
      if (!process) return null;

      const children = childrenMap.get(pid) || [];

      return {
        ...process,
        children: children.map(child => buildNode(child.pid)).filter(child => child !== null)
      };
    };

    if (rootPid !== undefined) {
      return buildNode(rootPid);
    }

    // 返回所有根进程（ppid 不在进程列表中的进程）
    const rootProcesses: any[] = [];

    for (const process of processes) {
      if (!processMap.has(process.ppid)) {
        rootProcesses.push(buildNode(process.pid));
      }
    }

    return rootProcesses;
  }

  /**
   * 规范化进程状态
   */
  private normalizeProcessState(state: string): 'running' | 'sleeping' | 'waiting' | 'zombie' | 'stopped' | 'unknown' {
    if (!state || typeof state !== 'string') {
      return 'unknown';
    }

    const normalizedState = state.toLowerCase().trim();

    // Linux 状态码
    if (normalizedState === 'r' || normalizedState.includes('running')) {
      return 'running';
    }
    if (normalizedState === 's' || normalizedState.includes('sleeping') || normalizedState.includes('sleep')) {
      return 'sleeping';
    }
    if (normalizedState === 'd' || normalizedState.includes('waiting') || normalizedState.includes('wait')) {
      return 'waiting';
    }
    if (normalizedState === 'z' || normalizedState.includes('zombie')) {
      return 'zombie';
    }
    if (normalizedState === 't' || normalizedState.includes('stopped') || normalizedState.includes('stop')) {
      return 'stopped';
    }

    // macOS/Windows 状态
    if (normalizedState.includes('active') || normalizedState.includes('normal')) {
      return 'running';
    }
    if (normalizedState.includes('idle')) {
      return 'sleeping';
    }

    return 'unknown';
  }

  /**
   * 解析启动时间
   */
  private parseStartTime(startTime: any): number {
    if (typeof startTime === 'number') {
      // 如果是时间戳
      if (startTime > 1000000000000) {
        // 毫秒时间戳
        return startTime;
      } else {
        // 秒时间戳
        return startTime * 1000;
      }
    }

    if (typeof startTime === 'string') {
      const parsed = Date.parse(startTime);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }

    // 默认返回当前时间
    return Date.now();
  }

  /**
   * 安全解析数字
   */
  private safeParseNumber(value: any): number {
    if (typeof value === 'number') {
      return isNaN(value) ? 0 : value;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }
}
