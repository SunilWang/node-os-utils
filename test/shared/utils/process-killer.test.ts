import { expect } from 'chai';

import {
  isValidProcessId,
  isValidPositiveProcessId,
  isValidProcessSignal,
  sendProcessSignal
} from '../../../src/utils/process-killer';

describe('进程信号安全工具', () => {
  it('应仅接受安全的进程 ID 和信号格式', () => {
    expect(isValidProcessId(123)).to.be.true;
    expect(isValidProcessId(0)).to.be.true;
    expect(isValidProcessId(-123)).to.be.true;
    expect(isValidProcessId('123;unexpected')).to.be.false;
    expect(isValidPositiveProcessId(123)).to.be.true;
    expect(isValidPositiveProcessId(0)).to.be.false;
    expect(isValidPositiveProcessId(-123)).to.be.false;

    expect(isValidProcessSignal('TERM')).to.be.true;
    expect(isValidProcessSignal('SIGKILL')).to.be.true;
    expect(isValidProcessSignal('9')).to.be.true;
    expect(isValidProcessSignal('TERM;unexpected')).to.be.false;
    expect(isValidProcessSignal('TERM\n')).to.be.false;
  });

  it('应通过 Node.js 原生 API 发送规范化后的信号', () => {
    const originalKill = process.kill;
    const calls: Array<{ pid: number; signal?: string | number }> = [];

    (process as any).kill = (pid: number, signal?: string | number) => {
      calls.push({ pid, signal });
      return true;
    };

    try {
      expect(sendProcessSignal(123, 'TERM')).to.be.true;
      expect(sendProcessSignal(456, '9')).to.be.true;
      expect(calls).to.deep.equal([
        { pid: 123, signal: 'SIGTERM' },
        { pid: 456, signal: 9 }
      ]);
    } finally {
      (process as any).kill = originalKill;
    }
  });

  it('应在调用 Node.js 原生 API 前拒绝非法参数', () => {
    const originalKill = process.kill;
    let callCount = 0;

    (process as any).kill = () => {
      callCount += 1;
      return true;
    };

    try {
      expect(sendProcessSignal('123;unexpected' as unknown as number, 'TERM')).to.be.false;
      expect(sendProcessSignal(0, 'TERM')).to.be.false;
      expect(sendProcessSignal(-123, 'TERM')).to.be.false;
      expect(sendProcessSignal(123, 'TERM;unexpected')).to.be.false;
      expect(callCount).to.equal(0);
    } finally {
      (process as any).kill = originalKill;
    }
  });

  it('应将原生进程 API 的失败转换为 false', () => {
    const originalKill = process.kill;

    (process as any).kill = () => {
      throw new Error('process not found');
    };

    try {
      expect(sendProcessSignal(99999, 'SIGTERM')).to.be.false;
    } finally {
      (process as any).kill = originalKill;
    }
  });
});
