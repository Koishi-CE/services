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
- CI（.github/workflows/ci.yml）跑同一套门禁；**发包不经 CI**，统一走宿主实例发布链。

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
- 发版：统一走宿主实例发布链（宿主工作区根 `bun run release`，koishi-scripts：version → build → publish；预演用 `bun run release:dryrun`），npm 凭证由宿主环境提供；仓内 `bun run release`（changeset version → build → changeset publish）仅为独立检出时的备用链。

## git 提交流程（PR only —— 禁止直推 main）

**铁律：本仓一切改动都走 PR，任何 AI / agent 都不得直接推送 `main`。** 这是流程要求，不以「有没有技术拦截」为条件——`main` 正由仓库 ruleset「保护主分支」约束（PR / 签名 / merge queue / 必需状态检查；建置顺序见 `docs/decisions/services-modernization.md`），但被 bypass 放行、甚至保护尚未生效时，改动再小也不例外（唯一例外是发布链的版本提交，见「Changesets 工作流」节）。

1. 从最新 `main` 切出改动分支：`git switch -c <type>/<范围>`（`type` 取 `feat` / `fix` / `docs` / `chore` / `build` / `refactor`）。
2. 先跑 `bun run check` 确认全绿再提交（**门禁与提交务必拆成两条命令，勿用 `&&` 串联**：`bun run check | tail` 的退出码是 `tail` 的，会把红灯当成绿灯）。涉及构建改动加跑 `bun run build`。
3. 在分支上提交（可小步多次）：`git add -A` 后提交，简体中文提交信息（`feat:` / `fix:` / `docs:` / `chore:` / `build:`，可带 scope 如 `fix(core):`）。
4. 推分支并开 PR：`git push -u origin <分支>` → `gh pr create`，正文按 `.github/PULL_REQUEST_TEMPLATE/` 下对应领域的模板写全（含实跑证据）。**禁止 `git push origin main`，禁止对 `main` 强推。**
5. 等 CI 全绿后停在 ready 状态，把 PR 链接与验证证据汇报给用户，由用户合并；**AI 不自行合并**（用户明确指示合并时按指示办）。
6. PR 合并后同步本地：`git switch main` → `git pull --ff-only` → 删除已合并的本地 / 远程分支，再汇报最终状态。
