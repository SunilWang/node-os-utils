import { expect } from 'chai';

import { BasePlatformAdapter } from '../../../src/core/platform-adapter';
import { SupportedFeatures, CommandResult } from '../../../src/types/platform';
import { MonitorError } from '../../../src/types/errors';

class TestPlatformAdapter extends BasePlatformAdapter {
  constructor() {
    super('test');
  }

  protected initializeSupportedFeatures(): SupportedFeatures {
    return {
      cpu: { info: true, usage: true, temperature: false, frequency: false, cache: false, perCore: true, cores: true },
      memory: { info: true, usage: true, swap: false, pressure: false, detailed: false, virtual: false },
      disk: { info: true, io: false, health: false, smart: false, filesystem: false, usage: false, stats: false, mounts: false, filesystems: false },
      network: { interfaces: true, stats: true, connections: false, bandwidth: false, gateway: false },
      process: { list: true, details: false, tree: false, monitor: false, info: false, kill: false, openFiles: false, environment: false },
      system: { info: true, load: true, uptime: true, users: false, services: false }
    };
  }

  async executeCommand(command: string): Promise<CommandResult> {
    if (command === 'throw') {
      throw new Error('failed');
    }

    if (command === 'fail') {
      return {
        stdout: '',
        stderr: 'failed',
        exitCode: 1,
        platform: this.getPlatform(),
        executionTime: 5,
        command
      };
    }

    if (command === 'empty') {
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        platform: this.getPlatform(),
        executionTime: 1,
        command
      };
    }

    return {
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      platform: this.getPlatform(),
      executionTime: 1,
      command
    };
  }

  async readFile(): Promise<string> { return ''; }
  async fileExists(): Promise<boolean> { return true; }
  async getCPUInfo(): Promise<any> { return {}; }
  async getCPUUsage(): Promise<any> { return {}; }
  async getCPUTemperature(): Promise<any> { return {}; }
  async getMemoryInfo(): Promise<any> { return {}; }
  async getMemoryUsage(): Promise<any> { return {}; }
  async getDiskInfo(): Promise<any> { return {}; }
  async getDiskIO(): Promise<any> { return {}; }
  async getNetworkInterfaces(): Promise<any> { return {}; }
  async getNetworkStats(): Promise<any> { return {}; }
  async getProcesses(): Promise<any> { return []; }
  async getProcessInfo(): Promise<any> { return {}; }
  async getSystemInfo(): Promise<any> { return {}; }
  async getSystemLoad(): Promise<any> { return {}; }
  async getDiskUsage(): Promise<any> { return {}; }
  async getDiskStats(): Promise<any> { return {}; }
  async getMounts(): Promise<any> { return {}; }
  async getFileSystems(): Promise<any> { return {}; }
  async getNetworkConnections(): Promise<any> { return {}; }
  async getDefaultGateway(): Promise<any> { return {}; }
  async getProcessList(): Promise<any> { return []; }
  async killProcess(): Promise<boolean> { return true; }
  async getProcessOpenFiles(): Promise<string[]> { return []; }
  async getProcessEnvironment(): Promise<Record<string, string>> { return {}; }
  async getSystemUptime(): Promise<any> { return {}; }
  async getSystemUsers(): Promise<any> { return []; }
  async getSystemServices(): Promise<any> { return []; }

  safeExecutePublic(command: string) {
    return this.safeExecute(command);
  }

  validateCommandResultPublic(result: CommandResult) {
    return this.validateCommandResult(result, result.command);
  }

  convertToBytesPublic(value: string | number, unit?: string) {
    return this.convertToBytes(value, unit);
  }

  parseKeyValueOutputPublic(output: string, separator?: string) {
    return this.parseKeyValueOutput(output, separator);
  }

  parseTableOutputPublic(output: string, hasHeader?: boolean) {
    return this.parseTableOutput(output, hasHeader);
  }

  splitTableRowPublic(row: string) {
    return this.splitTableRow(row);
  }

  safeParseJSONPublic(data: string, fallback?: any) {
    return this.safeParseJSON(data, fallback);
  }

  safeParseNumberPublic(value: string | number, fallback?: number) {
    return this.safeParseNumber(value, fallback);
  }

  safeParseIntPublic(value: string | number, fallback?: number, radix?: number) {
    return this.safeParseInt(value, fallback, radix);
  }
}

