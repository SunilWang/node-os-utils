# node-os-utils v2.0 测试指南

本文档介绍如何运行和维护 `node-os-utils` v2.0 的测试套件，包括跨平台测试、TypeScript 类型测试和 MonitorResult<T> 模式验证。

> **重要**: 本测试指南适用于 v2.0 版本，与 v1.x 版本的测试模式完全不同。

## 🚀 快速开始

### 构建并运行测试
```bash
# 首先构建 TypeScript
npm run build

# 运行当前平台的测试
npm run test:current-platform

# 运行完整测试套件
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage
```

### 开发模式
```bash
# 监控模式构建
npm run build:watch

# 另一个终端运行测试
npm run test:platform
```

## 📁 测试结构概览

```
test/
├── utils/                    # 测试工具和基础类
│   ├── test-base.ts         # 基础测试工具类（asyncTest, longTest, PerformanceMonitor）
│   └── platform-specific.ts # 平台特定工具（LinuxTestUtils, MacOSTestUtils, WindowsTestUtils）
├── platform/                # 平台特定测试（v2.0 重构）
│   ├── linux.test.ts        # Linux 特定测试（使用 MonitorResult<T> 模式）
│   ├── macos.test.ts        # macOS 特定测试（使用 MonitorResult<T> 模式）
│   ├── windows.test.ts      # Windows 特定测试（使用 MonitorResult<T> 模式）
│   └── README.md            # 平台测试详细文档
├── config/                  # 测试配置
│   └── test-config.ts       # 测试配置参数（超时、重试等）
├── unit/                    # 单元测试目录（未来扩展）
├── integration/             # 集成测试目录（未来扩展）
├── fixtures/                # 测试数据和模拟数据
└── .mocharc.json            # Mocha 配置文件
```

## 🖥️ 平台特定测试

### v2.0 测试命令

| 命令 | 描述 | 用途 |
|------|------|------|
| `npm test` | 运行完整测试套件 | 主要测试命令 |
| `npm run test:unit` | 运行单元测试 | 组件级测试 |
| `npm run test:integration` | 运行集成测试 | 系统级测试 |
| `npm run test:platform` | 运行平台特定测试 | 跨平台兼容性 |
| `npm run test:linux` | 运行 Linux 特定测试 | Linux 专用功能 |
| `npm run test:macos` | 运行 macOS 特定测试 | macOS 专用功能 |
| `npm run test:windows` | 运行 Windows 特定测试 | Windows 专用功能 |
| `npm run test:current-platform` | 运行当前平台测试 | 本地开发 |
| `npm run test:coverage` | 生成测试覆盖率报告 | 质量保证 |

### 平台检测机制

测试系统会自动检测当前运行的操作系统：

- **Linux**: `os.platform() === 'linux'`
- **macOS**: `os.platform() === 'darwin'`  
- **Windows**: `os.platform() === 'win32'`

不匹配的平台测试会被自动跳过。

## 🔧 v2.0 测试架构特色

### 1. MonitorResult<T> 模式验证
- 所有测试都验证 `MonitorResult<T>` 返回类型
- 统一的成功/失败检查模式
- 完整的错误码和错误信息验证
- 平台适配的优雅降级测试

### 2. TypeScript 严格类型测试
- 完整的类型安全验证
- 编译时类型错误检测
- DataSize 类功能测试
- 接口一致性验证

### 3. 智能平台适配测试
- 自动检测和跳过不支持的功能
- 平台特定的验证逻辑
- 错误码的平台特异性检查
- 性能基准的平台差异分析

### 4. 系统监控功能测试
- **CPU 监控**: info()、usage()、loadAverage()、temperature()
- **内存监控**: info()、usage()、pressure()、swap()
- **磁盘监控**: info()、usage()、stats()、healthCheck()
- **网络监控**: interfaces()、overview()、stats()、gateway()
- **进程监控**: list()、info()、findByName()、topCpu()
- **系统监控**: info()、uptime()、users()、healthCheck()

### 5. 缓存系统测试
- TTL 缓存功能验证
- 缓存命中率测试
- 缓存失效和清理
- 配置更新的缓存影响

