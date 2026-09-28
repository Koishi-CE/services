# services 现代化改造计划书

> **档案（决策记录，只读参考）** · 状态：实施中（阶段 0–4 已落地，进度见下表）· 起草日期 2026-09-28 · 依据：本仓与参照仓 `Koishi-CE/koishi` 的**实际代码与线上设置**（不采信任何转述）。
>
> 目标：把本仓（`services`，3 个服务型插件包）的仓库保护、门禁、CI、发布、文档对齐到同组织旗舰仓 `Koishi-CE/koishi` 的**现行工程规矩**，同时保留本仓自身的事实——服务型插件集、3 个包、按包构建、七语种词典。
>
> 本文结构：1 现状底账 · 2 参照仓规矩 · 3 差距清单 · 4 分阶段计划 · 5 决策点（已裁定）· 6 验收标准 · 7 风险与依赖 · 8 待维护者执行的仓库设置清单。
>
> **实施进度（2026-09-28 更新）**：下文的「现状底账」（第 1 节）是**改造起点的快照**，不是今日实况——读它时请对照本表。
>
> | 阶段 | 状态 | 产物 / 证据 |
> | --- | --- | --- |
> | 0 计划书 | 已合并 | 本文（PR #1） |
> | 1 CI 与锁文件基线 | 已合并 | `bun.lock`、`packageManager: bun@1.4.2`、`merge_group` 触发面、Codecov（PR #2 / #3） |
> | 2 仓库设置 | 已完成（维护者执行） | ruleset「保护主分支」`24119346`、`release` environment、GitHub App 凭据；merge queue 已由 PR #3 实证 |
> | 3 自研门禁与审计 | 已合并 | `tooling/checks/`（locales / packages / docs-links / pr-templates / spdx）、`.fallowrc.jsonc` + `.fallowrc.plugins.jsonc`、CI 的 `fallow` job（PR #7）；顺带修掉 fallow 报出的三处真死代码 |
> | 4 文档与常驻指令 | 本 PR | `docs/{README,guides/development,reference/architecture,process/release}.md`、`AGENTS.md` 重写、`README.md`（含 G24 大小写修正）、`.github/CONTRIBUTING.md`、`.github/PULL_REQUEST_TEMPLATE/`（5 份模板 + `config.yml` + `README.md`） |
> | 5 发布链迁到 CI | 未开始 | 见第 4 节阶段 5 |
> | 6 风格对齐 | 未开始 | 见第 4 节阶段 6 |
> | 7 收尾 | 部分完成 | merge queue 真实性验证已由 PR #7 实证（`gate` 与 `fallow` 都在 `gh-readonly-queue/main/pr-7-*` 上跑过并上报 success）；「改前 / 改后」数字与文档复核待阶段 5 / 6 落地后回填 |
>
> 各阶段的实施细节与相对本计划的偏差以对应 PR 正文为准（例如阶段 3 的 `check:spdx` 当前未覆盖 `tsdown.config.ts` 与 `types/yml.d.ts`，与计划第 6 条略有收窄，原因见 `tooling/README.md` 的「尚未纳入的检查」）。

---

## 1. 现状底账（2026-09-28 实勘）

全部结论有命令或文件原文支撑；「基线数字」出自实跑。

### 1.1 仓库与包

| 项 | 事实 |
| --- | --- |
| 仓库 | `Koishi-CE/services`，public，默认分支 `main`，最后推送 2026-09-25 |
| 协作者 | `Oppenheymu`（本会话身份）、`PaperKoi` |
| 包数 | 3（`packages/{am-i-alt,cron,puppeteer}`），57 个已被 git 跟踪的文件 |
| 包名 | `@koishi-ce/plugin-am-i-alt` 3.0.0 · `@koishi-ce/plugin-cron` 1.1.0 · `@koishi-ce/plugin-puppeteer` 1.0.0 |
| npm 现状 | `plugin-am-i-alt` 与 `plugin-puppeteer` **404（从未发布）**；`plugin-cron` 1.1.0 已发布（2026-09-08） |
| License | 全仓 MIT（根 `LICENSE`），无分区 |
| HTTP 层 | 均 ESM-only（`"type": "module"`、`main: lib/index.mjs`、`types: lib/index.d.ts`、`exports` 以 `import`/`default` 兜底），一致 |
| peer | 三包均 `@koishi-ce/koishi: ^1.0.0`（合规） |
| devDeps 指向 | `@koishi-ce/koishi: ^1.0.17`（npm 上当前 1.0.19） |
| 声明了但源码未引用的依赖 | `packages/puppeteer` 的 devDep **`@koishi-ce/plugin-mock`** 全包（含 5 个测试文件）零引用——fallow 的 `unused-dependencies` 会报 |
| 源码引用但未在包内声明 | `tsdown` 被 3 个 `packages/*/tsdown.config.ts` import，却只声明在**根** devDependencies（依赖提升才成立）——参照仓的做法是在 `.fallowrc.jsonc` 的 `entry` 里显式收编 `**/tsdown.config.ts` |
| 根 `files`/`exports` 体检 | 无（无 `publint` / `npm pack` 校验），首发包尤其危险 |

### 1.2 门禁与 CI 现状

- **分支保护：完全没有。** `gh api repos/Koishi-CE/services/rulesets` → `[]`；`branches/main/protection` → 404 `Branch not protected`。`AGENTS.md` 第 61 行写着「主分支 `main` 直提」——与目标状态直接冲突。
- **`.github/` 只有两样**：`workflows/ci.yml` 与 `assets/*.svg` 字标。无 `CODEOWNERS`、无 `dependabot.yml`、无 `PULL_REQUEST_TEMPLATE/`、无 `ISSUE_TEMPLATE/`、无 `CONTRIBUTING.md`。
- **CI 单 job**（`.github/workflows/ci.yml` 全 20 行）：`actions/checkout@v4` + `oven-sh/setup-bun@v2`（**`bun-version: latest`**，硬编码）+ `bun install` + 顺序跑 `lint` → `typecheck` → `bun test` → `build`。无 `merge_group`、无 `workflow_dispatch`、无 `concurrency`、无缓存、无覆盖率、无审计 job、无超时、无 `permissions` 声明。
- **GitHub 侧另有启用的 CodeQL**（default setup，languages `actions/javascript/javascript-typescript/typescript`，query suite **extended**，weekly；与参照仓 `default` 不同——本仓更严，不建议降）。最近一次 push 会跑出 `Analyze (actions)` / `Analyze (javascript-typescript)` 两个 check run。
- Actions 权限：`allowed_actions: all`、`sha_pinning_required: false`（与参照仓一致）。
- 无 `release` environment、无任何 secret/variable（`gh secret list` / `gh variable list` 均为空）。
- 仓库设置：public、license MIT、`allow_squash_merge` 仅 true、`delete_branch_on_merge: true`、`has_wiki: false`、默认分支 `main`。
- **CI 历史成功率：12 次里 8 次 failure、4 次 success**——`main` 无任何保护，失败的提交照样直推入库。8 次失败集中在 2026-09-25 那批（`36095078000`、`36109642270`、`36109869498`、`36110821628`、`36110977861`、`36133120569`、`36133339859`、`36136925124`）；已核实其中 `36136925124` 的失败步骤是 `bun test`（**61 pass / 8 fail，8 个 e2e 全挂在 Chrome 无沙箱**，`build` 被 skip，job 26s），其余 7 次的失败步骤未逐一拉取。绿的那两次与最近两次即修复后的运行。

**CI 耗时基线**（run `36137173329`，push main，success；run `36424636755` 为 PR #1，数字一致）：

