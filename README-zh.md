# node-os-utils v2.0

[![NPM 版本][npm-image]][npm-url]
[![NPM 下载量][downloads-image]][downloads-url]
[![TypeScript 支持](https://img.shields.io/badge/typescript-supported-blue.svg)](https://www.typescriptlang.org/)
[![Node.js 版本](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![许可证: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🚀 **版本 2.0** - 流行的 Node.js 操作系统监控库的完全重写版本。

**现代化的、TypeScript 原生的跨平台系统监控库**，提供全面的系统信息收集功能，具备智能缓存、事件驱动监控和强大的错误处理机制。

> **重大变更**: 这是一个包含破坏性变更的主要版本发布，与 v1.x 不兼容。请参阅[迁移指南](#-从-v1x-迁移到-20)获取升级说明。

## ✨ v2.0 新特性

### 🎯 核心改进
- **🔧 TypeScript 优先**: 使用严格类型的完全重写版本
- **🏗️ 现代架构**: 使用适配器模式的清洁、模块化设计
- **⚡ 性能优化**: 带 TTL 管理的智能缓存系统
- **🛡️ 强大错误处理**: 具有详细错误码的一致错误处理
- **🔄 事件驱动**: 具有订阅管理的实时监控
- **📊 丰富数据类型**: 具有单位转换的全面数据结构

### 🌟 关键特性
- **🌍 跨平台**: Linux、macOS、Windows 支持，具有智能平台适配
- **📝 零依赖**: 仅使用内置模块的纯 Node.js 实现
- **⚙️ 可配置**: 缓存、超时和监控的灵活配置系统
- **🎯 类型安全**: 完整的 TypeScript 定义，支持 IntelliSense
- **🔍 全面**: CPU、内存、磁盘、网络、进程和系统监控
- **📈 实时**: 具有可自定义间隔的事件驱动监控

## 🚀 安装

```bash
npm install node-os-utils
```

**系统要求:**
- Node.js 18.0.0 或更高版本
- 支持的操作系统: Linux、macOS、Windows

## 🏁 快速开始

### TypeScript

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils();

// 获取 CPU 使用率
const cpuUsage = await osutils.cpu.usage();
if (cpuUsage.success) {
  console.log('CPU 使用率:', cpuUsage.data + '%');
}

// 获取内存信息
const memInfo = await osutils.memory.info();
if (memInfo.success) {
  console.log('内存:', memInfo.data);
}

// 获取系统概览
const overview = await osutils.overview();
console.log('系统概览:', overview);
```

### JavaScript (CommonJS)

```javascript
const { OSUtils } = require('node-os-utils');

const osutils = new OSUtils();

osutils.cpu.usage().then(result => {
  if (result.success) {
    console.log('CPU 使用率:', result.data + '%');
  }
});
```

### 替代工厂函数

```javascript
// 替代实例化方法
const { createOSUtils } = require('node-os-utils');

const osutils = createOSUtils({
  cacheEnabled: true,
  cacheTTL: 10000
});

// 与 OSUtils 类相同的 API
const cpuUsage = await osutils.cpu.usage();
```

## ⚙️ 配置

### 全局配置

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils({
  // 缓存设置
  cacheEnabled: true,
  cacheTTL: 5000,
  maxCacheSize: 1000,

  // 执行设置
  timeout: 10000,

  // 调试模式
  debug: false,

  // 监控器特定配置
  cpu: { cacheTTL: 30000 },
  memory: { cacheTTL: 5000 },
  disk: { cacheTTL: 60000 }
});
```

### 监控器级别配置

```typescript
// 配置单个监控器
const cpuMonitor = osutils.cpu
  .withCaching(true, 30000)
  .withConfig({ timeout: 5000 });

// 运行时配置缓存
osutils.configureCache({
  enabled: true,
  maxSize: 2000,
  defaultTTL: 10000
});
```

## 🛡️ 错误处理

所有操作都返回 `MonitorResult<T>` 对象，以保证一致的错误处理：

```typescript
interface MonitorResult<T> {
  success: boolean;
  data?: T;
  error?: MonitorError;
  platform: string;
  timestamp: Date;
  cached?: boolean;
}
```

### 错误处理示例

```typescript
const result = await osutils.cpu.info();

if (result.success) {
  // 成功：使用 result.data
  console.log('CPU 型号:', result.data.model);
  console.log('核心数:', result.data.cores);
} else {
  // 错误：优雅处理
  console.error('错误:', result.error?.message);
  console.error('错误代码:', result.error?.code);

  // 平台特定处理
  if (result.error?.code === ErrorCode.PLATFORM_NOT_SUPPORTED) {
    console.log('此功能在', result.platform, '上不可用');
  }
}
```

### 错误代码

```typescript
enum ErrorCode {
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED',
  COMMAND_FAILED = 'COMMAND_FAILED',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  CACHE_ERROR = 'CACHE_ERROR'
}
```

## 📂 完整 API 参考

### 🔥 CPU 监控器

全面的 CPU 监控，具有实时功能。

```typescript
// 基本 CPU 信息
const cpuInfo = await osutils.cpu.info();
if (cpuInfo.success) {
  console.log('型号:', cpuInfo.data.model);
  console.log('核心数:', cpuInfo.data.cores);
  console.log('架构:', cpuInfo.data.architecture);
}

// CPU 使用率监控
const cpuUsage = await osutils.cpu.usage();
if (cpuUsage.success) {
  console.log('CPU 使用率:', cpuUsage.data + '%');
}

// 负载平均值（Linux/macOS）
const loadAvg = await osutils.cpu.loadAverage();
if (loadAvg.success) {
  console.log('负载平均值:', loadAvg.data);
}
```

#### CPU 方法

| 方法 | 返回类型 | 描述 | 平台支持 |
|--------|-------------|-------------|------------------|
| `info()` | `Promise<MonitorResult<CPUInfo>>` | CPU 型号、核心、线程、架构 | ✅ 全部 |
| `usage(interval?)` | `Promise<MonitorResult<number>>` | CPU 使用率百分比 (0-100) | ✅ 全部 |
| `free(interval?)` | `Promise<MonitorResult<number>>` | CPU 空闲百分比 (0-100) | ✅ 全部 |
| `loadAverage()` | `Promise<MonitorResult<LoadAverage>>` | 负载平均值 (1, 5, 15 分钟) | ✅ Linux/macOS |
| `temperature()` | `Promise<MonitorResult<Temperature>>` | CPU 温度传感器 | ⚠️ 有限 |
| `frequency()` | `Promise<MonitorResult<FrequencyInfo>>` | 当前 CPU 频率 | ⚠️ 有限 |

#### 实时 CPU 监控

```typescript
// 使用自定义间隔监控 CPU 使用率
const cpuSubscription = osutils.cpu.monitor(1000, (usage) => {
  console.log(`CPU 使用率: ${usage}%`);

  // 高使用率警报
  if (usage > 80) {
    console.warn('⚠️ 检测到高 CPU 使用率！');
  }
});

// 30 秒后停止监控
setTimeout(() => {
  cpuSubscription.unsubscribe();
  console.log('CPU 监控已停止');
}, 30000);

// 带错误处理的监控
const safeMonitor = osutils.cpu.monitor(2000, (usage) => {
  console.log('CPU:', usage);
}, (error) => {
  console.error('CPU 监控错误:', error);
});
```

### 💾 内存监控器

带智能单位转换的详细内存信息。

```typescript
// 带 DataSize 对象的内存信息
const memInfo = await osutils.memory.info();
if (memInfo.success) {
  console.log('总内存:', memInfo.data.total.gigabytes + ' GB');
  console.log('可用:', memInfo.data.available.gigabytes + ' GB');
  console.log('已用:', memInfo.data.used.gigabytes + ' GB');
  console.log('使用率:', memInfo.data.usagePercentage + '%');
}

// 快速内存使用率百分比
const memUsage = await osutils.memory.usage();
if (memUsage.success) {
  console.log('内存使用率:', memUsage.data + '%');
}
```

#### 内存方法

| 方法 | 返回类型 | 描述 | 平台支持 |
|--------|-------------|-------------|------------------|
| `info()` | `Promise<MonitorResult<MemoryInfo>>` | 带 DataSize 对象的详细内存分解 | ✅ 全部 |
| `usage()` | `Promise<MonitorResult<number>>` | 内存使用率百分比 (0-100) | ✅ 全部 |
| `free()` | `Promise<MonitorResult<DataSize>>` | 空闲内存量 | ✅ 全部 |
| `pressure()` | `Promise<MonitorResult<MemoryPressure>>` | 内存压力指标 | ⚠️ 有限 |
| `swap()` | `Promise<MonitorResult<SwapInfo>>` | 虚拟内存/交换信息 | ✅ 全部 |

#### DataSize 对象

```typescript
interface DataSize {
  bytes: number;
  kilobytes: number;
  megabytes: number;
  gigabytes: number;
  terabytes: number;

  // 格式化方法
  format(precision?: number): string;
  toHuman(): string;
}

// 使用示例
const memory = await osutils.memory.info();
if (memory.success) {
  console.log(memory.data.total.format(2)); // "16.00 GB"
  console.log(memory.data.available.toHuman()); // "8.3 GB"
}
```

### 💽 磁盘监控器

全面的磁盘和存储监控。

```typescript
// 所有磁盘信息
const diskInfo = await osutils.disk.info();
if (diskInfo.success) {
  diskInfo.data.forEach(disk => {
    console.log('文件系统:', disk.filesystem);
    console.log('挂载点:', disk.mountPoint);
    console.log('总容量:', disk.total.format());
    console.log('可用:', disk.available.format());
    console.log('使用率:', disk.usagePercentage + '%');
  });
}

// 特定路径使用情况
const rootUsage = await osutils.disk.usage('/');
if (rootUsage.success) {
  console.log('根目录使用率:', rootUsage.data.usagePercentage + '%');
}

// I/O 统计
const ioStats = await osutils.disk.stats();
if (ioStats.success) {
  console.log('读取操作:', ioStats.data.readOps);
  console.log('写入操作:', ioStats.data.writeOps);
}
```

#### 磁盘方法

| 方法 | 返回类型 | 描述 | 平台支持 |
|--------|-------------|-------------|------------------|
| `info(path?)` | `Promise<MonitorResult<DiskInfo[]>>` | 磁盘/分区信息 | ✅ 全部 |
| `usage(path?)` | `Promise<MonitorResult<DiskUsage>>` | 特定路径的使用情况 | ✅ 全部 |
| `stats()` | `Promise<MonitorResult<DiskStats>>` | I/O 统计摘要 | ✅ 全部 |
| `ioStats()` | `Promise<MonitorResult<DiskIOStats>>` | 详细 I/O 性能 | ⚠️ Linux/macOS |
| `free(path?)` | `Promise<MonitorResult<DataSize>>` | 可用空间 | ✅ 全部 |
| `healthCheck()` | `Promise<MonitorResult<HealthStatus>>` | 基本磁盘健康 | ⚠️ 有限 |

### 🌐 网络监控器

网络接口和流量监控。

```typescript
// 网络接口
const interfaces = await osutils.network.interfaces();
if (interfaces.success) {
  interfaces.data.forEach(iface => {
    console.log('接口:', iface.name);
    console.log('接收字节:', iface.rx.bytes.format());
    console.log('发送字节:', iface.tx.bytes.format());
    console.log('接收数据包:', iface.rx.packets);
    console.log('发送数据包:', iface.tx.packets);
  });
}

// 网络总览
const overview = await osutils.network.overview();
if (overview.success) {
  console.log('总接收:', overview.data.totalRx.format());
  console.log('总发送:', overview.data.totalTx.format());
}

// 实时网络监控
const netSub = osutils.network.monitor(5000, (stats) => {
  console.log('网络活动:', {
    download: stats.totalRx.megabytes + ' MB',
    upload: stats.totalTx.megabytes + ' MB'
  });
});
```

#### 网络方法

| 方法 | 返回类型 | 描述 | 平台支持 |
|--------|-------------|-------------|------------------|
| `interfaces()` | `Promise<MonitorResult<NetworkInterface[]>>` | 所有网络接口 | ✅ 全部 |
| `overview()` | `Promise<MonitorResult<NetworkOverview>>` | 网络统计总量 | ✅ 全部 |
| `stats(interface?)` | `Promise<MonitorResult<NetworkStats>>` | 接口特定统计 | ✅ 全部 |
| `speed(interval?)` | `Promise<MonitorResult<NetworkSpeed>>` | 网络速度计算 | ✅ 全部 |
| `connections()` | `Promise<MonitorResult<Connection[]>>` | 活动连接 | ⚠️ 有限 |
| `gateway()` | `Promise<MonitorResult<GatewayInfo>>` | 默认网关信息 | ✅ 全部 |

### 🔄 进程监控器

进程管理和监控功能。

```typescript
// 列出所有进程
const processes = await osutils.process.list();
if (processes.success) {
  console.log('总进程数:', processes.data.length);

  // 显示前 5 个 CPU 消耗者
  const topCpu = processes.data
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 5);

  topCpu.forEach(proc => {
    console.log(`${proc.name} (${proc.pid}): ${proc.cpu}% CPU`);
  });
}

// 查找特定进程
const nodeProcesses = await osutils.process.findByName('node');
if (nodeProcesses.success) {
  console.log('Node.js 进程数:', nodeProcesses.data.length);
}

// 当前进程信息
const currentProc = await osutils.process.info(process.pid);
if (currentProc.success) {
  console.log('当前进程内存:', currentProc.data.memory.format());
}
```

#### 进程方法

| 方法 | 返回类型 | 描述 | 平台支持 |
|--------|-------------|-------------|------------------|
| `list(options?)` | `Promise<MonitorResult<ProcessInfo[]>>` | 所有运行进程 | ✅ 全部 |
| `info(pid)` | `Promise<MonitorResult<ProcessInfo>>` | 特定进程详细信息 | ✅ 全部 |
| `findByName(name)` | `Promise<MonitorResult<ProcessInfo[]>>` | 按进程名查找 | ✅ 全部 |
| `topCpu(limit?)` | `Promise<MonitorResult<ProcessInfo[]>>` | 顶级 CPU 消耗者 | ✅ 全部 |
| `topMemory(limit?)` | `Promise<MonitorResult<ProcessInfo[]>>` | 顶级内存消耗者 | ✅ 全部 |
| `tree()` | `Promise<MonitorResult<ProcessTree[]>>` | 进程层次结构 | ⚠️ 有限 |
| `kill(pid, signal?)` | `Promise<MonitorResult<boolean>>` | 终止进程 | ⚠️ 有限 |

### 🖥️ 系统监控器

通用系统信息和健康监控。

```typescript
// 系统信息
const sysInfo = await osutils.system.info();
if (sysInfo.success) {
  console.log('主机名:', sysInfo.data.hostname);
  console.log('操作系统:', sysInfo.data.osName);
  console.log('版本:', sysInfo.data.osVersion);
  console.log('架构:', sysInfo.data.arch);
  console.log('平台:', sysInfo.data.platform);
}

// 系统运行时间
const uptime = await osutils.system.uptime();
if (uptime.success) {
  const days = Math.floor(uptime.data / (24 * 60 * 60));
  const hours = Math.floor((uptime.data % (24 * 60 * 60)) / (60 * 60));
  console.log(`运行时间: ${days} 天, ${hours} 小时`);
}

// 活动用户
const users = await osutils.system.users();
if (users.success) {
  console.log('登录用户:', users.data.map(u => u.name));
}
```

#### 系统方法

| 方法 | 返回类型 | 描述 | 平台支持 |
|--------|-------------|-------------|------------------|
| `info()` | `Promise<MonitorResult<SystemInfo>>` | 完整的系统信息 | ✅ 全部 |
| `uptime()` | `Promise<MonitorResult<number>>` | 运行时间（秒） | ✅ 全部 |
| `bootTime()` | `Promise<MonitorResult<Date>>` | 启动时间戳 | ✅ 全部 |
| `users()` | `Promise<MonitorResult<UserInfo[]>>` | 当前登录用户 | ✅ 全部 |
| `hostname()` | `Promise<MonitorResult<string>>` | 系统主机名 | ✅ 全部 |
| `osInfo()` | `Promise<MonitorResult<OSInfo>>` | 操作系统详细信息 | ✅ 全部 |
| `healthCheck()` | `Promise<MonitorResult<HealthStatus>>` | 系统健康概览 | ✅ 全部 |

## 🌍 平台兼容性

### 支持的平台

| 平台 | CPU | 内存 | 磁盘 | 网络 | 进程 | 系统 | 注释 |
|----------|-----|--------|------|---------|---------|--------|---------|
| **Linux** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 完全支持，已优化 |
| **macOS** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 完全支持 |
| **Windows** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | 网络和进程功能有限 |

**图例:**
- ✅ **完全支持**: 所有功能可用并经过测试
- ⚠️ **部分支持**: 核心功能工作，有一些限制
- ❌ **不支持**: 功能不可用

### 平台特定说明

#### Linux
- 使用 `/proc` 文件系统以获得最佳性能
- 对所有监控功能完全支持
- 提供高级 I/O 统计
- 支持硬件上的温度监控

#### macOS
- 使用系统命令（`top`、`vm_stat`、`df` 等）
- 完全功能兼容性
- Darwin 特定优化
- 与 macOS 系统 API 集成

#### Windows
- 可用时使用 PowerShell 和 WMI
- 网络监控有一些限制
- 进程树功能有限
- 核心功能完全支持

## 🚀 高级用法和示例

### 完整系统概览

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils({ debug: true });

// 全面系统概览
const overview = await osutils.overview();
console.log('📊 系统概览:');
console.log('CPU 使用率:', overview.cpu.usage + '%');
console.log('内存使用率:', overview.memory.usagePercentage + '%');
console.log('磁盘使用率:', overview.disk.usagePercentage + '%');
console.log('网络接收:', overview.network.totalRx.format());
console.log('网络发送:', overview.network.totalTx.format());
console.log('进程数:', overview.process.total);
console.log('运行时间:', Math.floor(overview.system.uptime / 3600) + ' 小时');

// 系统健康检查
const health = await osutils.healthCheck();
console.log('🏥 系统健康:', health.status); // 'healthy' | 'warning' | 'critical'

if (health.issues.length > 0) {
  console.log('⚠️ 检测到问题:');
  health.issues.forEach(issue => {
    console.log(`- ${issue.component}: ${issue.message}`);
  });
}

if (health.recommendations.length > 0) {
  console.log('💡 建议:');
  health.recommendations.forEach(rec => {
    console.log(`- ${rec}`);
  });
}
```

### 多指标实时监控

```typescript
// 创建监控仪表板
class SystemDashboard {
  private subscriptions: any[] = [];
  private alerts: string[] = [];

  start() {
    console.log('🚀 启动系统监控仪表板...');

    // CPU 监控
    const cpuSub = osutils.cpu.monitor(1000, (usage) => {
      this.updateDisplay('CPU', usage + '%');
      if (usage > 80) {
        this.addAlert(`⚠️ 高 CPU 使用率: ${usage}%`);
      }
    });

    // 内存监控
    const memSub = osutils.memory.monitor(2000, (info) => {
      const percent = info.usagePercentage;
      this.updateDisplay('内存', percent + '%');
      if (percent > 85) {
        this.addAlert(`⚠️ 高内存使用率: ${percent}%`);
      }
    });

    // 磁盘监控
    const diskSub = osutils.disk.monitor(10000, (info) => {
      const rootDisk = info.find(d => d.mountPoint === '/');
      if (rootDisk) {
        this.updateDisplay('磁盘', rootDisk.usagePercentage + '%');
        if (rootDisk.usagePercentage > 90) {
          this.addAlert(`⚠️ 磁盘几乎已满: ${rootDisk.usagePercentage}%`);
        }
      }
    });

    // 网络监控
    const netSub = osutils.network.monitor(5000, (stats) => {
      this.updateDisplay('网络', `↓${stats.totalRx.format()} ↑${stats.totalTx.format()}`);
    });

    this.subscriptions = [cpuSub, memSub, diskSub, netSub];

    // 警报检查器
    setInterval(() => {
      if (this.alerts.length > 0) {
        console.log('🚨 活动警报:');
        this.alerts.forEach(alert => console.log(alert));
        this.alerts = [];
      }
    }, 10000);
  }

  private updateDisplay(metric: string, value: string) {
    // 在这里更新您的 UI
    console.log(`📊 ${metric}: ${value}`);
  }

  private addAlert(alert: string) {
    this.alerts.push(alert);
  }

  stop() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    console.log('⏹️ 监控已停止');
  }
}

// 使用
const dashboard = new SystemDashboard();
dashboard.start();

// 5 分钟后停止
setTimeout(() => dashboard.stop(), 5 * 60 * 1000);
```

### 高级配置和缓存

```typescript
// 性能优化配置
const osutils = new OSUtils({
  // 全局缓存设置
  cacheEnabled: true,
  cacheTTL: 5000,
  maxCacheSize: 1000,

  // 执行设置
  timeout: 15000,
  retries: 3,

  // 调试模式
  debug: false,

  // 监控器特定设置
  cpu: {
    cacheTTL: 1000,    // CPU 快速刷新
    interval: 100      // 高精度监控
  },
  memory: {
    cacheTTL: 5000     // 内存中等刷新
  },
  disk: {
    cacheTTL: 30000,   // 磁盘慢速刷新
    timeout: 10000
  },
  network: {
    cacheTTL: 2000     // 网络中等刷新
  },
  process: {
    cacheTTL: 10000    // 进程慢速刷新
  }
});

// 运行时缓存配置
osutils.configureCache({
  enabled: true,
  maxSize: 2000,
  defaultTTL: 8000,
  cleanupInterval: 60000
});

// 缓存统计
const cacheStats = osutils.getCacheStats();
console.log('缓存命中率:', (cacheStats.hits / cacheStats.requests * 100).toFixed(1) + '%');
console.log('缓存条目数:', cacheStats.size);
console.log('内存使用:', cacheStats.memoryUsage.format());

// 需要时清理缓存
osutils.clearCache();
```

### 错误处理策略

```typescript
import { ErrorCode, MonitorError } from 'node-os-utils';

// 全面错误处理
class SystemMonitoringService {
  private osutils: OSUtils;

  constructor() {
    this.osutils = new OSUtils({ debug: true });
  }

  async getSystemInfo() {
    try {
      const results = await Promise.allSettled([
        this.osutils.cpu.info(),
        this.osutils.memory.info(),
        this.osutils.disk.info(),
        this.osutils.network.interfaces(),
        this.osutils.system.info()
      ]);

      const data: any = {};
      const errors: MonitorError[] = [];

      results.forEach((result, index) => {
        const keys = ['cpu', 'memory', 'disk', 'network', 'system'];
        const key = keys[index];

        if (result.status === 'fulfilled' && result.value.success) {
          data[key] = result.value.data;
        } else {
          const error = result.status === 'fulfilled'
            ? result.value.error
            : new Error(result.reason);

          errors.push({
            component: key,
            error,
            timestamp: new Date()
          });

          // 处理特定错误类型
          this.handleComponentError(key, error);
        }
      });

      return { data, errors };
    } catch (error) {
      console.error('系统监控失败:', error);
      throw error;
    }
  }

  private handleComponentError(component: string, error: any) {
    switch (error?.code) {
      case ErrorCode.PLATFORM_NOT_SUPPORTED:
        console.warn(`${component} 监控在 ${process.platform} 上不受支持`);
        break;
      case ErrorCode.PERMISSION_DENIED:
        console.error(`${component} 监控权限不足`);
        break;
      case ErrorCode.TIMEOUT:
        console.warn(`${component} 监控超时，正在重试...`);
        break;
      case ErrorCode.COMMAND_FAILED:
        console.error(`${component} 系统命令失败:`, error.message);
        break;
      default:
        console.error(`未知 ${component} 错误:`, error?.message);
    }
  }

  // 优雅降级示例
  async getCPUUsageWithFallback(): Promise<number> {
    const result = await this.osutils.cpu.usage();

    if (result.success) {
      return result.data;
    }

    // 回退到 OS 模块
    const os = require('os');
    const cpus = os.cpus();

    // 作为回退的简单计算
    return Math.random() * 20 + 10; // 模拟回退
  }
}
```

## 🔄 从 v1.x 迁移到 2.0

### 重大变更

版本 2.0 引入了一些重大变更，以提高类型安全性和一致性：

#### 1. 构造函数变更

```typescript
// v1.x
const osu = require('node-os-utils');
const cpuUsage = await osu.cpu.usage();

// v2.0
import { OSUtils } from 'node-os-utils';
const osutils = new OSUtils();
const cpuResult = await osutils.cpu.usage();
if (cpuResult.success) {
  const cpuUsage = cpuResult.data;
}
```

#### 2. 返回值变更

```typescript
// v1.x - 直接值
const cpuUsage = await osu.cpu.usage(); // number
const memInfo = await osu.mem.info();   // object

// v2.0 - MonitorResult 包装器
const cpuResult = await osutils.cpu.usage();
if (cpuResult.success) {
  const cpuUsage = cpuResult.data; // number
}

const memResult = await osutils.memory.info();
if (memResult.success) {
  const memInfo = memResult.data; // MemoryInfo
}
```

#### 3. 模块名称变更

| v1.x | v2.0 |
|------|------|
| `cpu` | `cpu` (不变) |
| `mem` | `memory` |
| `drive` | `disk` |
| `netstat` | `network` |
| `proc` | `process` |
| `os` | `system` |

#### 4. 方法名称变更

| v1.x | v2.0 |
|------|------|
| `osu.cpu.usage()` | `osutils.cpu.usage()` |
| `osu.mem.info()` | `osutils.memory.info()` |
| `osu.drive.info()` | `osutils.disk.info()` |
| `osu.netstat.inOut()` | `osutils.network.overview()` |
| `osu.proc.totalProcesses()` | `osutils.process.list().then(r => r.data.length)` |

### 迁移示例

```typescript
// v1.x 代码
const osu = require('node-os-utils');

async function getSystemInfo() {
  const cpuUsage = await osu.cpu.usage();
  const memInfo = await osu.mem.info();
  const driveInfo = await osu.drive.info();

  return {
    cpu: cpuUsage,
    memory: memInfo,
    disk: driveInfo
  };
}

// v2.0 等效代码
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils();

async function getSystemInfo() {
  const [cpuResult, memResult, diskResult] = await Promise.all([
    osutils.cpu.usage(),
    osutils.memory.info(),
    osutils.disk.info()
  ]);

  return {
    cpu: cpuResult.success ? cpuResult.data : null,
    memory: memResult.success ? memResult.data : null,
    disk: diskResult.success ? diskResult.data : null
  };
}
```

### 迁移清单

- [ ] 更新导入语句以使用 `OSUtils` 类
- [ ] 添加构造函数调用：`new OSUtils()`
- [ ] 更新所有方法调用以处理 `MonitorResult<T>` 返回类型
- [ ] 更改模块名称：`mem` → `memory`、`drive` → `disk` 等
- [ ] 为失败操作添加错误处理
- [ ] 如果使用 TypeScript，更新 TypeScript 类型
- [ ] 迁移后测试所有功能

## 🛠️ 开发和贡献

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/SunilWang/node-os-utils.git
cd node-os-utils

# 安装依赖
npm install

# 构建 TypeScript
npm run build

# 监控模式开发
npm run build:watch

# 运行所有测试
npm test

# 仅运行当前平台测试
npm run test:current-platform

# 运行特定平台测试
npm run test:linux    # Linux 特定测试
npm run test:macos    # macOS 特定测试
npm run test:windows  # Windows 特定测试

# 带覆盖率运行
npm run test:coverage

# 代码质量
npm run lint
npm run lint:check

# 生成 TypeDoc 文档
npm run docs
```

### 测试

**可用的测试脚本：**

```bash
# 核心测试套件
npm test                    # 所有测试
npm run test:unit          # 仅单元测试
npm run test:integration   # 仅集成测试
npm run test:platform      # 平台特定测试

# 平台特定测试
npm run test:linux         # 仅 Linux 测试
npm run test:macos         # 仅 macOS 测试
npm run test:windows       # 仅 Windows 测试
npm run test:current-platform  # 仅当前平台

# 覆盖率和报告
npm run test:coverage      # 带覆盖率报告
npm run test:watch         # 监控模式
```

**测试结构：**
- `test/unit/` - 单个组件的单元测试
- `test/integration/` - 集成测试
- `test/platform/` - 平台特定功能测试
- `test/utils/` - 测试工具和助手

### 贡献指南

1. **Fork 和克隆**
   ```bash
   git fork https://github.com/SunilWang/node-os-utils.git
   git clone https://github.com/yourusername/node-os-utils.git
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **开发设置**
   ```bash
   npm install
   npm run build:watch  # 启动开发构建
   ```

4. **进行更改**
   - 遵循 TypeScript 最佳实践
   - 添加全面测试
   - 必要时更新文档
   - 遵循现有代码模式

5. **质量检查**
   ```bash
   npm run lint          # 代码检查
   npm test             # 所有测试
   npm run test:coverage # 覆盖率检查
   npm run build        # 构建检查
   ```

6. **提交和推送**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   git push origin feature/your-feature-name
   ```

7. **提交拉取请求**
   - 提供清晰的描述
   - 包含测试结果
   - 引用相关问题

### 代码风格指南

- 使用 TypeScript 严格模式
- 遵循现有命名约定
- 为公共 API 添加 JSDoc 注释
- 维护跨平台兼容性
- 包含全面的错误处理
- 为新功能编写测试

### 问题报告

报告问题时，请包含：
- Node.js 版本
- 操作系统和版本
- 完整的错误消息
- 最小复现示例
- 预期与实际行为

## 📈 性能和基准测试

### 性能特征

| 操作 | 典型时间 | 缓存命中时间 | 内存使用 |
|-----------|-------------|----------------|---------------|
| CPU 信息 | 50-100ms | <1ms | ~2KB |
| CPU 使用率 | 100-500ms | <1ms | ~1KB |
| 内存信息 | 10-50ms | <1ms | ~3KB |
| 磁盘信息 | 100-300ms | <1ms | ~5KB |
| 网络统计 | 50-150ms | <1ms | ~4KB |
| 进程列表 | 200-1000ms | <1ms | ~50KB |

### 优化提示

```typescript
// 启用缓存以获得更好性能
const osutils = new OSUtils({
  cacheEnabled: true,
  cacheTTL: 5000  // 5 秒缓存
});

// 为不同指标使用适当的缓存 TTL
const config = {
  cpu: { cacheTTL: 1000 },     // 快速变化
  memory: { cacheTTL: 3000 },   // 中等变化
  disk: { cacheTTL: 30000 },    // 缓慢变化
};
```

## 📊 监控最佳实践

1. **缓存策略**: 根据数据变化频率使用适当的 TTL 值
2. **错误处理**: 始终在访问数据前检查 `result.success`
3. **平台感知**: 优雅地处理平台特定限制
4. **资源使用**: 监控您的监控 - 避免过度轮询
5. **实时监控**: 对于持续监控需求使用订阅

## 🔗 相关项目

- [systeminformation](https://github.com/sebhildebrandt/systeminformation) - 替代系统信息库
- [node-machine-id](https://github.com/automation-stack/node-machine-id) - 唯一机器标识
- [cpu-features](https://github.com/mscdex/cpu-features) - CPU 特性检测

## ❓ 常见问题

**问：为什么某些功能在 Windows 上不工作？**
答：Windows 具有不同的系统 API 和命令结构。一些功能如详细的 I/O 统计受到 Windows 能力的限制。

**问：测量的准确性如何？**
答：准确性取决于平台和测量类型。CPU 使用率是随时间采样的，内存信息是瞬时的，磁盘信息反映当前文件系统状态。

**问：可以在生产环境中使用吗？**
答：可以，但要实现适当的错误处理，并考虑频繁系统调用的性能影响。

**问：如何减少内存使用？**
答：配置适当的缓存设置，并在不需要时避免保持长时间运行的监控订阅。

## 📄 许可证

MIT 许可证。详细信息请参阅 [LICENSE](LICENSE) 文件。

Copyright (c) 2024 node-os-utils 贡献者

---

**用 ❤️ 和 TypeScript 构建**

如果您觉得这个仓库有用，请给个星标 ⭐！

[npm-image]: https://img.shields.io/npm/v/node-os-utils.svg
[npm-url]: https://www.npmjs.com/package/node-os-utils
[downloads-image]: https://img.shields.io/npm/dt/node-os-utils.svg
[downloads-url]: https://npmjs.org/package/node-os-utils

## 🧪 调试模式

```typescript
const osutils = new OSUtils({ debug: true });

// 将显示详细的调试信息
const cpuUsage = await osutils.cpu.usage();
// [DEBUG] Platform detected: darwin
// [DEBUG] Executing command: top -l 1 -n 0
// [DEBUG] Cache hit: false
// [DEBUG] Result: { success: true, data: 25.5, ... }
```

## 📈 使用模式

### 服务器监控

```typescript
import { OSUtils } from 'node-os-utils';

class ServerMonitor {
  private osutils = new OSUtils({
    cacheEnabled: true,
    debug: process.env.NODE_ENV === 'development'
  });

  async getMetrics() {
    const [cpu, memory, disk, network] = await Promise.allSettled([
      this.osutils.cpu.usage(),
      this.osutils.memory.info(),
      this.osutils.disk.usage(),
      this.osutils.network.overview()
    ]);

    return {
      cpu: cpu.status === 'fulfilled' && cpu.value.success ? cpu.value.data : null,
      memory: memory.status === 'fulfilled' && memory.value.success ? memory.value.data : null,
      disk: disk.status === 'fulfilled' && disk.value.success ? disk.value.data : null,
      network: network.status === 'fulfilled' && network.value.success ? network.value.data : null,
      timestamp: Date.now()
    };
  }

  startMonitoring(interval = 30000) {
    return setInterval(async () => {
      const metrics = await this.getMetrics();
      console.log('服务器指标:', metrics);

      // 发送到监控系统
      // await sendToMonitoringSystem(metrics);
    }, interval);
  }
}

const monitor = new ServerMonitor();
const intervalId = monitor.startMonitoring();
```

### 资源警报

```typescript
class ResourceAlerts {
  private osutils = new OSUtils();

  async checkAlerts() {
    const alerts = [];

    // CPU 警报
    const cpuUsage = await this.osutils.cpu.usage();
    if (cpuUsage.success && cpuUsage.data > 80) {
      alerts.push(`高CPU使用率: ${cpuUsage.data}%`);
    }

    // 内存警报
    const memInfo = await this.osutils.memory.info();
    if (memInfo.success && memInfo.data.usagePercentage > 85) {
      alerts.push(`高内存使用率: ${memInfo.data.usagePercentage}%`);
    }

    // 磁盘警报
    const diskUsage = await this.osutils.disk.usage();
    if (diskUsage.success && diskUsage.data > 90) {
      alerts.push(`磁盘空间不足: ${diskUsage.data}%`);
    }

    return alerts;
  }
}
```

## 🌐 平台特性

### Linux
- 完整的 `/proc` 文件系统支持
- 详细的网络接口统计
- cgroups 支持
- 系统服务状态

### macOS
- Apple Silicon 和 Intel 支持
- Activity Monitor 兼容数据
- APFS 文件系统支持
- 系统性能指标

### Windows
- WMI 集成
- 性能计数器支持
- 驱动器信息
- 服务状态监控

## 🔄 迁移指南

### 从 1.x 迁移到 2.0

**重大变更:**

1. **API 设计**: 全新的基于类的 API
2. **返回格式**: 统一的 `MonitorResult<T>` 格式
3. **错误处理**: 结构化错误对象
4. **配置方式**: 基于对象的配置
5. **导入方式**: ESM 优先

**迁移步骤:**

```typescript
// 1.x 版本
const osutils = require('node-os-utils');
const cpuUsage = await osutils.cpu.usage();

// 2.0 版本
import { OSUtils } from 'node-os-utils';
const osutils = new OSUtils();
const result = await osutils.cpu.usage();
if (result.success) {
  const cpuUsage = result.data;
}
```

## 🤝 贡献

我们欢迎所有形式的贡献！

### 开发设置

```bash
# 克隆仓库
git clone https://github.com/SunilWang/node-os-utils.git

# 安装依赖
npm install

# 开发模式
npm run dev

# 运行测试
npm test

# 构建项目
npm run build
```

### 测试

```bash
# 运行所有测试
npm test

# 平台特定测试
npm run test:linux
npm run test:macos
npm run test:windows

# 当前平台测试
npm run test:current-platform

# 测试覆盖率
npm run test:coverage
```

## 📄 许可证

MIT © [SunilWang](https://github.com/SunilWang)

## 🙏 致谢

感谢所有贡献者和使用 node-os-utils 的开发者们！

---

[npm-image]: https://img.shields.io/npm/v/node-os-utils.svg?style=flat-square
[npm-url]: https://npmjs.org/package/node-os-utils
[downloads-image]: https://img.shields.io/npm/dm/node-os-utils.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/node-os-utils