describe('BasePlatformAdapter', () => {
  it('isSupported 根据 supportedFeatures 判断功能支持', () => {
    const adapter = new TestPlatformAdapter();
    expect(adapter.isSupported('cpu.info')).to.be.true;
    expect(adapter.isSupported('cpu.temperature')).to.be.false;
    expect(adapter.isSupported('memory.swap')).to.be.false;
  });

  it('getSupportedFeatures 返回浅拷贝', () => {
    const adapter = new TestPlatformAdapter();
    const features = adapter.getSupportedFeatures();
    const featuresAgain = adapter.getSupportedFeatures();

    expect(features).to.not.equal(featuresAgain);

    features.cpu = { ...features.cpu, info: false };

    expect(adapter.isSupported('cpu.info')).to.be.true;
  });

  it('safeExecute 会捕获执行异常并返回失败结果', async () => {
    const adapter = new TestPlatformAdapter();
    const result = await adapter.safeExecutePublic('throw');

    expect(result.exitCode).to.equal(1);
    expect(result.stderr).to.include('failed');
  });

  it('validateCommandResult 遇到非零退出码会抛出错误', () => {
    const adapter = new TestPlatformAdapter();

    expect(() => adapter.validateCommandResultPublic({
      stdout: '',
      stderr: 'failed',
      exitCode: 1,
      platform: 'test',
      executionTime: 1,
      command: 'fail'
    })).to.throw(MonitorError);
  });

  it('validateCommandResult 输出为空时抛出错误', () => {
    const adapter = new TestPlatformAdapter();

    expect(() => adapter.validateCommandResultPublic({
      stdout: '',
      stderr: '',
      exitCode: 0,
      platform: 'test',
      executionTime: 1,
      command: 'empty'
    })).to.throw(MonitorError);
  });

  it('convertToBytes 可以解析带单位的字符串', () => {
    const adapter = new TestPlatformAdapter();
    expect(adapter.convertToBytesPublic('1 GB')).to.equal(1024 * 1024 * 1024);
    expect(adapter.convertToBytesPublic(2, 'MB')).to.equal(2 * 1024 * 1024);
  });

  it('parseKeyValueOutput 能解析键值对文本', () => {
    const adapter = new TestPlatformAdapter();
    const result = adapter.parseKeyValueOutputPublic('Key: Value\nOther: Data');

    expect(result).to.deep.equal({ Key: 'Value', Other: 'Data' });
  });

  it('parseTableOutput 能按表头映射数据', () => {
    const adapter = new TestPlatformAdapter();
    const table = adapter.parseTableOutputPublic('NAME VALUE\nCPU 20\nMEM 30');

    expect(table).to.deep.equal([
      { NAME: 'CPU', VALUE: '20' },
      { NAME: 'MEM', VALUE: '30' }
    ]);
  });

  it('splitTableRow 可分割多空格分隔的行', () => {
    const adapter = new TestPlatformAdapter();
    expect(adapter.splitTableRowPublic('CPU   20   %')).to.deep.equal(['CPU', '20', '%']);
  });

  it('safeParseJSON 在解析失败时返回 fallback', () => {
    const adapter = new TestPlatformAdapter();
    expect(adapter.safeParseJSONPublic('not json', { ok: false })).to.deep.equal({ ok: false });
  });

  it('safeParseNumber 与 safeParseInt 按需返回默认值', () => {
    const adapter = new TestPlatformAdapter();
    expect(adapter.safeParseNumberPublic('12.5')).to.equal(12.5);
    expect(adapter.safeParseNumberPublic('bad', 3)).to.equal(3);
    expect(adapter.safeParseIntPublic('10', 0, 10)).to.equal(10);
    expect(adapter.safeParseIntPublic('zz', 7, 10)).to.equal(7);
  });
});
