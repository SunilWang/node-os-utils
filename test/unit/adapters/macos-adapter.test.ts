import { expect } from 'chai';

import { MacOSAdapter } from '../../../src/adapters/macos-adapter';

describe('MacOSAdapter 内部解析逻辑', () => {
  it('应当将 RSS 转换为字节并保留内存百分比', () => {
    const adapter = new MacOSAdapter();
    const internal = adapter as any;

    const data = {
      summary: '123 1 20480 12.5 3.4 R user',
      command: '/usr/bin/example --flag',
      start: 'Mon Mar 11 10:00:00 2024'
    };

    const result = internal.parseProcessInfo(data, 123);

    expect(result.pid).to.equal(123);
    expect(result.ppid).to.equal(1);
    expect(result.command).to.equal('/usr/bin/example --flag');
    expect(result.memoryUsage).to.equal(20480 * 1024);
    expect(result.memoryPercentage).to.be.closeTo(3.4, 0.0001);
    expect(result.cpuUsage).to.be.closeTo(12.5, 0.0001);
    expect(result.state).to.equal('R');
  });
});