### 6. 实时监控测试
- 事件订阅和取消订阅
- 监控间隔准确性
- 错误处理回调
- 内存泄漏预防

### 7. 错误处理综合测试
- 各种 ErrorCode 的触发条件
- 平台不支持功能的处理
- 权限不足的优雅处理
- 超时和重试机制

## 🔬 深度测试说明

### Linux 测试重点（v2.0 增强）
- **文件系统集成**: `/proc` 文件系统的精确解析和错误处理
- **命令执行**: 系统命令的统一封装和错误转换
- **数据准确性**: 与 `/proc/loadavg`、`/proc/meminfo`、`/proc/stat` 的数据一致性
- **权限处理**: 各种权限限制场景的优雅处理
- **性能优化**: Linux 特有的高性能数据获取方式

### macOS 测试重点（v2.0 增强）
- **系统适配**: Intel 和 Apple Silicon 的差异处理
- **命令集成**: `vm_stat`、`top`、`df`、`netstat` 的统一接口
- **文件系统**: APFS 和 HFS+ 的兼容性
- **网络接口**: macOS 特有的网络接口命名规范
- **温度监控**: macOS 温度传感器访问的限制和处理

### Windows 测试重点（v2.0 增强）
- **命令行工具**: PowerShell 和传统命令的混合使用
- **驱动器处理**: Windows 盘符系统的完整支持
- **权限模型**: Windows UAC 和权限限制的处理
- **服务依赖**: Windows 服务可用性的检测和处理
- **编码处理**: Windows 命令输出的字符编码问题
- **性能限制**: Windows 系统调用的性能特性

## ⚡ v2.0 性能基准测试

### 响应时间要求
- **快速操作** (CPU usage, Memory usage): < 1000ms
- **中等操作** (CPU info, Memory info, System info): < 2000ms
- **慢速操作** (Disk info, Process list): < 5000ms
- **复杂操作** (Network overview, Process tree): < 10000ms

#### 缓存性能要求
- **缓存命中**: < 5ms
- **缓存清理**: < 100ms
- **缓存内存**: < 50MB (1000 条目)

#### 内存使用标准
- **单次调用**: < 5MB 增长
- **重复调用**: < 10MB 总增长
- **长期监控**: < 100MB (24小时)
- **缓存占用**: < 50MB (默认配置)

#### 并发性能要求
- **并发调用**: 10个并发请求稳定响应
- **监控订阅**: 支持 20+ 并发监控
- **错误恢复**: 99% 成功率 (1000次调用)

### 平台性能基线

| 平台 | CPU Info | Memory Info | Disk Info | Network Stats | 特性 |
|------|----------|-------------|-----------|---------------|---------|
| **Linux** | 100-300ms | 50-150ms | 200-800ms | 100-400ms | 直接文件访问，最佳性能 |
| **macOS** | 200-500ms | 100-300ms | 300-1000ms | 200-600ms | 系统命令，中等性能 |
| **Windows** | 500-1500ms | 300-800ms | 1000-3000ms | 500-1500ms | 命令行开销，相对较慢 |

### 缓存效果测试
- **无缓存**: 原始系统调用时间
- **缓存命中**: < 5ms 响应时间
- **缓存失效**: 自动重新获取并更新
- **缓存清理**: 内存使用控制在限制范围内

## 🛠️ 开发和调试

### v2.0 测试调试和筛选

#### 运行特定测试类别
```bash
# 只运行 CPU 相关测试
npx mocha "dist/test/platform/*.js" --grep "CPU"

# 只运行内存相关测试  
npx mocha "dist/test/platform/*.js" --grep "Memory"

# 只运行缓存相关测试
npx mocha "dist/test/**/*.js" --grep "Cache"

# 只运行错误处理测试
npx mocha "dist/test/**/*.js" --grep "Error"

# 只运行 MonitorResult 验证测试
npx mocha "dist/test/**/*.js" --grep "MonitorResult"
```

#### 调试模式和详细输出
```bash
# 显示详细测试输出
npm run test:platform -- --reporter spec

# 运行单个测试文件（增加超时）
npx mocha dist/test/platform/linux.test.js --timeout 60000

# 运行测试并显示错误堆栈
npx mocha "dist/test/**/*.js" --reporter tap

# 只运行失败的测试
npx mocha "dist/test/**/*.js" --bail
```

