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

  it('在网络统计命令失败时应回退为空结果', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;

    internal.executePowerShell = async () => {
      throw new MonitorError('stats failed', ErrorCode.COMMAND_FAILED, 'win32');
    };

    const stats = await adapter.getNetworkStats();
    expect(stats).to.deep.equal([]);
  });
});
