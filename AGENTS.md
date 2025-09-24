# Repository Guidelines

## 项目结构与模块组织
- `src/` 存放 TypeScript 源码，按功能划分为 `adapters/`、`core/`、`monitors/`、`types/` 与 `utils/`，入口为 `src/index.ts`，适配器会根据平台选择对应实现。
- `test/` 以平台、单元与集成维度组织测试，`test/utils/` 提供公共测试工具，构建产物位于 `dist/test/`，新增模块时务必创建同名测试文件。
- `docs/` 由 Typedoc 生成 API 文档，`dist/` 为编译后的分发目录，不要手动编辑；提交前确认未将临时文件加入 Git。
- 根目录的 `README.md`、`README-zh.md` 与 `CLAUDE.md` 汇总使用与开发背景；新增指南请同步更新对应语言版本。
- `tsconfig*.json` 与 `.eslintrc` 控制编译及静态检查参数，更新时请附带说明以便团队理解差异。

## 构建、测试与开发命令
- `npm run build`：清理并使用 `tsc` 编译 TypeScript，生成 `dist/`，CI 也依赖此命令验证打包可用性。
- `npm run build:watch` / `npm run dev`：监听源码变更并持续编译，便于调试长时间运行的监控任务。
- `npm test`：先构建再运行完整 Mocha 测试套件，覆盖所有平台用例，合并前必须保持通过。
- `npm run test:current-platform`：运行当前操作系统的快速验证；跨平台改动请依次执行 `test:linux`、`test:macos`、`test:windows` 并记录结果。
- `npm run test:coverage`：借助 `nyc` 输出覆盖率报告；提交前确保关键监控路径被覆盖，建议保持语句覆盖率 ≥ 80%。
- `npm run lint:check`（或 `npm run lint` 自动修复）：保证 ESLint 规则通过后再推送，可配合 VS Code ESLint 插件即时提示。
- `npm run docs`：针对公共 API 更新运行一次以确认文档能成功生成，无需将 `docs/` 产物提交。

## 编码风格与命名约定
- 使用 TypeScript + ES2020 特性，保持 2 空格缩进与结尾逗号；文件采用小写短横线命名（如 `cache-manager.ts`），类和接口以 PascalCase 命名。
- 入口与导出类型集中在 `src/types/`，公共接口需提供 `MonitorResult<T>` 成功/失败分支示例，返回对象必须包含 `success`、`data` 或 `error` 字段。
- 依赖 ESLint `@typescript-eslint` 规则，自定义配置见 `tsconfig*.json` 与项目根 `.eslintrc`；新增规则或例外时请在 PR 描述中说明原因。
- 使用结构化错误码（如 `ErrorCode.PLATFORM_NOT_SUPPORTED`）并优先通过类型定义暴露，避免硬编码字符串。

## 测试指南
- 所有测试最终运行于 `dist/`，新增测试时在 `test/` 编写 TypeScript 后执行 `npm run build`，禁止直接在 `dist/` 修改产物。
- Mocha + Chai 为断言组合；平台差异请使用 `test/utils/platform-specific.ts` 中的工具处理跳过逻辑，确保在不支持的平台上优雅退化。
- 命名采用 `*.test.ts`，并在断言中优先检查 `result.success` 或错误码，符合现有 `MonitorResult` 约定；长期运行的监控测试需使用 `asyncTest` 包装以避免超时。
- 若新增缓存或性能相关功能，请在测试中覆盖 TTL、错误处理与订阅行为，参考 `TESTING.md` 中的示例。

## 提交与拉取请求规范
- 仿照历史提交（例如 `统一返回Linux平台名称为小写...`）以中文完整句描述动机与影响，必要时附加受影响模块或脚本，避免使用“修复 bug”这类模糊语句。
- 提交前需通过构建、`lint:check` 与目标平台测试，附上关键命令输出摘要；跨平台补丁建议附加系统版本或硬件信息。
- PR 描述应包含：变更背景、主要实现、测试矩阵（列出运行的测试命令）以及相关 Issue 链接；涉及跨平台功能时说明验证环境与受限条件。
- 若改动调整公开 API 或配置格式，请在描述中列出破坏性变化与迁移步骤，并同步更新文档。

## 文档与发布提示
- 新增公共 API 后，请更新 README（中英文）与必要的 Typedoc 注释，再运行 `npm run docs`。
- 预发布流程使用 `npm run version:beta` 与 `npm run publish:beta`，执行前确认 `prepublishOnly` 能无误通过。
- 发布前务必核对 `package.json` 的 engines 与 files 字段，确保未遗漏新的构建产物或类型定义。

## 平台与配置提示
- 库会根据 Node.js `os.platform()` 结果挑选 `adapters/` 下的平台实现，请在 macOS、Windows、Linux 上分别验证关键监控能力。
- 需要特权访问的指标（如进程或磁盘详情）在不同平台权限要求不同，文档中应标注需要 sudo 或管理员权限的场景。
- 使用缓存相关功能时，可通过 `GlobalConfig` 调整 TTL、容量等参数；提交新配置选项需附带默认值说明与风险分析。