#### TypeScript 编译测试
```bash
# 检查 TypeScript 编译错误
npm run build

# 监控模式进行开发测试
npm run build:watch &
npm run test:platform -- --watch
```

### v2.0 测试开发指南

#### 1. 选择合适的测试文件
- **平台特定功能** → `test/platform/[platform].test.ts`
- **核心功能单元测试** → `test/unit/`
- **集成测试** → `test/integration/`
- **类型测试** → 在对应测试文件中添加类型验证

#### 2. 导入 v2.0 测试工具
```typescript
import { expect } from 'chai'
import { 
  PlatformUtils, 
  TestValidators, 
  TestAssertions,
  asyncTest, 
  longTest,
  PerformanceMonitor 
} from '../utils/test-base'
import { OSUtils, ErrorCode } from '../../src'
```

#### 3. v2.0 测试用例模式
```typescript
// v2.0 标准测试模式
it('应该正确获取内存信息', asyncTest(async function() {
  const osutils = new OSUtils()
  const result = await osutils.memory.info()
  
  // 验证 MonitorResult<T> 结构
  expect(result).to.have.property('success')
  expect(result).to.have.property('platform')
  expect(result).to.have.property('timestamp')
  
  if (result.success) {
    // 成功情况：验证数据结构
    expect(result.data).to.exist
    expect(result.data.total).to.have.property('bytes')
    expect(result.data.total.bytes).to.be.a('number').and.greaterThan(0)
    expect(result.data.available).to.have.property('gigabytes')
    expect(result.data.usagePercentage).to.be.a('number').and.at.least(0).and.at.most(100)
  } else {
    // 失败情况：验证错误信息
    expect(result.error).to.exist
    expect(result.error!.code).to.be.a('string')
    expect(result.error!.message).to.be.a('string')
    
    // 检查是否为预期的错误类型
    expect(result.error!.code).to.be.oneOf([
      ErrorCode.PLATFORM_NOT_SUPPORTED,
      ErrorCode.PERMISSION_DENIED,
      ErrorCode.COMMAND_FAILED
    ])
  }
}))

// 平台特定测试
it('应该处理平台不支持的功能', asyncTest(async function() {
  const osutils = new OSUtils()
  const result = await osutils.cpu.temperature()
  
  if (!result.success) {
    if (result.error?.code === ErrorCode.PLATFORM_NOT_SUPPORTED) {
      this.skip() // 平台不支持，跳过测试
    } else {
      expect(result.error?.code).to.be.oneOf([
        ErrorCode.PERMISSION_DENIED,
        ErrorCode.COMMAND_FAILED
      ])
    }
  } else {
    // 如果支持，验证数据格式
    expect(result.data.current).to.be.a('number')
  }
}))

// 缓存功能测试
it('应该正确使用缓存机制', asyncTest(async function() {
  const osutils = new OSUtils({ cacheEnabled: true, cacheTTL: 5000 })
  
  // 第一次调用
  const first = await osutils.cpu.usage()
  expect(first.cached).to.be.false
  
  // 第二次调用应该来自缓存
  const second = await osutils.cpu.usage()
  if (second.success) {
    expect(second.cached).to.be.true
  }
}))
```

#### 4. 性能测试模式
```typescript
it('系统调用应该在合理时间内完成', longTest(async function() {
  const osutils = new OSUtils()
  const monitor = new PerformanceMonitor()
  
  await monitor.time('cpu-info', () => osutils.cpu.info())
  await monitor.time('memory-info', () => osutils.memory.info())
  
  const report = monitor.getReport()
  
  // 基于平台设置不同的期望值
  const maxTime = PlatformUtils.isWindows() ? 2000 : 1000
  expect(report['cpu-info']).to.be.below(maxTime)
  expect(report['memory-info']).to.be.below(maxTime)
}))
```

## 🔒 v2.0 CI/CD 配置示例

