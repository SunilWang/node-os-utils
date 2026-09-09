/**
 * Node.js 原生 ESM 入口。
 *
 * 主实现继续由 CommonJS 入口提供；这里仅统一 ESM 的默认导出语义，
 * 并由 TypeScript 生成对应的 `.mjs` 与 `.d.mts` 发布产物。
 */
export {
  AdapterFactory,
  CacheManager,
  CPUMonitor,
  DataSize,
  DiskMonitor,
  ErrorCode,
  MemoryMonitor,
  MonitorError,
  NetworkMonitor,
  OSUtils,
  ProcessMonitor,
  SystemMonitor,
  Timestamp,
  createOSUtils,
  name,
  version
} from './index.js';

export type * from './index.js';
export { OSUtils as default } from './index.js';
