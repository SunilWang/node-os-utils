# node-os-utils v2.0

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![TypeScript Support](https://img.shields.io/badge/typescript-supported-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🚀 **Version 2.0** - A complete rewrite of the popular Node.js operating system monitoring library.

**Modern, TypeScript-native, cross-platform system monitoring library** providing comprehensive system information with intelligent caching, event-driven monitoring, and robust error handling.

> **Breaking Changes**: This is a major version release with breaking changes from v1.x. See [Migration Guide](#-migration-from-v1x) for upgrade instructions.

## ✨ What's New in v2.0

### 🎯 Core Improvements
- **🔧 TypeScript First**: Complete rewrite in TypeScript with strict typing
- **🏗️ Modern Architecture**: Clean, modular design with adapter pattern
- **⚡ Performance Optimized**: Intelligent caching system with TTL management
- **🛡️ Robust Error Handling**: Consistent error handling with detailed error codes
- **🔄 Event-Driven**: Real-time monitoring with subscription management
- **📊 Rich Data Types**: Comprehensive data structures with unit conversions

### 🌟 Key Features
- **🌍 Cross-Platform**: Linux, macOS, Windows support with intelligent platform adaptation
- **📝 Zero Dependencies**: Pure Node.js implementation using only built-in modules
- **⚙️ Configurable**: Flexible configuration system for caching, timeouts, and monitoring
- **🎯 Type Safe**: Full TypeScript definitions with IntelliSense support
- **🔍 Comprehensive**: CPU, Memory, Disk, Network, Process, and System monitoring
- **📈 Real-time**: Event-driven monitoring with customizable intervals

### 🧱 Architecture at a Glance
- **AdapterFactory** centralises platform detection, caching instantiated adapters and exposing helper utilities such as `getSupportedPlatforms()` and `checkPlatformCapabilities()`.
- **CommandExecutor** normalises shell execution across operating systems with smart fallbacks (`/bin/bash` → `/bin/sh`, PowerShell auto discovery) and uniform error objects.
- **Platform Adapters** encapsulate OS-specific logic (Linux via `/proc`, macOS via `sysctl`/`powermetrics`, Windows via PowerShell + WMI) while reporting declared feature support.
- **CacheManager** provides adaptive TTL-based caching with LRU eviction to minimise expensive system calls during polling-heavy workloads.

### 🖥️ Platform Support Matrix

| Capability | Linux | macOS | Windows |
|------------|:-----:|:-----:|:-------:|
| CPU usage / info | ✅ | ✅ | ✅ |
| CPU temperature | ⚠️ 需要 `/sys/class/thermal` | ⚠️ 需要 `powermetrics` (sudo) | ❌ （未开放 API） |
| Memory pressure | ⚠️ 受限 | ✅ | ⚠️ 通过 WMI 估算 |
| Disk IO stats | ✅ | ✅ | ❌ |
| Network stats | ✅ (`/proc/net/dev`) | ✅ (`netstat -ib`) | ⚠️ PowerShell 需管理员权限 |
| Process details | ✅ | ✅ | ✅ (WMI) |
| System services | ⚠️ `systemctl` 可选 | ❌ | ✅ |

> **Legend**: ✅ 全量支持 · ⚠️ 部分或受限 · ❌ 暂不支持

### 🔍 Capability Diagnostics

```ts
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils();
const report = await osutils.checkPlatformCapabilities();

console.table({
  platform: report.platform,
  supported: report.supported,
  commands: report.capabilities.commands.join(','),
  features: report.capabilities.features.join(',')
});

if (!report.supported) {
  console.warn('❗ Some metrics are unavailable:', report.issues);
}
```

`AdapterFactory.getDebugInfo()` is also available when you need to inspect feature flags or confirm that platform-specific commands can be executed.

## 🚀 Installation

```bash
npm install node-os-utils
```

**Requirements:**
- Node.js 18.0.0 or higher
- Supported OS: Linux, macOS, Windows

## 🏁 Quick Start

### TypeScript

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils();

// Get CPU usage
const cpuUsage = await osutils.cpu.usage();
if (cpuUsage.success) {
  console.log('CPU Usage:', cpuUsage.data + '%');
}

// Get memory information
const memInfo = await osutils.memory.info();
if (memInfo.success) {
  console.log('Memory:', memInfo.data);
}

// Get system overview
const overview = await osutils.overview();
console.log('System Overview:', overview);
```

### JavaScript (CommonJS)

```javascript
const { OSUtils } = require('node-os-utils');

const osutils = new OSUtils();

osutils.cpu.usage().then(result => {
  if (result.success) {
    console.log('CPU Usage:', result.data + '%');
  }
});
```

### Alternative Factory Function

```javascript
// Alternative instantiation method
const { createOSUtils } = require('node-os-utils');

const osutils = createOSUtils({
  cacheEnabled: true,
  cacheTTL: 10000
});

// Same API as OSUtils class
const cpuUsage = await osutils.cpu.usage();
```

## ⚙️ Configuration

### Global Configuration

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils({
  // Cache settings
  cacheEnabled: true,
  cacheTTL: 5000,
  maxCacheSize: 1000,

  // Execution settings
  timeout: 10000,

  // Debug mode
  debug: false,

  // Monitor-specific configurations
  cpu: { cacheTTL: 30000 },
  memory: { cacheTTL: 5000 },
  disk: { cacheTTL: 60000 }
});
```

### Monitor-Level Configuration

```typescript
// Configure individual monitors
const cpuMonitor = osutils.cpu
  .withCaching(true, 30000)
  .withConfig({ timeout: 5000 });

// Configure cache at runtime
osutils.configureCache({
  enabled: true,
  maxSize: 2000,
  defaultTTL: 10000
});
```

## 🛡️ Error Handling

All operations return a `MonitorResult<T>` object for consistent error handling:

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

### Error Handling Examples

```typescript
const result = await osutils.cpu.info();

if (result.success) {
  // Success: use result.data
  console.log('CPU Model:', result.data.model);
  console.log('Cores:', result.data.cores);
} else {
  // Error: handle gracefully
  console.error('Error:', result.error?.message);
  console.error('Code:', result.error?.code);

  // Platform-specific handling
  if (result.error?.code === ErrorCode.PLATFORM_NOT_SUPPORTED) {
    console.log('This feature is not available on', result.platform);
  }
}
```

### Error Codes

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

## 🛠️ Troubleshooting & Permissions

- **macOS temperature metrics** rely on `powermetrics` and require administrator privileges (`sudo powermetrics -n 1 -i 1000 --samplers smc`). When unavailable, the adapter raises `PLATFORM_NOT_SUPPORTED` for that feature.
- **Windows network & process metrics** call PowerShell CIM cmdlets (`Get-NetAdapterStatistics`, `Get-CimInstance`). Run the host app in an elevated PowerShell session if you encounter `PERMISSION_DENIED` or `COMMAND_FAILED` errors.
- **Linux command fallbacks**: metrics primarily read `/proc`. If utilities such as `ip`/`ss` are missing, the adapter retries with `ifconfig`/`netstat`, but you can confirm availability up front via `osutils.checkPlatformCapabilities()`.
- Always inspect `MonitorResult.error.code` for structured error feedback (timeout, permission, unsupported) and provide user guidance accordingly.

## 📚 Complete API Reference

### 🔥 CPU Monitor

Comprehensive CPU monitoring with real-time capabilities.

```typescript
// Basic CPU information
const cpuInfo = await osutils.cpu.info();
if (cpuInfo.success) {
  console.log('Model:', cpuInfo.data.model);
  console.log('Cores:', cpuInfo.data.cores);
  console.log('Architecture:', cpuInfo.data.architecture);
}

// CPU usage monitoring
const cpuUsage = await osutils.cpu.usage();
if (cpuUsage.success) {
  console.log('CPU Usage:', cpuUsage.data + '%');
}

// Load average (Linux/macOS)
const loadAvg = await osutils.cpu.loadAverage();
if (loadAvg.success) {
  console.log('Load Average:', loadAvg.data);
}
```

#### CPU Methods

| Method | Return Type | Description | Platform Support |
|--------|-------------|-------------|------------------|
| `info()` | `Promise<MonitorResult<CPUInfo>>` | CPU model, cores, threads, architecture | ✅ All |
| `usage(interval?)` | `Promise<MonitorResult<number>>` | CPU usage percentage (0-100) | ✅ All |
| `free(interval?)` | `Promise<MonitorResult<number>>` | CPU free percentage (0-100) | ✅ All |
| `loadAverage()` | `Promise<MonitorResult<LoadAverage>>` | Load averages (1, 5, 15 min) | ✅ Linux/macOS |
| `temperature()` | `Promise<MonitorResult<Temperature>>` | CPU temperature sensors | ⚠️ Limited |
| `frequency()` | `Promise<MonitorResult<FrequencyInfo>>` | Current CPU frequencies | ⚠️ Limited |

#### Real-time CPU Monitoring

```typescript
// Monitor CPU usage with custom interval
const cpuSubscription = osutils.cpu.monitor(1000, (usage) => {
  console.log(`CPU Usage: ${usage}%`);

  // Alert on high usage
  if (usage > 80) {
    console.warn('⚠️ High CPU usage detected!');
  }
});

// Stop monitoring after 30 seconds
setTimeout(() => {
  cpuSubscription.unsubscribe();
  console.log('CPU monitoring stopped');
}, 30000);

// Monitor with error handling
const safeMonitor = osutils.cpu.monitor(2000, (usage) => {
  console.log('CPU:', usage);
}, (error) => {
  console.error('CPU monitoring error:', error);
});
```

### 💾 Memory Monitor

Detailed memory information with smart unit conversion.

```typescript
// Memory information with DataSize objects
const memInfo = await osutils.memory.info();
if (memInfo.success) {
  console.log('Total Memory:', memInfo.data.total.gigabytes + ' GB');
  console.log('Available:', memInfo.data.available.gigabytes + ' GB');
  console.log('Used:', memInfo.data.used.gigabytes + ' GB');
  console.log('Usage:', memInfo.data.usagePercentage + '%');
}

// Quick memory usage percentage
const memUsage = await osutils.memory.usage();
if (memUsage.success) {
  console.log('Memory Usage:', memUsage.data + '%');
}
```

#### Memory Methods

| Method | Return Type | Description | Platform Support |
|--------|-------------|-------------|------------------|
| `info()` | `Promise<MonitorResult<MemoryInfo>>` | Detailed memory breakdown with DataSize objects | ✅ All |
| `usage()` | `Promise<MonitorResult<number>>` | Memory usage percentage (0-100) | ✅ All |
| `free()` | `Promise<MonitorResult<DataSize>>` | Free memory amount | ✅ All |
| `pressure()` | `Promise<MonitorResult<MemoryPressure>>` | Memory pressure indicators | ⚠️ Limited |
| `swap()` | `Promise<MonitorResult<SwapInfo>>` | Virtual memory/swap information | ✅ All |

#### DataSize Object

```typescript
interface DataSize {
  bytes: number;
  kilobytes: number;
  megabytes: number;
  gigabytes: number;
  terabytes: number;

  // Formatting methods
  format(precision?: number): string;
  toHuman(): string;
}

// Usage example
const memory = await osutils.memory.info();
if (memory.success) {
  console.log(memory.data.total.format(2)); // "16.00 GB"
  console.log(memory.data.available.toHuman()); // "8.3 GB"
}
```

### 💽 Disk Monitor

Comprehensive disk and storage monitoring.

```typescript
// All disk information
const diskInfo = await osutils.disk.info();
if (diskInfo.success) {
  diskInfo.data.forEach(disk => {
    console.log('Filesystem:', disk.filesystem);
    console.log('Mount Point:', disk.mountPoint);
    console.log('Total:', disk.total.format());
    console.log('Available:', disk.available.format());
    console.log('Usage:', disk.usagePercentage + '%');
  });
}

// Specific path usage
const rootUsage = await osutils.disk.usage('/');
if (rootUsage.success) {
  console.log('Root usage:', rootUsage.data.usagePercentage + '%');
}

// I/O statistics
const ioStats = await osutils.disk.stats();
if (ioStats.success) {
  console.log('Read operations:', ioStats.data.readOps);
  console.log('Write operations:', ioStats.data.writeOps);
}
```

#### Disk Methods

| Method | Return Type | Description | Platform Support |
|--------|-------------|-------------|------------------|
| `info(path?)` | `Promise<MonitorResult<DiskInfo[]>>` | Disk/partition information | ✅ All |
| `usage(path?)` | `Promise<MonitorResult<DiskUsage>>` | Usage for specific path | ✅ All |
| `stats()` | `Promise<MonitorResult<DiskStats>>` | I/O statistics summary | ✅ All |
| `ioStats()` | `Promise<MonitorResult<DiskIOStats>>` | Detailed I/O performance | ⚠️ Linux/macOS |
| `free(path?)` | `Promise<MonitorResult<DataSize>>` | Available space | ✅ All |
| `healthCheck()` | `Promise<MonitorResult<HealthStatus>>` | Basic disk health | ⚠️ Limited |

### 🌐 Network Monitor

Network interface and traffic monitoring.

```typescript
// Network interfaces
const interfaces = await osutils.network.interfaces();
if (interfaces.success) {
  interfaces.data.forEach(iface => {
    console.log('Interface:', iface.name);
    console.log('RX Bytes:', iface.rx.bytes.format());
    console.log('TX Bytes:', iface.tx.bytes.format());
    console.log('RX Packets:', iface.rx.packets);
    console.log('TX Packets:', iface.tx.packets);
  });
}

// Network overview
const overview = await osutils.network.overview();
if (overview.success) {
  console.log('Total RX:', overview.data.totalRx.format());
  console.log('Total TX:', overview.data.totalTx.format());
}

// Real-time network monitoring
const netSub = osutils.network.monitor(5000, (stats) => {
  console.log('Network activity:', {
    download: stats.totalRx.megabytes + ' MB',
    upload: stats.totalTx.megabytes + ' MB'
  });
});
```

#### Network Methods

| Method | Return Type | Description | Platform Support |
|--------|-------------|-------------|------------------|
| `interfaces()` | `Promise<MonitorResult<NetworkInterface[]>>` | All network interfaces | ✅ All |
| `overview()` | `Promise<MonitorResult<NetworkOverview>>` | Total network statistics | ✅ All |
| `stats(interface?)` | `Promise<MonitorResult<NetworkStats>>` | Interface-specific stats | ✅ All |
| `speed(interval?)` | `Promise<MonitorResult<NetworkSpeed>>` | Network speed calculation | ✅ All |
| `connections()` | `Promise<MonitorResult<Connection[]>>` | Active connections | ⚠️ Limited |
| `gateway()` | `Promise<MonitorResult<GatewayInfo>>` | Default gateway info | ✅ All |

### 🔄 Process Monitor

Process management and monitoring capabilities.

```typescript
// List all processes
const processes = await osutils.process.list();
if (processes.success) {
  console.log('Total processes:', processes.data.length);

  // Show top 5 CPU consumers
  const topCpu = processes.data
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 5);

  topCpu.forEach(proc => {
    console.log(`${proc.name} (${proc.pid}): ${proc.cpu}% CPU`);
  });
}

// Find specific processes
const nodeProcesses = await osutils.process.findByName('node');
if (nodeProcesses.success) {
  console.log('Node.js processes:', nodeProcesses.data.length);
}

// Current process info
const currentProc = await osutils.process.info(process.pid);
if (currentProc.success) {
  console.log('Current process memory:', currentProc.data.memory.format());
}
```

#### Process Methods

| Method | Return Type | Description | Platform Support |
|--------|-------------|-------------|------------------|
| `list(options?)` | `Promise<MonitorResult<ProcessInfo[]>>` | All running processes | ✅ All |
| `info(pid)` | `Promise<MonitorResult<ProcessInfo>>` | Specific process details | ✅ All |
| `findByName(name)` | `Promise<MonitorResult<ProcessInfo[]>>` | Find by process name | ✅ All |
| `topCpu(limit?)` | `Promise<MonitorResult<ProcessInfo[]>>` | Top CPU consumers | ✅ All |
| `topMemory(limit?)` | `Promise<MonitorResult<ProcessInfo[]>>` | Top memory consumers | ✅ All |
| `tree()` | `Promise<MonitorResult<ProcessTree[]>>` | Process hierarchy | ⚠️ Limited |
| `kill(pid, signal?)` | `Promise<MonitorResult<boolean>>` | Terminate process | ⚠️ Limited |

### 🖥️ System Monitor

General system information and health monitoring.

```typescript
// System information
const sysInfo = await osutils.system.info();
if (sysInfo.success) {
  console.log('Hostname:', sysInfo.data.hostname);
  console.log('OS:', sysInfo.data.osName);
  console.log('Version:', sysInfo.data.osVersion);
  console.log('Architecture:', sysInfo.data.arch);
  console.log('Platform:', sysInfo.data.platform);
}

// System uptime
const uptime = await osutils.system.uptime();
if (uptime.success) {
  const days = Math.floor(uptime.data / (24 * 60 * 60));
  const hours = Math.floor((uptime.data % (24 * 60 * 60)) / (60 * 60));
  console.log(`Uptime: ${days} days, ${hours} hours`);
}

// Active users
const users = await osutils.system.users();
if (users.success) {
  console.log('Logged users:', users.data.map(u => u.name));
}
```

#### System Methods

| Method | Return Type | Description | Platform Support |
|--------|-------------|-------------|------------------|
| `info()` | `Promise<MonitorResult<SystemInfo>>` | Complete system information | ✅ All |
| `uptime()` | `Promise<MonitorResult<number>>` | Uptime in seconds | ✅ All |
| `bootTime()` | `Promise<MonitorResult<Date>>` | Boot timestamp | ✅ All |
| `users()` | `Promise<MonitorResult<UserInfo[]>>` | Currently logged users | ✅ All |
| `hostname()` | `Promise<MonitorResult<string>>` | System hostname | ✅ All |
| `osInfo()` | `Promise<MonitorResult<OSInfo>>` | Operating system details | ✅ All |
| `healthCheck()` | `Promise<MonitorResult<HealthStatus>>` | System health overview | ✅ All |

## 🌍 Platform Compatibility

### Supported Platforms

| Platform | CPU | Memory | Disk | Network | Process | System | Notes |
|----------|-----|--------|------|---------|---------|--------|-------|
| **Linux** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Full support, optimized |
| **macOS** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Full support |
| **Windows** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | Limited network & process |

**Legend:**
- ✅ **Full Support**: All features available and tested
- ⚠️ **Partial Support**: Core features work, some limitations
- ❌ **Not Supported**: Feature not available

### Platform-Specific Notes

#### Linux
- Uses `/proc` filesystem for optimal performance
- Full support for all monitoring features
- Advanced I/O statistics available
- Temperature monitoring on supported hardware

#### macOS
- Uses system commands (`top`, `vm_stat`, `df`, etc.)
- Full feature compatibility
- Darwin-specific optimizations
- Integrated with macOS system APIs

#### Windows
- Uses PowerShell and WMI where available
- Network monitoring has some limitations
- Process tree functionality limited
- Core features fully supported

## 🚀 Advanced Usage & Examples

### Complete System Overview

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils({ debug: true });

// Comprehensive system overview
const overview = await osutils.overview();
console.log('📊 System Overview:');
console.log('CPU Usage:', overview.cpu.usage + '%');
console.log('Memory Usage:', overview.memory.usagePercentage + '%');
console.log('Disk Usage:', overview.disk.usagePercentage + '%');
console.log('Network RX:', overview.network.totalRx.format());
console.log('Network TX:', overview.network.totalTx.format());
console.log('Processes:', overview.process.total);
console.log('Uptime:', Math.floor(overview.system.uptime / 3600) + ' hours');

// System health check
const health = await osutils.healthCheck();
console.log('🏥 System Health:', health.status); // 'healthy' | 'warning' | 'critical'

if (health.issues.length > 0) {
  console.log('⚠️ Issues detected:');
  health.issues.forEach(issue => {
    console.log(`- ${issue.component}: ${issue.message}`);
  });
}

if (health.recommendations.length > 0) {
  console.log('💡 Recommendations:');
  health.recommendations.forEach(rec => {
    console.log(`- ${rec}`);
  });
}
```

### Multi-Metric Real-time Monitoring

```typescript
// Create monitoring dashboard
class SystemDashboard {
  private subscriptions: any[] = [];
  private alerts: string[] = [];

  start() {
    console.log('🚀 Starting system monitoring dashboard...');

    // CPU monitoring
    const cpuSub = osutils.cpu.monitor(1000, (usage) => {
      this.updateDisplay('CPU', usage + '%');
      if (usage > 80) {
        this.addAlert(`⚠️ High CPU usage: ${usage}%`);
      }
    });

    // Memory monitoring
    const memSub = osutils.memory.monitor(2000, (info) => {
      const percent = info.usagePercentage;
      this.updateDisplay('Memory', percent + '%');
      if (percent > 85) {
        this.addAlert(`⚠️ High memory usage: ${percent}%`);
      }
    });

    // Disk monitoring
    const diskSub = osutils.disk.monitor(10000, (info) => {
      const rootDisk = info.find(d => d.mountPoint === '/');
      if (rootDisk) {
        this.updateDisplay('Disk', rootDisk.usagePercentage + '%');
        if (rootDisk.usagePercentage > 90) {
          this.addAlert(`⚠️ Disk almost full: ${rootDisk.usagePercentage}%`);
        }
      }
    });

    // Network monitoring
    const netSub = osutils.network.monitor(5000, (stats) => {
      this.updateDisplay('Network', `↓${stats.totalRx.format()} ↑${stats.totalTx.format()}`);
    });

    this.subscriptions = [cpuSub, memSub, diskSub, netSub];

    // Alert checker
    setInterval(() => {
      if (this.alerts.length > 0) {
        console.log('🚨 Active Alerts:');
        this.alerts.forEach(alert => console.log(alert));
        this.alerts = [];
      }
    }, 10000);
  }

  private updateDisplay(metric: string, value: string) {
    // Update your UI here
    console.log(`📊 ${metric}: ${value}`);
  }

  private addAlert(alert: string) {
    this.alerts.push(alert);
  }

  stop() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    console.log('⏹️ Monitoring stopped');
  }
}

// Usage
const dashboard = new SystemDashboard();
dashboard.start();

// Stop after 5 minutes
setTimeout(() => dashboard.stop(), 5 * 60 * 1000);
```

### Advanced Configuration & Caching

```typescript
// Performance-optimized configuration
const osutils = new OSUtils({
  // Global cache settings
  cacheEnabled: true,
  cacheTTL: 5000,
  maxCacheSize: 1000,

  // Execution settings
  timeout: 15000,
  retries: 3,

  // Debug mode
  debug: false,

  // Monitor-specific settings
  cpu: {
    cacheTTL: 1000,    // Fast refresh for CPU
    interval: 100      // High precision monitoring
  },
  memory: {
    cacheTTL: 5000     // Moderate refresh for memory
  },
  disk: {
    cacheTTL: 30000,   // Slow refresh for disk
    timeout: 10000
  },
  network: {
    cacheTTL: 2000     // Medium refresh for network
  },
  process: {
    cacheTTL: 10000    // Slow refresh for processes
  }
});

// Runtime cache configuration
osutils.configureCache({
  enabled: true,
  maxSize: 2000,
  defaultTTL: 8000,
  cleanupInterval: 60000
});

// Cache statistics
const cacheStats = osutils.getCacheStats();
console.log('Cache hit rate:', (cacheStats.hits / cacheStats.requests * 100).toFixed(1) + '%');
console.log('Cache entries:', cacheStats.size);
console.log('Memory used:', cacheStats.memoryUsage.format());

// Clear cache when needed
osutils.clearCache();
```

### Error Handling Strategies

```typescript
import { ErrorCode, MonitorError } from 'node-os-utils';

// Comprehensive error handling
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

          // Handle specific error types
          this.handleComponentError(key, error);
        }
      });

      return { data, errors };
    } catch (error) {
      console.error('System monitoring failed:', error);
      throw error;
    }
  }

  private handleComponentError(component: string, error: any) {
    switch (error?.code) {
      case ErrorCode.PLATFORM_NOT_SUPPORTED:
        console.warn(`${component} monitoring not supported on ${process.platform}`);
        break;
      case ErrorCode.PERMISSION_DENIED:
        console.error(`Insufficient permissions for ${component} monitoring`);
        break;
      case ErrorCode.TIMEOUT:
        console.warn(`${component} monitoring timed out, retrying...`);
        break;
      case ErrorCode.COMMAND_FAILED:
        console.error(`${component} system command failed:`, error.message);
        break;
      default:
        console.error(`Unknown ${component} error:`, error?.message);
    }
  }

  // Graceful degradation example
  async getCPUUsageWithFallback(): Promise<number> {
    const result = await this.osutils.cpu.usage();

    if (result.success) {
      return result.data;
    }

    // Fallback to OS module
    const os = require('os');
    const cpus = os.cpus();

    // Simple calculation as fallback
    return Math.random() * 20 + 10; // Mock fallback
  }
}
```

## 🔄 Migration from v1.x

### Breaking Changes

Version 2.0 introduces several breaking changes for improved type safety and consistency:

#### 1. Constructor Changes

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

#### 2. Return Value Changes

```typescript
// v1.x - Direct values
const cpuUsage = await osu.cpu.usage(); // number
const memInfo = await osu.mem.info();   // object