### GitHub Actions 完整配置
```yaml
name: node-os-utils v2.0 Tests
on: 
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  # TypeScript 编译检查
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint:check
      - run: npm run build
      - run: npm audit --audit-level=high

  # Linux 平台测试
  test-linux:
    needs: build
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:linux
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        if: matrix.node-version == 20

  # macOS 平台测试
  test-macos:
    needs: build
    runs-on: macos-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:macos

  # Windows 平台测试
  test-windows:
    needs: build
    runs-on: windows-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:windows
      - name: Test Windows-specific features
        run: |
          npm run test:platform -- --grep "Windows"
        shell: pwsh

  # 性能基准测试
  performance:
    needs: [test-linux, test-macos, test-windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:platform -- --grep "Performance"
      - name: Generate performance report
        run: |
          npm run test:coverage -- --reporter json > coverage.json
          echo "Performance test completed"
```

### v2.0 测试覆盖率

#### 生成覆盖率报告
```bash
# 运行测试并生成覆盖率
npm run test:coverage

# 生成 HTML 格式报告
npx nyc report --reporter html

# 生成多种格式报告
npx nyc report --reporter html --reporter text --reporter lcov

# 检查覆盖率阈值
npx nyc check-coverage --lines 80 --functions 80 --branches 75
```

#### 覆盖率目标
- **代码行覆盖率**: ≥ 85%
- **函数覆盖率**: ≥ 90%
- **分支覆盖率**: ≥ 80%
- **语句覆盖率**: ≥ 85%

#### 平台特定覆盖率
- **Linux 平台**: 完整功能覆盖 (95%+)
- **macOS 平台**: 核心功能覆盖 (90%+)
- **Windows 平台**: 支持功能覆盖 (85%+)

## 📊 v2.0 测试配置

#### 超时时间设置（test-config.ts）
```typescript
export const testTimeouts = {
  // 基本操作超时
  quick: 2000,         // 快速操作（缓存命中等）
  default: 10000,      // 默认操作（大多数系统调用）
  long: 30000,         // 长时间操作（进程列表等）
  performance: 5000,   // 性能测试专用
  
  // 平台特定调整
  linux: {
    cpu: 5000,
    memory: 3000,
    disk: 8000,
    network: 5000,
    process: 15000
  },
  macos: {
    cpu: 8000,
    memory: 5000,
    disk: 12000,
    network: 8000,
    process: 20000
  },
  windows: {
    cpu: 15000,
    memory: 10000,
    disk: 20000,
    network: 15000,
    process: 30000
  }
}
```

#### 重试和错误处理配置
```typescript
export const testConfig = {
  // 重试配置
  retries: {
    flaky: 3,           // 不稳定测试重试次数
    timeout: 2,         // 超时重试次数
    error: 1            // 一般错误重试次数
  },
  
  // 缓存测试配置
  cache: {
    testTTL: 1000,      // 测试用缓存 TTL
    maxSize: 100,       // 测试缓存最大条目
    cleanupInterval: 5000  // 清理间隔
  },
  
  // 性能基线
  performance: {
    maxMemoryGrowth: 50 * 1024 * 1024,  // 50MB
    maxResponseTime: {
      fast: 1000,       // 快速操作
      normal: 5000,     // 普通操作
      slow: 15000       // 慢速操作
    }
  }
}
```

#### Mocha 配置（.mocharc.json）
```json
{
  "require": ["ts-node/register"],
  "extensions": ["ts"],
  "spec": "dist/test/**/*.js",
  "timeout": 30000,
  "bail": false,
  "exit": true,
  "reporter": "spec",
  "recursive": true,
  "grep": "",
  "slow": 5000
}
```

## 🎯 v2.0 测试最佳实践

#### 1. MonitorResult<T> 模式验证
```typescript
// ✅ 正确的测试模式
const result = await osutils.cpu.info()
expect(result.success).to.be.a('boolean')
if (result.success) {
  expect(result.data).to.exist
  // 验证具体数据结构
} else {
  expect(result.error).to.exist
  expect(result.error!.code).to.be.a('string')
}

// ❌ 错误的测试模式 - 直接访问 data
expect(result.data.model).to.be.a('string') // 可能导致测试失败
```

