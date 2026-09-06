# Changelog

本文件记录 `node-os-utils` 各版本的重要变更。

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
