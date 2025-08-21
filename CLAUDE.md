# CLAUDE.md

这个文件为使用 Claude Code (claude.ai/code) 处理此仓库代码提供指导。

## 项目概述

node-os-utils v2.0 是一个完全重写的现代化跨平台操作系统监控工具库。该版本从零开始使用 TypeScript 重构，提供完整的类型安全系统监控功能。该库提供 CPU、内存、磁盘、网络、进程等系统信息的 Node.js API，支持 Linux、macOS 和 Windows 平台。

**⚠️ 重要说明**: 这是一个主要版本更新，与 v1.x 版本不兼容。所有 1.x 版本的向后兼容代码已被完全移除。

## 核心架构

### v2.0 现代化架构特点
项目采用完全重构的 TypeScript-first 架构：
- **严格类型安全**: 100% TypeScript 覆盖，启用严格模式类型检查
- **统一错误处理**: 所有操作返回 `MonitorResult<T>` 类型，确保一致性
- **智能缓存系统**: 内置 TTL 缓存管理器，可配置缓存策略
- **平台适配器模式**: 清晰的平台抽象层，支持扩展新平台
- **事件驱动监控**: 基于 EventEmitter 的实时订阅系统
- **零运行时依赖**: 仅使用 Node.js 内置模块，无外部依赖
- **DataSize 工具类**: 智能单位转换和格式化

### 关键组件

#### 1. 监控器层 (src/monitors/)
- **BaseMonitor**: 所有监控器的抽象基类，提供缓存、事件、配置管理
- **CPUMonitor**: CPU 信息、使用率、温度、频率监控
- **MemoryMonitor**: 内存使用情况、虚拟内存、内存压力
- **DiskMonitor**: 磁盘容量、I/O 统计、挂载点信息
- **NetworkMonitor**: 网络接口、流量统计、连接状态
- **ProcessMonitor**: 进程列表、资源使用、进程树
- **SystemMonitor**: 系统信息、启动时间、用户会话

#### 2. 平台适配层 (src/adapters/)
- **AdapterFactory**: 自动检测平台并创建相应适配器
- **LinuxAdapter**: Linux 系统专用适配器
- **MacOSAdapter**: macOS 系统专用适配器
- **WindowsAdapter**: Windows 系统适配器（继承 macOS 基础实现）

#### 3. 核心组件 (src/core/)
- **BaseMonitor**: 监控器基类，提供通用功能和生命周期管理
- **CacheManager**: 缓存管理器，提供 TTL 缓存和性能优化
- **PlatformAdapter**: 平台适配器接口定义

#### 4. 工具组件 (src/utils/)
- **CommandExecutor**: 系统命令执行器，提供跨平台命令执行和错误处理

#### 5. 类型系统 (src/types/)
- **完整的 TypeScript 类型定义**
- **错误类型和错误码枚举**
- **配置选项类型**
- **监控数据结构类型**

### 错误处理模式
所有异步操作都遵循统一的错误处理模式：
- 使用 `MonitorResult<T>` 包装返回结果
- 提供 `success` 字段表示操作是否成功
- 错误时提供详细的错误信息和错误码
- 自动处理平台不支持的功能

## 开发命令

### 构建系统
```bash
npm run build          # 编译 TypeScript 到 dist/
npm run build:watch    # 监控模式编译
npm run dev           # 开发模式（相当于 build:watch）
npm run clean         # 清理编译输出
```

### 测试系统
```bash
npm test              # 运行完整测试套件
npm run test:unit     # 运行单元测试
npm run test:integration  # 运行集成测试
npm run test:platform    # 运行平台特定测试
npm run test:linux       # 运行 Linux 测试
npm run test:macos       # 运行 macOS 测试  
npm run test:windows     # 运行 Windows 测试
npm run test:current-platform  # 运行当前平台测试
npm run test:coverage           # 运行测试并生成覆盖率报告
```

### 代码质量
```bash
npm run lint          # 运行 ESLint 并自动修复
npm run lint:check    # 仅检查代码质量问题
```

### 文档生成
```bash
npm run docs          # 生成 TypeDoc API 文档
```

## 代码结构指南

### 添加新监控功能
1. 在 `src/monitors/` 目录创建新的监控器类
2. 继承 `BaseMonitor<T>` 并实现必要的抽象方法
3. 在对应的平台适配器中添加底层系统调用
4. 在 `src/types/monitors.ts` 中定义相关类型
5. 在 `src/index.ts` 中导出新功能
6. 在 `test/platform/` 中添加平台测试

### 平台命令集成
- 使用 `CommandExecutor` 执行系统命令
- 所有命令都会自动设置 UTF-8 locale 和错误处理
- 命令失败时自动转换为相应的 MonitorError