#### 2. 平台兼容性处理
```typescript
// ✅ 正确的平台检查
if (!result.success) {
  if (result.error?.code === ErrorCode.PLATFORM_NOT_SUPPORTED) {
    this.skip() // 跳过不支持的平台
    return
  }
  expect(result.error?.code).to.be.oneOf([/* 其他预期错误 */])
}

// ❌ 错误的处理方式
if (process.platform === 'win32') {
  this.skip() // 硬编码平台跳过
}
```

#### 3. 缓存测试策略
```typescript
// ✅ 缓存功能验证
const osutils = new OSUtils({ cacheEnabled: true, cacheTTL: 2000 })
const first = await osutils.memory.info()
expect(first.cached).to.be.false

// 立即第二次调用
const second = await osutils.memory.info()
if (second.success) {
  expect(second.cached).to.be.true
  expect(second.data).to.deep.equal(first.data)
}

// 等待 TTL 过期后测试
await new Promise(resolve => setTimeout(resolve, 2100))
const third = await osutils.memory.info()
if (third.success) {
  expect(third.cached).to.be.false
}
```

#### 4. 性能测试准则
```typescript
// ✅ 性能测试模式
it('应该在指定时间内完成', longTest(async function() {
  const monitor = new PerformanceMonitor()
  const osutils = new OSUtils()
  
  await monitor.time('operation', async () => {
    for (let i = 0; i < 10; i++) {
      await osutils.cpu.usage()
    }
  })
  
  const report = monitor.getReport()
  const avgTime = report['operation'] / 10
  
  // 基于平台设置合理期望
  const expectedTime = PlatformUtils.isWindows() ? 2000 : 1000
  expect(avgTime).to.be.below(expectedTime)
}))
```

#### 5. 错误场景覆盖
```typescript
// ✅ 全面的错误测试
it('应该处理各种错误情况', asyncTest(async function() {
  const osutils = new OSUtils()
  
  // 测试无效参数
  const invalidResult = await osutils.disk.info('/nonexistent/path')
  if (!invalidResult.success) {
    expect(invalidResult.error?.code).to.be.oneOf([
      ErrorCode.NOT_FOUND,
      ErrorCode.INVALID_INPUT,
      ErrorCode.PERMISSION_DENIED
    ])
  }
  
  // 测试超时
  const quickOsutils = new OSUtils({ timeout: 1 }) // 1ms 超时
  const timeoutResult = await quickOsutils.process.list()
  if (!timeoutResult.success) {
    expect(timeoutResult.error?.code).to.equal(ErrorCode.TIMEOUT)
  }
}))
```

#### 6. 内存和资源管理
```typescript
// ✅ 监控订阅的正确清理
it('应该正确管理监控订阅', asyncTest(async function() {
  const osutils = new OSUtils()
  const subscriptions: any[] = []
  
  try {
    // 创建多个监控订阅
    for (let i = 0; i < 5; i++) {
      const sub = osutils.cpu.monitor(1000, () => {})
      subscriptions.push(sub)
    }
    
    // 验证监控正常工作
    await new Promise(resolve => setTimeout(resolve, 2000))
    
  } finally {
    // 确保清理所有订阅
    subscriptions.forEach(sub => sub.unsubscribe())
  }
  
  // 验证内存使用没有异常增长
  const memUsage = process.memoryUsage()
  expect(memUsage.heapUsed).to.be.below(100 * 1024 * 1024) // 100MB
}))
```

#### 7. 数据一致性验证
```typescript
// ✅ 跨方法数据一致性检查
it('相关方法应该返回一致的数据', asyncTest(async function() {
  const osutils = new OSUtils()
  
  const [infoResult, usageResult] = await Promise.all([
    osutils.memory.info(),
    osutils.memory.usage()
  ])
  
  if (infoResult.success && usageResult.success) {
    // 验证使用率计算的一致性
    const calculatedUsage = (infoResult.data.used.bytes / infoResult.data.total.bytes) * 100
    const tolerance = 5 // 5% 容差
    expect(Math.abs(calculatedUsage - usageResult.data)).to.be.below(tolerance)
  }
}))
```

## 🐛 v2.0 常见问题解答

#### Q: MonitorResult<T> 测试总是失败怎么办？
**A**: 确保始终先检查 `result.success` 字段：
```typescript
// ✅ 正确方式
if (result.success) {
  expect(result.data.property).to.exist
} else {
  expect(result.error).to.exist
}

// ❌ 错误方式 - 直接访问可能不存在的 data
expect(result.data.property).to.exist
```

