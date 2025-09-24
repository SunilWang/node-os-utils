import { PlatformAdapter } from '../types/platform';
import { LinuxAdapter } from './linux-adapter';
import { MacOSAdapter } from './macos-adapter';
import { WindowsAdapter } from './windows-adapter';
import { MonitorError, ErrorCode } from '../types/errors';

/**
 * 平台适配器工厂，负责实例化并缓存各操作系统的具体适配器
 */
export class AdapterFactory {
  private static adapters: Map<string, PlatformAdapter> = new Map();

  /**
   * 创建平台适配器
   *
   * @param platform 目标平台，如果不指定则自动检测
   * @returns 平台适配器实例
   */
  static create(platform?: string): PlatformAdapter {
    const targetPlatform = this.normalizePlatform(platform || this.detectPlatform());

    // 检查是否已有缓存的适配器实例
    if (this.adapters.has(targetPlatform)) {
      return this.adapters.get(targetPlatform)!;
    }

    let adapter: PlatformAdapter;

    switch (targetPlatform) {
      case 'linux':
        adapter = new LinuxAdapter();
        break;
      case 'darwin':
        adapter = new MacOSAdapter();
        break;
      case 'win32':
        adapter = new WindowsAdapter();
        break;
      default:
        throw new MonitorError(
          `Unsupported platform: ${targetPlatform}`,
          ErrorCode.PLATFORM_NOT_SUPPORTED,
          targetPlatform
        );
    }

    // 缓存适配器实例
    this.adapters.set(targetPlatform, adapter);
    return adapter;
  }

  /**
   * 获取支持的平台列表
   */
  static getSupportedPlatforms(): string[] {
    return ['linux', 'darwin', 'win32'];
  }

  /**
   * 检查是否支持指定平台
   */
  static isPlatformSupported(platform: string): boolean {
    return this.getSupportedPlatforms().includes(this.normalizePlatform(platform));
  }

  /**
   * 获取当前平台信息
   */
  static getCurrentPlatformInfo(): {
    platform: string;
    arch: string;
    version: string;
    supported: boolean;
  } {
    const platform = this.detectPlatform();

    return {
      platform,
      arch: process.arch,
      version: process.version,
      supported: this.isPlatformSupported(platform)
    };
  }

  /**
   * 检测运行平台
   */
  static detectPlatform(): string {
    return process.platform;
  }

  /**
   * 获取平台显示名称
   */
  static getPlatformDisplayName(platform?: string): string {
    const targetPlatform = this.normalizePlatform(platform || this.detectPlatform());

    const displayNames: Record<string, string> = {
      'linux': 'Linux',
      'darwin': 'macOS',
      'win32': 'Windows',
      'freebsd': 'FreeBSD',
      'openbsd': 'OpenBSD',
      'netbsd': 'NetBSD',
      'aix': 'AIX',
      'sunos': 'SunOS'
    };

    return displayNames[targetPlatform] || targetPlatform;
  }