| 环节 | 实测 |
| --- | --- |
| 整个 run（wall clock） | 41s |
| `gate` job（`started_at`→`completed_at`） | 37s |
| checkout | 1s |
| setup-bun | 1s |
| `bun install` | 2s |
| `bun run lint` | 1s |
| `bun run typecheck` | <1s |
| `bun test` | **28s** |
| `bun run build` | 1s |

CI 上 `bun test` 输出：`69 pass / 0 fail / 145 expect() calls / Ran 69 tests across 7 files. [27.75s]`，并打印 `[I] puppeteer chrome executable found at /usr/bin/chromium`——**端到端组在 CI 上真跑**（非跳过）。

### 1.3 本地门禁现状

`bun run check` = `bun run lint && bun run typecheck && bun test`（共 3 段，非参照仓的 10 段）。

实跑结果（本机，2026-09-28）：**退出码 0，耗时 1.7s**；`69 pass / 0 fail / 145 expect() calls / Ran 69 tests across 7 files. [915ms]`；本机探测到 `msedge.exe` 作为浏览器，端到端组真跑并全过。

- `bunx biome check .`：**Checked 21 files**（JSON reporter summary：`{"changed":0,"unchanged":21,"errors":0,"warnings":0,"infos":13}`），`Found 13 infos`，退出码 0。13 条 info 全部是 `lint/complexity/useLiteralKeys`（均标 FIXABLE / Unsafe fix），分布：`packages/am-i-alt/src/commands.ts` 2 处、`packages/puppeteer/src/canvas.ts` 2 处、`html.ts` 6 处、`index.ts` 3 处。`files.includes: ["packages/*/src/**"]` 实测覆盖嵌套目录。
- **13 条 info 不能按 biome 的建议直接改**：改成点访问会撞 tsconfig 的 `noPropertyAccessFromIndexSignature` → **TS4111 已实测复现**。参照仓对同一规则的处置正是在 `biome.json` 里把 `complexity.useLiteralKeys` 置 `off`——决策 1「完全照抄参照仓口径」天然解决了这个冲突（阶段 6 一并落地）。另注：`bun run fix` 走的是 `biome check --write`，只应用 safe fix，不会自动改坏（unsafe 需显式 `--unsafe`）。
- `files.includes` 只覆盖 `packages/*/src/**`，故 `locales/*.yml`、`tsdown.config.ts`、`tsconfig*.json`、根 `package.json`、`README.md` **全部不进 lint 与 format**。参照仓用 `includes: ["**", "!**/node_modules", "!**/lib", "!**/dist", "!**/*.tsbuildinfo"]`（依赖 `.gitignore` 与负向排除），覆盖面明显更宽——阶段 6 换口径后，`tsdown.config.ts` 等文件将首次进入门禁视野（预期会把 G16 的 SPDX 缺口与格式差异一起暴露，属预期）。
- 无锁文件：`bun.lock` 不在仓库、也无历史（`git log --all -- bun.lock` 为空），`.gitignore` 也未忽略它。根 `package.json` **没有 `packageManager` 字段**——`setup-bun` 因此回退到它自己的默认版本，这正是「版本不可复现」的根因（不只是 `latest` 这个写法）。
- 无 `bunfig.toml`；无 `.fallowrc.jsonc`；无 `tooling/`；无 `docs/`。

### 1.4 代码风格现状

- `.editorconfig`：**全文件 2 空格**（`[*] indent_size = 2`），`end_of_line = lf`、`trim_trailing_whitespace = true`、`insert_final_newline = true`。
- `biome.json`：`indentStyle: space`、`indentWidth: 4`、`lineWidth: 100`、双引号、尾逗号 all、LF；`preset: recommended` + `nursery.noFloatingPromises: error`；`overrides` 只豁免测试文件（`**/*.{spec,test}.*`）。**`biome.json` 与 `.editorconfig` 目前互相矛盾**（4 空格 vs 2 空格）。
- 实测缩进：37 个源码/配置文件里 **34 个含 4 空格缩进、0 个含 tab**。分组看：4 空格组 = 全部 `packages/*/src/*.ts`（20）、3 个包 `package.json`、3 个 `tsdown.config.ts`、`.changeset/config.json`、`biome.json`、`tsconfig.base.json`、7 个 `locales/*.yml`；2 空格组 = `AGENTS.md`、3 个包 `tsconfig.json`、根 `tsconfig.json`、`readme.md`、`.github/assets/*.svg`。**两组并存正是 `.editorconfig`（2 空格）与 biome（4 空格）冲突的直接后果。**
- **文件名大小写缺陷（独立于本次改造，建议一并修）**：根 README 在 git 索引里是小写 **`readme.md`**（`git ls-tree HEAD` / `git ls-files` 均显示小写，工作区显示 `README.md`）；Windows 大小写不敏感掩盖了差异，`git status` 不报。GitHub 网页端会正常渲染，但 Linux/macOS 检出后按 `README.md` 取文件的工具会失败。
- SPDX 头：全部 20 个手写 `src/**/*.ts` 与 7 个 `locales/*.yml` 都带行；**4 个手写文件不带**：3 个 `packages/*/tsdown.config.ts` + 根 `types/yml.d.ts`（生成物 `lib/*.d.ts` 也无，但已被 `.gitignore` 忽略——SPDX 闸门需豁免生成物与 `lib`/`dist`）。

### 1.5 词典与测试

- `packages/am-i-alt/locales/` 七语种齐全（`zh-CN` / `zh-TW` / `en-US` / `ja-JP` / `fr-FR` / `de-DE` / `ru-RU`），**7 个文件各 26 个叶键、占位符完全一致，全部带 SPDX 头**。临时校验程序（写在 `$env:TEMP`、用完删除）逐项核过：其余 6 语种对 `zh-CN` **缺键 0 / 多键 0 / 占位符不一致 0**；**拉丁与西里尔语种的假翻译 0 处**（`en-US` / `fr-FR` / `de-DE` / `ru-RU` 的值均无汉字，`ja-JP` 全为日文属正常，`zh-TW` 唯一与简体同形的是 `decision.unknown = 未知`，繁体同形属正常）。`cron` 与 `puppeteer` 无 `locales/` 目录。
- **⚠ 「七语种齐全」是表面齐全（本次勘察最重要的新发现）**：`packages/am-i-alt/src/index.ts:81-82` 只 `ctx.i18n.define` 了 **zh-CN 与 en-US 两个**，另外 5 个 yml **从未被 import** → 运行时不注册，也不会进 `lib/assets`（实测产物只有 `en-US-Bq_K1V5b.yml` 与 `zh-CN-H-eVeSkS.yml` 两个，与源文件 SHA256 逐字相同，由 tsdown 的 `loader: {".yml": "copy"}` 以「名-内容哈希」写出）。即：**5 个语种文件是死文件**。`koishi.locales: ["zh","en"]` 与「只注册 2 个」自洽，但与 `AGENTS.md` 的七语种要求、以及参照仓同类插件（`plugin-help` 等全量 import）不一致。处置见差距 G21。
- `koishi.locales` 声明：`am-i-alt` → `["zh", "en"]`；`cron` → `["zh"]`（**但包内根本没有 `locales/` 目录与文件**）；`puppeteer` → 未声明（也无文件）。参照仓线上惯例是**语言前缀**形态（`plugin-help` 即 `["zh","en","ja","fr","zh-TW"]`）。本项列为决策点 5。
  - 另注：`koishi.locales` 的**消费方未核实**——在已安装的 `@koishi-ce/koishi` 与 market/explorer/console 源码里检索 `locales` 字段零命中；只能确认它是 Koishi-CE 插件普遍使用的字段（bind / broadcast / callme / echo / help / inspect / rate-limit 都有），推测为市场或注册表侧的分析器读取。**故 G22 的检查口径按「声明 ⊆ 实际文件」设计，不假设该字段有任何运行时语义。**