#### Q: 平台特定功能测试如何处理？
**A**: 使用错误码判断而不是硬编码平台检查：
```typescript
if (!result.success && result.error?.code === ErrorCode.PLATFORM_NOT_SUPPORTED) {
  this.skip() // 动态跳过不支持的功能
}
```

#### Q: TypeScript 编译错误导致测试失败？
**A**: 确保测试代码也遵循 v2.0 的类型要求：
```typescript
// 使用类型断言或可选链
const osutils: OSUtils = new OSUtils()
expect(result.error?.code).to.be.a('string')
```

#### Q: 缓存测试不稳定怎么办？
**A**: 使用专门的缓存配置进行测试，避免与其他测试冲突：
```typescript
const testOsutils = new OSUtils({ 
  cacheEnabled: true, 
  cacheTTL: 1000,
  maxCacheSize: 10 
})
```

#### Q: 性能测试在 CI 环境中失败？
**A**: 针对 CI 环境调整性能期望值：
```typescript
const isCI = process.env.CI === 'true'
const timeoutMultiplier = isCI ? 3 : 1
const maxTime = 1000 * timeoutMultiplier
expected(executionTime).to.be.below(maxTime)
```

#### Q: 如何测试实时监控功能？
**A**: 使用 Promise 和定时器进行异步监控测试：
```typescript
it('should monitor CPU usage', asyncTest(async function() {
  const osutils = new OSUtils()
  const results: number[] = []
  
  const subscription = osutils.cpu.monitor(500, (usage) => {
    results.push(usage)
  })
  
  await new Promise(resolve => setTimeout(resolve, 1500))
  subscription.unsubscribe()
  
  expect(results.length).to.be.at.least(2)
}))
```

#### Q: 错误处理测试如何编写？
**A**: 针对每个 ErrorCode 创建对应的触发条件：
```typescript
// 权限错误测试
const restrictedResult = await osutils.system.sensitiveOperation()
if (!restrictedResult.success) {
  expect(restrictedResult.error?.code).to.equal(ErrorCode.PERMISSION_DENIED)
}

// 超时错误测试
const quickOsutils = new OSUtils({ timeout: 1 })
const timeoutResult = await quickOsutils.process.list()
expect(timeoutResult.error?.code).to.equal(ErrorCode.TIMEOUT)
```

#### Q: 如何添加新的监控功能测试？
**A**: 遵循 v2.0 测试模式：
1. 创建对应的监控器测试文件
2. 实现 MonitorResult<T> 验证
3. 添加平台特定的测试用例
4. 包含错误处理和边界条件测试
5. 添加性能和缓存测试

## 📖 v2.0 相关文档

- **[API 参考文档](./README.md)** - 完整的 v2.0 API 文档和使用示例
- **[开发指南](./CLAUDE.md)** - v2.0 开发和代码贡献指南
- **[中文文档](./README-zh.md)** - 完整的中文版本文档
- **[TypeScript 类型定义](./src/types/)** - 完整的 TypeScript 接口定义
- **[平台适配器](./src/adapters/)** - 各平台的具体实现代码
- **[测试工具源码](./test/utils/)** - 测试工具类的完整实现

## 🎯 测试开发路线图

### v2.0.0 (当前)
- ✅ 基本的 MonitorResult<T> 模式测试
- ✅ 平台特定功能测试
- ✅ 缓存系统测试
- ✅ 错误处理测试
- ✅ 性能基准测试

### v2.1.0 (计划中)
- 🔄 更多集成测试场景
- 🔄 压力和负载测试
- 🔄 内存泄漏检测测试
- 🔄 并发监控测试

### v2.2.0 (未来)
- 📋 自动化性能回归测试
- 📋 跨版本兼容性测试
- 📋 更多平台支持测试
- 📋 端到端集成测试

---

**通过这个全面的 v2.0 测试系统**，`node-os-utils` 在所有支持的操作系统上都能提供类型安全、错误处理完善、性能优化的系统监控功能。每个平台的特殊性和限制都通过适当的测试得到验证和处理。