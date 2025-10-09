import { expect } from 'chai';

import { DiskMonitor } from '../../../src/monitors/disk-monitor';

describe('DiskMonitor 数据转换', () => {
  it('应在指定挂载点配置下保留 mountPoint 字段的磁盘', () => {
    const monitor = new DiskMonitor({} as any);
    monitor.withMountPoints(['/data']);

    const result = (monitor as any).transformDiskUsage([
      {
        device: '/dev/sda1',
        mountPoint: '/data',
        filesystem: 'ext4',
        total: 1024,
        used: 512,
        available: 512
      },
      {
        device: '/dev/sdb1',
        mountPoint: '/mnt',
        filesystem: 'ext4',
        total: 2048,
        used: 1024,
        available: 1024
      }
    ]);

    expect(result).to.have.lengthOf(1);
    expect(result[0].mountpoint).to.equal('/data');
  });

  it('应使用 readSectors/writeSectors 计算 I/O 字节数', () => {
    const monitor = new DiskMonitor({} as any);

    const stats = (monitor as any).transformDiskStats([
      {
        device: 'sda',
        reads: 10,
        writes: 5,
        readSectors: 8,
        writeSectors: 4
      }
    ]);

    expect(stats).to.have.lengthOf(1);
    expect(stats[0].readBytes.toBytes()).to.equal(8 * 512);
    expect(stats[0].writeBytes.toBytes()).to.equal(4 * 512);
  });
});
