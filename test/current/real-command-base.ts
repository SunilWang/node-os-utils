import { expect } from 'chai'
import * as os from 'os'
import { ErrorCode, MonitorError } from '../../src/types/errors'
import { CommandExecutor } from '../../src/utils/command-executor'

/**
 * 真实平台命令测试公共辅助方法。
 *
 * 这些测试只在对应操作系统执行，不通过 mock 伪造系统命令输出。
 */
export class RealCommandTestBase {
  /** 当前 Node.js 平台。 */
  static platform(): NodeJS.Platform {
    return os.platform()
  }

  /** 在非目标平台跳过当前测试套件。 */
  static requirePlatform(context: Mocha.Context, platform: NodeJS.Platform): void {
    if (os.platform() !== platform) context.skip()
  }

  /**
   * 验证当前真实测试依赖的最小命令能力。
   *
   * @param context Mocha 测试上下文
   * @returns 命令可执行时正常返回；明确的环境限制时跳过当前套件
   */
  static async requireRuntimeBaseline(context: Mocha.Context, commandByPlatform?: Partial<Record<NodeJS.Platform, string>>): Promise<void> {
    const defaultCommands: Record<string, string> = {
      linux: 'cat /proc/cpuinfo',
      darwin: 'sysctl -n hw.logicalcpu',
      win32: 'powershell -NoProfile -Command "Get-CimInstance Win32_OperatingSystem | Out-Null"'
    }
    const command = commandByPlatform?.[this.platform()] || defaultCommands[this.platform()]
    if (!command) {
      context.skip()
      return
    }

    try {
      await new CommandExecutor(this.platform()).execute(command, { timeout: 5000 })
    } catch (error) {
      this.skipForEnvironmentalError(context, error)
    }
  }

  /** 断言非负有限数值。 */
  static assertNonNegative(value: unknown, label: string): void {
    expect(value, label).to.be.a('number')
    expect(Number.isFinite(value), label).to.be.true
    expect(value as number, label).to.be.at.least(0)
  }

  /** 断言百分比在公共 API 约定范围内。 */
  static assertPercentage(value: unknown, label: string): void {
    this.assertNonNegative(value, label)
    expect(value as number, label).to.be.at.most(100)
  }

  /** 断言 MonitorResult 成功并返回其数据。 */
  static unwrap<T>(result: any, label = '真实命令调用'): T {
    if (!result?.success) {
      const error = result?.error
      throw new Error(`${label}失败: ${error?.message || String(error)}`)
    }
    return result.data as T
  }

  /** 判断错误是否属于环境能力限制，可用于精确跳过。 */
  static isEnvironmentalError(error: unknown): boolean {
    if (!(error instanceof MonitorError)) return false
    if (error.code === ErrorCode.PERMISSION_DENIED ||
      error.code === ErrorCode.PLATFORM_NOT_SUPPORTED ||
      error.code === ErrorCode.NOT_AVAILABLE) {
      return true
    }

    // 只有明确能证明“命令不存在”时才允许跳过；泛化的 COMMAND_FAILED
    // 和 TIMEOUT 可能掩盖实现回归、死锁或输出解析错误，必须继续失败。
    if (error.code !== ErrorCode.COMMAND_FAILED) return false

    const diagnostic = [error.message, error.details?.stderr, error.details?.code]
      .filter(Boolean)
      .join(' ')
    return error.details?.code === 'ENOENT' ||
      /command not found|not recognized as an internal or external command|permission denied|operation not permitted|access is denied|diskmanagement framework/i.test(diagnostic)
  }

  /** 将环境能力限制转换为 Mocha skip，其余错误继续抛出。 */
  static skipForEnvironmentalError(context: Mocha.Context, error: unknown): void {
    if (this.isEnvironmentalError(error)) {
      const monitorError = error as MonitorError
      context.test?.title && console.warn(
        `[real-command][skip] ${context.test.title}: ${monitorError.code} ${monitorError.message}`
      )
      context.skip()
      return
    }
    throw error
  }
}