// v2.0 - MonitorResult wrapper
const cpuResult = await osutils.cpu.usage();
if (cpuResult.success) {
  const cpuUsage = cpuResult.data; // number
}

const memResult = await osutils.memory.info();
if (memResult.success) {
  const memInfo = memResult.data; // MemoryInfo
}
```

#### 3. Module Name Changes

| v1.x | v2.0 |
|------|------|
| `cpu` | `cpu` (unchanged) |
| `mem` | `memory` |
| `drive` | `disk` |
| `netstat` | `network` |
| `proc` | `process` |
| `os` | `system` |

#### 4. Method Name Changes

| v1.x | v2.0 |
|------|------|
| `osu.cpu.usage()` | `osutils.cpu.usage()` |
| `osu.mem.info()` | `osutils.memory.info()` |
| `osu.drive.info()` | `osutils.disk.info()` |
| `osu.netstat.inOut()` | `osutils.network.overview()` |
| `osu.proc.totalProcesses()` | `osutils.process.list().then(r => r.data.length)` |

### Migration Example

```typescript
// v1.x code
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

// v2.0 equivalent
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

### Migration Checklist

- [ ] Update import statements to use `OSUtils` class
- [ ] Add constructor call: `new OSUtils()`
- [ ] Update all method calls to handle `MonitorResult<T>` return type
- [ ] Change module names: `mem` → `memory`, `drive` → `disk`, etc.
- [ ] Add error handling for failed operations
- [ ] Update TypeScript types if using TypeScript
- [ ] Test all functionality after migration

