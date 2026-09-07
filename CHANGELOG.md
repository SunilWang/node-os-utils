# Changelog

本文件记录 `node-os-utils` 各版本的重要变更。

## [2.0.6] - 2026-09-07

### 修复

- 修复缓存 TTL、缓存容量和超时配置为 `0` 时被错误回退到默认值的问题。
- 修复订阅及监控失败在没有 `error` 监听器时抛出未捕获异常的问题。
- 修复 Linux 进程名包含空格或右括号时的 `/proc/[pid]/stat` 解析问题。
- 修复 Windows 进程启动时间解析：`Get-CimInstance | ConvertTo-Json` 实际返回的
  `\/Date(...)\/`（PowerShell 5.1）与 ISO 8601（PowerShell 7）格式此前无法识别，
  导致启动时间恒为当前时间；现按三种格式依次解析，并保留 DMTF 时区偏移处理。
- 修复 macOS 系统信息的架构恒为 `Kernel`、版本回退恒为 `Darwin` 的 `uname` 字段索引错误。
- 修复 Linux `/proc/meminfo` 不可读时内存降级路径单位错误（KB 冒充字节，指标偏小 1024 倍）。
- 修复 Linux 查询不存在进程时 `NOT_AVAILABLE` 错误码被改写为 `COMMAND_FAILED` 的问题。
- 修复单个监控器 `destroy()` 误销注入的共享缓存、波及其余监控器的问题。
- 修复网络带宽监测在采样失败时抛出未捕获异常、采样间隔为 `0` 时除零的问题。
- 修复流式命令超时仅终止 shell、子进程可能残留的问题（Windows 杀进程树，POSIX SIGTERM/SIGKILL）。
- 修复命令输出超过 `maxBuffer` 被误报为超时的问题；进程列表命令缓冲区提升至 10MB。
- 修复传入自定义 `env` 整体覆盖内置英文 locale、导致命令输出解析失败的问题。
- 修复监控订阅间隔未校验下限、回调重叠执行、暂停后仍可能投递回调的问题。
- 修复系统时间、运行时间被缓存冻结，TTL 内不随真实时间变化的问题。
- 修复系统时间戳、登录时间等解析失败时用当前时间冒充数据的问题，现返回 `undefined`。
- 修复 macOS 进程列表对含空格可执行路径列错位、`df` 不识别字节级单位的问题。
- 修复 `df` 挂载点含空格或折行时解析错误的问题，统一改用 POSIX 单行输出（`df -P`）。
- 修复 Windows PowerShell 在非英文系统上输出乱码的问题（强制 UTF-8 输出编码）。
- 修复进程树构建缺少环检测、PID 复用时可能栈溢出的问题。
- 修复磁盘与系统健康检查中 I/O 错误、资源检查项恒为通过的问题，现为真实检查。
- 修复 macOS 文件路径包含 shell 特殊字符时的命令拼接风险。
- 修复进程列表缓存未区分 PID 和名称过滤条件的问题。
- 修复系统概览中网络活动使用累计字节数判断、导致长期误报的问题。
- 修复系统健康检查忽略负载、运行时间和服务检查失败结果的问题。
- 修复高负载状态下健康检查明细仍标记为通过的问题。
- 修复运行时 `withCaching(enabled, ttl)` 未同步具体监控器缓存 TTL 的问题。
- 补充 ESLint 配置，恢复 `npm run lint:check` 的静态检查能力。

### 兼容性

- Linux、macOS CPU 信息统一返回 Node.js 标准架构标识。
- Windows、Linux、macOS 的内存、磁盘、网络资源信息纳入系统概览。
- `DataSize` 现在拒绝非有限数值，避免产生无效监控结果。
- Windows 网络接口信息由对象 map 归一化为数组结构，与类型声明及其他平台一致。
- 返回固定占位值的同步兼容方法（`disk.free`/`disk.used`/`network.inOut`/`network.stats`）
  已标记 `@deprecated`，请迁移到对应的异步方法。
- `ProcessInfo` 的 `startTime`、`runtime` 及用户登录时间字段改为可选，
  解析失败时返回 `undefined` 而非当前时间。
- `config.timeout` 现在同时作用于监控操作层（默认 10 秒），超时返回 `TIMEOUT`
  错误结果而非无限等待。

### 验证

- 完成 TypeScript 构建及单元测试：244 passing；42 项平台相关测试因当前运行环境跳过。
- 通过 macOS 平台集成测试：19 passing。

## [2.0.5] - 2026-09-06

### 修复

- 修复 Linux/Windows 系统运行时间被重复换算 1000 倍的问题（Issue #47）。
- 统一系统运行时间的毫秒值、秒值和启动时间戳处理，兼容旧版适配器返回结构。

### 验证

- 新增系统运行时间单位归一化回归测试。
- 单元测试：176 passing。

## [2.0.4] - 2026-07-21

### 安全修复

- 修复 `ProcessMonitor.kill(pid, signal)` 在 Linux 和 macOS 上将运行时参数
  拼接到 shell 命令而产生的命令注入风险。
- 为进程查询、打开文件、环境变量和终止操作增加 PID 与信号运行时校验，
  阻止 JavaScript 调用方绕过 TypeScript 类型约束传入危险字符串。

### 兼容性

- Linux 和 macOS 改用 Node.js 原生 `process.kill()` 发送信号，不再经过
  shell，同时保留 PID `0` 和负数对应的 Unix 进程组语义。
- Windows 继续使用 `taskkill`，但仅接受正整数 PID，并规范化强制终止信号。

### 验证

- 新增 Linux、macOS、Windows 适配器及 `ProcessMonitor` 安全回归测试。
- 同步更新中英文 README 中的 PID 和信号参数约束。
