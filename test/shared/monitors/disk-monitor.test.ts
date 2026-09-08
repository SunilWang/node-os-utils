import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

  it('挂载点均可访问时 ioErrors 应为 true', async () => {
    // 使用临时目录作为可访问的挂载点，不依赖真实系统状态
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-os-utils-test-'));
    try {
      const adapter = createDiskAdapter([
        { device: '/dev/sda1', mountPoint: tempDir, filesystem: 'ext4', options: 'rw' }
      ]);
      const result = await new DiskMonitor(adapter).healthCheck();

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.checks.ioErrors).to.be.true;
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('存在不可访问的挂载点时 ioErrors 应为 false 并记入 issues', async () => {
    const missingPath = path.join(os.tmpdir(), 'node-os-utils-definitely-not-exist');
    const adapter = createDiskAdapter([
      { device: '/dev/sdb1', mountPoint: missingPath, filesystem: 'ext4', options: 'rw' }
    ]);
    const result = await new DiskMonitor(adapter).healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.checks.ioErrors).to.be.false;
      expect(result.data.issues.join(' ')).to.include(`Mount point not accessible: ${missingPath}`);
      expect(result.data.status).to.equal('critical');
    }
  });

  it('配置排除的文件系统类型不参与可访问性检查', async () => {
    const missingPath = path.join(os.tmpdir(), 'node-os-utils-definitely-not-exist');
    const adapter = createDiskAdapter([
      // proc 在默认 excludeTypes 中，即使路径不可访问也不应误报
      { device: 'proc', mountPoint: missingPath, filesystem: 'proc', options: 'rw' }
    ]);
    const result = await new DiskMonitor(adapter).healthCheck();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.checks.ioErrors).to.be.true;
    }
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
