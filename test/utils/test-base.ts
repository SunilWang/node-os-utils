/**
 * 测试基础工具类
 * 提供跨平台的测试工具函数和平台检测功能
 */

import * as os from 'os'
import { expect } from 'chai'

/**
 * 平台检测工具类
 */
export class PlatformUtils {
  /**
   * 检查是否为Linux系统
   */
  static isLinux(): boolean {
    return os.platform() === 'linux'
  }

  /**
   * 检查是否为macOS系统
   */
  static isMacOS(): boolean {
    return os.platform() === 'darwin'
  }

  /**
   * 检查是否为Windows系统
   */
  static isWindows(): boolean {
    return os.platform() === 'win32'
  }

  /**
   * 获取当前平台
   */
  static getCurrentPlatform(): string {
    return os.platform()
  }

  /**
   * 获取平台友好名称
   */
  static getPlatformName(): string {
    const platform = os.platform()
    switch (platform) {
      case 'linux': return 'Linux'
      case 'darwin': return 'macOS'
      case 'win32': return 'Windows'
      default: return platform
    }
  }
}

/**
 * 测试验证工具类
 */
export class TestValidators {
  /**
   * 检查是否为有效的数字
   */
  static isValidNumber(num: any): boolean {
    return typeof num === 'number' && !isNaN(num) && isFinite(num)
  }

  /**
   * 检查是否为有效的百分比 (0-100)
   */
  static isValidPercentage(num: any): boolean {
    return this.isValidNumber(num) && num >= 0 && num <= 100
  }

  /**
   * 检查是否为正数
   */
  static isPositiveNumber(num: any): boolean {
    return this.isValidNumber(num) && num >= 0
  }

  /**
   * 检查是否为非空字符串
   */
  static isNonEmptyString(str: any): boolean {
    return typeof str === 'string' && str.length > 0
  }

  /**
   * 检查是否为有效的数组
   */
  static isValidArray(arr: any): boolean {
    return Array.isArray(arr)
  }

  /**
   * 检查是否为有效的对象
   */
  static isValidObject(obj: any): boolean {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
  }
}

/**
 * 测试配置类
 */
export class TestConfig {
  /**
   * 默认超时时间
   */
  static readonly DEFAULT_TIMEOUT = 10000

  /**
   * 长时间运行测试的超时时间
   */
  static readonly LONG_TIMEOUT = 30000

  /**
   * 性能测试的最大执行时间
   */
  static readonly PERF_MAX_DURATION = 5000

  /**
   * 内存测试的最大内存增长(MB)
   */
  static readonly MAX_MEMORY_INCREASE_MB = 10
}

/**
 * 异步测试装饰器
 */
export function asyncTest(testFn: Function) {
  return async function(this: Mocha.Context) {
    this.timeout(TestConfig.DEFAULT_TIMEOUT)
    await testFn.call(this)
  }
}

/**
 * 长时间测试装饰器
 */
export function longTest(testFn: Function) {
  return async function(this: Mocha.Context) {
    this.timeout(TestConfig.LONG_TIMEOUT)
    await testFn.call(this)
  }
}

/**
 * 平台条件测试装饰器
 */
export function platformTest(platforms: string[], testFn: Function) {
  return function(this: Mocha.Context) {
    const currentPlatform = os.platform()
    if (!platforms.includes(currentPlatform)) {
      this.skip()
      return
    }
    return testFn.call(this)
  }
}

/**
 * 跳过特定平台的测试装饰器
 */
export function skipOnPlatform(platforms: string[], testFn: Function) {
  return function(this: Mocha.Context) {
    const currentPlatform = os.platform()
    if (platforms.includes(currentPlatform)) {
      this.skip()
      return
    }
    return testFn.call(this)
  }
}

/**
 * 测试数据验证助手
 */
