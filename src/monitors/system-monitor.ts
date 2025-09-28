import { BaseMonitor } from '../core/base-monitor';
import {
  MonitorResult,
  SystemConfig,
  SystemInfo,
  LoadAverage
} from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from '../core/cache-manager';

/**
 * 系统监控器
 *
 * 提供系统级别的监控功能，包括系统信息、运行时间、负载等
 */
export class SystemMonitor extends BaseMonitor<SystemInfo> {
  private systemConfig: SystemConfig;

  constructor(
    adapter: PlatformAdapter,
    config: SystemConfig = {},
    cache?: CacheManager
  ) {
    super(adapter, config, cache);
    this.systemConfig = { ...this.getDefaultConfig(), ...config } as SystemConfig;
  }

  /**
   * 获取系统基本信息
   */
  async info(): Promise<MonitorResult<SystemInfo>> {
    const cacheKey = 'system-info';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('system.info');

        const rawData = await this.adapter.getSystemInfo();
        return this.transformSystemInfo(rawData);
      },
      this.systemConfig.cacheTTL || 60000 // 系统基本信息缓存 1 分钟
    );
  }

  /**
   * 获取系统运行时间
   */
  async uptime(): Promise<MonitorResult<{
    uptime: number;
    uptimeFormatted: string;
    bootTime: number;
  }>> {
    if (!this.systemConfig.includeUptime) {
      return this.createErrorResult(
        this.createUnsupportedError('system.uptime (disabled in config)')
      );
    }

    const cacheKey = 'system-uptime';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('system.uptime');

        const rawData = await this.adapter.getSystemUptime();
        const uptime = this.safeParseNumber(rawData.uptime) * 1000; // 转换为毫秒
        const bootTime = Date.now() - uptime;

        return {
          uptime,
          uptimeFormatted: this.formatUptime(uptime),
          bootTime
        };
      },
      this.systemConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取系统负载
   */
  async load(): Promise<MonitorResult<LoadAverage & {
    normalized: {
      load1: number;
      load5: number;
      load15: number;
    };
    status: 'low' | 'normal' | 'high' | 'critical';
  }>> {
    if (!this.systemConfig.includeLoad) {
      return this.createErrorResult(
        this.createUnsupportedError('system.load (disabled in config)')
      );
    }

    const cacheKey = 'system-load';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('system.load');

        const rawData = await this.adapter.getSystemLoad();
        const loadAvg = this.transformLoadAverage(rawData);

        // 获取 CPU 核心数用于标准化负载
        const cpuInfo = await this.adapter.getCPUInfo();
        const cpuCores = cpuInfo.cores || cpuInfo.count || 1;

        const normalized = {
          load1: loadAvg.load1 / cpuCores,
          load5: loadAvg.load5 / cpuCores,
          load15: loadAvg.load15 / cpuCores
        };

        const status = this.evaluateLoadStatus(normalized.load1);

        return {
          ...loadAvg,
          normalized,
          status
        };
      },
      this.systemConfig.cacheTTL || 5000
    );
  }

  /**
   * 获取当前登录用户
   */
  async users(): Promise<MonitorResult<Array<{
    username: string;
    terminal: string;
    host: string;
    loginTime: number;
  }>>> {
    if (!this.systemConfig.includeUsers) {
      return this.createErrorResult(
        this.createUnsupportedError('system.users (disabled in config)')
      );
    }

    const cacheKey = 'system-users';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('system.users');

        const rawData = await this.adapter.getSystemUsers();
        return this.transformUsersList(rawData);
      },
      this.systemConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取系统服务状态
   */
  async services(): Promise<MonitorResult<Array<{
    name: string;
    status: 'running' | 'stopped' | 'failed' | 'unknown';
    enabled: boolean;
    description?: string;
  }>>> {
    if (!this.systemConfig.includeServices) {
      return this.createErrorResult(
        this.createUnsupportedError('system.services (disabled in config)')
      );
    }

    const cacheKey = 'system-services';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('system.services');

        const rawData = await this.adapter.getSystemServices();
        return this.transformServicesList(rawData);
      },
      this.systemConfig.cacheTTL || 60000
    );
  }

  /**
   * 获取系统资源总览
   */
  async overview(): Promise<MonitorResult<{
    system: {
      hostname: string;
      platform: string;
      uptime: string;
      loadStatus: string;
    };
    resources: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      networkActivity: boolean;
    };
    counts: {
      processes: number;
      users: number;
      services?: number;
    };
    health: {
      status: 'healthy' | 'warning' | 'critical';
      issues: string[];
    };
  }>> {
    const cacheKey = 'system-overview';

    return this.executeWithCache(
      cacheKey,
      async () => {
        // 并行获取各种信息
        const [
          systemInfo,
          uptimeInfo,
          loadInfo,
          usersInfo
        ] = await Promise.allSettled([
          this.info(),
          this.uptime().catch(() => ({ success: false, data: null })),
          this.load().catch(() => ({ success: false, data: null })),
          this.users().catch(() => ({ success: false, data: [] }))
        ]);

        const system = {
          hostname: systemInfo.status === 'fulfilled' && systemInfo.value.success ?
            systemInfo.value.data!.hostname : 'unknown',
          platform: systemInfo.status === 'fulfilled' && systemInfo.value.success ?
            systemInfo.value.data!.platform : 'unknown',
          uptime: uptimeInfo.status === 'fulfilled' && uptimeInfo.value.success ?
            uptimeInfo.value.data!.uptimeFormatted : 'unknown',
          loadStatus: loadInfo.status === 'fulfilled' && loadInfo.value.success ?
            loadInfo.value.data!.status : 'unknown'
        };

        // 获取资源使用情况（这里可能需要调用其他监控器）
        const resources = {
          cpuUsage: 0, // 需要从 CPU 监控器获取
          memoryUsage: 0, // 需要从内存监控器获取
          diskUsage: 0, // 需要从磁盘监控器获取
          networkActivity: false // 需要从网络监控器获取
        };

        const counts = {
          processes: systemInfo.status === 'fulfilled' && systemInfo.value.success ?
            systemInfo.value.data!.processCount || 0 : 0,
          users: usersInfo.status === 'fulfilled' && usersInfo.value.success ?
            usersInfo.value.data!.length : 0
        };

        // 评估健康状态
        const health = this.evaluateSystemHealth(loadInfo, counts);

        return {
          system,
          resources,
          counts,
          health
        };
      },
      this.systemConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取系统时间信息
   */
  async time(): Promise<MonitorResult<{
    current: number;
    timezone: string;
    utcOffset: number;
    formatted: string;
    bootTime?: number;
  }>> {
    const cacheKey = 'system-time';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const current = Date.now();
        const date = new Date(current);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const utcOffset = date.getTimezoneOffset() * -1; // 转换为正确的偏移量

        let bootTime: number | undefined;
        try {
          const uptimeResult = await this.uptime();
          if (uptimeResult.success && uptimeResult.data) {
            bootTime = uptimeResult.data.bootTime;
          }
        } catch {
          // 忽略错误
        }

        return {
          current,
          timezone,
          utcOffset,
          formatted: date.toISOString(),
          bootTime
        };
      },
      this.systemConfig.cacheTTL || 60000
    );
  }

  /**
   * 系统健康检查
   */
  async healthCheck(): Promise<MonitorResult<{
    status: 'healthy' | 'warning' | 'critical';
    checks: {
      load: boolean;
      uptime: boolean;
      services: boolean;
      resources: boolean;
    };
    issues: string[];
    score: number; // 0-100
  }>> {
    const cacheKey = 'system-health';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const issues: string[] = [];
        const checks = {
          load: true,
          uptime: true,
          services: true,
          resources: true
        };

        let totalScore = 100;

        // 检查系统负载
        try {
          const loadResult = await this.load();
          if (loadResult.success && loadResult.data) {
            if (loadResult.data.status === 'critical') {
              issues.push(`Critical system load: ${loadResult.data.load1.toFixed(2)}`);
              checks.load = false;
              totalScore -= 30;
            } else if (loadResult.data.status === 'high') {
              issues.push(`High system load: ${loadResult.data.load1.toFixed(2)}`);
              totalScore -= 15;
            }
          }
        } catch (error) {
          issues.push('Failed to check system load');
          checks.load = false;
          totalScore -= 20;
        }

        // 检查系统运行时间
        try {
          const uptimeResult = await this.uptime();
          if (uptimeResult.success && uptimeResult.data) {
            const uptimeHours = uptimeResult.data.uptime / (1000 * 60 * 60);
            if (uptimeHours < 1) {
              issues.push('System recently restarted');
              totalScore -= 10;
            }
          }
        } catch (error) {
          issues.push('Failed to check system uptime');
          checks.uptime = false;
          totalScore -= 10;
        }

        // 检查关键服务（如果启用）
        if (this.systemConfig.includeServices) {
          try {
            const servicesResult = await this.services();
            if (servicesResult.success && servicesResult.data) {
              const failedServices = servicesResult.data.filter(service =>
                service.status === 'failed' && service.enabled
              );

              if (failedServices.length > 0) {
                issues.push(`Failed services: ${failedServices.map(s => s.name).join(', ')}`);
                checks.services = false;
                totalScore -= failedServices.length * 10;
              }
            }
          } catch (error) {
            issues.push('Failed to check system services');
            checks.services = false;
            totalScore -= 15;
          }
        }

        // 确定整体健康状态
        let status: 'healthy' | 'warning' | 'critical';

        if (totalScore >= 90) {
          status = 'healthy';
        } else if (totalScore >= 70) {
          status = 'warning';
        } else {
          status = 'critical';
        }

        return {
          status,
          checks,
          issues,
          score: Math.max(0, totalScore)
        };
      },
      this.systemConfig.cacheTTL || 60000
    );
  }

  /**
   * 配置是否包含系统负载
   */
  withLoad(include: boolean): this {
    this.systemConfig.includeLoad = include;
    return this;
  }

  /**
   * 配置是否包含运行时间
   */
  withUptime(include: boolean): this {
    this.systemConfig.includeUptime = include;
    return this;
  }

  /**
   * 配置是否包含系统信息
   */
  withSystemInfo(include: boolean): this {
    this.systemConfig.includeSystemInfo = include;
    return this;
  }

  /**
   * 配置是否包含用户信息
   */
  withUsers(include: boolean): this {
    this.systemConfig.includeUsers = include;
    return this;
  }

  /**
   * 配置是否包含服务状态
   */
  withServices(include: boolean): this {
    this.systemConfig.includeServices = include;
    return this;
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): SystemConfig {
    return {
      interval: 30000,
      timeout: 15000,
      cacheEnabled: true,
      cacheTTL: 30000,
      samples: 1,
      includeDetails: true,
      includeLoad: true,
      includeUptime: true,
      includeSystemInfo: true,
      includeUsers: false, // 用户信息可能涉及隐私，默认不包含
      includeServices: false // 服务检查可能需要特殊权限，默认不包含
    };
  }

  // 私有转换方法

  /**
   * 转换系统信息
   */
  private transformSystemInfo(rawData: any): SystemInfo {
    return {
      hostname: rawData.hostname || rawData.name || 'unknown',
      platform: rawData.platform || rawData.type || 'unknown',
      distro: rawData.distro || rawData.distribution || rawData.platform || 'unknown',
      release: rawData.release || rawData.version || 'unknown',
      kernel: rawData.kernel || rawData.kernelVersion || 'unknown',
      arch: rawData.arch || rawData.architecture || 'unknown',
      uptime: this.normalizeUptime(rawData),
      uptimeSeconds: this.extractUptimeSeconds(rawData),
      bootTime: this.normalizeBootTime(rawData),
      loadAverage: this.transformLoadAverage(rawData.loadAverage || rawData.load || {}),
      userCount: rawData.userCount || rawData.users,
      processCount: rawData.processCount || rawData.processes,
      time: Date.now(),
      timezone: rawData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  private normalizeUptime(rawData: any): number {
    const now = Date.now();

    if (typeof rawData?.uptimeMs === 'number') {
      return Math.max(0, rawData.uptimeMs);
    }

    if (typeof rawData?.uptimeMilliseconds === 'number') {
      return Math.max(0, rawData.uptimeMilliseconds);
    }

    if (typeof rawData?.uptimeSeconds === 'number') {
      return Math.max(0, rawData.uptimeSeconds * 1000);
    }

    if (typeof rawData?.uptime === 'number') {
      if (typeof rawData?.bootTime === 'number') {
        return Math.max(0, now - rawData.bootTime);
      }
      return Math.max(0, rawData.uptime);
    }

    if (typeof rawData?.bootTime === 'number') {
      return Math.max(0, now - rawData.bootTime);
    }

    if (typeof rawData?.uptime === 'string') {
      const parsed = parseFloat(rawData.uptime);
      if (!Number.isNaN(parsed)) {
        return Math.max(0, parsed * 1000);
      }
    }

    return 0;
  }

  private extractUptimeSeconds(rawData: any): number | undefined {
    // 优先读取统一的秒级字段，避免重复转换
    if (typeof rawData?.uptimeSeconds === 'number') {
      return Math.max(0, rawData.uptimeSeconds);
    }

    if (typeof rawData?.uptime === 'number' && rawData.uptime < 1e6) {
      return Math.max(0, rawData.uptime);
    }

    if (typeof rawData?.uptime === 'number' && typeof rawData?.bootTime === 'number') {
      return Math.max(0, (Date.now() - rawData.bootTime) / 1000);
    }

    if (typeof rawData?.bootTime === 'number') {
      return Math.max(0, (Date.now() - rawData.bootTime) / 1000);
    }

    return undefined;
  }

  private normalizeBootTime(rawData: any): number | undefined {
    // 保持 bootTime 的可追溯性，缺失时退化为当前时间推算
    if (typeof rawData?.bootTime === 'number') {
      return rawData.bootTime;
    }

    if (typeof rawData?.uptimeSeconds === 'number') {
      return Date.now() - rawData.uptimeSeconds * 1000;
    }

    if (typeof rawData?.uptime === 'number') {
      const uptime = rawData.uptime < 1e6 ? rawData.uptime * 1000 : rawData.uptime;
      return Date.now() - uptime;
    }

    return undefined;
  }

  /**
   * 转换负载平均值
   */
  private transformLoadAverage(rawLoad: any): LoadAverage {
    return {
      load1: this.safeParseNumber(rawLoad.load1 || rawLoad[0]),
      load5: this.safeParseNumber(rawLoad.load5 || rawLoad[1]),
      load15: this.safeParseNumber(rawLoad.load15 || rawLoad[2])
    };
  }

  /**
   * 转换用户列表
   */
  private transformUsersList(rawData: any[]): Array<{
    username: string;
    terminal: string;
    host: string;
    loginTime: number;
  }> {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(user => ({
      username: user.username || user.user || user.name || 'unknown',
      terminal: user.terminal || user.tty || user.line || 'unknown',
      host: user.host || user.hostname || user.from || 'localhost',
      loginTime: this.parseLoginTime(user.loginTime || user.login_time || user.time)
    }));
  }

  /**
   * 转换服务列表
   */
  private transformServicesList(rawData: any[]): Array<{
    name: string;
    status: 'running' | 'stopped' | 'failed' | 'unknown';
    enabled: boolean;
    description?: string;
  }> {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(service => ({
      name: service.name
        || service.service
        || service.unit
        || service.label
        || 'unknown',
      status: this.normalizeServiceStatus(
        service.status ?? service.state ?? service.active ?? service.sub,
        service
      ),
      enabled: this.isServiceEnabled(service),
      description: service.description || service.desc || service.DisplayName
    }));
  }

  private isServiceEnabled(service: any): boolean {
    if (service?.enabled !== undefined) {
      return Boolean(service.enabled);
    }

    const loadState = typeof service?.load === 'string' ? service.load.toLowerCase() : '';
    if (loadState.includes('masked') || loadState.includes('disabled') || loadState.includes('not-found')) {
      return false;
    }

    if (service?.StartType) {
      return String(service.StartType).toLowerCase() !== 'disabled';
    }

    return true;
  }

  /**
   * 格式化运行时间
   */
  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts: string[] = [];

    if (days > 0) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
    }
    if (hours > 0) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'less than a minute';
  }

  /**
   * 评估负载状态
   */
  private evaluateLoadStatus(normalizedLoad: number): 'low' | 'normal' | 'high' | 'critical' {
    if (normalizedLoad >= 2.0) {
      return 'critical';
    } else if (normalizedLoad >= 1.0) {
      return 'high';
    } else if (normalizedLoad >= 0.7) {
      return 'normal';
    } else {
      return 'low';
    }
  }

  /**
   * 评估系统健康状态
   */
  private evaluateSystemHealth(loadInfo: any, counts: any): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查负载状态
    if (loadInfo.status === 'fulfilled' && loadInfo.value.success) {
      const loadStatus = loadInfo.value.data.status;
      if (loadStatus === 'critical') {
        issues.push('Critical system load detected');
      } else if (loadStatus === 'high') {
        issues.push('High system load detected');
      }
    }

    // 检查进程数（简单的启发式检查）
    if (counts.processes > 1000) {
      issues.push('High number of processes detected');
    }

    // 确定整体状态
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (issues.some(issue => issue.includes('Critical'))) {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'warning';
    }

    return { status, issues };
  }

  /**
   * 规范化服务状态
   */
  private normalizeServiceStatus(
    status: any,
    service?: any
  ): 'running' | 'stopped' | 'failed' | 'unknown' {
    if (typeof status === 'number') {
      if (status === 0) return 'running';
      if (status > 0) return 'failed';
    }

    if (typeof status === 'string') {
      const normalizedStatus = status.toLowerCase().trim();

      if (normalizedStatus === '-' && typeof service?.pid === 'number') {
        return service.pid > 0 ? 'running' : 'stopped';
      }

      if (!Number.isNaN(Number(normalizedStatus))) {
        return this.normalizeServiceStatus(Number(normalizedStatus), service);
      }

      if (/(running|active|online|up)/.test(normalizedStatus)) {
        return 'running';
      }
      if (/(stopped|inactive|down|stop|exit|exited|not running)/.test(normalizedStatus)) {
        return 'stopped';
      }
      if (/(failed|error|dead|crashed)/.test(normalizedStatus)) {
        return 'failed';
      }
    }

    if (typeof service?.pid === 'number' && service.pid > 0) {
      return 'running';
    }

    return 'unknown';
  }

  /**
   * 解析登录时间
   */
  private parseLoginTime(loginTime: any): number {
    if (typeof loginTime === 'number') {
      // 如果是时间戳
      if (loginTime > 1000000000000) {
        // 毫秒时间戳
        return loginTime;
      } else {
        // 秒时间戳
        return loginTime * 1000;
      }
    }

    if (typeof loginTime === 'string') {
      const parsed = Date.parse(loginTime);
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
