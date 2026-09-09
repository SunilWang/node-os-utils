import { PlatformAdapter } from '../types/platform';
import { ExecuteOptions } from '../types/config';
import { LinuxAdapter } from './linux-adapter';
import { MacOSAdapter } from './macos-adapter';
import { WindowsAdapter } from './windows-adapter';
import { MonitorError, ErrorCode } from '../types/errors';

/**
 * 平台适配器工厂，负责实例化具体适配器，并缓存各操作系统的默认超时实例
 */
export class AdapterFactory {
  private static adapters: Map<string, PlatformAdapter> = new Map();

  /**
   * 创建平台适配器
   *
   * @param platform 目标平台，如果不指定则自动检测
   * @param defaultExecuteOptions 底层系统命令的默认执行选项
   * @returns 平台适配器实例
   */
  static create(platform?: string, defaultExecuteOptions: ExecuteOptions = {}): PlatformAdapter {
    const targetPlatform = this.normalizePlatform(platform || this.detectPlatform());
    const effectiveExecuteOptions: ExecuteOptions = {
      ...defaultExecuteOptions,
      timeout: defaultExecuteOptions.timeout ?? 10000
    };
    const optionKeys = Object.keys(defaultExecuteOptions);
    const usesDefaultOptions = effectiveExecuteOptions.timeout === 10000 &&
      optionKeys.every(key => key === 'timeout');

    // 保持原有默认实例单例语义；自定义执行选项不缓存，避免配置串扰和缓存无界增长。
    if (usesDefaultOptions && this.adapters.has(targetPlatform)) {
      return this.adapters.get(targetPlatform)!;
    }

    let adapter: PlatformAdapter;

    switch (targetPlatform) {
      case 'linux':
        adapter = new LinuxAdapter(effectiveExecuteOptions);
        break;
      case 'darwin':
        adapter = new MacOSAdapter(effectiveExecuteOptions);
        break;
      case 'win32':
        adapter = new WindowsAdapter(effectiveExecuteOptions);
        break;
      default:
        throw new MonitorError(
          `Unsupported platform: ${targetPlatform}`,
          ErrorCode.PLATFORM_NOT_SUPPORTED,
          targetPlatform
        );
    }

    // 缓存适配器实例
    if (usesDefaultOptions) {
      this.adapters.set(targetPlatform, adapter);
    }
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
   * 检查平台能力，复用传入适配器的命令执行配置。
   *
   * @param {string | PlatformAdapter} platformOrAdapter 平台名称或已有适配器；省略时检测当前平台
   * @returns 平台支持状态、已确认能力及探测问题；初始化或功能枚举失败时 supported 为 false
   */
  static async checkPlatformCapabilities(platformOrAdapter?: string | PlatformAdapter): Promise<{
    platform: string;
    supported: boolean;
    capabilities: {
      commands: string[];
      files: string[];
      features: string[];
    };
    issues: string[];
  }> {
    const providedAdapter = typeof platformOrAdapter === 'object' ? platformOrAdapter : undefined;
    const platform = providedAdapter ? providedAdapter.getPlatform() : platformOrAdapter as string | undefined;
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
      const adapter = providedAdapter || this.create(targetPlatform);
      const issues: string[] = [];
      const { capabilities, supported } = await this.testAdapterCapabilities(adapter, issues);

      return {
        platform: targetPlatform,
        supported,
        capabilities,
        issues
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
        issues: [this.describeProbeError(error)]
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
   * 调用适配器运行命令、文件和功能探测，分别保留成功结果与失败诊断。
   *
   * @param {PlatformAdapter} adapter 复用默认执行选项的平台适配器
   * @param {string[]} issues 收集未能完成的探测问题
   * @returns 已确认能力及支持状态；功能枚举失败保留已有结果并将 supported 设为 false
   */
  private static async testAdapterCapabilities(adapter: PlatformAdapter, issues: string[]): Promise<{
    capabilities: {
      commands: string[];
      files: string[];
      features: string[];
    };
    supported: boolean;
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

        // 使用适配器预算，避免能力自检比实际监控更早超时；定位器退出 1 表示目标不存在。
        const result = await adapter.executeCommand(executableCheck);
        if (result.exitCode === 0 && result.stdout.trim()) {
          capabilities.commands.push(command);
        } else if (result.exitCode !== 1) {
          issues.push(result.exitCode === 0
            ? `Command probe "${command}" returned no executable path`
            : `Command probe "${command}" failed with exit code ${result.exitCode}: ${result.stderr}`);
        }
      } catch (error) {
        const commandMissing = error instanceof MonitorError &&
          error.code === ErrorCode.COMMAND_FAILED && error.details?.exitCode === 1;
        if (!commandMissing) {
          issues.push(`Command probe "${command}" failed: ${this.describeProbeError(error)}`);
        }
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
      } catch (error) {
        if (!(error instanceof MonitorError && error.code === ErrorCode.FILE_NOT_FOUND)) {
          issues.push(`File probe "${file}" failed: ${this.describeProbeError(error)}`);
        }
      }
    }

    // 功能枚举失败沿用原有 supported:false 语义，并保留此前探测成功的能力。
    let featureProbeSucceeded = true;
    try {
      const supportedFeatures = adapter.getSupportedFeatures();
      for (const [category, features] of Object.entries(supportedFeatures)) {
        for (const [feature, supported] of Object.entries(features)) {
          if (supported) {
            capabilities.features.push(`${category}.${feature}`);
          }
        }
      }
    } catch (error) {
      featureProbeSucceeded = false;
      issues.push(`Feature probe failed: ${this.describeProbeError(error)}`);
    }

    return { capabilities, supported: featureProbeSucceeded };
  }

  /**
   * 格式化探测异常，并保留 MonitorError 的分类以便识别超时等临时故障。
   *
   * @param {unknown} error 探测过程捕获的异常
   * @returns {string} 包含错误分类及原始消息的诊断描述
   */
  private static describeProbeError(error: unknown): string {
    return error instanceof MonitorError
      ? `[${error.code}] ${error.message}`
      : error instanceof Error ? error.message : String(error);
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