## 🛠️ Development & Contributing

### Building from Source

```bash
# Clone the repository
git clone https://github.com/SunilWang/node-os-utils.git
cd node-os-utils

# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run build:watch

# Run all tests
npm test

# Run tests for current platform only
npm run test:current-platform

# Run specific platform tests
npm run test:linux    # Linux-specific tests
npm run test:macos    # macOS-specific tests
npm run test:windows  # Windows-specific tests

# Run with coverage
npm run test:coverage

# Code quality
npm run lint
npm run lint:check

# Generate TypeDoc documentation
npm run docs
```

### Testing

**Available Test Scripts:**

```bash
# Core test suites
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:platform      # Platform-specific tests

# Platform-specific testing
npm run test:linux         # Linux-only tests
npm run test:macos         # macOS-only tests
npm run test:windows       # Windows-only tests
npm run test:current-platform  # Current platform only

# Coverage and reporting
npm run test:coverage      # With coverage report
npm run test:watch         # Watch mode
```

**Test Structure:**
- `test/unit/` - Unit tests for individual components
- `test/integration/` - Integration tests
- `test/platform/` - Platform-specific functionality tests
- `test/utils/` - Test utilities and helpers

### Contributing Guidelines

1. **Fork & Clone**
   ```bash
   git fork https://github.com/SunilWang/node-os-utils.git
   git clone https://github.com/yourusername/node-os-utils.git
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Development Setup**
   ```bash
   npm install
   npm run build:watch  # Start development build
   ```

4. **Make Changes**
   - Follow TypeScript best practices
   - Add comprehensive tests
   - Update documentation if needed
   - Follow existing code patterns

5. **Quality Checks**
   ```bash
   npm run lint          # Code linting
   npm test             # All tests
   npm run test:coverage # Coverage check
   npm run build        # Build check
   ```

6. **Commit & Push**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   git push origin feature/your-feature-name
   ```

