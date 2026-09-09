import { expect } from 'chai';
import { promises as fs } from 'fs';

import { DiskMonitor } from '../../../src/monitors/disk-monitor';

const nodeFs = require('fs') as typeof import('fs');
const mutableNodeFs = nodeFs as any;

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

  it('应解析十六进制和十进制 ioerr_cnt', () => {
    const monitor = new DiskMonitor({} as any);
    const parse = (monitor as any).parseIOErrorCounter.bind(monitor);

    expect(parse('0x0')).to.equal(0);
    expect(parse('0x10')).to.equal(16);
    expect(parse('12')).to.equal(12);
    expect(parse('')).to.equal(null);
    expect(parse('1.5')).to.equal(null);
    expect(parse('invalid')).to.equal(null);
  });

  it('Linux 应异步汇总可读取的 ioerr_cnt', async () => {
    const originalReaddir = fs.readdir;
    const originalReadFile = fs.readFile;
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

    (fs as any).readdir = async () => ['sda', 'sdb'];
    (fs as any).readFile = async (path: string) => path.includes('sda') ? '0x2\n' : '0\n';

    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const result = await (new DiskMonitor({} as any) as any).checkIOErrors();

      expect(result).to.deep.equal({
        hasErrors: true,
        checked: true,
        issues: ['Disk I/O errors detected (ioerr_cnt total: 2)']
      });
    } finally {
      (fs as any).readdir = originalReaddir;
      (fs as any).readFile = originalReadFile;
      if (platformDescriptor) {
        Object.defineProperty(process, 'platform', platformDescriptor);
      }
    }
  });
});

describe('DiskMonitor healthCheck() ioErrors 检查', () => {
  function createDiskAdapter(mounts: any[]) {
    return {
      getPlatform: () => 'linux',
      isSupported: () => true,
      getDiskUsage: async () => ([
        { device: '/dev/sda1', mountPoint: '/', filesystem: 'ext4', total: 1000, used: 500, available: 500 }
      ]),
      getMounts: async () => mounts
    } as any;
  }

  it('不应主动访问挂载路径，避免远程挂载阻塞事件循环', async () => {
    const missingPath = '/node-os-utils-definitely-not-exist';
    const originalAccessSync = nodeFs.accessSync;
    let accessSyncCalls = 0;
    const adapter = createDiskAdapter([
      { device: '/dev/sdb1', mountPoint: missingPath, filesystem: 'ext4', options: 'rw' }
    ]);
    mutableNodeFs.accessSync = () => {
      accessSyncCalls += 1;
    };

    try {
      const result = await new DiskMonitor(adapter).healthCheck();

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.issues.join(' ')).not.to.include('Mount point not accessible');
      }
    } finally {
      mutableNodeFs.accessSync = originalAccessSync;
    }

    expect(accessSyncCalls).to.equal(0);
  });

  it('挂载点数据源不可用时保守保持 ioErrors 为 true', async () => {
    const adapter = {
      getPlatform: () => 'linux',
      isSupported: () => true,
      getDiskUsage: async () => ([
        { device: '/dev/sda1', mountPoint: '/', filesystem: 'ext4', total: 1000, used: 500, available: 500 }
      ]),
      getMounts: async () => { throw new Error('mounts unavailable'); }
    } as any;
    const result = await new DiskMonitor(adapter).healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      // 挂载点信息获取失败时，ioErrors 无可用数据源，应保守跳过（保持 true）
      expect(result.data.checks.ioErrors).to.be.true;
    }
  });
});