  /**
   * 检查平台能力
   */
  static async checkPlatformCapabilities(platform?: string): Promise<{
    platform: string;
    supported: boolean;
    capabilities: {
      commands: string[];
      files: string[];
      features: string[];
    };
    issues: string[];
  }> {
    const targetPlatform = this.normalizePlatform(platform || this.detectPlatform());
    const supported = this.isPlatformSupported(targetPlatform);

    if (!supported) {
      return {
        platform: targetPlatform,
        supported: false,
        capabilities: {
          commands: [],
          files: [],
          features: []
        },
        issues: [`Platform ${targetPlatform} is not supported`]
      };
    }

    try {
      const adapter = this.create(targetPlatform);
      const capabilities = await this.testAdapterCapabilities(adapter);

      return {
        platform: targetPlatform,
        supported: true,
        capabilities,
        issues: []
      };
    } catch (error) {
      return {
        platform: targetPlatform,
        supported: false,
        capabilities: {
          commands: [],
          files: [],
          features: []
        },
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * 清理缓存的适配器
   */
  static clearCache(): void {
    this.adapters.clear();
  }

  /**
   * 获取缓存的适配器数量
   */
  static getCacheSize(): number {
    return this.adapters.size;
  }

  /**
   * 创建适配器的调试信息
   */
  static async getDebugInfo(platform?: string): Promise<{
    platform: string;
    adapter: string;
    supportedFeatures: Record<string, any>;
    systemInfo: any;
  }> {
    const targetPlatform = this.normalizePlatform(platform || this.detectPlatform());
    const adapter = this.create(targetPlatform);

    try {
      const [supportedFeatures, systemInfo] = await Promise.all([
        Promise.resolve(adapter.getSupportedFeatures()),
        adapter.getSystemInfo().catch(() => null)
      ]);

      return {
        platform: targetPlatform,
        adapter: adapter.constructor.name,
        supportedFeatures,
        systemInfo
      };
    } catch (error) {
      return {
        platform: targetPlatform,
        adapter: adapter.constructor.name,
        supportedFeatures: {},
        systemInfo: null
      };
    }
  }

  /**
   * 调用适配器运行一系列命令/文件探测以判定平台能力
   */
  private static async testAdapterCapabilities(adapter: PlatformAdapter): Promise<{
    commands: string[];
    files: string[];
    features: string[];
  }> {
    const capabilities = {
      commands: [] as string[],
      files: [] as string[],
      features: [] as string[]
    };

    // 测试常用命令
    const commonCommands = this.getCommonCommandsByPlatform(adapter.getPlatform());

    for (const command of commonCommands) {
      try {
        const executableCheck = adapter.getPlatform() === 'win32'
          ? `where ${command}`
          : `which ${command}`;

        await adapter.executeCommand(executableCheck, { timeout: 3000 });
        capabilities.commands.push(command);
      } catch {
        // 命令不可用
      }
    }

    // 测试文件访问
    const commonFiles = this.getCommonFilesByPlatform(adapter.getPlatform());

    for (const file of commonFiles) {
      try {
        const exists = await adapter.fileExists(file);
        if (exists) {
          capabilities.files.push(file);
        }
      } catch {
        // 文件不可访问
      }
    }

    // 测试功能支持
    const supportedFeatures = adapter.getSupportedFeatures();
    for (const [category, features] of Object.entries(supportedFeatures)) {
      for (const [feature, supported] of Object.entries(features)) {
        if (supported) {
          capabilities.features.push(`${category}.${feature}`);
        }
      }
    }

    return capabilities;
  }

  /**
   * 按平台列出诊断常用命令，用于能力自检
   */
  private static getCommonCommandsByPlatform(platform: string): string[] {
    const commands: Record<string, string[]> = {
      'linux': ['ps', 'top', 'df', 'free', 'vmstat', 'iostat', 'netstat', 'lscpu', 'lsblk'],
      'darwin': ['ps', 'top', 'df', 'vm_stat', 'iostat', 'netstat', 'sysctl', 'ifconfig'],
      'win32': ['tasklist', 'wmic', 'systeminfo', 'netstat']
    };

    return commands[platform] || [];
  }

  /**
   * 按平台列出监控常访问的关键文件
   */
  private static getCommonFilesByPlatform(platform: string): string[] {
    const files: Record<string, string[]> = {
      'linux': [
        '/proc/cpuinfo',
        '/proc/meminfo',
        '/proc/stat',
        '/proc/loadavg',
        '/proc/uptime',
        '/proc/diskstats',
        '/proc/net/dev'
      ],
      'darwin': [
        '/usr/bin/sysctl',
        '/usr/bin/vm_stat',
        '/usr/bin/top',
        '/usr/bin/iostat'
      ],
      'win32': [
        'C:\\Windows\\System32\\tasklist.exe',
        'C:\\Windows\\System32\\wmic.exe'
      ]
    };

    return files[platform] || [];
  }

  /**
   * 归一化平台标识，兼容常见别名
   * 将外部传入的平台别名归一化为 Node.js 标准 platform 值
   */
  private static normalizePlatform(platform: string): string {
    const normalized = platform?.toLowerCase();

    const aliases: Record<string, string> = {
      mac: 'darwin',
      macos: 'darwin',
      osx: 'darwin',
      win: 'win32',
      windows: 'win32'
    };

    return aliases[normalized] || normalized;
  }
}