- 测试：7 个测试文件 / 69 用例 / 145 断言（`am-i-alt` 20、`cron` 4、`puppeteer` 12+4+10+11+8 = 45）。位置不统一（`am-i-alt`、`cron` 贴被测模块，`puppeteer` 用 `src/__tests__/`）。**全仓 `mock.module` 出现 0 次**——参照仓「必须 `--isolate`」的动机（跨文件 mock 串扰）在本仓当前不存在，但 `--isolate` 仍作为口径统一项纳入。**包级无 `test` 脚本**（只有根级 `bun test`）。
- **`bun test` 是 CI 唯一的耗时大头**：本地 0.9–2.6s，CI 稳定 **28s**（跑满 30s 的 e2e 超时预算），占 `gate` job 40s 的 70%。这也是「先把基线量化、再谈提速」的直接理由。
- `puppeteer` 的端到端组（`src/__tests__/index.test.ts`）用 `describe.skipIf(!executable)` 包裹，`findExecutable()` 拿不到浏览器时整组跳过；组内 `e2eTimeout = 30_000`、launch args 追加 `--no-sandbox`（GitHub runner 的 AppArmor 禁非特权 userns，Chrome 无沙箱会 FATAL——历史修复见提交 `732b88c`、`abf2d57`）。

### 1.6 发布现状

- `AGENTS.md` 第 55 行：「发版统一走宿主实例发布链（宿主工作区根 `bun run release`，koishi-scripts：version → build → publish），npm 凭证由宿主环境提供；仓内 `bun run release` 仅为独立检出时的备用链」。
- 仓内 `package.json` 的 `release` 脚本 = `changeset version && bun run --filter './packages/*' build && changeset publish`。
- 2 条 pending changeset：`cron-migrate-from-main.md`（`@koishi-ce/plugin-cron` patch）、`tidy-otters-render.md`（`@koishi-ce/plugin-puppeteer` minor）。
- `.changeset/config.json`：`changelog: false`、`access: public`、`baseBranch: main`、`updateInternalDependencies: patch`；schema 指向 `@changesets/config@3.0.0`（参照仓指 3.1.1）；无 `ignore` 名单（根包 `private: true` 无需）。
- `.changeset/README.md` 示例里的包名写作 `koishi-plugin-services`（**不存在的包名，漂移，顺带修正**）。
- 跨包依赖一律写 semver range（不用 `workspace:*`）——这是本仓刻意纪律（见 `AGENTS.md` 基本约束），因为 changeset publish 不改写 workspace 协议。本仓 3 个包之间**没有互相依赖**。

---

## 2. 参照仓规矩摘要（只摘本次会用到的）

来源：`Koishi-CE/koishi` 线上 ruleset、environment、以及仓库内 `AGENTS.md` / `docs/**` / `.github/**` / `tooling/checks/**` 原文。

### 2.1 仓库保护（ruleset id `24072025`「保护主分支」，active，作用于 `~DEFAULT_BRANCH`）

规则集逐条：`deletion` · `non_fast_forward` · `code_coverage`（minimum_coverage 90 / max_coverage_drop 1）· `code_scanning`（CodeQL，security_alerts_threshold `medium_or_higher`，alerts_threshold `errors_and_warnings`）· `required_signatures` · `pull_request`（1 人评审 / dismiss stale / **require_code_owner_review** / **required_review_thread_resolution** / **allowed_merge_methods: squash** / require_extra_approval_for_unattributed_changes）/ `required_linear_history` · `merge_queue`（SQUASH，`max_entries_to_build: 1`、`min_entries_to_merge: 1`、`max_entries_to_merge: 3`、`min_entries_to_merge_wait_minutes: 0`、`grouping_strategy: ALLGREEN`、**`check_response_timeout_minutes: 12`**）· `required_status_checks`（**strict_required_status_checks_policy: true**；三个 context：`gate (build / check / test)`、`client (webui bundle build)`、`fallow (dead code & deps audit)`）。

bypass 名单：`RepositoryRole` id 5（admin）`always`；两个 `Integration`（id 262318、5097680）**`exempt`**。

### 2.2 environment

`release`：`can_admins_bypass: false`，`required_reviewers`（**`prevent_self_review: true`**，reviewers = PaperKoi + Oppenheymu），Deployment branches = 自定义策略**仅 `main`**。

### 2.3 CI（`.github/workflows/ci.yml`）

三 job（`gate (build / check / test)` / `client (webui bundle build)` / `fallow (dead code & deps audit)`）、`on: push main + pull_request + merge_group + workflow_dispatch`、`concurrency: ci-${{ github.ref }}` + `cancel-in-progress: true`、`permissions: contents: read`、每 job `timeout-minutes`（30 / 30 / 10）、`actions/checkout@v7`、`oven-sh/setup-bun@v2` **不写版本**（自动读根 `package.json` 的 `packageManager`）、Dependabot PR 专属的 `bun.lock` 格式守门 step（`lockfileVersion < 2` 即 `::error::` 退出 1）、门禁经 `bunx turbo run` 执行、末尾 `codecov/codecov-action@v7` 上传 `coverage/lcov.info`。

### 2.4 门禁十段与自研脚本

`bun run check` = `lint` → `lint:client` → `typecheck` → `check:locales` → `check:docs-links` → `check:vue-types` → `check:assertions` → `check:packages` → `check:console-wiring` → `check:pr-templates`。

自研脚本（`tooling/checks/*.ts`，全部零第三方依赖、`bun` 直跑、问题即 `exit 1`、头部 JSDoc 即文档、有逻辑就配 `*.test.ts`、不进任何 tsconfig 的 include）行数：`locales.ts` 262 · `packages.ts` 372 · `docs-links.ts` 218 · `assertions.ts` 370 · `vue-types.ts` 348 · `console-wiring.ts` 169 · `pr-templates.ts` 169。

适用性裁断：`check:vue-types` / `lint:client` / `check:console-wiring` 对本仓无对象（无 `.vue`、无 console 宿主接线），不移植；`check:assertions`（双重断言基线）本仓当前无该问题，列为可选。

### 2.5 文档与常驻指令

四层：`docs/guides/development.md`（271 行，11 节）· `docs/reference/architecture.md`（150 行，6 节）· `docs/process/release.md`（147 行，7 节）· `docs/decisions/`（只读档案）+ `docs/README.md` 导航页（含 mermaid 文档地图与 8 条「文档组织约定」）。页面模板统一为 `# 标题` → 引用块（定位 + 先读链 + 「本文结构」编号速览）→ `## N. 标题` 编号章节。

`AGENTS.md` 骨架：基本约束 → 硬性约束（编号，违反 = 错误）→ 门禁与工作流（命令块 + 说明）→ 代码风格 → 已知坑（一行一条）→ git 提交流程（**PR only**，6 步 + 唯一例外）。

### 2.6 发布链

触发 `push main` + `paths: ['.changeset/**']` + `workflow_dispatch`（带 `skip-version` 布尔输入）；`concurrency: release` + `cancel-in-progress: false`。两个 job：`prepare`（消费 changeset → build → test → **GitHub App token 推版本提交** → 打包 artifact；`contents: write`，**无** `id-token`）与 `publish`（解包 → 逐包 `npm publish`；`id-token: write` + `environment: release`，**无** `contents: write`，且**不跑 `bun install`**）。npm 走 OIDC 可信发布；`publish` 前把 npm 装进用户级 prefix（`--prefix "$HOME/.npm-global"`）并追加 `GITHUB_PATH`；推送用 `persist-credentials: false` + `-c core.hooksPath=/dev/null` + 完整 URL 传 token。

