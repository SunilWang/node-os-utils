import { expect } from 'chai';

import { WindowsAdapter } from '../../../src/adapters/windows-adapter';
import { MonitorError, ErrorCode } from '../../../src/types/errors';

describe('WindowsAdapter 内部行为', () => {
  it('在 WMI 数据缺失 Size 时应限制磁盘占用不为负值', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;

    let callCount = 0;
    internal.executePowerShell = async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new MonitorError('psdrive failed', ErrorCode.COMMAND_FAILED, 'win32');
      }

      return [
        {
          DeviceID: 'C:',
          FileSystem: 'NTFS',
          FreeSpace: '1024'
        }
      ];
    };

    const disks = await adapter.getDiskInfo();
    expect(disks).to.have.lengthOf(1);
    expect(disks[0].mountPoint).to.equal('C:');
    expect(disks[0].used).to.equal(0);
    expect(disks[0].available).to.equal(1024);
    expect(disks[0].usagePercentage).to.equal(0);
  });

  it('在网络统计命令失败时应抛出 MonitorError', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;

    internal.executePowerShell = async () => {
      throw new MonitorError('stats failed', ErrorCode.COMMAND_FAILED, 'win32');
    };

    try {
      await adapter.getNetworkStats();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
    }
  });
});

describe('WindowsAdapter — Deno 兼容性降级', () => {
  describe('T007: getCPUInfo() — PowerShell 失败时降级到 os.cpus()', () => {
    it('应返回基于 os.cpus()/os.loadavg() 的有效非零 CPU 数据，而非抛出异常', async () => {
      const adapter = new WindowsAdapter();
      const internal = adapter as any;

      // stub executePowerShell 使其抛出异常（模拟 Deno 中 PowerShell 不可用）
      internal.executePowerShell = async () => {
        throw new MonitorError('PowerShell 不可用', ErrorCode.COMMAND_FAILED, 'win32');
      };

      // 不应抛出，应返回基于 os.cpus() 的数据
      const result = await adapter.getCPUInfo();

      expect(result).to.be.an('object');
      expect(result.cores).to.be.a('number').and.to.be.greaterThan(0);
      expect(result.model).to.be.a('string').and.to.have.length.greaterThan(0);
      expect(result.threads).to.be.a('number').and.to.be.greaterThan(0);
    });
  });
});

describe('WindowsAdapter — Deno 兼容性降级 (T021: US2)', () => {
  let adapter: WindowsAdapter;
  let internal: any;

  beforeEach(() => {
    adapter = new WindowsAdapter();
    internal = adapter as any;
    // stub executePowerShell 使所有 PowerShell 命令失败
    internal.executePowerShell = async () => {
      throw new MonitorError('PowerShell 不可用', ErrorCode.COMMAND_FAILED, 'win32');
    };
  });

  it('T021: getMemoryInfo() 应返回基于 os.totalmem()/os.freemem() 的有效内存数据', async () => {
    const result = await adapter.getMemoryInfo();
    expect(result).to.be.an('object');
    expect(result.total).to.be.a('number').and.to.be.greaterThan(0);
    expect(result.available).to.be.a('number').and.to.be.greaterThan(0);
    expect(result.used).to.be.a('number').and.to.be.at.least(0);
  });

  it('T021: getNetworkStats() 在命令失败时应抛出 MonitorError(COMMAND_FAILED)，不返回静默空数组', async () => {
    try {
      await adapter.getNetworkStats();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED);
    }
  });

  it('T021: getDiskInfo() 在命令失败时应抛出 MonitorError，不静默返回数据', async () => {
    try {
      await adapter.getDiskInfo();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
    }
  });

  it('T021: getProcessList() 在命令失败时应抛出 MonitorError(COMMAND_FAILED)，不静默返回数据', async () => {
    try {
      await adapter.getProcessList();
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
    }
  });
});
