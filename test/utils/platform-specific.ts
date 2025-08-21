/**
 * 平台特定的测试工具和配置
 * 为不同操作系统提供专门的测试支持
 */

import { PlatformUtils, TestValidators } from './test-base'

/**
 * Linux特定的测试工具
 */
export class LinuxTestUtils {
  /**
   * Linux特定的系统文件路径
   */
  static readonly PROC_MEMINFO = '/proc/meminfo'
  static readonly PROC_CPUINFO = '/proc/cpuinfo'
  static readonly PROC_STAT = '/proc/stat'
  static readonly PROC_LOADAVG = '/proc/loadavg'

  /**
   * 检查是否可以访问/proc文件系统
   */
  static canAccessProc(): boolean {
    try {
      const fs = require('fs')
      return fs.existsSync(this.PROC_MEMINFO)
    } catch {
      return false
    }
  }

  /**
   * 验证Linux的负载平均值
   */
  static validateLoadAverage(loads: number[]): boolean {
    if (!Array.isArray(loads) || loads.length !== 3) return false
    return loads.every(load => TestValidators.isValidNumber(load) && load >= 0)
  }

  /**
   * 获取预期的Linux命令列表
   */
  static getExpectedCommands(): string[] {
    return [
      'free',
      'df',
      'vmstat',
      'netstat',
      'ps',
      'top',
      'iotop',
      'lscpu'
    ]
  }

  /**
   * 验证Linux内存信息的结构
   */
  static validateMemoryInfo(info: any): boolean {
    const requiredFields = ['totalMemMb', 'usedMemMb', 'freeMemMb', 'usedMemPercentage', 'freeMemPercentage']
    return requiredFields.every(field => 
      info.hasOwnProperty(field) && TestValidators.isValidNumber(parseFloat(info[field]))
    )
  }
}

/**
 * macOS特定的测试工具
 */
export class MacOSTestUtils {
  /**
   * macOS特定的系统命令
   */
  static readonly VM_STAT_CMD = 'vm_stat'
  static readonly TOP_CMD = 'top'
  static readonly DF_CMD = 'df'
  static readonly NETSTAT_CMD = 'netstat'

  /**
   * 验证macOS的vm_stat输出格式
   */
  static validateVmStatOutput(output: string): boolean {
    return output.includes('Pages free:') && 
           output.includes('Pages active:') &&
           output.includes('Pages inactive:')
  }

  /**
   * 验证macOS的负载平均值（应该正常工作）
   */
  static validateLoadAverage(loads: number[]): boolean {
    if (!Array.isArray(loads) || loads.length !== 3) return false
    return loads.every(load => TestValidators.isValidNumber(load) && load >= 0)
  }

  /**
   * 获取预期的macOS系统命令列表
   */
  static getExpectedCommands(): string[] {
    return [
      'vm_stat',
      'top',
      'df',
      'netstat',
      'ps',
      'system_profiler',
      'sysctl'
    ]
  }

  /**
   * 验证macOS磁盘信息格式
   */
  static validateDiskInfo(info: any): boolean {
    const requiredFields = ['totalGb', 'usedGb', 'freeGb', 'usedPercentage', 'freePercentage']
    return requiredFields.every(field => 
      info.hasOwnProperty(field) && TestValidators.isValidNumber(parseFloat(info[field]))
    )
  }
}

/**
 * Windows特定的测试工具
 */
export class WindowsTestUtils {
  /**
   * Windows特定的系统命令
   */
  static readonly WMIC_CMD = 'wmic'
  static readonly TASKLIST_CMD = 'tasklist'
  static readonly SYSTEMINFO_CMD = 'systeminfo'

  /**
   * Windows上某些功能可能不支持
   */
  static readonly UNSUPPORTED_FEATURES = [
    'loadavg',  // Windows不支持负载平均值
    'uptime'    // Windows的uptime计算方式不同
  ]