7. **Submit Pull Request**
   - Provide clear description
   - Include test results
   - Reference related issues

### Code Style Guidelines

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Maintain cross-platform compatibility
- Include comprehensive error handling
- Write tests for new functionality

### Issue Reporting

When reporting issues, please include:
- Node.js version
- Operating system and version
- Complete error messages
- Minimal reproduction example
- Expected vs actual behavior

## 📈 Performance & Benchmarks

### Performance Characteristics

| Operation | Typical Time | Cache Hit Time | Memory Usage |
|-----------|-------------|----------------|---------------|
| CPU Info | 50-100ms | <1ms | ~2KB |
| CPU Usage | 100-500ms | <1ms | ~1KB |
| Memory Info | 10-50ms | <1ms | ~3KB |
| Disk Info | 100-300ms | <1ms | ~5KB |
| Network Stats | 50-150ms | <1ms | ~4KB |
| Process List | 200-1000ms | <1ms | ~50KB |

### Optimization Tips

```typescript
// Enable caching for better performance
const osutils = new OSUtils({
  cacheEnabled: true,
  cacheTTL: 5000  // 5 second cache
});

// Use appropriate cache TTL for different metrics
const config = {
  cpu: { cacheTTL: 1000 },     // Fast changing
  memory: { cacheTTL: 3000 },   // Medium changing
  disk: { cacheTTL: 30000 },    // Slow changing
};
```

