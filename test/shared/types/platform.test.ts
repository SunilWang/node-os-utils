import { expect } from 'chai';

import type {
  PlatformAdapter,
  CommandResult,
  SupportedFeatures,
  LinuxCommands,
  MacOSCommands,
  WindowsCommands,
  PlatformPaths
} from '../../../src/types/platform';

type AssertTrue<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type AdapterExecuteReturn = ReturnType<PlatformAdapter['executeCommand']>;
type AdapterFileExistsReturn = ReturnType<PlatformAdapter['fileExists']>;
type AdapterKillProcessReturn = ReturnType<PlatformAdapter['killProcess']>;

type _ExecuteCommandReturnsPromise = AssertTrue<AdapterExecuteReturn extends Promise<CommandResult> ? true : false>;
type _FileExistsReturnsPromiseBoolean = AssertTrue<AdapterFileExistsReturn extends Promise<boolean> ? true : false>;
type _KillProcessReturnsPromiseBoolean = AssertTrue<AdapterKillProcessReturn extends Promise<boolean> ? true : false>;

type _SupportedFeaturesCpuKeys = AssertTrue<Equal<keyof SupportedFeatures['cpu'], 'info' | 'usage' | 'temperature' | 'frequency' | 'cache' | 'perCore' | 'cores'>>;
type _SupportedFeaturesMemoryKeys = AssertTrue<Equal<keyof SupportedFeatures['memory'], 'info' | 'usage' | 'swap' | 'pressure' | 'detailed' | 'virtual'>>;
type _SupportedFeaturesSystemKeys = AssertTrue<Equal<keyof SupportedFeatures['system'], 'info' | 'load' | 'uptime' | 'users' | 'services'>>;

type _LinuxCommandsKeys = AssertTrue<Equal<keyof LinuxCommands, 'cpuInfo' | 'cpuUsage' | 'memoryInfo' | 'diskInfo' | 'diskIO' | 'networkInterfaces' | 'networkStats' | 'processes' | 'systemInfo' | 'loadAverage' | 'temperature'>>;
type _MacOSCommandsKeys = AssertTrue<Equal<keyof MacOSCommands, 'cpuInfo' | 'cpuUsage' | 'memoryInfo' | 'diskInfo' | 'diskIO' | 'networkInterfaces' | 'networkStats' | 'processes' | 'systemInfo' | 'loadAverage' | 'temperature' | 'vmStat' | 'sysctl'>>;
type _WindowsCommandsKeys = AssertTrue<Equal<keyof WindowsCommands, 'cpuInfo' | 'cpuUsage' | 'memoryInfo' | 'diskInfo' | 'diskIO' | 'networkInterfaces' | 'networkStats' | 'processes' | 'systemInfo' | 'loadAverage' | 'temperature'>>;

type _PlatformPathsOptionalKeys = AssertTrue<keyof PlatformPaths extends 'cpuInfo' | 'memInfo' | 'diskStats' | 'netStats' | 'loadavg' | 'uptime' | 'procDir' | 'sysDir' | 'thermalDir' ? true : false>;

describe('类型定义：platform.ts', () => {
  it('编译期断言通过即可视为成功', () => {
    expect(true).to.be.true;
  });
});
