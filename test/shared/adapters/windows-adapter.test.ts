import { expect } from 'chai';
import os from 'os';

import { WindowsAdapter } from '../../../src/adapters/windows-adapter';
import { DiskMonitor } from '../../../src/monitors/disk-monitor';
import { MonitorError, ErrorCode } from '../../../src/types/errors';

describe('WindowsAdapter 内部行为', () => {
  it('应按 DMTF 日期中的时区偏移解析进程启动时间', () => {
    const adapter = new WindowsAdapter();
    const parse = (adapter as any).parseWmiDate.bind(adapter);
    // +480 表示本地时间领先 UTC 8 小时。
    expect(parse('20240101120000.000000+480')).to.equal(Date.UTC(2024, 0, 1, 4, 0, 0));
    expect(parse('20240101120000.123456-360')).to.equal(Date.UTC(2024, 0, 1, 18, 0, 0, 123));
  });

  it('应解析 PowerShell 5.1 ConvertTo-Json 的 \\/Date(毫秒)\\/ 格式', () => {
    const adapter = new WindowsAdapter();
    const parse = (adapter as any).parseWmiDate.bind(adapter);
    const creationDate = JSON.parse('{"CreationDate":"\\/Date(1704110400000)\\/"}').CreationDate;

    expect(creationDate).to.equal('/Date(1704110400000)/');
    expect(parse(creationDate)).to.equal(1704110400000);
    expect(parse('\\/Date(1704110400000)\\/')).to.equal(1704110400000);
  });

  it('应解析 PowerShell 7 的 ISO 8601 日期格式', () => {
    const adapter = new WindowsAdapter();
    const parse = (adapter as any).parseWmiDate.bind(adapter);
    expect(parse('2024-01-01T12:00:00+08:00')).to.equal(Date.UTC(2024, 0, 1, 4, 0, 0));
    expect(parse('2024-01-01T04:00:00Z')).to.equal(Date.UTC(2024, 0, 1, 4, 0, 0));
  });

  it('无法识别的日期格式应返回 0，而不是用当前时间冒充', () => {
    const adapter = new WindowsAdapter();
    const parse = (adapter as any).parseWmiDate.bind(adapter);
    expect(parse(undefined)).to.equal(0);
    expect(parse('')).to.equal(0);
    expect(parse('not-a-date')).to.equal(0);
  });

  it('getNetworkInterfaces() 应归一化为与 Linux/macOS 一致的数组结构', async () => {
    const adapter = new WindowsAdapter();
    const originalNetworkInterfaces = os.networkInterfaces;

    (os as any).networkInterfaces = () => ({
      'Ethernet': [
        { address: '192.168.1.10', netmask: '255.255.255.0', family: 'IPv4', mac: 'aa:bb:cc:dd:ee:ff', internal: false, cidr: '192.168.1.10/24' },
        { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: 'aa:bb:cc:dd:ee:ff', internal: false, cidr: 'fe80::1/64', scopeid: 12 }
      ],
      'Loopback Pseudo-Interface 1': [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }
      ]
    });

    try {
      const result = await adapter.getNetworkInterfaces();

      expect(result).to.be.an('array').with.lengthOf(2);

      const ethernet = result.find((iface: any) => iface.name === 'Ethernet');
      expect(ethernet).to.exist;
      expect(ethernet.mac).to.equal('aa:bb:cc:dd:ee:ff');
      expect(ethernet.state).to.equal('up');
      expect(ethernet.internal).to.be.false;
      expect(ethernet.addresses).to.have.lengthOf(2);
      expect(ethernet.addresses[0]).to.include({
        address: '192.168.1.10',
        netmask: '255.255.255.0',
        family: 'IPv4',
        internal: false
      });
      expect(ethernet.addresses[1].scopeid).to.equal(12);

      const loopback = result.find((iface: any) => iface.name === 'Loopback Pseudo-Interface 1');
      expect(loopback).to.exist;
      expect(loopback.internal).to.be.true;
    } finally {
      (os as any).networkInterfaces = originalNetworkInterfaces;
    }
  });

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

  it('Get-PSDrive 超时后不应继续启动 CIM fallback', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;
    let callCount = 0;

    internal.executePowerShell = async () => {
      callCount += 1;
      throw new MonitorError('PowerShell timeout', ErrorCode.TIMEOUT, 'win32');
    };

    try {
      await adapter.getDiskInfo();
      expect.fail('超时后应直接失败');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.code).to.equal(ErrorCode.TIMEOUT);
    }
    expect(callCount).to.equal(1);
  });

  it('监控层先超时后，迟到的 Get-PSDrive 超时仍不应启动 CIM fallback', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;
    let rejectCommand: ((reason: MonitorError) => void) | undefined;
    let callCount = 0;

    internal.executePowerShell = () => {
      callCount += 1;
      return new Promise((_, reject) => {
        rejectCommand = reject;
      });
    };

    const monitor = new DiskMonitor(adapter, {
      cacheEnabled: false,
      timeout: 1
    });
    const result = await monitor.info();

    expect(result.success).to.equal(false);
    if (!result.success) {
      expect(result.error.code).to.equal(ErrorCode.TIMEOUT);
    }

    rejectCommand?.(new MonitorError('PowerShell timeout', ErrorCode.TIMEOUT, 'win32'));
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(callCount).to.equal(1);
    monitor.destroy();
  });

  it('CIM fallback 超时应保留 TIMEOUT 错误类型', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;
    let callCount = 0;

    internal.executePowerShell = async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new MonitorError('Get-PSDrive failed', ErrorCode.COMMAND_FAILED, 'win32');
      }
      throw new MonitorError('CIM timeout', ErrorCode.TIMEOUT, 'win32');
    };

    try {
      await adapter.getDiskInfo();
      expect.fail('CIM 超时后应直接失败');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.code).to.equal(ErrorCode.TIMEOUT);
    }
    expect(callCount).to.equal(2);
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

  it('killProcess 应在拼接 taskkill 命令前拒绝运行时非法 PID', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;
    const commands: string[] = [];
    let powerShellCallCount = 0;

    internal.executeCommand = async (command: string) => {
      commands.push(command);
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        platform: 'win32',
        executionTime: 0,
        command
      };
    };
    internal.executePowerShell = async () => {
      powerShellCallCount += 1;
      return null;
    };

    const result = await adapter.killProcess('123&unexpected' as unknown as number, 'SIGTERM');
    const processInfo = await adapter.getProcessInfo('123&unexpected' as unknown as number);

    expect(result).to.be.false;
    expect(processInfo).to.be.null;
    expect(commands).to.be.empty;
    expect(powerShellCallCount).to.equal(0);
  });

  it('killProcess 应保留合法 PID 并规范化强制终止信号', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;
    const commands: string[] = [];

    internal.executeCommand = async (command: string) => {
      commands.push(command);
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        platform: 'win32',
        executionTime: 0,
        command
      };
    };

    expect(await adapter.killProcess(123, 'SIGTERM')).to.be.true;
    expect(await adapter.killProcess(456, 'KILL')).to.be.true;
    expect(await adapter.killProcess(789, 'NOT_A_REAL_SIGNAL')).to.be.false;
    expect(commands).to.deep.equal([
      'taskkill /PID 123',
      'taskkill /PID 456 /F'
    ]);
  });

  it('getProcessInfo 应使用不含嵌套双引号的 PowerShell 过滤条件', async () => {
    const adapter = new WindowsAdapter();
    const internal = adapter as any;
    let script = '';

    internal.executePowerShell = async (command: string) => {
      script = command;
      return {
        ProcessId: 123,
        ParentProcessId: 1,
        Name: 'node.exe',
        CommandLine: 'node.exe app.js',
        WorkingSetSize: 1024
      };
    };

    const result = await adapter.getProcessInfo(123);

    expect(result.pid).to.equal(123);
    expect(script).to.include("-Filter 'ProcessId = 123'");
    expect(script).to.not.include('-Filter "ProcessId = 123"');
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

describe('WindowsAdapter 超时传播', () => {
  for (const method of ['getDefaultGateway', 'getSystemServices'] as const) {
    it(`${method} 超时应原样抛出，不能转换为空值或平台不支持`, async () => {
      const adapter = new WindowsAdapter();
      const timeout = new MonitorError('PowerShell timeout', ErrorCode.TIMEOUT, 'win32', {
        command: method, executionTime: 1001
      });
      (adapter as any).executePowerShell = async () => { throw timeout; };

      let caught: unknown;
      try {
        await adapter[method]();
      } catch (error) {
        caught = error;
      }
      expect(caught).to.equal(timeout);
    });
  }

  it('非超时失败仍应保留网关和服务的既有降级行为', async () => {
    const adapter = new WindowsAdapter();
    (adapter as any).executePowerShell = async () => {
      throw new MonitorError('PowerShell unavailable', ErrorCode.COMMAND_FAILED, 'win32');
    };

    expect(await adapter.getDefaultGateway()).to.equal(null);
    let caught: unknown;
    try {
      await adapter.getSystemServices();
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(MonitorError);
    expect((caught as MonitorError).code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED);
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
      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED);
    }
  });

  it('getProcessInfo() 在命令失败时应保留原始错误类型', async () => {
    try {
      await adapter.getProcessInfo(123);
      expect.fail('应该抛出 MonitorError');
    } catch (error: any) {
      expect(error).to.be.instanceOf(MonitorError);
      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED);
    }
  });
});