export class TestAssertions {
  /**
   * 断言系统信息对象的有效性
   */
  static assertSystemInfo(info: any, requiredFields: string[]): void {
    expect(info).to.be.an('object')

    for (const field of requiredFields) {
      // 检查属性是否存在
      expect(info).to.have.property(field)
      // 检查字段值是否为有效数字字符串或数字
      const value = info[field]
      if (typeof value === 'string') {
        expect(TestValidators.isValidNumber(parseFloat(value))).to.be.true
        expect(parseFloat(value)).to.be.at.least(0, `${field} should be non-negative`)
      } else if (typeof value === 'number') {
        expect(TestValidators.isValidNumber(value)).to.be.true
        expect(value).to.be.at.least(0, `${field} should be non-negative`)
      } else {
        expect.fail(`${field} should be a number or numeric string, got ${typeof value}: ${value}`)
      }
    }
  }

  /**
   * 断言百分比字段的有效性
   */
  static assertPercentageFields(info: any, percentageFields: string[]): void {
    for (const field of percentageFields) {
      const value = parseFloat(info[field])
      expect(TestValidators.isValidPercentage(value)).to.be.true
    }
  }

  /**
   * 断言内存信息的一致性
   */
  static assertMemoryConsistency(info: any): void {
    const used = parseFloat(info.usedMemMb || info.usedGb)
    const free = parseFloat(info.freeMemMb || info.freeGb)
    const total = parseFloat(info.totalMemMb || info.totalGb)
    const usedPercentage = parseFloat(info.usedMemPercentage || info.usedPercentage)
    const freePercentage = parseFloat(info.freeMemPercentage || info.freePercentage)

    // 验证总和关系 - 增加容差以处理浮点数精度问题
    expect(Math.abs((used + free) - total)).to.be.lessThan(2, 'Used + Free should approximately equal Total')
    expect(Math.abs((usedPercentage + freePercentage) - 100)).to.be.lessThan(2, 'Percentages should sum to approximately 100')
  }

  /**
   * 断言网络统计信息的有效性
   */
  static assertNetworkStats(stats: any[]): void {
    expect(stats).to.be.an('array')

    for (const stat of stats) {
      expect(stat).to.have.property('interface')
      expect(stat).to.have.property('inputBytes')
      expect(stat).to.have.property('outputBytes')

      expect(TestValidators.isNonEmptyString(stat.interface)).to.be.true
      expect(TestValidators.isValidNumber(parseInt(stat.inputBytes))).to.be.true
      expect(TestValidators.isValidNumber(parseInt(stat.outputBytes))).to.be.true
      expect(parseInt(stat.inputBytes)).to.be.at.least(0)
      expect(parseInt(stat.outputBytes)).to.be.at.least(0)
    }
  }
}

/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private startTime: number
  private startMemory: number
  private timings: { [key: string]: number } = {}

  constructor() {
    this.startTime = Date.now()
    this.startMemory = process.memoryUsage().heapUsed
  }

  /**
   * 获取执行时间(毫秒)
   */
  getExecutionTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * 获取内存使用增长(字节)
   */
  getMemoryIncrease(): number {
    return process.memoryUsage().heapUsed - this.startMemory
  }

  /**
   * 验证性能是否在可接受范围内
   */
  assertPerformance(maxTimeMs: number = TestConfig.PERF_MAX_DURATION): void {
    const executionTime = this.getExecutionTime()
    expect(executionTime).to.be.lessThan(maxTimeMs,
      `Execution time ${executionTime}ms exceeded maximum ${maxTimeMs}ms`)
  }

  /**
   * 验证内存使用是否在可接受范围内
   */
  assertMemoryUsage(maxIncreaseMB: number = TestConfig.MAX_MEMORY_INCREASE_MB): void {
    const memoryIncrease = this.getMemoryIncrease()
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024)
    expect(memoryIncreaseMB).to.be.lessThan(maxIncreaseMB,
      `Memory increase ${memoryIncreaseMB.toFixed(2)}MB exceeded maximum ${maxIncreaseMB}MB`)
  }

  /**
   * 计时方法 - 执行函数并记录执行时间
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now()
    const result = await fn()
    const end = Date.now()
    this.timings[label] = end - start
    return result
  }

  /**
   * 获取所有计时报告
   */
  getReport(): { [key: string]: number } {
    return { ...this.timings }
  }

  /**
   * 重置所有计时记录
   */
  reset(): void {
    this.timings = {}
    this.startTime = Date.now()
    this.startMemory = process.memoryUsage().heapUsed
  }
}