### 2.7 参照仓的实证结论（与平台绑定，非其专属处境）

1. `biome.json` 里出现 `//` 会让 Biome **静默丢弃整个 `overrides` 数组**（实测文件数 904 → 1088、错误数上万、不报错不警告）——配置说明一律写进文档。
2. ruleset 里的必需检查名**只认 job 名**（不含 workflow 名、矩阵、事件）；只有过去 7 天内成功跑过的检查才会被搜索框索引。
3. 缺 `merge_group` 触发 → 队列永远等不到必需检查上报 → 超时（该 ruleset 12 分钟）剔单 → 合并必然失败。
4. `strict_required_status_checks_policy`（"Require branches to be up to date"）与 merge queue 功能重复。
5. Dependabot 的 updater 镜像内 Bun 版本不跟随仓库 `packageManager`（`dependabot-core#15897`），会把 `bun.lock` 静默降级重写（`#15848`）→ 需 CI 守门。
6. 跨 job 传 commit SHA 给特权 job checkout 会被 CodeQL 判 `actions/cache-poisoning`（该仓实测稳定 3 条 high）。
7. `GITHUB_TOKEN` **无法加入 ruleset 的 bypass 名单**，只有 GitHub App 可以。
8. 装 npm 到系统 prefix 会 EACCES（实测 exit 243）。
9. 失败 workflow 里不存在的上传步骤会让 PR 缺 status；ruleset 若开了 `code_coverage` 会等它。
10. TS7 的 buildinfo 错误回声：改根 tsconfig / 依赖结构后旧错误复活，先删 `node_modules/.cache/tsc/*.tsbuildinfo`。
11. `bun run check | tail` 的退出码是 `tail` 的——门禁与提交务必拆成两条命令，勿用 `&&` 串联。

---

## 3. 差距清单

按「必须改 / 建议改 / 刻意保留」分组。每条给出证据与目标状态。

### 3.1 必须改（与验收标准直接对应）

| # | 差距 | 证据 | 目标状态 |
| --- | --- | --- | --- |
| G1 | 无分支保护 | rulesets `[]`；protection 404 | ruleset「保护主分支」：deletion / non_fast_forward / required_signatures / required_linear_history / pull_request（1 评审 + dismiss stale + code owner + thread 解决 + 仅 squash）/ merge_queue / required_status_checks |
| G2 | `AGENTS.md` 写「main 直提」 | 第 61 行 | 改为 PR only（含「AI 不自审自并」「唯一例外是发布链版本提交」） |
| G3 | `AGENTS.md` 写「发包不经 CI」 | 第 29、55 行 | 决策 2 = 迁到 CI → 改写为 CI 发布链 + 本地备用链 |
| G4 | 无锁文件 | `git log --all -- bun.lock` 空 | 提交 `bun.lock`（Bun 1.4.2 实测写出 `lockfileVersion: 2`），CI 走 frozen |
| G5 | Bun 版本不可复现 | `bun-version: latest` + 根 `package.json` 无 `packageManager` | 根加 `"packageManager": "bun@1.4.2"`；workflow 删 `bun-version` |
| G6 | 无 `merge_group` 触发 | ci.yml 全 20 行 | 触发面加 `merge_group` + `workflow_dispatch`，加 `concurrency` |
| G7 | 无 `release` workflow（发包不经 CI） | 只有 ci.yml | 新增 `release.yml`（两 job 切分 + OIDC + environment 审批） |
| G8 | 无 CODEOWNERS | `.github/` 无该文件 | `*` 兜底 + 敏感路径两人共管 |
| G9 | 无 dependabot + 无锁文件守门 | 无 `dependabot.yml` | 新增 `dependabot.yml`（bun + github-actions 两条目）+ CI 内 Dependabot 专属守门 step |
| G10 | 无 PR 模板 | `.github/` 无该目录 | 按领域 4–6 份 + `config.yml` + `README.md`，并加 `check:pr-templates` 对账 |
| G11 | 无 `docs/` | 不存在 | 四层文档（guides / reference / process / decisions）+ `docs/README.md` |
| G12 | 无 `check:*` 自研门禁 | `check` 只有 3 段 | 加 `check:locales` / `check:packages` / `check:docs-links` / `check:pr-templates`（+ 可选 `check:spdx`、`check:assertions`） |
| G13 | 无 fallow 死代码/依赖审计 | 无 `.fallowrc.jsonc` | 加 `.fallowrc.jsonc` + `bunx fallow@<pin> dead-code`，独立 `fallow` job |
| G14 | CI 无覆盖率 | 无 `--coverage` | `bun test --isolate --coverage --coverage-reporter=lcov` + 上传（先量化，再决定是否开 ruleset 的 `code_coverage`） |
| G15 | CI 无超时 / 无 `permissions` 声明 | ci.yml | 每 job `timeout-minutes`、顶层 `permissions: contents: read` |
| G16 | 3 个 `tsdown.config.ts` 与根 `types/yml.d.ts` 无 SPDX 头 | 实勘（4 个手写文件） | 补齐（见 G25 的豁免口径） |
| G17 | style 口径与参照仓不一致 | 4 空格 / lineWidth 100 / `.editorconfig` 2 空格 | 决策 1 = 完全照抄 koishi 的 `biome.json`；`.editorconfig` 同步（代码 tab、`.md`/`.yml` 2 空格）；`biome format --write .` 单独一个提交 |
| G18 | 13 条 biome info | `useLiteralKeys` ×13 | 清零 |
| G19 | `.changeset/README.md` 包名漂移 | 写作 `koishi-plugin-services` | 改为真实包名 `@koishi-ce/plugin-*`；schema 版本 3.0.0 → 3.1.1 |
| G20 | `check` 无统一入口语义 | 现为 3 段 `&&` 串联 | `bun run check` 成为唯一入口（含 `check:*`），与 CI 口径逐字一致 |
| G21 | **`am-i-alt` 5 个语种文件是死文件** | `src/index.ts:81-82` 只 `define` zh-CN 与 en-US；产物 `lib/assets` 只有 2 个 yml | 二选一并写进 PR：**(a)** 补 import 另外 5 个语种（真正七语种，与 `AGENTS.md` 一致）；**(b)** 删掉 5 个死文件并把 `AGENTS.md` 改成「实际支持 2 个语种」。属**行为改动**，须独立 PR + changeset，不与门禁改造混做 |
| G22 | `koishi.locales` 声明与实际漂移 | `am-i-alt` `["zh","en"]` ↔ 7 个文件；`cron` `["zh"]` ↔ 无文件 | 按决策点 5 的裁定落地，并纳入 `check:locales` |
| G23 | `puppeteer` 的 devDep `@koishi-ce/plugin-mock` 未被使用 | 全包零引用 | 移除以让 fallow 的 `unused-dependencies` 干净；`packages/*/tsdown.config.ts` 未在包内声明 `tsdown` 的问题改用 `.fallowrc.jsonc` 的 `entry: ["**/tsdown.config.ts"]` 收编（参照仓做法） |
| G24 | 根 README 在 git 索引里是小写 `readme.md` | `git ls-tree HEAD` | 改为 `README.md`（大写在 git 里是内容改动，Linux/macOS 检出才正确）；与阶段 4 的 README 改动合并 |
| G25 | 生成物无 SPDX 头（`lib/*.d.ts`） | 实勘 | `check:spdx` 明确豁免 `lib` / `dist` / `node_modules`，只查手写源文件 |

### 3.2 建议改（不阻塞验收，一并纳入）

