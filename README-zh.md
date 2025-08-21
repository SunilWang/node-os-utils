# node-os-utils 2.0

[![NPM 版本][npm-image]][npm-url]
[![NPM 下载量][downloads-image]][downloads-url]
[![TypeScript 支持](https://img.shields.io/badge/typescript-supported-blue.svg)](https://www.typescriptlang.org/)
[![Node.js 版本](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![许可证: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个现代化的、TypeScript 原生的跨平台操作系统监控库。2.0 版本经过完全重构，提供类型安全的 API、智能缓存管理和事件驱动的实时监控功能。

## ✨ 新版本特性

### 🎯 2.0 版本亮点
- **💥 突破性改变**: 全新的 TypeScript 原生 API 设计
- **🚀 无向后兼容**: 专注于 2.0 版本的现代化设计
- **🔥 性能优化**: 重新设计的缓存系统和命令执行器
- **🎪 智能适配**: 自动平台检测和优雅降级

### 🔧 核心特性
- **🌟 TypeScript 原生**: 完整的类型系统，编译时错误检查
- **🌍 跨平台**: 支持 Linux、macOS 和 Windows
- **⚡ 高性能**: 智能缓存、批量操作、异步优先
- **📊 全面监控**: CPU、内存、磁盘、网络、进程、系统信息
- **🔄 实时监控**: 事件驱动的监控订阅
- **🛡️ 错误处理**: 统一的错误模型和优雅降级
- **🏗️ 模块化**: 清晰的监控器架构和平台适配器
- **📝 零依赖**: 仅使用 Node.js 内置模块

## 🚀 安装

```bash
npm install node-os-utils@2.0.0
```

**系统要求:**
- Node.js ≥ 18.0.0
- 支持的操作系统: Linux、macOS、Windows

## 🏁 快速开始

### TypeScript / ES Modules

```typescript
import { OSUtils } from 'node-os-utils';

// 创建 OSUtils 实例
const osutils = new OSUtils({
  cacheEnabled: true,
  cacheTTL: 5000,
  debug: false
});

// 获取 CPU 使用率
const cpuUsage = await osutils.cpu.usage();
if (cpuUsage.success) {
  console.log('CPU 使用率:', cpuUsage.data + '%');
} else {
  console.error('获取 CPU 使用率失败:', cpuUsage.error);
}

// 获取系统信息
const systemInfo = await osutils.system.info();
if (systemInfo.success) {
  console.log('系统信息:', systemInfo.data);
}
```

### CommonJS

```javascript
const { OSUtils } = require('node-os-utils');

const osutils = new OSUtils();

(async () => {
  const memInfo = await osutils.memory.info();
  if (memInfo.success) {
    console.log('总内存:', memInfo.data.total.toString());
    console.log('使用率:', memInfo.data.usagePercentage + '%');
  }
})();
```

## 📊 API 文档

### 统一返回格式

所有异步方法都返回 `MonitorResult<T>` 类型：

```typescript
type MonitorResult<T> = {
  success: true;
  data: T;
  timestamp: number;
  cached: boolean;
  platform: string;
} | {
  success: false;
  error: MonitorError;
  platform: string;
  timestamp: number;
};
```

### CPU 监控

```typescript
// 基本信息
const cpuInfo = await osutils.cpu.info();
// { model: 'Intel Core i7', cores: 8, threads: 16, ... }

// 使用率
const usage = await osutils.cpu.usage();
// 返回 0-100 的数字

// 负载平均值
const loadAvg = await osutils.cpu.loadAverage();
// { oneMinute: 1.2, fiveMinutes: 1.1, fifteenMinutes: 0.9 }

// 详细使用率
const detailed = await osutils.cpu.usageDetailed();
// { overall: 45.2, cores: [40, 50, 35, 60], user: 20, system: 15, ... }

// 每核心使用率
const perCore = await osutils.cpu.usageByCore();
// [45.2, 50.1, 38.7, 52.3, ...]
```

### 内存监控

```typescript
// 内存信息
const memInfo = await osutils.memory.info();
// 返回详细的内存信息，包含 DataSize 对象

// 使用率
const memUsage = await osutils.memory.usage();
// 返回 0-100 的百分比

// 可用内存
const available = await osutils.memory.available();
// 返回 DataSize 对象

// 交换空间信息
const swapInfo = await osutils.memory.swap();
// { total: DataSize, used: DataSize, available: DataSize, ... }
```

### 磁盘监控

```typescript
// 磁盘信息
const diskInfo = await osutils.disk.info();
// 返回磁盘数组信息

// 指定路径的磁盘信息
const rootDisk = await osutils.disk.info('/');

// 整体使用率
const diskUsage = await osutils.disk.usage();
// 返回 0-100 的百分比

// I/O 统计
const ioStats = await osutils.disk.ioStats();
// { readBytes: DataSize, writeBytes: DataSize, ... }
```

### 网络监控

```typescript
// 网络接口
const interfaces = await osutils.network.interfaces();
// 返回网络接口数组

// 网络总览
const overview = await osutils.network.overview();
// { totalRx: DataSize, totalTx: DataSize, ... }

// 实时网络流量
const stats = await osutils.network.stats();
// { rx: DataSize, tx: DataSize, packets: number, ... }
```

### 进程监控

```typescript
// 进程列表
const processes = await osutils.process.list();
// 返回进程信息数组

// 进程统计
const stats = await osutils.process.stats();
// { total: number, running: number, sleeping: number, ... }

// 当前进程信息
const current = await osutils.process.current();
// 返回当前 Node.js 进程的详细信息
```

### 系统监控

```typescript
// 系统信息
const sysInfo = await osutils.system.info();
// { platform: 'darwin', hostname: 'MacBook', osVersion: '14.0', ... }

// 系统健康检查
const health = await osutils.system.healthCheck();
// { status: 'healthy', issues: [], timestamp: ... }

// 启动时间
const uptime = await osutils.system.uptime();
// 返回系统运行时间（秒）
```

### 实时监控

```typescript
// CPU 使用率监控
const cpuSubscription = osutils.cpu.monitor(1000, (usage) => {
  if (usage.success) {
    console.log('实时 CPU 使用率:', usage.data + '%');
  }
});

// 停止监控
cpuSubscription.unsubscribe();

// 内存监控
const memSubscription = osutils.memory.monitor(2000, (memInfo) => {
  if (memInfo.success) {
    console.log('实时内存使用:', memInfo.data.usagePercentage + '%');
  }
});
```

## 🔧 配置选项

### 全局配置

```typescript
const osutils = new OSUtils({
  // 缓存配置
  cacheEnabled: true,
  cacheTTL: 5000,
  maxCacheSize: 1000,
  
  // 执行配置
  timeout: 10000,
  
  // 调试模式
  debug: false,
  
  // 特定监控器配置
  cpu: {
    cacheTTL: 30000,
    includeTemperature: true,
    includeFrequency: true
  },
  memory: {
    cacheTTL: 5000,
    includeSwap: true
  },
  disk: {
    cacheTTL: 60000,
    includeIO: true
  }
});
```

### 链式配置

```typescript
// 为特定监控器配置缓存
const cpuMonitor = osutils.cpu
  .withCaching(true, 30000)
  .withConfig({ timeout: 5000 });
```

## 🔄 实用工具

### 数据单位处理

```typescript
import { DataSize } from 'node-os-utils';

const size = new DataSize(1024 * 1024 * 1024); // 1GB
console.log(size.toGB()); // 1
console.log(size.toString()); // "1.00 GB"
console.log(size.toString('MB')); // "1024.00 MB"
```

### 工厂函数

```typescript
import { createOSUtils } from 'node-os-utils';

const osutils = createOSUtils({
  cacheEnabled: true,
  debug: true
});
```

### 平台检测

```typescript
// 获取平台信息
const platformInfo = osutils.getPlatformInfo();
console.log(platformInfo); // { platform: 'darwin', arch: 'arm64', ... }

// 检查支持的平台
const supported = osutils.getSupportedPlatforms();
console.log(supported); // ['linux', 'darwin', 'win32']

// 检查平台能力
const capabilities = await osutils.checkPlatformCapabilities();
```

## 🎯 系统总览

```typescript
// 获取完整的系统总览
const overview = await osutils.overview();
console.log(overview);

/*
输出示例:
{
  platform: 'darwin',
  timestamp: 1640995200000,
  system: { hostname: 'MacBook-Pro', osVersion: '14.0', ... },
  cpu: { usage: 25.5 },
  memory: { total: DataSize, used: DataSize, usagePercentage: 60 },
  disk: { usage: 45.2 },
  network: { totalRx: DataSize, totalTx: DataSize },
  processes: { total: 245, running: 12 }
}
*/
```

## 🏥 健康检查

```typescript
// 系统健康检查
const healthReport = await osutils.healthCheck();
console.log(healthReport);

/*
输出示例:
{
  status: 'healthy', // 'healthy' | 'warning' | 'critical'
  issues: [],
  timestamp: 1640995200000,
  details: {
    system: { status: 'healthy', issues: [] },
    disk: { status: 'warning', issues: ['Low disk space on /'] },
    network: { status: 'healthy', issues: [] }
  }
}
*/
```

## ⚡ 性能优化

### 缓存管理

```typescript
// 获取缓存统计
const stats = osutils.getCacheStats();
console.log(stats); // { size: 15, maxSize: 1000, hits: 45, misses: 12 }

// 清理缓存
osutils.clearCache();

// 动态配置缓存
osutils.configureCache({
  enabled: true,
  maxSize: 2000,
  defaultTTL: 10000
});
```

### 批量操作

```typescript
// 并行获取多个信息
const [cpuInfo, memInfo, diskInfo] = await Promise.all([
  osutils.cpu.info(),
  osutils.memory.info(),
  osutils.disk.info()
]);
```

## 🚨 错误处理

### 错误类型

```typescript
import { ErrorCode } from 'node-os-utils';

const result = await osutils.cpu.temperature();
if (!result.success) {
  switch (result.error.code) {
    case ErrorCode.NOT_SUPPORTED:
      console.log('当前平台不支持温度监控');
      break;
    case ErrorCode.PERMISSION_DENIED:
      console.log('权限不足');
      break;
    case ErrorCode.TIMEOUT:
      console.log('操作超时');
      break;
    default:
      console.error('未知错误:', result.error.message);
  }
}
```

### 优雅降级

```typescript
// 系统会自动处理不支持的功能
const tempResult = await osutils.cpu.temperature();
if (!tempResult.success && tempResult.error.code === ErrorCode.NOT_SUPPORTED) {
  console.log('CPU温度监控在此平台不可用，跳过...');
  // 继续其他操作
}
```

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