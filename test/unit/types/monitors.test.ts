import { expect } from 'chai';

import type {
  CPUInfo,
  CacheInfo,
  CPUUsage,
  LoadAverage,
  MemoryInfo,
  MemoryPressure,
  SwapInfo,
  DiskInfo,
  DiskUsage,
  NetworkInterface,
  NetworkStats,
  ProcessInfo,
  SystemInfo
} from '../../../src/types/monitors';
import type { DataSize, Percentage, Frequency } from '../../../src/types/common';

type AssertTrue<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type _CPUInfoCacheMatches = AssertTrue<Equal<CPUInfo['cache'], CacheInfo>>;
type _CPUUsageOverallIsPercentage = AssertTrue<CPUUsage['overall'] extends Percentage ? true : false>;
type _CPUUsageCoresIsArray = AssertTrue<CPUUsage['cores'] extends Percentage[] ? true : false>;
type _LoadAverageShape = AssertTrue<Equal<keyof LoadAverage, 'load1' | 'load5' | 'load15'>>;
type _MemoryInfoTotalsAreDataSize = AssertTrue<MemoryInfo['total'] extends DataSize ? true : false>;
type _MemoryPressureLevelUnion = AssertTrue<MemoryPressure['level'] extends 'low' | 'medium' | 'high' | 'critical' ? true : false>;
type _SwapInfoTotalsAreDataSize = AssertTrue<SwapInfo['total'] extends DataSize ? true : false>;
type _DiskInfoUsageHasDataSize = AssertTrue<DiskInfo['total'] extends DataSize ? true : false>;
type _DiskUsagePercentageNumber = AssertTrue<DiskUsage['usagePercentage'] extends number ? true : false>;
type _NetworkStatsRatesAreDataSize = AssertTrue<NetworkStats['rxBytes'] extends DataSize ? true : false>;
type _ProcessInfoPidIsNumber = AssertTrue<ProcessInfo['pid'] extends number ? true : false>;
type _SystemInfoUptimeIsNumber = AssertTrue<SystemInfo['uptime'] extends number ? true : false>;
type _CPUInfoFrequenciesAreFrequency = AssertTrue<CPUInfo['baseFrequency'] extends Frequency ? true : false>;

describe('类型定义：monitors.ts', () => {
  it('编译期断言通过即可视为成功', () => {
    expect(true).to.be.true;
  });
});