| # | 项 | 理由 |
| --- | --- | --- |
| S1 | 测试文件位置统一 | 现为两套（贴模块 vs `src/__tests__/`）；建议统一到贴被测模块（`src/*.test.ts`），与 `AGENTS.md` 现有描述一致 |
| S2 | `--isolate` 纳入 `bun test` 口径 | 当前 `mock.module` 用量为 0，属预防性口径统一；Bun 1.4.2 支持该旗标（已实测 `bun test --help`） |
| S3 | `koishi.locales` 声明与实际对齐 | 见决策点 5 |
| S4 | `cron-migrate-from-main.md` 长期滞留 | 自 2026-09 迁入后未消费；实施发布链时会一并消费掉（属发布链固有行为，不需手改） |
| S5 | CI 步骤耗时打点 | 用 `gh run view --json jobs` 的 `steps[].started_at/completed_at` 做「改前 / 改后 / 口径」三列数字 |
| S6 | `AGENTS.md` 增加「已知坑」节 | 现完全无该节（参照仓有 23 条）；补本仓实测坑 |
| S7 | `docs/README.md` 导航 | 参照仓有；小仓 4 份文档也值得一页索引 |
| S8 | `CONTRIBUTING.md` | 面向人类贡献者入口；参照仓 39 行，可整份裁剪 |

### 3.3 刻意保留（不做）

| 项 | 理由 |
| --- | --- |
| `check:vue-types` / `lint:client` / `check:console-wiring` | 本仓无 `.vue`、无 console 宿主接线，无检查对象 |
| Turborepo | 决策 3 = 不引入。实测门禁整轮 1.7s（本地）/ CI 41s、`bun install` 2s，缓存收益空间不成立；且远程缓存需要外部服务（见 §7） |
| `NOTICE` / 许可证分区 | 本仓全 MIT，无 AGPL 分区；改为在 `README.md` 说明各包许可与来源 |
| koishi 专属内容 | 上游 fork 合并映射、`packages/shim` 占名包、vendored 三包、market 插件、`create-koishi-ce` 模板、41 名 overrides、六行 alias —— 均为参照仓处境，不搬 |
| 拆 e2e job | 决策 4 = 不拆。Chrome 已在 gate 内真跑（`/usr/bin/chromium`），拆出去要重复 checkout + install + build，收益不成立 |
| `code_coverage` ruleset 规则 | 暂不启用（先拿到真实覆盖率基线再定阈值）；避免重演「ruleset 等一个不存在的 status」 |

---

## 4. 分阶段计划

**硬顺序**：阶段 0 → 1 必须先于任何「打开必需状态检查」的动作；否则 merge queue 永远等不到检查上报而超时剔单。

### 阶段 0 · 计划书（本 PR）

- 产物：`docs/decisions/services-modernization.md`（本文）。
- 验证：`bun run check` 全绿（文档不参与 biome 的 `includes`，实际不受影响）；本文所有相对链接可解析。
- 出 PR，等维护者批准。

### 阶段 1 · CI 与锁文件基线（**必须先合并**，才能打开分支保护）

1. 根 `package.json`：加 `"packageManager": "bun@1.4.2"`。
2. 生成并提交 `bun.lock`（`bun install`；实测 `lockfileVersion: 2`）。
3. `.github/workflows/ci.yml` 重写：
   - `on:` 加 `merge_group` + `workflow_dispatch`；`concurrency: ci-${{ github.ref }}` + `cancel-in-progress: true`；`permissions: contents: read`。
   - 删 `bun-version: latest`；`actions/checkout@v4` → `@v7`。
   - 加 Dependabot 专属 `bun.lock` 格式守门 step（阈值 `< 2` 报错）。
   - 每 job `timeout-minutes: 30`。
4. 覆盖率基线：本地跑 `bun test --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov`，把数字写进 PR（届时才决定 `code_coverage` 规则与阈值）。
5. 分 job：本阶段先只保留 `gate`（保持 ruleset 未开、无必需检查，安全）；`fallow` job 随阶段 3 的自研门禁一起加，避免引入一个尚未配好的 job。

- 验证：`bun run check` 全绿；push 后新 CI 在 `pull_request` 与（合并后）`merge_group` 两种事件下都上报 `gate`。
- 出 PR，等维护者合并。
- **实际落地**：PR #2 已合并（`4a44a4e`）。

### 阶段 2 · 仓库设置（**维护者执行**，顺序不可颠倒）

先确认阶段 1 已合并到 `main`，再按 §8 清单逐条执行。要点：

1. 新建 GitHub App（`Contents: Read and write`、关 webhook、仅装本仓）→ 记 `APP_CLIENT_ID`（variable）、`APP_PRIVATE_KEY`（secret）。
2. 建 `release` environment + Required reviewers（`prevent_self_review: true`）+ Deployment branches 限 `main`。
3. 建 ruleset「保护主分支」：规则同 §2.1；bypass 名单放该 App，模式 **`exempt`**（决策 2b：与参照仓线上取值一致）；必需状态检查先只填 `gate`，后续阶段逐个追加。
4. `merge_queue.check_response_timeout_minutes`：本仓 CI 实测 41s（测试段 28s），设 15 分钟（提示词建议 ≥15）。

### 阶段 3 · 自研门禁与审计

1. 新增 `tooling/README.md`（通用约定：零依赖 / bun 直跑 / 不进门禁 typecheck / 头部注释即文档 / `check:*` 命名）。
2. `tooling/checks/locales.ts`：以 `zh-CN.yml` 为基准做键对齐 + 语种齐全 + 假翻译（拉丁/西里尔语种叶值仍含汉字）。本仓现状可直接通过（26 键 ×7 语种全对齐、假翻译 0 处、`am-i-alt` 七语种齐全），故该脚本的价值在**防回归**。
   **另加一条本仓专属检查（G21 的防回归，本次勘察后新增，关键）**：`locales/*.yml` 中每个语种文件必须被同包源码**实际 import**（即出现在 `lib/assets` 产物里）——否则「文件存在但运行时不注册」这类缺陷会静默通过门禁。实现：扫描 `packages/*/src/**` 的 `.yml` 导入语句，与 `locales/` 下的文件名对账，报告「存在但未 import」的语种文件。
3. `tooling/checks/packages.ts`：按 3 包规模裁剪——包名纪律（`@koishi-ce/plugin-*`、不写回上游名）、`types` 字段统一、ESM-only（`type: module`、exports 无 `require`、产物 `.mjs` + `.d.ts`）、`peerDependencies` 指向 `@koishi-ce/koishi ^1.0.0`、**依赖方向负面规则**（`cron`/`am-i-alt` 不得依赖 `puppeteer` 的浏览器面；服务型包不得依赖 `@koishi-ce/plugin-console`）、源码导入纪律。
   **另加**：`koishi.locales` 声明必须是实际 `locales/*.yml` 的子集（决策点 5 的口径）。
4. `tooling/checks/docs-links.ts`：**整份移植**（覆盖范围收窄为 `docs/**` + 根 `README.md` + `AGENTS.md` + `.github/**`，去掉 `NOTICE`）。
5. `tooling/checks/pr-templates.ts`：**整份移植**（`NON_TEMPLATE` 保持 `README.md`）。
6. `tooling/checks/spdx.ts`（本仓专属，可选但推荐）：所有 `packages/**/src/**`、`tooling/**/*.ts`、`packages/*/tsdown.config.ts`、`locales/*.yml` 必须带 SPDX 头（补齐 G16，并防回归）。
7. `.fallowrc.jsonc` + `bunx fallow@<pin> dead-code`（pin 到精确版，写进 `package.json` 的 `fallow` 脚本；pin 的理由：上游迭代快，浮动会让门禁口径在无代码改动时漂移）。
8. 根 `package.json` 的 `check` 改为唯一入口：`lint` → `typecheck` → `check:locales` → `check:packages` → `check:docs-links` → `check:pr-templates` →（spdx）→ `test` → `fallow`。
9. CI 加 `fallow` job（`name: fallow (dead code & deps audit)`，`timeout-minutes: 10`）。