### 跨平台考虑事项
- 项目支持 Linux、macOS 和 Windows
- 系统命令需要考虑不同平台的差异
- 使用正则表达式解析命令输出时需要测试多平台兼容性
- 利用适配器模式处理平台特定逻辑

## 配置系统

### 全局配置
通过 `new OSUtils(config)` 或 `createOSUtils(config)` 配置：

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
  cpu: { cacheTTL: 30000 },
  memory: { cacheTTL: 5000 },
  disk: { cacheTTL: 60000 }
});
```

### 监控器配置模式
每个监控器支持链式配置：

```typescript
// 不再支持链式配置方法
// v2.0 通过构造函数配置或运行时配置

const osutils = new OSUtils({
  cpu: { 
    cacheTTL: 30000,
    timeout: 5000,
    interval: 100  // 监控间隔
  },
  memory: {
    cacheTTL: 5000,
    includeBuffers: true  // 包含缓冲区信息
  }
});

// 或者运行时配置
osutils.updateConfig({
  cpu: { cacheTTL: 60000 }
});
```

## API 使用模式

### 基本用法
```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils();

// 获取 CPU 使用率
const cpuUsage = await osutils.cpu.usage();
if (cpuUsage.success) {
  console.log('CPU Usage:', cpuUsage.data);
}

// 获取内存信息
const memInfo = await osutils.memory.info();
if (memInfo.success) {
  console.log('Memory Info:', memInfo.data);
}
```

### 实时监控
```typescript
// 监控 CPU 使用率
const subscription = osutils.cpu.monitor(1000, (usage) => {
  console.log('Real-time CPU usage:', usage);
});

// 停止监控
subscription.unsubscribe();
```

### v2.0 API 模式
**所有 API 都返回 MonitorResult<T> 类型，必须检查 success 字段：**

```typescript
import { OSUtils } from 'node-os-utils';

const osutils = new OSUtils();

// v2.0 统一的错误处理模式
const cpuResult = await osutils.cpu.usage();
if (cpuResult.success) {
  console.log('CPU Usage:', cpuResult.data + '%');
} else {
  console.error('CPU monitoring failed:', cpuResult.error?.message);
  console.error('Error code:', cpuResult.error?.code);
}

// 创建工厂函数（替代方案）
import { createOSUtils } from 'node-os-utils';
const osutils2 = createOSUtils({ cacheEnabled: true });
```

### MonitorResult<T> 类型结构
```typescript
interface MonitorResult<T> {
  success: boolean;
  data?: T;
  error?: MonitorError;
  platform: string;
  timestamp: Date;
  cached?: boolean;
}

interface MonitorError {
  code: ErrorCode;
  message: string;
  platform: string;
  component: string;
  timestamp: Date;
}

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

## 测试模式

### 测试结果验证模式
所有测试都必须遵循 `MonitorResult<T>` 模式验证：

```typescript
// 基本成功测试
const result = await osutils.cpu.info();
expect(result.success).to.be.true;
if (result.success) {
  expect(result.data).to.have.property('model');
  expect(result.data.model).to.be.a('string');
  expect(result.data.cores).to.be.a('number').and.greaterThan(0);
}
expected(result.platform).to.equal(process.platform);
expected(result.timestamp).to.be.a('date');
```

### 平台特定功能测试
```typescript
// 处理平台不支持的功能
const tempResult = await osutils.cpu.temperature();
if (tempResult.success) {
  // 平台支持温度监控
  expect(tempResult.data.current).to.be.a('number');
} else {
  // 平台不支持或权限不足
  expect(tempResult.error?.code).to.be.oneOf([
    ErrorCode.PLATFORM_NOT_SUPPORTED,
    ErrorCode.PERMISSION_DENIED
  ]);
}
```

### 错误类型验证
```typescript
// 具体错误码检查
const invalidResult = await osutils.disk.info('/nonexistent');
if (!invalidResult.success) {
  expect(invalidResult.error?.code).to.be.oneOf([
    ErrorCode.NOT_FOUND,
    ErrorCode.INVALID_INPUT
  ]);
  expect(invalidResult.error?.message).to.be.a('string');
  expect(invalidResult.error?.component).to.equal('disk');
}
```

### 缓存功能测试
```typescript
// 测试缓存功能
const osutilsWithCache = new OSUtils({ cacheEnabled: true, cacheTTL: 5000 });

// 第一次调用
const first = await osutilsWithCache.cpu.usage();
expected(first.cached).to.be.false;

// 第二次调用应该来自缓存
const second = await osutilsWithCache.cpu.usage();
if (second.success) {
  expect(second.cached).to.be.true;
  expect(second.data).to.equal(first.data);
}
```