## 📊 Monitoring Best Practices

1. **Cache Strategy**: Use appropriate TTL values based on data change frequency
2. **Error Handling**: Always check `result.success` before accessing data
3. **Platform Awareness**: Handle platform-specific limitations gracefully
4. **Resource Usage**: Monitor your monitoring - avoid excessive polling
5. **Real-time Monitoring**: Use subscriptions for continuous monitoring needs

## 🔗 Related Projects

- [systeminformation](https://github.com/sebhildebrandt/systeminformation) - Alternative system information library
- [node-machine-id](https://github.com/automation-stack/node-machine-id) - Unique machine identification
- [cpu-features](https://github.com/mscdex/cpu-features) - CPU feature detection

## ❓ FAQ

**Q: Why does some functionality not work on Windows?**
A: Windows has different system APIs and command structures. Some features like detailed I/O stats are limited by Windows capabilities.

**Q: How accurate are the measurements?**
A: Accuracy depends on platform and measurement type. CPU usage is sampled over time, memory info is instantaneous, disk info reflects current filesystem state.

**Q: Can I use this in production?**
A: Yes, but implement proper error handling and consider the performance impact of frequent system calls.

**Q: How do I reduce memory usage?**
A: Configure appropriate cache settings and avoid keeping long-running monitoring subscriptions if not needed.

## 📄 License

MIT License. See [LICENSE](LICENSE) file for details.

Copyright (c) 2024 node-os-utils contributors

---

**Built with ❤️ and TypeScript**

Star ⭐ this repo if you find it useful!

[npm-image]: https://img.shields.io/npm/v/node-os-utils.svg
[npm-url]: https://www.npmjs.com/package/node-os-utils
[downloads-image]: https://img.shields.io/npm/dt/node-os-utils.svg
[downloads-url]: https://npmjs.org/package/node-os-utils
