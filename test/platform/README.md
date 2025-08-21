# 平台特定测试

本目录包含针对不同操作系统的专门测试，确保 `node-os-utils` 在各个平台上的功能正确性和性能表现。

## 测试结构

```
test/platform/
├── linux.test.ts     # Linux 特定测试
├── macos.test.ts     # macOS 特定测试
├── windows.test.ts   # Windows 特定测试
└── README.md         # 本文档
```

## 运行平台测试

### 运行当前平台的测试
```bash
npm run test:current-platform
```
这个命令会自动检测当前运行的操作系统并执行相应的测试。

### 运行特定平台的测试
```bash
# Linux 测试
npm run test:linux

# macOS 测试  
npm run test:macos

# Windows 测试
npm run test:windows
```

### 运行所有平台测试
```bash
npm run test:platform
```

### 运行所有平台测试（CI/CD 用）
```bash
npm run test:all-platforms
```
注意：这个命令会尝试运行所有平台的测试，但只有当前平台的测试会实际执行，其他平台的测试会被跳过。

## 平台特定功能测试

### Linux 测试 (linux.test.ts)

测试 Linux 系统特有的功能：

- `/proc` 文件系统访问
  - `/proc/meminfo` - 内存信息
  - `/proc/cpuinfo` - CPU 信息  
  - `/proc/stat` - CPU 统计
  - `/proc/loadavg` - 负载平均值
  - `/proc/net/dev` - 网络统计

- 系统命令集成
  - `free` - 内存信息
  - `df` - 磁盘空间
  - `ps` - 进程信息
  - `netstat` - 网络统计
  - `lscpu` - CPU 信息

- Linux 特有的验证
  - 负载平均值准确性
  - 内存信息与 `/proc/meminfo` 一致性
  - 多文件系统挂载点支持
  - 网络接口命名约定 (`lo`, `eth0`, `wlan0`, `enp*`, `wlp*`)

### macOS 测试 (macos.test.ts)

测试 macOS 系统特有的功能：

- 系统命令集成
  - `vm_stat` - 虚拟内存统计
  - `top` - 系统进程信息
  - `df` - 磁盘空间信息
  - `system_profiler` - 硬件信息
  - `sysctl` - 系统参数

- macOS 特有的验证
  - 负载平均值正常工作
  - CPU 型号识别 (Apple Silicon/Intel)
  - APFS 文件系统支持
  - macOS 网络接口命名 (`lo0`, `en0`, `en1`, `awdl0`)
  - Apple Silicon 性能优化验证

- 版本兼容性
  - 不同 macOS 版本下的功能一致性
  - Apple Silicon vs Intel Mac 的差异处理

### Windows 测试 (windows.test.ts)

测试 Windows 系统特有的功能：

- 系统命令集成
  - `wmic` - Windows 管理工具
  - `tasklist` - 进程列表
  - `systeminfo` - 系统信息
  - `netstat` - 网络统计
  - `powershell` - PowerShell 命令

- Windows 特有的验证
  - 驱动器盘符支持 (`C:`, `D:`, `E:`)
  - 负载平均值处理 (可能返回 `[0,0,0]`)
  - Windows 网络接口命名约定
  - 权限和访问限制处理

- 不支持功能的处理
  - `loadavg` 可能不完全支持
  - 某些 Unix 特有功能的优雅降级

## 测试工具类

### 基础工具 (test-base.ts)

- `PlatformUtils` - 平台检测工具
- `TestValidators` - 数据验证工具
- `TestAssertions` - 测试断言工具  
- `PerformanceMonitor` - 性能监控工具
- `TestConfig` - 测试配置常量

### 平台特定工具 (platform-specific.ts)

- `LinuxTestUtils` - Linux 特有的测试工具
- `MacOSTestUtils` - macOS 特有的测试工具
- `WindowsTestUtils` - Windows 特有的测试工具
- `CrossPlatformValidator` - 跨平台验证工具

## 测试类别

每个平台的测试都包含以下类别：

### 1. CPU 模块测试
- 核心数和型号信息
- 负载平均值 (`loadavg`)
- CPU 使用率 (`usage`)
- CPU 空闲率 (`free`) 
- CPU 平均信息 (`average`)

### 2. 内存模块测试
- 总内存 (`totalMem`)
- 内存信息 (`info`)
- 空闲内存 (`free`)
- 已用内存 (`used`)
- 内存一致性验证

### 3. 磁盘模块测试
- 磁盘信息 (`info`)
- 空闲空间 (`free`)
- 已用空间 (`used`)
- 多驱动器/挂载点支持

### 4. 网络模块测试
- 网络统计 (`stats`)
- 网络流量 (`inOut`)
- 接口命名约定验证

### 5. 系统命令测试
- 平台特有命令可用性
- 命令执行结果验证
- 错误处理机制

### 6. 性能测试
- 响应时间基准
- 内存使用监控
- 重复调用稳定性
- 平台特有性能优化

### 7. 错误处理测试
- 权限限制处理
- 不存在路径/驱动器处理
- 服务不可用情况
- 版本兼容性处理

## 配置和自定义

### 超时时间配置

```typescript
// 默认超时时间
DEFAULT_TIMEOUT = 10000 // 10秒

// 长时间运行测试
LONG_TIMEOUT = 30000 // 30秒

// 性能测试限制
PERF_MAX_DURATION = 5000 // 5秒
```

### 性能基准

```typescript
// 内存增长限制
MAX_MEMORY_INCREASE_MB = 10 // 10MB

// 平台特定超时
memoryTestTimeout: Windows ? 15000 : 10000
diskTestTimeout: Linux ? 8000 : 12000
networkTestTimeout: 10000
```

## CI/CD 集成

在持续集成环境中使用：

```yaml
# GitHub Actions 示例
- name: Run platform-specific tests
  run: npm run test:current-platform

# 或者运行所有平台测试（只有当前平台实际执行）
- name: Run all platform tests
  run: npm run test:platform
```

## 调试和开发

### 跳过特定平台测试

```bash
# 只在当前平台运行，自动跳过其他平台
npm run test:platform
```

### 查看详细测试输出

```bash
# 使用 Mocha 的详细模式
npx mocha dist/test/platform/linux.test.js --reporter spec
```

### 开发新的平台特定测试

1. 在相应的测试文件中添加测试用例
2. 使用平台检测确保测试只在正确平台运行
3. 使用测试工具类进行数据验证
4. 考虑错误处理和边界情况

## 注意事项

1. **平台检测**：测试会自动跳过不匹配的平台
2. **权限要求**：某些测试可能需要管理员权限
3. **网络依赖**：网络测试需要活跃的网络连接
4. **性能变异**：性能测试结果可能因系统负载而变化
5. **版本差异**：不同操作系统版本可能有行为差异

## 贡献指南

添加新的平台特定测试时：

1. 确保测试有适当的平台检测
2. 提供清晰的测试描述和预期行为
3. 包含错误处理和边界情况
4. 更新相关文档
5. 考虑向后兼容性