import { expect } from 'chai';

import * as Types from '../../../src/types';

describe('类型聚合导出：types/index.ts', () => {
  it('暴露 ErrorCode 与 MonitorError', () => {
    expect(Types.ErrorCode).to.have.property('PLATFORM_NOT_SUPPORTED');
    expect(typeof Types.MonitorError).to.equal('function');
  });

  it('导出 DataSize 等常用类型', () => {
    expect(typeof Types.DataSize).to.equal('function');
    const size = new Types.DataSize(1024);
    expect(size.toKB()).to.equal(1);
  });
});
