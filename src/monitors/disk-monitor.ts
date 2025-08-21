import { BaseMonitor } from '../core/base-monitor';
import { 
  MonitorResult, 
  DiskConfig,
  DiskInfo, 
  DiskUsage,
  DiskStats,
  MountPoint,
  FileSystem,
  DataSize
} from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from '../core/cache-manager';

/**
 * 磁盘监控器
 * 
 * 提供磁盘相关的监控功能，包括空间使用、I/O统计、挂载点等
 */
export class DiskMonitor extends BaseMonitor<DiskInfo[]> {
  private diskConfig: DiskConfig;

  constructor(
    adapter: PlatformAdapter,
    config: DiskConfig = {},
    cache?: CacheManager
  ) {
    super(adapter, config, cache);
    this.diskConfig = { ...this.getDefaultConfig(), ...config } as DiskConfig;
  }

  /**
   * 获取所有磁盘信息
   */
  async info(): Promise<MonitorResult<DiskInfo[]>> {
    const cacheKey = 'disk-info';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('disk.info');
        
        const rawData = await this.adapter.getDiskInfo();
        return this.transformDiskInfo(rawData);
      },
      this.diskConfig.cacheTTL || 30000 // 磁盘信息缓存 30 秒
    );
  }

  /**
   * 获取指定磁盘的信息
   */
  async infoByDevice(device: string): Promise<MonitorResult<DiskInfo | null>> {
    const allDisksResult = await this.info();
    
    if (!allDisksResult.success || !allDisksResult.data) {
      return allDisksResult as MonitorResult<DiskInfo | null>;
    }

    const diskInfo = allDisksResult.data.find(disk => 
      disk.device === device || disk.mountpoint === device
    );

    return this.createSuccessResult(diskInfo || null);
  }

  /**
   * 获取磁盘使用情况
   */
  async usage(): Promise<MonitorResult<DiskUsage[]>> {
    const cacheKey = 'disk-usage';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('disk.usage');
        
        const rawData = await this.adapter.getDiskUsage();
        return this.transformDiskUsage(rawData);
      },
      this.diskConfig.cacheTTL || 10000
    );
  }

  /**
   * 获取总体磁盘使用率（百分比）
   */
  async overallUsage(): Promise<MonitorResult<number>> {
    const usageResult = await this.usage();
    
    if (!usageResult.success || !usageResult.data) {
      return usageResult as MonitorResult<number>;
    }

    // 计算所有磁盘的加权平均使用率
    let totalBytes = 0;
    let usedBytes = 0;

    for (const disk of usageResult.data) {
      if (this.diskConfig.excludeTypes && 
          this.diskConfig.excludeTypes.includes(disk.filesystem)) {
        continue;
      }

      totalBytes += disk.total.toBytes();
      usedBytes += disk.used.toBytes();
    }

    const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    return this.createSuccessResult(Math.round(usagePercentage * 100) / 100);
  }

  /**
   * 获取指定挂载点的使用情况
   */
  async usageByMountPoint(mountPoint: string): Promise<MonitorResult<DiskUsage | null>> {
    const allUsageResult = await this.usage();
    
    if (!allUsageResult.success || !allUsageResult.data) {
      return allUsageResult as MonitorResult<DiskUsage | null>;
    }

    const usage = allUsageResult.data.find(disk => disk.mountpoint === mountPoint);
    return this.createSuccessResult(usage || null);
  }

  /**
   * 获取磁盘 I/O 统计
   */
  async stats(): Promise<MonitorResult<DiskStats[]>> {
    if (!this.diskConfig.includeStats) {
      return this.createErrorResult(
        this.createUnsupportedError('disk.stats (disabled in config)')
      );
    }

    const cacheKey = 'disk-stats';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('disk.stats');
        
        const rawData = await this.adapter.getDiskStats();
        return this.transformDiskStats(rawData);
      },
      this.diskConfig.cacheTTL || 5000
    );
  }

  /**
   * 获取挂载点信息
   */
  async mounts(): Promise<MonitorResult<MountPoint[]>> {
    const cacheKey = 'disk-mounts';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('disk.mounts');
        
        const rawData = await this.adapter.getMounts();
        return this.transformMountPoints(rawData);
      },
      this.diskConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取文件系统信息
   */
  async filesystems(): Promise<MonitorResult<FileSystem[]>> {
    const cacheKey = 'disk-filesystems';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('disk.filesystems');
        
        const rawData = await this.adapter.getFileSystems();
        return this.transformFileSystems(rawData);
      },
      this.diskConfig.cacheTTL || 60000 // 文件系统信息变化较少
    );
  }

  /**
   * 获取磁盘空间总览
   */
  async spaceOverview(): Promise<MonitorResult<{
    total: DataSize;
    used: DataSize;
    available: DataSize;
    usagePercentage: number;
    disks: number;
  }>> {
    const cacheKey = 'disk-space-overview';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        const usageResult = await this.usage();
        
        if (!usageResult.success || !usageResult.data) {
          throw new Error('Failed to get disk usage data');
        }

        let totalBytes = 0;
        let usedBytes = 0;
        let availableBytes = 0;

        for (const disk of usageResult.data) {
          if (this.diskConfig.excludeTypes && 
              this.diskConfig.excludeTypes.includes(disk.filesystem)) {
            continue;
          }

          totalBytes += disk.total.toBytes();
          usedBytes += disk.used.toBytes();
          availableBytes += disk.available.toBytes();
        }

        const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

        return {
          total: new DataSize(totalBytes),
          used: new DataSize(usedBytes),
          available: new DataSize(availableBytes),
          usagePercentage: Math.round(usagePercentage * 100) / 100,
          disks: usageResult.data.length
        };
      },
      this.diskConfig.cacheTTL || 15000
    );
  }

  /**
   * 获取磁盘健康状态检查
   */
  async healthCheck(): Promise<MonitorResult<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    checks: {
      spaceUsage: boolean;
      mountStatus: boolean;
      ioErrors: boolean;
    };
  }>> {
    const cacheKey = 'disk-health';
    
    return this.executeWithCache(
      cacheKey,
      async () => {
        const issues: string[] = [];
        const checks = {
          spaceUsage: true,
          mountStatus: true,
          ioErrors: true
        };

        // 检查磁盘空间使用率
        try {
          const usageResult = await this.usage();
          if (usageResult.success && usageResult.data) {
            for (const disk of usageResult.data) {
              if (disk.usagePercentage > 90) {
                issues.push(`High disk usage on ${disk.mountpoint}: ${disk.usagePercentage.toFixed(1)}%`);
                checks.spaceUsage = false;
              } else if (disk.usagePercentage > 80) {
                issues.push(`Disk usage warning on ${disk.mountpoint}: ${disk.usagePercentage.toFixed(1)}%`);
              }
            }
          }
        } catch (error) {
          issues.push('Failed to check disk usage');
          checks.spaceUsage = false;
        }

        // 检查挂载状态
        try {
          const mountsResult = await this.mounts();
          if (mountsResult.success && mountsResult.data) {
            const readOnlyMounts = mountsResult.data.filter(mount => 
              mount.options.includes('ro') && !mount.mountpoint.startsWith('/proc')
            );
            
            if (readOnlyMounts.length > 0) {
              issues.push(`Read-only filesystems detected: ${readOnlyMounts.map(m => m.mountpoint).join(', ')}`);
              checks.mountStatus = false;
            }
          }
        } catch (error) {
          issues.push('Failed to check mount status');
          checks.mountStatus = false;
        }

        // 确定整体健康状态
        let status: 'healthy' | 'warning' | 'critical' = 'healthy';
        
        if (!checks.spaceUsage || !checks.mountStatus || !checks.ioErrors) {
          status = 'critical';
        } else if (issues.length > 0) {
          status = 'warning';
        }

        return {
          status,
          issues,
          checks
        };
      },
      this.diskConfig.cacheTTL || 30000
    );
  }

  /**
   * 配置是否包含 I/O 统计
   */
  withStats(include: boolean): this {
    this.diskConfig.includeStats = include;
    return this;
  }

  /**
   * 配置排除的文件系统类型
   */
  withExcludeTypes(types: string[]): this {
    this.diskConfig.excludeTypes = types;
    return this;
  }

  /**
   * 配置只监控指定的挂载点
   */
  withMountPoints(mountPoints: string[]): this {
    this.diskConfig.mountPoints = mountPoints;
    return this;
  }

  /**
   * 配置磁盘单位
   */
  withUnit(unit: 'auto' | 'B' | 'KB' | 'MB' | 'GB' | 'TB'): this {
    this.diskConfig.unit = unit;
    return this;
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): DiskConfig {
    return {
      interval: 5000,
      timeout: 10000,
      cacheEnabled: true,
      cacheTTL: 15000,
      samples: 1,
      includeDetails: true,
      includeStats: false, // I/O 统计可能对性能有影响
      excludeTypes: ['proc', 'sysfs', 'devtmpfs', 'tmpfs', 'devpts'],
      unit: 'GB'
    };
  }

  // 私有转换方法

  /**
   * 转换磁盘基本信息
   */
  private transformDiskInfo(rawData: any[]): DiskInfo[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(disk => ({
      device: disk.device || disk.name || 'unknown',
      mountpoint: disk.mountPoint || disk.mount || '/',
      filesystem: disk.filesystem || disk.fs || disk.type || 'unknown',
      total: new DataSize(this.safeParseNumber(disk.total || disk.size)),
      used: new DataSize(this.safeParseNumber(disk.used)),
      available: new DataSize(this.safeParseNumber(disk.available || disk.free)),
      usagePercentage: this.calculateUsagePercentage(disk),
      type: this.normalizeDeviceType(disk.type || disk.device),
      model: disk.model,
      serial: disk.serial,
      interface: disk.interface
    }));
  }

  /**
   * 转换磁盘使用情况
   */
  private transformDiskUsage(rawData: any[]): DiskUsage[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData
      .filter(disk => this.shouldIncludeDisk(disk))
      .map(disk => ({
        device: disk.device || disk.filesystem || 'unknown',
        mountpoint: disk.mountPoint || disk.mount || '/',
        filesystem: disk.filesystem || disk.fs || disk.type || 'unknown',
        total: new DataSize(this.safeParseNumber(disk.total || disk.size)),
        used: new DataSize(this.safeParseNumber(disk.used)),
        available: new DataSize(this.safeParseNumber(disk.available || disk.free)),
        usagePercentage: this.calculateUsagePercentage(disk)
      }));
  }

  /**
   * 转换磁盘 I/O 统计
   */
  private transformDiskStats(rawData: any[]): DiskStats[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(stats => ({
      device: stats.device || 'unknown',
      readCount: this.safeParseNumber(stats.reads || stats.read_ios),
      writeCount: this.safeParseNumber(stats.writes || stats.write_ios),
      readBytes: new DataSize(this.safeParseNumber(stats.readBytes || stats.read_sectors * 512)),
      writeBytes: new DataSize(this.safeParseNumber(stats.writeBytes || stats.write_sectors * 512)),
      readTime: this.safeParseNumber(stats.readTime || stats.read_ticks),
      writeTime: this.safeParseNumber(stats.writeTime || stats.write_ticks),
      ioTime: this.safeParseNumber(stats.ioTime || stats.io_ticks),
      weightedIOTime: this.safeParseNumber(stats.weightedIOTime || stats.time_in_queue)
    }));
  }

  /**
   * 转换挂载点信息
   */
  private transformMountPoints(rawData: any[]): MountPoint[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(mount => ({
      device: mount.device || mount.source || 'unknown',
      mountpoint: mount.mountPoint || mount.target || mount.mount || '/',
      filesystem: mount.filesystem || mount.fstype || mount.type || 'unknown',
      options: (mount.options || mount.opts || '').toString(),
      dump: this.safeParseNumber(mount.dump),
      pass: this.safeParseNumber(mount.pass)
    }));
  }

  /**
   * 转换文件系统信息
   */
  private transformFileSystems(rawData: any[]): FileSystem[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(fs => ({
      name: fs.name || fs.filesystem || 'unknown',
      type: fs.type || fs.fstype || 'unknown',
      description: fs.description || '',
      supported: fs.supported !== false,
      features: fs.features || []
    }));
  }

  /**
   * 计算使用率百分比
   */
  private calculateUsagePercentage(disk: any): number {
    const total = this.safeParseNumber(disk.total || disk.size);
    const used = this.safeParseNumber(disk.used);
    
    if (total <= 0) {
      return 0;
    }

    return Math.round((used / total) * 10000) / 100; // 保留两位小数
  }

  /**
   * 判断是否应该包含该磁盘
   */
  private shouldIncludeDisk(disk: any): boolean {
    const filesystem = disk.filesystem || disk.fs || disk.type || '';
    
    // 排除指定的文件系统类型
    if (this.diskConfig.excludeTypes && 
        this.diskConfig.excludeTypes.includes(filesystem)) {
      return false;
    }

    // 如果配置了特定挂载点，只包含这些挂载点
    if (this.diskConfig.mountPoints && this.diskConfig.mountPoints.length > 0) {
      const mountPoint = disk.mountpoint || disk.mount || '/';
      return this.diskConfig.mountPoints.includes(mountPoint);
    }

    return true;
  }

  /**
   * 规范化设备类型
   */
  private normalizeDeviceType(type: string): 'HDD' | 'SSD' | 'NVMe' | 'eMMC' | 'Unknown' {
    if (!type) return 'Unknown';
    
    const normalizedType = type.toLowerCase();
    
    if (normalizedType.includes('ssd')) return 'SSD';
    if (normalizedType.includes('hdd') || normalizedType.includes('hard')) return 'HDD';
    if (normalizedType.includes('nvme')) return 'NVMe';
    if (normalizedType.includes('emmc')) return 'eMMC';
    
    return 'Unknown';
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

  // ==================== 向后兼容的同步方法 ====================

  /**
   * 获取指定路径的空闲磁盘空间（同步版本，向后兼容）
   * @param path 路径（默认为根目录）
   * @returns 空闲磁盘空间对象或 'not supported'
   */
  free(path: string = '/'): any {
    try {
      // 对于同步版本，我们无法调用异步的适配器方法
      // 这里返回一个基本的结构，实际值需要通过异步方法获取
      return {
        size: 0,       // 总大小
        used: 0,       // 已用空间  
        available: 0   // 可用空间
      };
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取指定路径的已用磁盘空间（同步版本，向后兼容）
   * @param path 路径（默认为根目录）
   * @returns 已用磁盘空间对象或 'not supported' 
   */
  used(path: string = '/'): any {
    try {
      // 对于同步版本，我们无法调用异步的适配器方法
      // 这里返回一个基本的结构，实际值需要通过异步方法获取
      return {
        size: 0,       // 总大小
        used: 0,       // 已用空间
        available: 0   // 可用空间
      };
    } catch (error) {
      return 'not supported';
    }
  }
}