- 验证：逐脚本本地实跑并把输出摘要写进 PR；`bun run check` 全绿；CI 两个 job 全绿。
- 出 PR，等维护者合并。合并后维护者把 `fallow (dead code & deps audit)` 追加进必需状态检查。
- **实际落地**：PR #7 已合并（`9b654eb`）。相对计划的偏差有三处：① `check:spdx` 的第 6 条要求（覆盖 `packages/*/tsdown.config.ts` 与 `locales/*.yml`）**收窄为只覆盖已合规的两类**（`packages/*/src` 与 `tooling`），4 个缺头文件留作后续独立改动；② `fallow` 经 `.fallowrc.jsonc` + `.fallowrc.plugins.jsonc` 承载（`toolingDependencies` 只存在于插件定义里）；③ CI 把自研门禁五连列为 `gate` 内的独立 step，`fallow` 仍为独立 job。截至阶段 4 写作时，`fallow` **尚未**追加进必需状态检查。

### 阶段 4 · 文档与常驻指令

1. `docs/README.md`（导航 + 文档组织约定，照搬参照仓骨架，删除 upstream 英文例外）。
2. `docs/guides/development.md`：环境（Bun ≥1.4，`packageManager` 钉 `bun@1.4.2`）· PR 工作流（PR only 铁律 + 6 步）· 常用命令 · 门禁构成（**本仓段数，不写「十段」**）· 构建产物布局（各包 `lib/index.mjs` + `.d.ts` + yml 拷贝）· 编码约定 · 测试写法 · 已知坑（本仓实测：`biome.json` 不能写注释、TS7 buildinfo、Bun 解析缓存、`| tail` 退出码、Bun.spawn env、`@types/bun` 超前于运行时等）· 版本与发布 · 依赖更新（Dependabot）。
3. `docs/reference/architecture.md`：定位 · 目录与包清单（3 行表 + 一句话计数）· 依赖纪律（两个依赖世界 + 硬性规则）· 构建体系（按包 tsdown + 根 tsconfig 大一统 typecheck）· 测试体系 · 许可证（全 MIT 一句）。
4. `docs/process/release.md`：命令 · 发布链环节 · changesets 约定 · 发布顺序与补发 · 暂存区与 409（纯 npm 通用知识，强烈建议保留）· 事故记录（**本仓 2026-08-31 workspace 协议事故的同源教训**）· CI 发布（OIDC）与仓库侧前置。
5. `AGENTS.md` 重写为参照仓骨架：基本约束 → 硬性约束（编号）→ 门禁与工作流 → 代码风格 → 已知坑 → git 提交流程（PR only）。保留本仓事实（3 包 / 服务型定位 / `@koishi-ce` scope / 按包构建 / 七语种 / `puppeteer` 的 Chrome 注意事项 / 跨包依赖写 semver range 禁 `workspace:*`）。**删除「main 直提」与「发包不经 CI」**。
6. `README.md`：补各包许可与来源说明（全部 MIT、各自上游来源）、CI 徽章、发布链说明。
7. `.github/CONTRIBUTING.md`（照搬骨架，CI job 名换成本仓实况）。
8. `.github/PULL_REQUEST_TEMPLATE/`：`config.yml` + `README.md` + `bug_fix.md` + `feature.md` + `docs.md` + `refactor_perf.md` + `release.md` + `general.md`（数量宁少勿多；删掉参照仓的 shim/vendored/webui/上游映射专属勾选）。

- 验证：`bun run check`（尤其 `check:docs-links` 与 `check:pr-templates`）全绿。
- 出 PR，等维护者合并。

### 阶段 5 · 发布链迁到 CI（决策 2 = 是）

1. 裁剪版发布脚本（本仓专属，约 120–150 行，零第三方依赖，`bun` 直跑）：`version`（`changeset version` + 刷新 `bun.lock`）· `build`（`bun run --filter './packages/*' build`）· `test`（与门禁同一口径）· `publish`（**仅 registry 版本比对 + 逐包 `npm publish --access public`**；不做拓扑序——3 包之间无互依赖；不做 `workspace:*` 改写——本仓纪律本就禁用该协议，但**保留一条终局断言**：发布前扫描依赖字段不得残留 `workspace:`/`file:`/`link:`）。
   不整份移植参照仓的 `tooling/release`（1857 行，能力大半用不上）。
2. `.github/workflows/release.yml` 照 §2.6 移植：两 job 切分、`concurrency: release` 不取消、`workflow_dispatch` 的 `skip-version` 输入、`prepare` 推送用 App token（`persist-credentials: false` + `core.hooksPath=/dev/null` + 完整 URL + `env` 传 token 不内联）、`publish` 装 npm 到用户级 prefix + `environment: release`（对象形式）。
3. **不跨 job 传 commit SHA**（避免 CodeQL `actions/cache-poisoning`）：消费 changeset 与构建同处 `prepare` job。
4. 本阶段是 `plugin-am-i-alt` 与 `plugin-puppeteer` 的**首发**，需要 npm 侧为这两个包配 OIDC 信任关系（见 §8）。

- 验证：`workflow_dispatch` + `skip-version=false` 空跑一次（无 changeset 时 `changed=false`，publish 被跳过）；再用一次真实 changeset 走完整链路，确认 environment 审批与 OIDC 发包；两包上 npm 后 `npm view` 核对。
- 出 PR，等维护者合并。合并后维护者把 release 相关设置补齐并把 `release` environment 落地。

### 阶段 6 · 风格对齐（决策 1 = 完全照抄 koishi 口径）

单独一个提交，**不与任何逻辑改动混合**：

1. `biome.json` 改为参照仓口径（tab / `lineWidth: 60` / `attributePosition: multiline` / `suspicious`、`correctness`、`complexity`、`style`、`nursery` 的开关逐条对齐 / `files.includes` 用 `**` + 负向排除 / 保留 `overrides`（去掉 `.vue` 与脚手架两项）/ 加 `**/package.json` 不格式化）。
2. `.editorconfig` 改为：`[*]` tab；`[*.{md,yml,yaml}]` 2 空格；删 `.vue` 与模板两节（本仓无 `.vue`）。
3. `bun run format`（`biome format --write .`）整仓重排；随之清零 13 条 `useLiteralKeys` info（决策 1b）。
4. 文档记录：`biome.json` 不能写注释（参照仓实证），配置说明写进 `docs/guides/development.md`。

- 验证：`bun run check` 全绿 + `bun run build` 通过 + 测试计数不变（69 用例）；PR 正文附「改前 / 改后」的文件数与 diff 规模。
- 出 PR，等维护者合并。

### 阶段 7 · 收尾

1. `merge_group` 真实性验证：把一个真实 PR 送进 merge queue，确认 `gate`（+ `fallow`）在 `gh-readonly-queue/...` ref 上跑过并把结果上报给队列。
2. 把 `fallow`（阶段 3 后）与任何新增 job 追加进必需状态检查。
3. 回填「改前 / 改后 / 口径」三列数字（CI 总时长、`gate` 各步骤耗時、测试段耗时）。
4. 复核 `AGENTS.md` / `docs/**` 无与现状矛盾的描述。

---

## 5. 决策点（已由维护者裁定，2026-09-28）

