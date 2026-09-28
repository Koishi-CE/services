# 项目常驻指令

> 本文件是本仓库（`services`，GitHub 组织 [Koishi-CE](https://github.com/Koishi-CE) 下的**服务型插件** monorepo，发布 npm 作用域 `@koishi-ce`）的常驻开发约定。定位：收录「向其他插件提供基础服务」的插件（现有 `plugin-am-i-alt` / `plugin-cron` / `plugin-puppeteer`）。
> 技术栈：TypeScript 7（@typescript/native）+ tsdown + biome + Changesets + Bun（包管理器 / 测试运行时 / CI）。
> 本文件只放**铁律**（精简、可执行）；方法与理由见 [docs/guides/development.md](docs/guides/development.md)，结构见 [docs/reference/architecture.md](docs/reference/architecture.md)，发布见 [docs/process/release.md](docs/process/release.md)，文档索引见 [docs/README.md](docs/README.md)。

## 基本约束

- **全程使用简体中文**：回复、代码注释、提交说明、文档均用简体中文。
- **生态纪律（与 Koishi-CE 主仓对齐）**：
  - 包名一律 `@koishi-ce/plugin-*`；`peerDependencies` 一律指向 `@koishi-ce/koishi ^1.0.0`，**不要写回上游名**（`koishi` / `@koishijs/*`）。
  - 代码内导入一律 `@koishi-ce/*`；`declare module` 增强同样指向 `@koishi-ce/koishi`（跨 shim 再导出的模块名无法保证声明合并生效）。
  - cordis / minato / @satorijs/* 生态冻结在 3.x 线，勿跳代。
- **产物 ESM-only**：全部包 `"type": "module"`，tsdown 只出 `.mjs` + `.d.ts`，exports 以 `default` 条件兜底（Koishi-CE 宿主的插件加载链由 Bun `require()` 直接加载 ESM）；**不要恢复 CJS 产物**。
- **跨包依赖写 semver range，禁写 `workspace:*`**：changeset publish 不改写 workspace 协议，原样上 npm 会炸下游（Koishi-CE 主仓 2026-08-31 事故同源）；bun 按 range 一样会链接 workspace 本地包，本地开发不受影响，changesets version 会按 `updateInternalDependencies` 自动连带 bump。
- **不引入 Turborepo、不引入根级统一构建**：本仓是三个包的按包构建（根 `bun run build` 经 `--filter` 逐包调用 tsdown），门禁整轮为秒级，缓存收益不成立（决策记录见 [docs/decisions/services-modernization.md](docs/decisions/services-modernization.md)）。

## 硬性约束（违反即错误）

1. **一切改动走 PR，禁止直推 `main`**（发布链的版本提交是唯一例外）。见下方「git 提交流程」。
2. **提交必须签名**：ruleset 开了 `required_signatures`；不要用 `git -c user.email=...` 覆盖身份（会让签名变 `bad_email`，GitHub 判定 `verified: false` 并拒绝合并）。
3. **`biome.json` 里不能写注释**：出现 `//` 会让 Biome **静默丢弃整个 `overrides` 数组**（不报错、不警告）。配置说明写进 `docs/guides/development.md`。
4. **新增 `locales/*.yml` 必须 import 并 `ctx.i18n.define`**：只把文件放进 `locales/` 不会在运行时注册、也不会进 `lib/assets` 产物；`check:locales` 的「存在但未 import」对账会拦住漏改。
5. **类型导入一律 `import type`**，相对导入带 `.ts` 后缀（tsconfig 已开 `verbatimModuleSyntax` / `allowImportingTsExtensions`）。
6. **禁 enum 与构造器参数属性**（`erasableSyntaxOnly`）：用 const 对象 + 联合类型替代。
7. **异步调用必须 await 或显式 void / `.catch`**（`noFloatingPromises`）。
8. **门禁与提交拆成两条命令**：不要用 `&&` 串联，也不要 `bun run check | tail`（退出码是 `tail` 的，会把红灯当绿灯）。
9. **写进仓内的临时探针文件必须删除干净**，提交前用 `git status --short` 核实。
10. **`tooling/checks/*` 是零依赖脚本**：只用 `node:*` 与 Bun 全局 API，不占 devDependencies，不写进任何 tsconfig 的 include。

## 工作流与门禁

```bash
bun install          # 仓根执行（独立检出模式；宿主工作区内由宿主根统一 install，见下方已知坑）
bun run check        # 全量门禁：lint → typecheck → test → 自研门禁五连（提交前必跑）
bun run lint         # biome check .
bun run typecheck    # tsc -p tsconfig.json（大一统：packages/*/src 一次查完）
bun test             # 全量测试（bun:test；断言用 bun:test 的 expect，不引入 chai）
bun run build        # 按包构建（产物 packages/*/lib/index.mjs + .d.ts + 词典拷贝）
bun run fallow       # 死代码与依赖审计（bunx 直跑，版本 pin 在脚本内；CI 有独立 job）
bun run format       # biome format --write .
```

- `bun run check` 的八段构成、每段的检查内容与 CI 的对应关系见 [docs/guides/development.md](docs/guides/development.md) 第 4 节。**本地口径与 CI 必须逐字一致**，改任一侧都要同步另一侧。
- 根 `tsconfig.json` 的 paths 按具体文件登记各包入口（`@koishi-ce/plugin-*` → `packages/*/src/index.ts`），新增包时同步补一行，编辑器可跳转子包源码。
- 词典（i18n）放包根 `locales/*.yml`，七语种齐全（zh-CN 基准 + zh-TW / en-US / ja-JP / fr-FR / de-DE / ru-RU），键路径跨语种对齐，占位符 `{name}` 形态；`package.json` 的 `koishi.locales` 用语言前缀形态，且不得声明不存在的语种。
- 门禁全绿才提交；逐功能小步提交。
- CI（`.github/workflows/ci.yml`）跑同一套门禁 + 独立的 `fallow` job；**`merge_group` 触发不可删**（ruleset 的 merge queue 只认队列 ref 上跑出来的检查，缺它会导致队列超时剔单）。job 名即 ruleset 的必需状态检查名，改名须同步 ruleset。

## 代码风格（biome 已强制）

- 当前口径（阶段 6 会对齐旗舰仓）：4 空格缩进、行宽 100、双引号、尾逗号 all、LF。
- 格式以 biome 为唯一权威：`bun run format` 收尾，不要手工对齐；`.editorconfig` 与 `biome.json` 需保持一致（换口径时同改）。
- 类型安全：strict 全家桶、`noUncheckedIndexedAccess`、`noPropertyAccessFromIndexSignature`、`exactOptionalPropertyTypes`。
- 测试文件例外：关 `noNonNullAssertion`；测试依赖注入用 `@koishi-ce/plugin-mock` + `@koishi-ce/plugin-database-memory`。

## 已知坑（一行一条，细节见 [docs/guides/development.md](docs/guides/development.md) 第 8 节）

- 在宿主工作区内于本仓目录跑 `bun install` 不会生成本仓 `bun.lock`（宿主 `workspaces` 含 `external/**`，本仓被吸附）——验证「CI 会怎么装」要用工作区之外的隔离副本。
- `| tail` 吃掉退出码；门禁与提交必须拆两条命令。
- `biome.json` 不能写注释（会静默丢 `overrides`）。
- `ctx.i18n.locales` 对每个语言前缀只保留一个变体，不要拿它写「七语种齐全」断言（必假红）。
- `am-i-alt` 的端口语种曾因漏 import 而长期不生效；产物 `lib/assets/` 的 yml 数量是权威判据。
- `puppeteer` 的 e2e 组在 CI 上真跑（runner 有 `/usr/bin/chromium`），冷启动 Chrome 是耗时大头，超时预算已放宽到 60s + `retry: 1`。
- TS7 的 buildinfo 错误回声：引入增量构建后，改根 tsconfig / 依赖结构要先删 `*.tsbuildinfo` 再跑。
- `readme.md` 的大小写在 Windows 上不可见（git 索引里曾是小写），Linux / macOS 检出的工具会踩；改名用 `git mv -f` 并在 `git ls-files` 里核实。
- fallow 的豁免是包名级全局的，且 manifest 级发现（如未使用的 devDependency）**只认配置豁免**，源文件内联抑制注释无效。

## Changesets 工作流（强制，勿攒）

- 面向发布的包有**行为变化**时随提交写 `.changeset/` 条目，不要攒到发版前——攒必漏。纯内部 / 文档 / 工具链改动不写。
- bump 类型：API 破坏 → major（1.x 前 → minor），新功能 → minor，修复 → patch。
- 手写模板：

  ```md
  ---
  "@koishi-ce/plugin-am-i-alt": patch
  ---

  fix: ……（简体中文说明）
  ```

- **已知坑**：全新仓库在首次 commit 之前 `changeset status` 会报 "Failed to find where HEAD diverged from <分支>"——先做初始提交即可。
- **发版走 CI 发布链**（OIDC 可信发布 + GitHub App 推送版本提交 + `release` environment 审批），不手动 `npm publish`；流程与环境前置见 [docs/process/release.md](docs/process/release.md)。发布链的版本提交是全仓唯一允许直推 `main` 的路径。

## git 提交流程（PR only —— 禁止直推 main）

**铁律：本仓一切改动都走 PR，任何 AI / agent 都不得直接推送 `main`。** 这是流程要求，不以「有没有技术拦截」为条件——`main` 正由仓库 ruleset「保护主分支」（id `24119346`）约束（PR / 签名 / linear history / merge queue / 必需状态检查），但被 bypass 放行、甚至保护尚未生效时，改动再小也不例外（唯一例外是发布链的版本提交，见上节）。

1. 从最新 `main` 切出改动分支：`git switch -c <type>/<范围>`（`type` 取 `feat` / `fix` / `docs` / `chore` / `build` / `refactor`）。
2. 先跑 `bun run check` 确认全绿再提交（**门禁与提交务必拆成两条命令，勿用 `&&` 串联**）。涉及构建改动加跑 `bun run build`；动了依赖 / 导出面加跑 `bun run fallow`。
3. 在分支上提交（可小步多次）：`git add -A` 后提交，简体中文提交信息（`feat:` / `fix:` / `docs:` / `chore:` / `build:`，可带 scope 如 `fix(core):`）。
4. 推分支并开 PR：`git push -u origin <分支>` → `gh pr create`，正文按 `.github/PULL_REQUEST_TEMPLATE/` 下对应领域的模板写全（含实跑证据）。**禁止 `git push origin main`，禁止对 `main` 强推。**
5. 等 CI 全绿后停在 ready 状态，把 PR 链接与验证证据汇报给用户，由用户合并；**AI 不自行合并**（用户明确指示合并时按指示办）。命中 CODEOWNERS 敏感路径时需对应 code owner 批准，PR 作者不能批准自己的 PR。
6. PR 合并后同步本地：`git switch main` → `git pull --ff-only` → 删除已合并的本地 / 远程分支，再汇报最终状态。
