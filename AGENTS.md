# 项目常驻指令

> 本文件是本仓库（`services`，GitHub 组织 [Koishi-CE](https://github.com/Koishi-CE) 下的服务型插件 monorepo，发布 npm 作用域 `@koishi-ce`）的常驻开发约定。定位：收录「向其他插件提供基础服务」的插件（首个成员 `@koishi-ce/plugin-am-i-alt`）。技术栈：TypeScript 7（@typescript/native）+ tsdown + biome + Changesets + Bun（包管理器 / 测试运行时 / CI），开发环境为宿主工作区（external/ 下，依赖可由工作区根提升提供；本仓自带 devDependencies，独立检出 `bun install` 亦可工作）。

## 基本约束

- **全程使用简体中文**：回复、代码注释、提交说明、文档均用简体中文。
- **生态纪律（与 Koishi-CE 主仓对齐）**：
  - 包名一律 `@koishi-ce/plugin-*`；`peerDependencies` 一律指向 `@koishi-ce/koishi ^1.0.0`，**不要写回上游名**（`koishi` / `@koishijs/*`）。
  - 代码内导入一律 `@koishi-ce/*`；`declare module` 增强同样指向 `@koishi-ce/koishi`（跨 shim 再导出的模块名无法保证声明合并生效）。
  - cordis / minato / @satorijs/* 生态冻结在 3.x 线，勿跳代。
- **产物 ESM-only**：全部包 `"type": "module"`，tsdown 只出 `.mjs` + `.d.ts`，exports 以 `default` 条件兜底（Koishi-CE 宿主的插件加载链由 Bun `require()` 直接加载 ESM）；**不要恢复 CJS 产物**。
- **跨包依赖写 semver range，禁写 `workspace:*`**：changeset publish 不改写 workspace 协议，原样上 npm 会炸下游（Koishi-CE 主仓 2026-08-31 事故同源）；bun 按 range 一样会链接 workspace 本地包，本地开发不受影响，changesets version 会按 `updateInternalDependencies` 自动连带 bump。

## 工作流与门禁

```bash
bun install          # 仓根执行（独立检出模式；宿主工作区内可由宿主根统一 install）
bun run check        # 全量门禁：biome check + tsc 类型检查 + bun test（提交前必跑）
bun run lint         # biome check .
bun run typecheck    # tsc -p tsconfig.json（大一统：packages/*/src 一次查完）
bun test             # 全量测试（bun:test，测试文件贴被测模块放 src/*.test.ts）
bun run build        # 根级：--filter 构建全部子包（产物 packages/*/lib/index.mjs）
bun run format       # biome format --write .
```

- 仓库根 tsconfig.json 的 paths 按具体文件登记各包入口（`@koishi-ce/plugin-*` → `packages/*/src/index.ts`），新增包时同步补一行，编辑器可跳转子包源码。
- 门禁全绿才提交；逐功能小步提交。
- CI（.github/workflows/ci.yml）跑同一套门禁；release.yml 走 changesets 发版，需在仓库 Secrets 配置 `NPM_TOKEN`。

## 代码风格（biome 已强制）

- 4 空格缩进、行宽 100、双引号、尾逗号 all、LF。
- 类型安全：strict 全家桶、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`erasableSyntaxOnly`（禁止 enum 与构造器参数属性，用 const 对象 + 联合类型替代）。
- 类型导入一律 `import type`；相对导入带 `.ts` 后缀（tsconfig 已开 `allowImportingTsExtensions`）。
- 异步调用必须 await 或显式 void/`.catch`（`noFloatingPromises` 为 error）。
- 测试用 `bun:test` 的 `expect` 断言（不引入 chai）；测试依赖注入用 `@koishi-ce/plugin-mock` + `@koishi-ce/plugin-database-memory`。
- 词典（i18n）放包根 `locales/*.yml`，七语种齐全（zh-CN 基准 + zh-TW / en-US / ja-JP / fr-FR / de-DE / ru-RU），键路径跨语种对齐，占位符 `{name}` 形态。

## Changesets 工作流（强制，勿攒）

- 每次用户可见改动随提交在 `.changeset/` 写条目，不要攒到发版前——攒必漏。
- **已知坑**：全新仓库在首次 commit 之前 `changeset status` 会报 "Failed to find where HEAD diverged from <分支>"——先做初始提交即可。
- 手写模板：

  ```md
  ---
  "@koishi-ce/plugin-am-i-alt": patch
  ---

  fix: ……（简体中文说明）
  ```

- bump 类型：API 破坏 → major（1.x 前 → minor），新功能 → minor，修复 → patch；纯 chore 不需要。
- 发版：CI 自动（changesets action：version PR → 合并后 publish）；手动则仓库根 `bun run release`（version → build → changeset publish）。

## git 提交流程

1. 先跑 `bun run check` 确认全绿再提交。
2. `git add -A` 后提交，简体中文提交信息（`feat:` / `fix:` / `docs:` / `chore:`）。
3. 主分支 `master` 直提；完成后向用户简要说明改动与提交哈希。