| # | 决策点 | 裁定 | 影响 |
| --- | --- | --- | --- |
| 1 | 代码风格是否完全对齐 koishi | **完全照抄参照仓 `biome.json` 口径**（含 tab 缩进、`lineWidth: 60`，并关闭 `useNamingConvention`、`noFloatingPromises`、`useLiteralKeys` 等以与参照仓一致） | 阶段 6：一个纯格式提交，`biome format --write .`；本仓现有 4 空格 / lineWidth 100 / `noFloatingPromises: error` 强度随之放松到参照仓口径 |
| 1b | 13 条 biome info 是否清零 | **清零** | 阶段 6 一并处理，info 归零 |
| 2 | 发布链是否迁到 CI | **迁到 CI，并按小仓裁剪**（两 job 切分 + OIDC + `release` environment；自写约 150 行小脚本，不搬 1857 行发布引擎） | 阶段 5；需要 npm 侧 OIDC 信任配置与仓库侧 environment / App |
| 2b | 发布 App 的 bypass 模式 | **`exempt`**（与参照仓线上取值一致；提示词中的 `Always` 未采用） | 阶段 2 建 ruleset 时填 `exempt` |
| 3 | 是否引入 Turborepo | **暂不引入** | 不新增 `turbo.jsonc` / `turbo` devDependency / `TURBO_TOKEN`；CODEOWNERS 无需该路径；「量化优先」——若阶段 7 的实测数字显示确有收益再单独立项 |
| 4 | puppeteer 的 Chrome 测试是否拆 job | **不拆**，留在 `gate` 内 | CI 保持单 job（+ 阶段 3 的 `fallow`），无重复 install/build |
| 5 | `koishi.locales` 声明口径 | **A（已落地）**：声明 ⊆ 实际 + 有 `locales/` 就必须七语种齐全且键对齐 + 每个 `locales/*.yml` 必须被同包源码 import；`cron` 的声明已在阶段 3 期间删除（它没有词典） | `tooling/checks/locales.ts` 承担；三包现状均合规 |
| 6 | `am-i-alt` 的 5 个死语种文件 | **A（已落地）**：补齐 import 让七语种真正生效（PR #5，2026-09-28 合并） | 产物 `lib/assets/` 现有 7 个 yml 拷贝物；防回归由 `check:locales` 的 import 对账承担 |

### 决策点 5 说明（已裁定为 A，保留推理过程）

> 状态：2026-09-28 裁定为 **A**，并在阶段 3 落地（`tooling/checks/locales.ts`）；`cron` 的 `["zh"]` 声明也已删除（新规则下它指向不存在的词典，会直接报红）。下方为当时的候选与理由，保留供回溯。

事实：参照仓线上惯例是**语言前缀**形态（`@koishi-ce/plugin-help` 声明 `["zh","en","ja","fr","zh-TW"]`，`plugin-bind` 声明 `["zh","en"]`），而本仓 `am-i-alt` 实际有 7 个语种文件却只声明 `["zh","en"]`，`cron` 声明 `["zh"]` 但完全没有词典文件，`puppeteer` 未声明。另注：该字段的**消费方未核实**（见 §1.5），故不应假设它有运行时语义。

三个候选口径：

- **A（推荐）**：`check:locales` 要求「`koishi.locales` 声明的每个语言前缀都能在 `locales/` 里找到对应文件」+「有 `locales/` 目录就必须 7 语种齐全且键对齐」+「每个 `locales/*.yml` 都必须被源码 import」（G21 的防回归）。同时把 `cron` 的 `locales` 声明删除（它没有词典）。声明不必等于文件集合，但不得指向不存在的语种。
- **B**：要求声明集合与实际文件**完全相等**（`am-i-alt` 必须补全为 7 项、`cron` 必须删声明）。最严，但把「我声明支持哪些语言」与「我有哪些文件」强行绑定，与参照仓 `plugin-bind`（有 en 文件却只声明的形态）也不完全一致。
- **C**：保持现状，`check:locales` 不校验 `koishi.locales` 字段（只做键对齐 / 语种齐全 / 假翻译 / import 对账）。改动最小，但留下声明漂移。

请维护者裁定后在阶段 3 落地。

### 决策点 6 说明（已裁定为 A，保留推理过程）

> 状态：2026-09-28 裁定为 **A**（补齐 import），由 PR #5 独立落地并已合并；`check:locales` 的 import 对账同期在阶段 3 实现（PR #7）。下方为当时的候选与理由，保留供回溯。

事实：`packages/am-i-alt` 的 7 个语种文件里，**只有 zh-CN 与 en-US 被 `src/index.ts:81-82` 注册**，另外 5 个（`zh-TW` / `ja-JP` / `fr-FR` / `de-DE` / `ru-RU`）从未 import，因而运行时不生效、也不进产物。这属于**代码缺陷而非门禁问题**，且修它会产生用户可见行为变化（新增 5 个语种的界面/命令文案），因此**不与门禁改造混做**。

三个候选：

- **A（推荐）**：补齐 import，让七语种真正生效——与 `AGENTS.md`「七语种齐全」的要求一致，词典已全部翻译好且键对齐、无假翻译，改动成本极低（约 5 行）。
- **B**：删掉 5 个死文件，把 `AGENTS.md` 与 `koishi.locales` 改成「实际支持 zh-CN / en-US」。最保守，但浪费已完成的翻译工作。
- **C**：暂不处理，只在 `docs/` 记为已知问题（`check:locales` 的 import 对账要么先豁免 `am-i-alt`、要么一上来就是红的）。

不论选哪个，`tooling/checks/locales.ts` 的「存在但未 import」对账都应实现——它正是防止这类缺陷再次静默通过的闸门。

**本会话建议**：先把 G21 作为独立 PR（`fix(am-i-alt): …` + changeset）排在阶段 3 之前或之后皆可，但**不要**与 CI / 仓库设置改动同一个 PR。请维护者指定顺序。

---

## 6. 验收标准

与提示词第 9 节一一对应，并给出**可核验的命令**。

| # | 验收标准 | 核验方式 |
| --- | --- | --- |
| 1 | `main` 上有生效 ruleset：PR-only + 签名 + linear history + merge queue + 必需状态检查（名字与 CI job 一致）；`merge_group` 已在 CI 触发面里**并被真实队列跑验证过** | `gh api repos/Koishi-CE/services/rulesets`；`gh run list --event merge_group`；队列里那个 PR 的 check 上报记录 |
| 2 | 锁文件入库；CI 不再用 `latest` 版本；gate / fallow 分 job 且全绿；`bun run check` 与 CI 口径一致 | `git ls-files bun.lock`；`grep packageManager package.json`；`gh run view --json jobs`；CI 与本地跑同一条 `bun run check` |
| 3 | `AGENTS.md` / `docs/{guides,reference,process,decisions}` 成形，且**不再有与现状矛盾的描述**（「main 直提」「发包不经 CI」必须消失或改写） | `grep -rn "直提\|不经 CI" AGENTS.md docs/`；`bun tooling/checks/docs-links.ts` |
| 4 | CODEOWNERS、dependabot（+ 锁文件守门）、PR 模板、SPDX 头齐备 | 文件存在性 + `bun run check`（含 `check:pr-templates` / `check:spdx`） |
| 5 | 每条改动都有 PR + 实跑证据；提速类改动有「改前 / 改后 / 口径」三列数字 | 各 PR 正文；阶段 7 的回填表 |
| 6 | `@koishi-ce/plugin-*` 能经 CI 发版，全程无长期 token，且 `publish` 仍受 `release` environment 审批 | `gh run list --workflow release.yml`；npm 上 `npm view @koishi-ce/plugin-am-i-alt version`；`gh api repos/.../environments/release` |

---

## 7. 风险与依赖

