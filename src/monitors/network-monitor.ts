import { BaseMonitor } from '../core/base-monitor';
import {
  MonitorResult,
  NetworkConfig,
  NetworkInterface,
  NetworkStats,
  NetworkAddress,
  DataSize
} from '../types';
import { PlatformAdapter } from '../types/platform';
import { CacheManager } from '../core/cache-manager';

/**
 * 网络监控器
 *
 * 提供网络相关的监控功能，包括接口信息、流量统计、连接状态等
 */
export class NetworkMonitor extends BaseMonitor<NetworkInterface[]> {
  private networkConfig: NetworkConfig;
  // private previousStats: Map<string, NetworkStats> = new Map();
  // private lastStatsTime: number = 0;

  constructor(
    adapter: PlatformAdapter,
    config: NetworkConfig = {},
    cache?: CacheManager
  ) {
    super(adapter, config, cache);
    this.networkConfig = { ...this.getDefaultConfig(), ...config } as NetworkConfig;
  }

  /**
   * 获取网络接口信息（实现抽象方法）
   */
  async info(): Promise<MonitorResult<NetworkInterface[]>> {
    return this.interfaces();
  }

  /**
   * 获取网络接口信息
   */
  async interfaces(): Promise<MonitorResult<NetworkInterface[]>> {
    const cacheKey = 'network-interfaces';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('network.interfaces');

        const rawData = await this.adapter.getNetworkInterfaces();
        return this.transformNetworkInterfaces(rawData);
      },
      this.networkConfig.cacheTTL || 10000
    );
  }

  /**
   * 获取指定接口信息
   */
  async interfaceByName(name: string): Promise<MonitorResult<NetworkInterface | null>> {
    const interfacesResult = await this.interfaces();

    if (!interfacesResult.success || !interfacesResult.data) {
      return interfacesResult as MonitorResult<NetworkInterface | null>;
    }

    const networkInterface = interfacesResult.data.find(iface => iface.name === name);
    return this.createSuccessResult(networkInterface || null);
  }

  /**
   * 获取网络统计信息（异步版本）
   */
  async statsAsync(options: { skipCache?: boolean } = {}): Promise<MonitorResult<NetworkStats[]>> {
    if (!this.networkConfig.includeInterfaceStats) {
      return this.createErrorResult(
        this.createUnsupportedError('network.stats (disabled in config)')
      );
    }

    const cacheKey = 'network-stats';
    const fetchStats = async () => {
      this.validatePlatformSupport('network.stats');
      const rawData = await this.adapter.getNetworkStats();
      return this.transformNetworkStats(rawData);
    };

    if (options.skipCache) {
      try {
        const data = await fetchStats();
        return this.createSuccessResult(data, false);
      } catch (error) {
        return this.handleError(error);
      }
    }

    return this.executeWithCache(
      cacheKey,
      fetchStats,
      this.networkConfig.cacheTTL || 2000 // 统计信息缓存较短
    );
  }

  /**
   * 获取指定接口的统计信息
   */
  async statsByInterface(interfaceName: string): Promise<MonitorResult<NetworkStats | null>> {
    const statsResult = await this.statsAsync();

    if (!statsResult.success || !statsResult.data) {
      return statsResult as MonitorResult<NetworkStats | null>;
    }

    const stats = statsResult.data.find(stat => stat.interface === interfaceName);
    return this.createSuccessResult(stats || null);
  }

  /**
   * 获取带宽使用情况（需要两次测量）
   */
  async bandwidth(): Promise<MonitorResult<{
    interval: number;
    interfaces: Array<{
      interface: string;
      rxSpeed: number;
      txSpeed: number;
      rxSpeedFormatted: string;
      txSpeedFormatted: string;
    }>;
  }>> {
    if (!this.networkConfig.includeBandwidth) {
      return this.createErrorResult(
        this.createUnsupportedError('network.bandwidth (disabled in config)')
      );
    }

    const interval = this.networkConfig.bandwidthInterval || 1000;

    // 第一次测量
    const firstStatsResult = await this.statsAsync({ skipCache: true });
    if (!firstStatsResult.success || !firstStatsResult.data) {
      throw new Error('Failed to get network stats for bandwidth calculation');
    }

    // 等待指定间隔
    await new Promise(resolve => setTimeout(resolve, interval));

    // 第二次测量
    const secondStatsResult = await this.statsAsync({ skipCache: true });
    if (!secondStatsResult.success || !secondStatsResult.data) {
      throw new Error('Failed to get second network stats for bandwidth calculation');
    }

    // 计算带宽
    const bandwidth = this.calculateBandwidth(
      firstStatsResult.data,
      secondStatsResult.data,
      interval
    );

    return this.createSuccessResult({
      interval,
      interfaces: bandwidth
    });
  }

  /**
   * 获取活跃的网络连接
   */
  async connections(): Promise<MonitorResult<any[]>> {
    if (!this.networkConfig.includeConnections) {
      return this.createErrorResult(
        this.createUnsupportedError('network.connections (disabled in config)')
      );
    }

    const cacheKey = 'network-connections';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('network.connections');

        const rawData = await this.adapter.getNetworkConnections();
        return this.transformNetworkConnections(rawData);
      },
      this.networkConfig.cacheTTL || 5000
    );
  }

  /**
   * 获取默认网关信息
   */
  async gateway(): Promise<MonitorResult<{
    gateway: string | null;
    interface: string;
  } | null>> {
    const cacheKey = 'network-gateway';

    return this.executeWithCache(
      cacheKey,
      async () => {
        this.validatePlatformSupport('network.gateway');

        const rawData = await this.adapter.getDefaultGateway();
        return this.transformGatewayInfo(rawData);
      },
      this.networkConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取公网 IP 地址
   */
  async publicIP(): Promise<MonitorResult<{
    ipv4?: string;
    ipv6?: string;
  }>> {
    const cacheKey = 'network-public-ip';

    return this.executeWithCache(
      cacheKey,
      async () => {
        // 这个功能可能需要外部服务，暂时返回空结果
        return {
          ipv4: undefined,
          ipv6: undefined
        };
      },
      this.networkConfig.cacheTTL || 300000 // 公网 IP 缓存 5 分钟
    );
  }

  /**
   * 网络健康检查
   */
  async healthCheck(): Promise<MonitorResult<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    checks: {
      interfaceStatus: boolean;
      connectivity: boolean;
      performance: boolean;
    };
  }>> {
    const cacheKey = 'network-health';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const issues: string[] = [];
        const checks = {
          interfaceStatus: true,
          connectivity: true,
          performance: true
        };

        // 检查网络接口状态
        try {
          const interfacesResult = await this.interfaces();
          if (interfacesResult.success && interfacesResult.data) {
            const activeInterfaces = interfacesResult.data.filter(iface =>
              iface.state === 'up' && !iface.internal
            );

            if (activeInterfaces.length === 0) {
              issues.push('No active network interfaces found');
              checks.interfaceStatus = false;
            }

            // 检查是否有错误率高的接口
            if (this.networkConfig.includeInterfaceStats) {
              const statsResult = await this.statsAsync();
              if (statsResult.success && statsResult.data) {
                for (const stats of statsResult.data) {
                  const totalPackets = stats.rxPackets + stats.txPackets;
                  const totalErrors = stats.rxErrors + stats.txErrors;
                  const errorRate = totalPackets > 0 ? (totalErrors / totalPackets) * 100 : 0;

                  if (errorRate > 5) {
                    issues.push(`High error rate on interface ${stats.interface}: ${errorRate.toFixed(2)}%`);
                    checks.performance = false;
                  }
                }
              }
            }
          }
        } catch (error) {
          issues.push('Failed to check network interface status');
          checks.interfaceStatus = false;
        }

        // 检查默认网关连通性
        try {
          const gatewayResult = await this.gateway();
          if (!gatewayResult.success || !gatewayResult.data) {
            issues.push('No default gateway configured');
            checks.connectivity = false;
          }
        } catch (error) {
          issues.push('Failed to get gateway information');
          checks.connectivity = false;
        }

        // 确定整体健康状态
        let status: 'healthy' | 'warning' | 'critical' = 'healthy';

        if (!checks.interfaceStatus || !checks.connectivity) {
          status = 'critical';
        } else if (!checks.performance || issues.length > 0) {
          status = 'warning';
        }

        return {
          status,
          issues,
          checks
        };
      },
      this.networkConfig.cacheTTL || 30000
    );
  }

  /**
   * 获取网络总览信息
   */
  async overview(): Promise<MonitorResult<{
    interfaces: number;
    activeInterfaces: number;
    totalRxBytes: DataSize;
    totalTxBytes: DataSize;
    totalPackets: number;
    totalErrors: number;
  }>> {
    const cacheKey = 'network-overview';

    return this.executeWithCache(
      cacheKey,
      async () => {
        const [interfacesResult, statsResult] = await Promise.all([
          this.interfaces(),
          this.statsAsync().catch(() => ({ success: false, data: null }))
        ]);

        if (!interfacesResult.success || !interfacesResult.data) {
          throw new Error('Failed to get network interfaces');
        }

        const interfaces = interfacesResult.data;
        const activeInterfaces = interfaces.filter(iface =>
          iface.state === 'up' && !iface.internal
        ).length;

        let totalRxBytes = 0;
        let totalTxBytes = 0;
        let totalPackets = 0;
        let totalErrors = 0;

        if (statsResult.success && statsResult.data) {
          for (const stats of statsResult.data) {
            totalRxBytes += stats.rxBytes.toBytes();
            totalTxBytes += stats.txBytes.toBytes();
            totalPackets += stats.rxPackets + stats.txPackets;
            totalErrors += stats.rxErrors + stats.txErrors;
          }
        }

        return {
          interfaces: interfaces.length,
          activeInterfaces,
          totalRxBytes: new DataSize(totalRxBytes),
          totalTxBytes: new DataSize(totalTxBytes),
          totalPackets,
          totalErrors
        };
      },
      this.networkConfig.cacheTTL || 10000
    );
  }

  /**
   * 配置是否包含接口统计
   */
  withInterfaceStats(include: boolean): this {
    this.networkConfig.includeInterfaceStats = include;
    return this;
  }

  /**
   * 配置是否包含连接信息
   */
  withConnections(include: boolean): this {
    this.networkConfig.includeConnections = include;
    return this;
  }

  /**
   * 配置是否包含带宽监控
   */
  withBandwidth(include: boolean): this {
    this.networkConfig.includeBandwidth = include;
    return this;
  }

  /**
   * 配置目标网络接口
   */
  withInterfaces(interfaces: string[]): this {
    this.networkConfig.interfaces = interfaces;
    return this;
  }

  /**
   * 配置带宽监控间隔
   */
  withBandwidthInterval(interval: number): this {
    this.networkConfig.bandwidthInterval = interval;
    return this;
  }

  /**
   * 获取默认配置
   */
  protected getDefaultConfig(): NetworkConfig {
    return {
      interval: 2000,
      timeout: 10000,
      cacheEnabled: true,
      cacheTTL: 5000,
      samples: 1,
      includeDetails: true,
      includeInterfaceStats: true,
      includeConnections: false, // 连接信息可能较多，默认不包含
      includeBandwidth: false, // 带宽监控需要额外计算，默认不包含
      bandwidthInterval: 1000,
      unit: 'auto'
    };
  }

  // 私有转换方法

  /**
   * 转换网络接口信息
   */
  /**
   * 将平台适配器返回的原始接口数据统一转换为 NetworkInterface 结构
   * 支持 Node.js os.networkInterfaces() 返回的对象以及适配器自定义的数组格式
   */
  private transformNetworkInterfaces(rawData: any): NetworkInterface[] {
    if (!rawData) {
      return [];
    }

    /**
     * 收集单个网卡的信息并写入结果数组
     */
    const addInterface = (name: string, addresses: any[], raw?: any): void => {
      if (!Array.isArray(addresses) || addresses.length === 0) {
        return;
      }

      const transformedAddresses: NetworkAddress[] = addresses.map((addr: any) => ({
        address: addr.address || '',
        netmask: addr.netmask || '',
        family: addr.family === 'IPv6' || addr.family === 6 ? 'IPv6' : 'IPv4',
        internal: addr.internal || false,
        scopeid: addr.scopeid
      }));

      const firstAddr = addresses[0];
      const rawState = raw?.state ?? raw?.operstate ?? raw?.status;
      const networkInterface: NetworkInterface = {
        name,
        addresses: transformedAddresses,
        mac: firstAddr?.mac || '',
        state: this.normalizeInterfaceState(rawState, firstAddr),
        type: this.inferInterfaceType(name),
        mtu: firstAddr?.mtu || 1500,
        internal: Boolean(raw?.internal ?? firstAddr?.internal ?? false),
        speed: firstAddr?.speed,
        duplex: firstAddr?.duplex
      };

      if (this.shouldIncludeInterface(networkInterface)) {
        interfaces.push(networkInterface);
      }
    };

    const interfaces: NetworkInterface[] = [];

    if (Array.isArray(rawData)) {
      for (const item of rawData) {
        if (!item || typeof item !== 'object') continue;
        const name = item.name || item.interface;
        if (!name) continue;

        const addresses = Array.isArray(item.addresses)
          ? item.addresses
          : [{
              address: item.address,
              netmask: item.netmask,
              family: item.family,
              internal: item.internal,
              mac: item.mac,
              mtu: item.mtu,
              scopeid: item.scopeid
            }];

        addInterface(name, addresses as any[], item);
      }

      return interfaces;
    }

    if (typeof rawData === 'object') {
      for (const [name, addresses] of Object.entries(rawData)) {
        addInterface(name, addresses as any[], (rawData as any)[name]);
      }
    }

    return interfaces;
  }

  /**
   * 转换网络统计信息
   */
  private transformNetworkStats(rawData: any[]): NetworkStats[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData
      .filter(stats => this.shouldIncludeInterface({ name: stats.interface }))
      .map(stats => ({
        interface: stats.interface || stats.name || 'unknown',
        rxBytes: new DataSize(this.safeParseNumber(stats.rxBytes || stats.rx_bytes)),
        txBytes: new DataSize(this.safeParseNumber(stats.txBytes || stats.tx_bytes)),
        rxPackets: this.safeParseNumber(stats.rxPackets || stats.rx_packets),
        txPackets: this.safeParseNumber(stats.txPackets || stats.tx_packets),
        rxErrors: this.safeParseNumber(stats.rxErrors || stats.rx_errors),
        txErrors: this.safeParseNumber(stats.txErrors || stats.tx_errors),
        rxDropped: this.safeParseNumber(stats.rxDropped || stats.rx_dropped),
        txDropped: this.safeParseNumber(stats.txDropped || stats.tx_dropped),
        rxSpeed: stats.rxSpeed,
        txSpeed: stats.txSpeed
      }));
  }

  /**
   * 转换网络连接信息
   */
  private transformNetworkConnections(rawData: any[]): any[] {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(conn => ({
      protocol: conn.protocol || 'unknown',
      localAddress: conn.localAddress || conn.local_address,
      localPort: conn.localPort || conn.local_port,
      remoteAddress: conn.remoteAddress || conn.remote_address,
      remotePort: conn.remotePort || conn.remote_port,
      state: conn.state || 'unknown',
      pid: conn.pid
    }));
  }

  /**
   * 转换网关信息
   */
  private transformGatewayInfo(rawData: any): { gateway: string | null; interface: string } | null {
    // 网关信息在 Linux 点对点链路中可能只有接口（例如 `default dev ppp0`），此时仍视为有效路由
    if (!rawData || (rawData.gateway == null && rawData.interface == null && rawData.iface == null && rawData.device == null)) {
      return null;
    }

    return {
      // 优先使用显式网关地址，若缺失则回退到 `address` 字段，保持与适配器输出一致
      gateway: rawData.gateway ?? rawData.address ?? null,
      // 兼容不同平台字段命名（interface/iface/device），确保能准确识别默认出口
      interface: rawData.interface || rawData.iface || rawData.device || 'unknown'
    };
  }

  /**
   * 计算带宽
   */
  private calculateBandwidth(
    firstStats: NetworkStats[],
    secondStats: NetworkStats[],
    intervalMs: number
  ): Array<{
    interface: string;
    rxSpeed: number;
    txSpeed: number;
    rxSpeedFormatted: string;
    txSpeedFormatted: string;
  }> {
    const results: Array<{
      interface: string;
      rxSpeed: number;
      txSpeed: number;
      rxSpeedFormatted: string;
      txSpeedFormatted: string;
    }> = [];

    for (const firstStat of firstStats) {
      const secondStat = secondStats.find(s => s.interface === firstStat.interface);
      if (!secondStat) continue;

      const intervalSec = intervalMs / 1000;
      const rxDiff = secondStat.rxBytes.toBytes() - firstStat.rxBytes.toBytes();
      const txDiff = secondStat.txBytes.toBytes() - firstStat.txBytes.toBytes();

      const rxSpeed = Math.max(0, rxDiff / intervalSec); // 字节/秒
      const txSpeed = Math.max(0, txDiff / intervalSec); // 字节/秒

      results.push({
        interface: firstStat.interface,
        rxSpeed,
        txSpeed,
        rxSpeedFormatted: new DataSize(rxSpeed).toString(this.networkConfig.unit || 'auto') + '/s',
        txSpeedFormatted: new DataSize(txSpeed).toString(this.networkConfig.unit || 'auto') + '/s'
      });
    }

    return results;
  }

  /**
   * 推断接口状态
   */
  private inferInterfaceState(addr: any): 'up' | 'down' | 'unknown' {
    // 如果有地址且不是内部接口，通常表示接口是活跃的
    if (addr && addr.address && !addr.internal) {
      return 'up';
    }

    // 内部接口（如回环）通常也是活跃的
    if (addr && addr.internal && addr.address) {
      return 'up';
    }

    return 'unknown';
  }

  /**
   * 推断接口类型
   */
  private inferInterfaceType(name: string): 'ethernet' | 'wifi' | 'loopback' | 'virtual' | 'other' {
    const lowerName = name.toLowerCase();

    if (lowerName.includes('lo') || lowerName.includes('loopback')) {
      return 'loopback';
    }

    if (lowerName.includes('wifi') || lowerName.includes('wlan') || lowerName.includes('wireless')) {
      return 'wifi';
    }

    if (lowerName.includes('eth') || lowerName.includes('en')) {
      return 'ethernet';
    }

    if (lowerName.includes('virt') || lowerName.includes('docker') || lowerName.includes('br-')) {
      return 'virtual';
    }

    return 'other';
  }

  /**
   * 判断是否应该包含该接口
   */
  private shouldIncludeInterface(networkInterface: { name: string }): boolean {
    // 如果配置了特定接口列表，只包含这些接口
    if (this.networkConfig.interfaces && this.networkConfig.interfaces.length > 0) {
      return this.networkConfig.interfaces.includes(networkInterface.name);
    }

    return true;
  }

  private normalizeInterfaceState(rawState: any, addr: any): 'up' | 'down' | 'unknown' {
    // 直接复用适配器给出的状态，若不存在则回退到地址推断以保留兼容性
    if (typeof rawState === 'string') {
      const normalized = rawState.toLowerCase();

      if (/(up|running|active|online)/.test(normalized)) {
        return 'up';
      }

      if (/(down|inactive|disabled|offline)/.test(normalized)) {
        return 'down';
      }
    }

    return this.inferInterfaceState(addr);
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
   * 获取网络流量统计（同步版本，向后兼容）
   * @param interval 监控间隔（毫秒）
   * @returns 网络流量统计对象或 'not supported'
   */
  inOut(interval: number = 1000): any {
    try {
      // 对于同步版本，无法进行实际的网络监控
      // 返回基本结构，实际值需要通过异步方法获取
      return {
        total: {
          inputMb: 0,
          outputMb: 0
        },
        inputMb: 0,
        outputMb: 0
      };
    } catch (error) {
      return 'not supported';
    }
  }

  /**
   * 获取网络统计信息（同步版本，向后兼容）
   * @returns 网络统计信息数组或 'not supported'
   */
  stats(): any {
    try {
      // 对于同步版本，返回基本的网络接口信息
      const os = require('os');
      const interfaces = os.networkInterfaces();

      const result: any[] = [];
      for (const [name, addresses] of Object.entries(interfaces)) {
        if (Array.isArray(addresses) && addresses.length > 0) {
          const addr = addresses[0] as any;
          result.push({
            iface: name,
            operstate: addr.internal ? 'down' : 'up',
            rx_bytes: 0,
            rx_dropped: 0,
            rx_errors: 0,
            tx_bytes: 0,
            tx_dropped: 0,
            tx_errors: 0,
            internal: addr.internal,
            address: addr.address
          });
        }
      }

      return result;
    } catch (error) {
      return 'not supported';
    }
  }
}
