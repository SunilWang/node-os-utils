import { execFile } from 'child_process'
import { ensureMinimumTimeout } from './test-base'

/**
 * 直接查询 PowerShell，为适配器提供独立且有时间边界的交叉校验数据。
 *
 * @param {string} script PowerShell 管道前的查询脚本
 * @param {number} timeout 命令超时预算，默认 15 秒
 * @returns {Promise<T>} ConvertTo-Json 输出解析后的数据
 * @throws {Error} 命令失败或超时，保留子进程原始错误及诊断字段
 * @throws {SyntaxError} PowerShell 输出不是有效 JSON
 */
export async function queryPowerShell<T>(script: string, timeout = 15000): Promise<T> {
  const command = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script} | ConvertTo-Json -Depth 4 -Compress`
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout },
      (error, output, stderr) => {
        if (error) reject(Object.assign(error, { stdout: output, stderr }))
        else resolve(output)
      }
    )
  })
  // PowerShell 可能输出 UTF-8 BOM；仅移除编码标记，不修补无效 JSON。
  return JSON.parse(stdout.replace(/^\uFEFF/, '').trim()) as T
}

/**
 * 探测独立 PowerShell/CIM 基线，只将明确缺失或权限限制标记为不可用。
 *
 * @param {Mocha.Context} context 当前 before hook 上下文
 * @returns {Promise<boolean>} 基线成功返回 true，明确环境限制返回 false
 * @throws {Error} 超时、未知命令失败和解析错误继续使测试失败
 */
export async function probePowerShell(context: Mocha.Context): Promise<boolean> {
  ensureMinimumTimeout(context, 65000)
  try {
    await queryPowerShell('Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 Caption', 60000)
    return true
  } catch (error) {
    const commandError = error as NodeJS.ErrnoException & { killed?: boolean; stderr?: string }
    // 被终止的命令和无效 JSON 不能证明 PowerShell 不可用，必须保留原始失败。
    if (commandError?.killed || error instanceof SyntaxError) throw error
    const missingOrDenied = ['ENOENT', 'EACCES', 'EPERM'].includes(commandError?.code || '')
    const permissionDenied = /access is denied|permission denied|operation not permitted/i.test(commandError?.stderr || '')
    if (!missingOrDenied && !permissionDenied) throw error
    console.warn(`[real-command][powershell] 环境能力受限: ${commandError.message}`)
    return false
  }
}