| 风险 / 依赖 | 说明 | 处置 |
| --- | --- | --- |
| **顺序风险（最高）** | 若先开必需状态检查、后加 `merge_group`，队列永远等不到上报，12–15 分钟后剔单，合并卡死 | 阶段 1 必须先合并；阶段 2 才开保护；`gate` 名字在阶段 1 就定稿 |
| **首次发布的不可回滚性** | `plugin-am-i-alt` 与 `plugin-puppeteer` 在 npm 上从未发布，一旦以错的版本号/协议发出即无法撤回 | 阶段 5 先 `workflow_dispatch` 空跑 + 本地 `--dry-run` 预演；`publish` 环保留 `workspace:`/`file:`/`link:` 终局断言 |
| npm OIDC 信任配置 | 需要为 3 个包各配一条信任关系（repository + workflow 文件名 + environment），且 environment 名须与 workflow 里的严格同名 | 阶段 5 前置；配置项进 §8 清单由维护者执行 |
| GitHub App 创建权限 | 需要组织层可建 App；参照仓已有同类 App，但那是装在其自己仓库上的，本仓需另建一个（或把既有 App 扩装到本仓并确认权限面） | 阶段 2 前置；由维护者执行，本会话不自行创建 |
| CodeQL default setup 的 `code_scanning` 规则 | 参照仓 ruleset 开了 `code_scanning`（CodeQL medium_or_higher）。本仓 CodeQL 是 default setup 且 query suite 更严（extended） | 阶段 2 可开（CodeQL 已在跑，会真实上报）；若一开始就拿不到结果，先不开，避免又一个「等不到的规则」 |
| `code_coverage` 规则 | 参照仓设 90% / drop 1；本仓尚无覆盖率基线，且失败的 workflow 上传步骤不存在时 PR 会缺 status | 阶段 1 先量化覆盖率，阶段 7 再决定是否开与阈值 |
| Turborepo 远程缓存 | 托管方（Vercel）对维护者的可用性存疑；自托管需要 runner 可访问的地址；GitHub Actions 缓存无法跨 PR → merge_group 复用（官方明文） | 决策 3 = 不引入，风险消解；将来重启时按「量化优先」先拿基线 |
| 格式大 diff 淹没历史 | 阶段 6 的 `biome format --write .` 会重排全部源文件（含 lineWidth 100 → 60 的换行变化） | 单独一个纯格式提交、不与逻辑改动混合；在 PR 正文给出 diff 规模与「无行为变化」论证（测试计数不变） |
| 格式化后 lint 强度放松 | 决策 1 选择完全对齐参照仓，`noFloatingPromises: error` 会被关掉（本仓现有更严），`useLiteralKeys` 也会被关掉 | 在 `docs/guides/development.md` 明确记录这是「对齐参照仓」的取舍；`useLiteralKeys` 的关闭同时解掉了与 tsconfig `noPropertyAccessFromIndexSignature` 的 TS4111 冲突（见 §1.3）。若维护者后续要恢复某条强度，作为独立改动提出 |
| biome 覆盖面换口径后暴露新问题 | `files.includes` 从 `packages/*/src/**` 换成参照仓的 `**` + 负向排除后，`tsdown.config.ts`、`tsconfig*.json`、`locales/*.yml`、根 `package.json` 首次进入 lint/format 视野 | 阶段 6 单独一个纯格式提交，把这些文件的差异一并纳入；预期差异规模远大于 `src/`，PR 正文需给出「改前 / 改后」文件数与 diff 规模 |
| **`main` 无保护期间的直推风险** | 阶段 1 合并后、阶段 2 打开 ruleset 之前，`main` 仍可直推；而阶段 1 恰好改了 CI 触发面 | 缩短这个窗口：阶段 1 合并后尽快执行阶段 2；期间**只允许 AI 走 PR**（本会话已遵守） |
| `readme.md` 大小写修正在 Windows 上不可见 | `git mv README.md README.md` 之类的操作在大小写不敏感文件系统上无效 | 用 `git mv -f readme.md README.md`（或先 `git rm --cached` 再 `git add`）并在 PR 里说明；属 G24，随阶段 4 的 README 改动一起做 |

---

## 8. 待维护者执行的仓库设置清单

**本会话不自行执行任何设置类改动。** 以下命令/操作由维护者确认后执行（顺序即编号顺序）。

### 8.1 阶段 2 前置（阶段 1 已合并后）

```bash
# 1) GitHub App：Contents: Read and write、关 webhook、仅装 Koishi-CE/services
#    存 Client ID 与私钥
gh variable set APP_CLIENT_ID --repo Koishi-CE/services --body "<Client ID>"
gh secret set APP_PRIVATE_KEY --repo Koishi-CE/services < private-key.pem

# 2) release environment（Required reviewers + 禁自审 + 仅 main）
gh api -X PUT repos/Koishi-CE/services/environments/release \
  -f 'deployment_branch_policy[protected_branches]=false' \
  -f 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/Koishi-CE/services/environments/release/deployment-branch-policies -f name=main
# Required reviewers 需在网页 Settings → Environments → release 勾选（PaperKoi + Oppenheymu，勾 prevent self review）

# 3) 分支 ruleset「保护主分支」（先只填 gate，后续阶段追加）
#    规则：deletion / non_fast_forward / required_signatures / required_linear_history /
#          pull_request(1 评审, dismiss stale, require_code_owner_review,
#                        required_review_thread_resolution, allowed_merge_methods=[squash]) /
#          merge_queue(SQUASH, ALLGREEN, check_response_timeout_minutes=15) /
#          required_status_checks([gate], strict_required_status_checks_policy 待定)
#    bypass：RepositoryRole(admin)=always + 上述 App 的 Integration=exempt
```

`strict_required_status_checks_policy` 建议**不开**（与 merge queue 重复，参照仓实证结论）。

### 8.2 阶段 3 后追加

- 将 `fallow (dead code & deps audit)` 追加进 ruleset 的必需状态检查。
- 可选：给 `main` 加 `code_scanning` 规则（CodeQL 已在 default setup 运行）。

### 8.3 阶段 5 前置

- npm 侧为 `@koishi-ce/plugin-am-i-alt`、`@koishi-ce/plugin-cron`、`@koishi-ce/plugin-puppeteer` 各配一条 OIDC 可信发布关系：repository `Koishi-CE/services`、workflow 文件名 `release.yml`、environment `release`、权限仅 `publish`（不含 `stage publish`）。
- 确认 `release` environment 已按 8.1 的第 2 步建好（名字必须与 workflow 中的 `environment.name` 严格同名）。

---

## 9. 附件：本次实勘用到的命令（便于复核）

```bash
# 目标仓
gh api repos/Koishi-CE/services/rulesets                      # → []
gh api repos/Koishi-CE/services/branches/main/protection      # → 404
gh secret list --repo Koishi-CE/services; gh variable list --repo Koishi-CE/services
gh run list --repo Koishi-CE/services --limit 8 --json databaseId,conclusion,createdAt,updatedAt
gh api repos/Koishi-CE/services/actions/runs/<id>/jobs        # 各步骤 started_at/completed_at
gh api repos/Koishi-CE/services/code-scanning/default-setup
gh api repos/Koishi-CE/services/collaborators --jq '.[].login'

# 参照仓
gh api repos/Koishi-CE/koishi/rulesets/24072025
gh api repos/Koishi-CE/koishi/environments/release
gh api repos/Koishi-CE/koishi/environments/release/deployment-branch-policies
gh secret list --repo Koishi-CE/koishi; gh variable list --repo Koishi-CE/koishi

# 本仓基线
bun --version; npm --version                                  # 1.4.2 / 11.20.0
bun install → bun.lock（lockfileVersion 2，实测）
bun run check                                                 # 退出码 0，1.7s，69 pass / 0 fail
bunx biome check . --reporter=summary                         # Checked 21 files，13 infos
git log --all -- bun.lock                                     # 空
```