  /**
   * 验证Windows的负载平均值（通常返回[0,0,0]或不支持）
   */
  static validateLoadAverage(loads: number[]): boolean {
    // Windows上可能返回[0,0,0]或"not supported"
    if (!Array.isArray(loads)) return false
    return loads.length === 3 && loads.every(load => 
      TestValidators.isValidNumber(load) && load >= 0
    )
  }

  /**
   * 检查功能是否在Windows上不被支持
   */
  static isFeatureUnsupported(feature: string): boolean {
    return this.UNSUPPORTED_FEATURES.includes(feature)
  }

  /**
   * 获取预期的Windows系统命令列表
   */
  static getExpectedCommands(): string[] {
    return [
      'wmic',
      'tasklist',
      'systeminfo',
      'netstat',
      'powershell'
    ]
  }

  /**
   * 验证Windows内存信息的结构
   */
  static validateMemoryInfo(info: any): boolean {
    const requiredFields = ['totalMemMb', 'usedMemMb', 'freeMemMb']
    return requiredFields.every(field => 
      info.hasOwnProperty(field) && TestValidators.isValidNumber(parseFloat(info[field]))
    )
  }

  /**
   * 验证Windows磁盘信息（可能使用不同的单位）
   */
  static validateDiskInfo(info: any): boolean {
    const requiredFields = ['totalGb', 'usedGb', 'freeGb']
    return requiredFields.every(field => 
      info.hasOwnProperty(field) && TestValidators.isValidNumber(parseFloat(info[field]))
    )
  }
}

/**
 * 跨平台功能验证工具
 */
export class CrossPlatformValidator {
  /**
   * 根据当前平台选择合适的验证器
   */
  static validateSystemInfo(info: any): boolean {
    if (PlatformUtils.isLinux()) {
      return LinuxTestUtils.validateMemoryInfo(info)
    } else if (PlatformUtils.isMacOS()) {
      return MacOSTestUtils.validateDiskInfo(info)
    } else if (PlatformUtils.isWindows()) {
      return WindowsTestUtils.validateMemoryInfo(info)
    }
    return false
  }

  /**
   * 验证负载平均值（考虑平台差异）
   */
  static validateLoadAverage(loads: number[]): boolean {
    if (PlatformUtils.isWindows()) {
      return WindowsTestUtils.validateLoadAverage(loads)
    } else if (PlatformUtils.isMacOS()) {
      return MacOSTestUtils.validateLoadAverage(loads)
    } else if (PlatformUtils.isLinux()) {
      return LinuxTestUtils.validateLoadAverage(loads)
    }
    return false
  }

  /**
   * 获取当前平台的预期命令列表
   */
  static getExpectedCommands(): string[] {
    if (PlatformUtils.isLinux()) {
      return LinuxTestUtils.getExpectedCommands()
    } else if (PlatformUtils.isMacOS()) {
      return MacOSTestUtils.getExpectedCommands()
    } else if (PlatformUtils.isWindows()) {
      return WindowsTestUtils.getExpectedCommands()
    }
    return []
  }

  /**
   * 检查功能是否在当前平台上被支持
   */
  static isFeatureSupported(feature: string): boolean {
    if (PlatformUtils.isWindows()) {
      return !WindowsTestUtils.isFeatureUnsupported(feature)
    }
    // Linux和macOS通常支持大多数功能
    return true
  }
}

/**
 * 平台特定的测试数据生成器
 */
export class PlatformTestDataGenerator {
  /**
   * 生成平台特定的测试用例
   */
  static generatePlatformTestCases() {
    const platform = PlatformUtils.getCurrentPlatform()
    const platformName = PlatformUtils.getPlatformName()
    
    return {
      platform,
      platformName,
      expectedCommands: CrossPlatformValidator.getExpectedCommands(),
      supportedFeatures: {
        loadavg: CrossPlatformValidator.isFeatureSupported('loadavg'),
        uptime: CrossPlatformValidator.isFeatureSupported('uptime')
      },
      testConfig: {
        memoryTestTimeout: PlatformUtils.isWindows() ? 15000 : 10000,
        diskTestTimeout: PlatformUtils.isLinux() ? 8000 : 12000,
        networkTestTimeout: 10000
      }
    }
  }
}