## 依赖和工具

### 运行时依赖
项目无运行时依赖，仅使用 Node.js 内置模块：
- `child_process` - 系统命令执行
- `events` - 事件发射器
- `util` - 工具函数
- `os` - 操作系统信息

### 开发依赖
- **TypeScript** (^5.4.0) - TypeScript 编译器
- **Mocha** (^10.0.0) - 测试框架
- **Chai** (^4.3.0) - 断言库
- **ESLint** - 代码质量检查
- **TypeDoc** - API 文档生成
- **NYC** - 代码覆盖率工具

## 版本要求

### Node.js 版本
- **最低要求**: Node.js 18.0.0+
- **推荐版本**: Node.js 20.x 或 22.x
- **测试支持**: 自动测试 Node.js 18、20、22

### TypeScript 配置
- 严格模式启用
- 目标版本: ES2020
- 模块系统: CommonJS (编译输出)
- 类型声明文件自动生成

## v2.0 开发注意事项

### 🚫 绝对禁止的操作
1. **添加任何 v1.x 兼容代码** - v2.0 完全不兼容 v1.x，不得添加任何向后兼容代码
2. **绕过 MonitorResult<T> 模式** - 所有监控方法必须返回 MonitorResult<T>
3. **忽略错误处理** - 必须为每个可能失败的操作提供适当的错误处理
4. **跳过平台测试** - 所有新功能必须在三个主要平台上进行测试

### ✅ 必须遵循的原则
1. **TypeScript 严格模式** - 启用所有严格类型检查，不得使用 `any` 类型
2. **统一错误处理** - 使用 ErrorCode 枚举，提供详细错误信息
3. **平台适配器模式** - 所有平台特定代码必须放在相应的适配器中
4. **缓存策略** - 合理使用缓存，避免频繁的系统调用
5. **事件清理** - 确保所有监控订阅都能正确取消
6. **单元测试覆盖** - 新功能必须包含完整的测试用例

### 📁 文件操作指南
1. **不创建不必要的文件** - 仅在绝对必要时创建新文件
2. **优先编辑现有文件** - 始终优先编辑现有文件而不是创建新文件
3. **不主动创建文档** - 除非明确要求，否则不创建 *.md 文件
4. **遵循项目结构** - 新文件必须放在正确的目录中

### 🔧 代码质量要求
1. **TypeScript 最佳实践** - 使用现代 TypeScript 特性和模式
2. **跨平台兼容性** - 确保所有功能在 Linux、macOS、Windows 上正常工作
3. **性能优化** - 合理使用缓存，避免阻塞操作
4. **内存管理** - 正确处理事件监听器的生命周期
5. **错误恢复** - 提供优雅的错误恢复机制

### 🧪 测试要求
1. **完整的平台测试** - 在所有支持的平台上测试功能
2. **错误场景覆盖** - 测试各种错误条件和边界情况
3. **性能测试** - 验证缓存和性能优化的有效性
4. **类型安全测试** - 确保 TypeScript 类型定义的正确性

## API 设计模式

### DataSize 类使用
```typescript
// 所有大小相关数据都使用 DataSize 类
const memInfo = await osutils.memory.info();
if (memInfo.success) {
  console.log('总内存:', memInfo.data.total.gigabytes + ' GB');
  console.log('可用内存:', memInfo.data.available.format());
  console.log('人性化显示:', memInfo.data.used.toHuman());
}
```

### 实时监控模式
```typescript
// 监控订阅管理
class MonitoringManager {
  private subscriptions: any[] = [];
  
  startMonitoring() {
    const cpuSub = osutils.cpu.monitor(1000, (usage) => {
      this.handleCPUUsage(usage);
    }, (error) => {
      this.handleError('cpu', error);
    });
    
    this.subscriptions.push(cpuSub);
  }
  
  stopAll() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }
}
```

### 配置管理模式
```typescript
// 层次化配置
const osutils = new OSUtils({
  // 全局默认配置
  cacheEnabled: true,
  cacheTTL: 5000,
  timeout: 10000,
  debug: false,
  
  // 监控器特定配置
  cpu: {
    cacheTTL: 1000,    // CPU 数据变化快，短缓存
    timeout: 5000
  },
  memory: {
    cacheTTL: 3000     // 内存数据中等频率
  },
  disk: {
    cacheTTL: 30000,   // 磁盘数据变化慢，长缓存
    timeout: 15000
  }
});

// 运行时配置调整
osutils.configureCache({
  enabled: true,
  maxSize: 2000,
  defaultTTL: 8000
});
```