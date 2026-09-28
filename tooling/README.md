# tooling/

本目录是本仓的**工程工具集**：服务于开发与门禁流程的 TypeScript 脚本，全部零第三方依赖、Bun 直跑。工具不进 npm 发布范围，也不被任何运行时代码消费——改动这里只影响开发 / 门禁体验，不影响三个插件的本体行为。

## 通用约定

- **零第三方依赖**：只用 `node:*` 内置模块与 Bun 全局 API（`Bun.Glob` / `Bun.YAML` / `Bun.file` 等），不占 devDependencies；需要 CLI 语义就自己解析 argv。
- **bun 直跑**：入口均为单文件脚本，优先经根 package.json 的 script 调用（`bun run check:locales` 等），也可直接 `bun tooling/checks/<脚本>.ts` 执行。
- **不进门禁 typecheck**：`tooling/` 不在任何 tsconfig 的 include 内（根 tsconfig.json 只 include `packages/*/src`），目录下的 [tsconfig.json](./tsconfig.json) 仅供编辑器语言服务命中——打开文件即以正确配置出诊断。
- **头部 JSDoc 即文档**：每个入口脚本用 JSDoc 块写清用途、用法与规则取舍，本 README 只做索引；细节冲突时以脚本注释为准。
- **SPDX 头必备**：`tooling/**/*.ts` 由 `check:spdx` 逐一核对（两行：许可证 + 版权）。

## 目录总览

| 子目录 | 调用方式 | 用途 |
| --- | --- | --- |
| [checks/](./checks/) | `bun run check:*`（已并入 `bun run check`） | 门禁检查脚本：词典 / 包纪律 / 文档链接 / PR 模板 / SPDX |

## checks/ — 门禁检查脚本

五个零依赖脚本，均已并入根 `bun run check`；发现任何问题退出码置 1，具体规则与豁免清单见各脚本头部注释：

| 脚本 | script 名 | 检查内容 |
| --- | --- | --- |
| [locales.ts](./checks/locales.ts) | `check:locales` | 词典键对齐（以 zh-CN 为基准）/ 七语种齐全 / 假翻译；外加本仓专属的两条对账——`locales/*.yml` 必须被同包源码 import（决策点 6 的防回归）、`koishi.locales` 声明必须是实际语种的子集（决策点 5 口径 A） |
| [packages.ts](./checks/packages.ts) | `check:packages` | 包名纪律（一律 `@koishi-ce/*`，不写回上游名）/ 顶层类型字段统一 `types` / ESM-only 形态 / 依赖方向负面规则 / 源码导入纪律 |
| [docs-links.ts](./checks/docs-links.ts) | `check:docs-links` | `docs/**`、根部门面文件与 `.github/**`（含 PR 模板目录）markdown 的相对链接与锚点存活 |
| [pr-templates.ts](./checks/pr-templates.ts) | `check:pr-templates` | PR 模板与 `.github/PULL_REQUEST_TEMPLATE/config.yml` 清单对账（孤儿文件 / 字段形态 / name 重复） |
| [spdx.ts](./checks/spdx.ts) | `check:spdx` | 手写源码（`packages/*/src/**/*.ts` 与 `tooling/**/*.ts`）的 SPDX 许可证头齐备；生成物（`lib` / `dist`）与 `node_modules` 豁免 |

### 尚未纳入的检查（本仓已知缺口）

- **tsdown 配置与 `types/yml.d.ts` 的 SPDX 头**：本仓还有 4 个手写文件缺头（3 个 `packages/*/tsdown.config.ts` + 根 `types/yml.d.ts`）。`spdx.ts` 当前**不扫**这两类路径，故闸门是绿的；补齐这 4 个头之后，应把扫描面扩到它们（计划书 §7.5 的 G16 / G25）。
- **`koishi.locales` 的完整声明**：闸门只保证「声明 ⊆ 实际」，不强制声明全部语种。`am-i-alt` 当前声明 `["zh", "en"]`——语种文件补齐并注册后应同步为七个前缀。

盲区（这些路径**不在**任何门禁视野内，改动它们不会触发红灯）：`locales/*.yml` 的格式、`tsdown.config.ts`、`tsconfig*.json`、根 `package.json` 的字段形态，以及生成物 `packages/*/lib/**`。

## 新增工具时

- 放进 `checks/`（或按主题新建子目录），单文件入口 + 头部 JSDoc 写清用法（现有脚本即模板：SPDX 头 + 用法块 + 规则取舍）。
- 遵守通用约定：零第三方依赖、bun 直跑。
- 门禁类入口挂到根 package.json 的 scripts，命名 `check:*`，并**并入 `check` 与 `.github/workflows/ci.yml` 的 gate job**（两条链的口径必须逐字一致，否则本地绿而 CI 红）。
