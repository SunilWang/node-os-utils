# Repository Guidelines

## 项目结构与模块组织
- **源码**：`src/` 分为 `adapters/`、`core/`、`monitors/`、`types/`、`utils/`，入口为 `src/index.ts`。
- **测试**：`test/` 采用单元 (`test/unit/`) + 平台 (`test/platform/`) 划分，运行前需先执行 `npm run build` 以生成 `dist/test/`。
- **文档与产物**：Typedoc 生成的 API 文档位于 `docs/`，编译输出在 `dist/`，请勿直接编辑。

## 构建、测试与开发命令
- `npm run build`：清理后使用 `tsc` 编译至 `dist/`。
- `npm run test:unit`：执行 `dist/test/unit/**/*.test.js` 下的 Mocha 用例。
- `npm run test:macos` / `npm run test:linux` / `npm run test:windows`：针对单个平台的集成验证。
- `npm run lint:check`：运行 ESLint 规则校验；若需自动修复，使用 `npm run lint`。

## 编码风格与命名约定
- 统一使用 TypeScript + ES2020 特性，缩进两空格、行尾带逗号。
- 文件命名使用小写短横线（示例：`cache-manager.ts`），类与接口采用 PascalCase。
- 错误码使用 `ErrorCode.*` 常量，避免硬编码字符串；复用 `MonitorError` 创建函数。
- 依赖 ESLint（`@typescript-eslint`）与项目内 `tsconfig*.json` 配置，提交前确保通过。

## 测试指南
- 测试框架为 Mocha + Chai，所有测试文件命名为 `*.test.ts`。
- 新增模块需同步补充 `test/unit/` 下的同行测试；平台特性请参考 `test/platform/*.test.ts`。
- 覆盖率通过 `npm run test:coverage` 生成，建议语句覆盖率 ≥ 80%；重点监控路径需编写正反用例。
- 长耗时异步测试应使用项目提供的 `asyncTest` 工具，防止超时。

## 提交与 PR 规范
- 提交信息需使用简体中文、完整句描述动机与影响，例如：“补充 macOS 内存监控缓存逻辑说明”。
- PR 描述包含：背景、主要改动、测试矩阵（列出运行命令）、关联 Issue，并注明平台限制或权限需求。
- 修改公共 API、配置或文档时，请同步更新 `README.md` 与 `README-zh.md` 并说明迁移步骤。

## 调试与配置提示
- 使用 `AdapterFactory.getDebugInfo()` 可快速检视适配器功能支持状态。
- 容器环境中 Linux 适配器会自动禁用 `system.services` 能力，必要时请在 `SystemMonitor` 调用前检查 `isSupported()`。
- 运行特权命令前确认权限；在 macOS 上调试需注意 `sysctl`、`powermetrics` 等命令可能需要 `sudo`。
