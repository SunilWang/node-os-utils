import os from 'os';

// 仅允许标准信号名称或十进制编号；此边界不得放宽为包含空白或 shell 元字符。
const NAMED_SIGNAL_PATTERN = /^(?:SIG)?[A-Z][A-Z0-9]*$/i;
const NUMERIC_SIGNAL_PATTERN = /^\d+$/;

/**
 * 判断进程 ID 是否可安全传递给系统进程 API。
 *
 * @param pid 待校验的运行时进程 ID
 * @returns 是否为安全整数；Unix 平台可继续使用 0 或负数表示进程组
 */
export function isValidProcessId(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isSafeInteger(pid);
}

/**
 * 判断进程 ID 是否为 Windows taskkill 可接受的正整数。
 *
 * @param pid 待校验的运行时进程 ID
 * @returns 是否为大于 0 的安全整数
 */
export function isValidPositiveProcessId(pid: unknown): pid is number {
  return isValidProcessId(pid) && pid > 0;
}

/**
 * 判断信号是否符合进程终止 API 支持的安全输入格式。
 *
 * @param signal 待校验的运行时信号名称或十进制编号
 * @returns 是否仅包含允许的信号字符
 */
export function isValidProcessSignal(signal: unknown): signal is string {
  if (typeof signal !== 'string') {
    return false;
  }

  if (signal.trim() !== signal) {
    return false;
  }

  if (NUMERIC_SIGNAL_PATTERN.test(signal)) {
    const numericSignal = Number(signal);
    return Number.isSafeInteger(numericSignal) && numericSignal >= 0;
  }

  return NAMED_SIGNAL_PATTERN.test(signal);
}

/**
 * 将兼容格式的信号转换为 Node.js 原生进程 API 接受的值。
 *
 * @param signal 待转换的信号名称或十进制编号
 * @returns 当前平台支持的信号；不支持时返回 null
 */
export function normalizeProcessSignal(signal: string): NodeJS.Signals | number | null {
  if (!isValidProcessSignal(signal)) {
    return null;
  }

  if (NUMERIC_SIGNAL_PATTERN.test(signal)) {
    return Number(signal);
  }

  const upperSignal = signal.toUpperCase();
  const normalizedSignal = upperSignal.startsWith('SIG') ? upperSignal : `SIG${upperSignal}`;
  const platformSignals = os.constants?.signals;

  if (!platformSignals || !Object.prototype.hasOwnProperty.call(platformSignals, normalizedSignal)) {
    return null;
  }

  return normalizedSignal as NodeJS.Signals;
}

/**
 * 不经过 shell，直接向指定进程发送信号。
 *
 * @param pid 目标进程 ID，必须为大于 0 的安全整数
 * @param signal 信号名称或十进制编号，默认 SIGTERM
 * @returns 信号发送成功时返回 true；参数非法、平台不支持或进程不存在时返回 false
 */
export function sendProcessSignal(pid: number, signal: string = 'SIGTERM'): boolean {
  if (!isValidPositiveProcessId(pid)) {
    return false;
  }

  const normalizedSignal = normalizeProcessSignal(signal);
  if (normalizedSignal === null) {
    return false;
  }

  try {
    return process.kill(pid, normalizedSignal);
  } catch {
    return false;
  }
}
