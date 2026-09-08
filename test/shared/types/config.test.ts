import { expect } from 'chai';

import type {
  GlobalConfig,
  MonitorConfig,
  CPUConfig,
  MemoryConfig,
  DiskConfig,
  NetworkConfig,
  ProcessConfig,
  SystemConfig
} from '../../../src/types/config';

type AssertTrue<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// 编译期断言：子配置必须扩展基础配置
type _CPUConfigExtendsMonitor = AssertTrue<CPUConfig extends MonitorConfig ? true : false>;
type _MemoryConfigExtendsMonitor = AssertTrue<MemoryConfig extends MonitorConfig ? true : false>;
type _DiskConfigExtendsMonitor = AssertTrue<DiskConfig extends MonitorConfig ? true : false>;
type _NetworkConfigExtendsMonitor = AssertTrue<NetworkConfig extends MonitorConfig ? true : false>;
type _ProcessConfigExtendsMonitor = AssertTrue<ProcessConfig extends MonitorConfig ? true : false>;
type _SystemConfigExtendsMonitor = AssertTrue<SystemConfig extends MonitorConfig ? true : false>;

// 编译期断言：全局配置中的各项配置类型保持一致
type _GlobalCpuMatches = AssertTrue<Equal<NonNullable<GlobalConfig['cpu']>, CPUConfig>>;
type _GlobalMemoryMatches = AssertTrue<Equal<NonNullable<GlobalConfig['memory']>, MemoryConfig>>;
type _GlobalDiskMatches = AssertTrue<Equal<NonNullable<GlobalConfig['disk']>, DiskConfig>>;
type _GlobalNetworkMatches = AssertTrue<Equal<NonNullable<GlobalConfig['network']>, NetworkConfig>>;
type _GlobalProcessMatches = AssertTrue<Equal<NonNullable<GlobalConfig['process']>, ProcessConfig>>;
type _GlobalSystemMatches = AssertTrue<Equal<NonNullable<GlobalConfig['system']>, SystemConfig>>;

describe('类型定义：config.ts', () => {
  it('编译期断言通过即可视为成功', () => {
    expect(true).to.be.true;
  });
});
