# 开发指南（DEVELOPMENT）

> `services`（Koishi-CE 服务型插件 monorepo）的**开发手册**：环境、命令、门禁、构建产物布局、编码约定、测试写法与已知坑。以实际代码为准，文档滞后时听代码的。
> **先读**：根 [AGENTS.md](../../AGENTS.md)（铁律精简版）→ 本文（方法与细节）；结构见 [../reference/architecture.md](../reference/architecture.md)，发布见 [../process/release.md](../process/release.md)。
> **本文结构**：1 环境 · 2 PR 工作流（禁止直推 main） · 3 常用命令 · 4 门禁构成 · 5 构建产物布局 · 6 编码约定 · 7 测试写法 · 8 已知坑 · 9 版本与发布 · 10 依赖更新。

## 1. 环境要求

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| [Bun](https://bun.sh) | ≥ 1.4（根 `package.json` 的 `packageManager` 钉 `bun@1.4.2`） | 唯一包管理器（workspaces + `bun.lock`）、测试运行器、脚本运行时 |
| Node | ≥ 22（不作兼容目标） | 辅助场景；类型检查经 `@typescript/native` 提供的 `tsc` 二进制 |

- 不要引入 pnpm / yarn / npm 的锁文件；无全局安装要求，工具都在 devDependencies 里。
- CI 不写死 Bun 版本：`oven-sh/setup-bun` 自动读根 `packageManager`，升级只改根字段。

## 2. PR 工作流（禁止直推 main）

**铁律：本仓一切改动都走 PR，禁止直接推送 `main`**——含人类维护者与各类 AI / agent 工具产出的改动，改动再小也不例外。这是流程要求而非技术限制：`main` 现由仓库 ruleset「保护主分支」（id `24119346`）约束（要求走 PR、签名提交、linear history 与 merge queue，2026-09-28 核对），但被 bypass 放行不等于「可以直推」。**合并由维护者执行，AI / agent 产出的 PR 不自审自并。** 精简版纪律见根 [AGENTS.md](../../AGENTS.md) 的 git 提交流程节，面向人类贡献者的版本见 [.github/CONTRIBUTING.md](../../.github/CONTRIBUTING.md)。

```bash
git switch -c docs/pr-only-workflow     # 1. 从最新 main 切出改动分支（<type>/<范围>）
# ...改代码 → bun run check（构建类改动加 bun run build）...
git add -A && git commit -m "docs: ……"  # 2. 分支上提交，简体中文提交信息
git push -u origin docs/pr-only-workflow # 3. 推分支（不是 main）
gh pr create --template "文档 (docs)"     # 4. 开 PR，选领域模板（清单见 .github/PULL_REQUEST_TEMPLATE/config.yml）
# 5. 等 CI 全绿 → 汇报 PR 链接与验证证据 → 由维护者在 merge queue 里合并
git switch main && git pull --ff-only    # 6. 合并后同步 main 并删除已合并分支
```

- **分支命名**：`<type>/<范围>`，`type` 取 `feat` / `fix` / `docs` / `chore` / `build` / `refactor`（如 `fix/puppeteer-e2e-flake`、`chore/quality-gates-phase3`）。
- **提交粒度**：分支内可小步多次提交；提交信息格式与 scope 约定同主历史（`feat:` / `fix:` / `docs:` / `chore:` / `build:`，可带 scope 如 `fix(core):`）。
- **提交必须签名**：ruleset 开了 `required_signatures`，本机 `~/.gitconfig` 已配 `commit.gpgsign`。**不要用 `git -c user.email=...` 之类覆盖身份**——那会让签名变成 `bad_email`，GitHub 判定 `verified: false` 并拒绝合并。提交后用 `gh api "repos/Koishi-CE/services/pulls/<n>/commits" --jq '.[].commit.verification'` 核对应为 `verified: true`。
- **PR 正文**：按 `.github/PULL_REQUEST_TEMPLATE/` 下对应领域的模板写全。改动说明、验证证据（实跑的门禁段与结论，附退出码与关键输出行）、changeset 情况、影响面与风险四件是各模板的公共要求。
- **合并条件**：CI 全绿 + 评审通过（命中 CODEOWNERS 敏感路径需对应 code owner 批准，PR 作者不能批准自己的 PR）+ merge queue 通过。**队列会新跑一遍 CI**——它只认在自建的 `gh-readonly-queue/<base>/pr-*` ref 上跑出来的那次检查，`pull_request` 那次不算数。
- **唯一例外**：发布链的版本提交（阶段 5 起由 `release.yml` 的 `prepare` job 用 GitHub App token 直推 `main`）——这是发布链的既定设计，不构成人工直推 `main` 的许可。
- **并行会话注意**：同一时刻 `main` 可能被其它会话推进，动手前重核 `git log --oneline origin/main -1`；推送前先 `git rebase origin/main`。

## 3. 常用命令

```bash
bun install                     # 安装依赖（Bun workspaces，产出/校验 bun.lock）
bun run check                   # 全量门禁 = lint → typecheck → test → 自研门禁五连（提交前必跑）
bun run lint                    # biome check .（格式 + lint 的唯一权威）
bun run format                  # biome format --write .
bun run typecheck               # tsc -p tsconfig.json（TS7，三包源码一次查完）
bun test                        # 全量测试（bun:test）
bun run build                   # 按包 tsdown：bun run --filter './packages/*' build → packages/*/lib/
bun run check:locales           # 词典：键对齐 / 七语种齐全 / 假翻译 / import 对账 / koishi.locales 子集
bun run check:packages          # 包纪律：包名 / 元数据 / ESM-only / peer 契约 / 导入纪律
bun run check:docs-links        # 文档相对链接与锚点存活
bun run check:pr-templates      # PR 模板与 config.yml 清单对账
bun run check:spdx              # 手写源码的 SPDX 许可证头
bun run fallow                  # 死代码与依赖审计（bunx 直跑，版本 pin 在脚本内；配置见根 .fallowrc.jsonc）
bun run changeset               # 写 changeset 条目（面向发布的包有行为变化时）
```

定向调试：

```bash
bun test packages/puppeteer                    # 只跑某包的用例
bun test --isolate --coverage --coverage-reporter=text   # 覆盖率（与 CI 同口径，输出到终端）
bun tooling/checks/locales.ts                  # 单跑某个自研门禁脚本
```

## 4. 门禁构成

**本地 `bun run check` 由八段组成**（`lint` → `typecheck` → `test` → 五个自研脚本）：

1. **lint（biome）**：`biome check .` = 格式 + lint。当前 `files.includes` 只覆盖 `packages/*/src/**`（阶段 6 会对齐旗舰仓的 `**` + 负向排除口径，届时 `tsdown.config.ts` / `locales/*.yml` / 根 `package.json` 等首次进入视野）。`biome.json` **不能写注释**（见第 8 节第 4 条）。
2. **typecheck（TS7）**：`tsc -p tsconfig.json`，`include: ["packages/*/src"]` 一次查完三包；不需要先 build（paths 指向 `src`）。
3. **test（bun:test）**：`bun test`。用例数与耗时以实跑输出为准。
4. **check:locales**：`tooling/checks/locales.ts`（零依赖）——以 `zh-CN.yml` 为基准做键对齐、七语种齐全（有 `locales/` 就必须齐）、假翻译（拉丁 / 西里尔语种的叶值仍含汉字即报）；另加两条本仓专属对账：**每个 `locales/*.yml` 必须被同包源码 import**（防「文件存在但运行时不注册」这类静默缺陷）、**`koishi.locales` 声明必须是实际语种的子集**（声明用语言前缀形态，`zh` 覆盖 `zh-CN` / `zh-TW`）。
5. **check:packages**：`tooling/checks/packages.ts`（零依赖）——包名纪律（不写回上游名）、顶层类型字段统一 `types`、ESM-only 形态、peer 逐字为 `@koishi-ce/koishi ^1.0.0` 且三包互不声明运行时依赖、源码导入纪律。
6. **check:docs-links**：`tooling/checks/docs-links.ts`（零依赖）——docs 全树 + 根部门面（`readme.md` / `AGENTS.md`）+ `.github/**`（含 PR 模板目录）的相对链接与锚点存活。
7. **check:pr-templates**：`tooling/checks/pr-templates.ts`（零依赖）——PR 模板选择器与模板文件对账：清单登记的 `body` 必须存在、目录内 `.md`（README 除外）不得是孤儿、`name` 不得重复、字段只认 GitHub 的 `name` / `description` / `body` 三键。
8. **check:spdx**：`tooling/checks/spdx.ts`（零依赖）——手写源码（`packages/*/src/**` 与 `tooling/**`）必须带 `SPDX-License-Identifier` 头；生成物（`lib` / `dist`）与 `node_modules` 豁免。**只校验标识符、不校验版权行**（版权归属随来源不同，见 [../reference/architecture.md](../reference/architecture.md) 第 7 节）。

**CI（`.github/workflows/ci.yml`）** 两个并行 job，与本地口径逐条对应：

| job | 内容 | 说明 |
| --- | --- | --- |
| `gate` | install → lint → typecheck → test → 自研门禁五连 → build → 覆盖率 → 上传 Codecov | 前八步与本地 `bun run check` 逐字一致；覆盖率单独跑一遍（`--isolate --coverage`），上传步骤排除 `merge_group` |
| `fallow (dead code & deps audit)` | `bun run fallow` | 独立 job，**刻意不并入 gate 的 check 链**——`bunx` 要拉取工具，离线或网络抖动会让主门禁红在与代码无关的地方 |

三个顺序要点（都写在 `ci.yml` 的注释里，改动前先读）：

- **`merge_group` 不可省**：ruleset 启用 merge queue 后，队列只认在 `gh-readonly-queue/...` ref 上跑出来的检查；缺该触发时队列永远等不到上报，超时（本仓 10 分钟）后把 PR 剔除，等于合并必然失败。官方原文：「You must update your CI configuration to trigger and report on merge group events when requiring a merge queue.」
- **Bun 版本不硬编码**：`oven-sh/setup-bun` 自动读根 `packageManager`；第三方 Action 一律钉 commit SHA（ruleset 的 `code_scanning` 会把 `actions/unpinned-tag` 告警算作阻塞项）。
- **当前不需要 build 前置于 typecheck / test**：根 tsconfig 的 paths 指向各包 `src`。一旦 paths 改指 `lib/*.d.ts` 或有测试去读 `lib` 真实产物，**必须**把 build 提到前面。

**必需状态检查**：ruleset 里当前填的是 `gate`；`fallow (dead code & deps audit)` 在阶段 3 后追加。ruleset 只认 **job 名**（不含 workflow 名、矩阵与事件）；编辑器里的搜索框是「输入才搜」的懒加载，打开时不显示候选属正常。

## 5. 构建产物布局

| 产物 | 位置 | 产生方式 |
| --- | --- | --- |
| 入口 ESM | `packages/<包>/lib/index.mjs` | 各包 `tsdown.config.ts`（`bun run build` 经 `--filter` 逐包构建） |
| 类型声明 | `packages/<包>/lib/index.d.ts`（+ `.map`） | 同上，`dts: true` |
| 词典拷贝 | `packages/am-i-alt/lib/assets/<语种>-<哈希>.yml` | tsdown 的 `loader: { ".yml": "copy" }`，只拷**被 import 的** yml |

- `lib/` / `dist/` 被 `.gitignore` 忽略，不入库；发布时现构建。
- **产物里的词典数量是语种是否生效的权威判据**：`am-i-alt` 的 `lib/assets/` 里应出现与「被 import 的语种数」相同数量的 yml（当前七语种齐全）。少一个就说明它的 import 丢了——`check:locales` 会在提交前就拦住。
- 详情（构建配置逐项、依赖外部化口径、d.ts 的 `neverBundle`）见 [../reference/architecture.md](../reference/architecture.md) 第 4 节。

## 6. 编码约定

### TypeScript

- 严格全家桶（`tsconfig.base.json`）：`strict`、`noUncheckedIndexedAccess`、`noPropertyAccessFromIndexSignature`、`exactOptionalPropertyTypes`、`noUnusedLocals/Parameters`、`noImplicitOverride`、`noImplicitReturns`、`noFallthroughCasesInSwitch`、`noUnreachableCode` 等。
- 模块：`target: ES2025`、`module/moduleResolution: NodeNext`（**相对导入一律带 `.ts` 扩展名**）、`verbatimModuleSyntax` + `isolatedModules` + `erasableSyntaxOnly`、`allowImportingTsExtensions`（配合 `noEmit`）。
- **类型导入一律 `import type`**；重导出用 `export type {`。
- **禁 enum 与构造器参数属性**（`erasableSyntaxOnly`）：用 const 对象 + 联合类型替代。
- **异步调用必须 await 或显式 void / `.catch`**（biome 的 `nursery.noFloatingPromises` 为 error；阶段 6 对齐旗舰仓口径后该规则会关闭，见第 8 节第 6 条）。
- `.yml` 导入的类型面在根 `types/yml.d.ts`（不在包内，改动它等于改全仓的类型面）。

### 命名空间与依赖纪律

- 代码内导入一律 `@koishi-ce/*`；`declare module` 增强指向 `@koishi-ce/koishi`。
- `peerDependencies` 一律 `@koishi-ce/koishi ^1.0.0`；跨包依赖写 semver range，**禁写 `workspace:*`**（理由见 [../reference/architecture.md](../reference/architecture.md) 第 3 节）。
- cordis / minato / @satorijs 生态冻结在 3.x 线，勿跳代。

### 国际化（i18n）

- 词典放包根 `locales/*.yml`，七语种齐全（`zh-CN` 基准 + `zh-TW` / `en-US` / `ja-JP` / `fr-FR` / `de-DE` / `ru-RU`），键路径跨语种对齐，占位符用 `{name}` 形态。
- **新增语种文件后必须 import 并 `ctx.i18n.define`**——只把 yml 放进 `locales/` 不会生效，也不会进产物；`check:locales` 的 import 对账会拦住这种漏改。
- `package.json` 的 `koishi.locales` 用**语言前缀**形态（如 `["zh", "zh-TW", "en"]`），且不得声明不存在的语种。

### Biome

- biome 是格式与 lint 的唯一权威；`biome.json` 当前口径为 4 空格缩进 / 行宽 100 / 双引号 / 尾逗号 all / LF，测试文件关 `noNonNullAssertion`（阶段 6 会整体对齐旗舰仓口径：tab、行宽 60 等）。
- **`biome.json` 里不能写注释**：出现 `//` 会让 Biome 静默丢弃整个 `overrides` 数组（不报错、不警告，表现为文件数与错误数暴涨）。配置说明写进本文档。

## 7. 测试写法

框架 `bun:test`，断言用 `bun:test` 的 `expect`（不引入 chai）。

```ts
import { describe, expect, it } from "bun:test";
import { Context } from "@koishi-ce/koishi";

const app = new Context();
app.plugin(mock);
app.plugin(memory);
await app.start();
```

- **测试依赖注入**用 `@koishi-ce/plugin-mock`（`app.mock.client(...)` / `app.mock.initUser(...)`）+ `@koishi-ce/plugin-database-memory`；两者放包内 `devDependencies`。
- **文件放置**随所在包：`am-i-alt` / `cron` 贴被测模块（`src/*.test.ts`）；`puppeteer` 因模块多而收进 `src/__tests__/`。
- **端到端（真实浏览器）**：`packages/puppeteer/src/__tests__/index.test.ts` 的浏览器组用 `describe.skipIf(!executable)` 包裹，本机探测到浏览器（如 `msedge.exe`）才真跑；CI runner 有 `/usr/bin/chromium`，故 CI 上真跑。该组是耗时的绝对大头（冷启动 Chrome 占绝大部分），故超时预算给了 60s 并对每个用例与 hook 加了 `{ retry: 1 }`——改动它前先读该文件顶部注释里的两次 flake 记录。
- **`.yml` 词典在测试中可直接 import**（Bun 原生支持）。
- **不要拿 `ctx.i18n.locales` 写「七语种齐全」的断言**：该属性对每个语言前缀只保留一个变体（`zh` 组下只会出现 `zh-CN` 或 `zh-TW` 之一且随执行顺序漂移），断言必假红；语种齐全由 `check:locales` 静态承担（该结论有四类探针的实测记录，见 `packages/am-i-alt/src/index.test.ts` 末尾注释）。

## 8. 已知坑（历史经验，别再踩）

1. **在宿主工作区内，于本仓目录跑 `bun install` 不会生成本仓的 `bun.lock`**：宿主工作区根 `C:\Dev\Bot-Dev\koishi-dev-service` 的 `workspaces` 含 `external/**`，Bun 会把本仓吸附成宿主的一个 workspace 包，于是从本仓执行实际装到宿主根（`bun pm ls` 显示宿主根 node_modules）。无 `bunfig.toml`、无环境变量参与，纯属 workspace 吸附。**兜底做法**：在工作区之外做一份只含清单与源码的隔离副本，在其中 `bun install`，再拷回；想验证「CI 会怎么装」必须用隔离副本，否则测的是宿主根。独立检出（如 CI 或 clone 到工作区外）不受影响。
2. **门禁与提交务必拆成两条命令**：`bun run check | tail` 的退出码是 `tail` 的，会把红灯当绿灯。不要用 `&&` 串联门禁与 `git commit`。
3. **TS7 的 buildinfo 错误回声**：本仓当前未开 `incremental`、也没有 buildinfo 文件；一旦引入增量构建，改根 tsconfig / 依赖结构后旧错误会复活——先删对应的 `*.tsbuildinfo`（旗舰仓在 `node_modules/.cache/tsc/`）再跑。
4. **`biome.json` 里不能写注释**：出现 `//` 会让 Biome 静默丢弃整个 `overrides` 数组（不报错、不警告）。配置说明一律写进本文档。
5. **`ctx.i18n.locales` 不保证含全部语种变体**（见第 7 节末条），不要用它做语种齐全断言。
6. **阶段 6 会放松两条 lint 强度**：为对齐旗舰仓口径，`nursery.noFloatingPromises`（现为 error）与 `complexity.useLiteralKeys`（现报 13 条 info）会关闭。`useLiteralKeys` 的关闭同时解掉一个死结：按它的建议改成点访问会撞 tsconfig 的 `noPropertyAccessFromIndexSignature`（TS4111，已实测复现）。这是「与旗舰仓口径一致」的自觉取舍，不是遗漏。
7. **`am-i-alt` 的端口语种曾长期不生效**：7 个 yml 里曾有 5 个从未被 import（运行时不注册、产物里也没有）。修法即补齐 import；防回归由 `check:locales` 的「存在但未 import」对账承担——**新增语种文件后必须 import 并在 `apply()` 里 `ctx.i18n.define`**。
8. **`packages/puppeteer` 的 e2e 在 CI 上偶发红**：根因是 30s 超时被冷启动 Chrome 吃满（曾两次把 PR 踢出 merge queue）。现为 60s + `retry: 1`。若再次打满，下一步是给 e2e 拆独立 job（即重新评估「不拆 job」的决策），而不是继续加超时。
9. **写临时探针文件后必须删干净**：提交前用 `git status --short` 与全局搜索确认无残留；负例测试（故意注入违规验证门禁会红）尤其容易漏。
10. **`readme.md` 的大小写在 Windows 上不可见**：git 索引里的文件名曾是小写 `readme.md`，而工作区显示 `README.md`（大小写不敏感文件系统掩盖差异），Linux / macOS 检出后按 `README.md` 取文件的工具会失败。修正用 `git mv -f readme.md README.md` 或 `git rm --cached readme.md && git add README.md`，并在 `git ls-files` 里核实。
11. **`fallow` 的豁免是包名级全局的、且 manifest 级发现只认配置豁免**：源文件里的 `// fallow-ignore-next-line` 对「未使用的 devDependency」这类 manifest-owned 发现**无效**（实测），必须落在 `.fallowrc.jsonc` 的 `ignoreDependencies` 并附理由。另：`toolingDependencies` 只存在于「插件定义」里（顶层没有该字段），且顶层 `plugins` 是**路径数组**而非定义对象。
12. **`check:locales` 的 `koishi.locales` 校验是单向的**（声明 ⊆ 实际）：不强制声明全部语种，漏声明不会红。声明是宿主与文档的承诺面，语种补齐后应主动同步。
13. **`check:pr-templates` 在模板目录不存在时跳过**：`.github/PULL_REQUEST_TEMPLATE/` 尚未建立时只打印提示并通过；目录一旦存在，`config.yml` 缺失即报错。新增模板时三处同步：该目录的 `.md`、`config.yml`、以及 [.github/PULL_REQUEST_TEMPLATE/README.md](../../.github/PULL_REQUEST_TEMPLATE/README.md) 的清单。

## 9. 版本与发布

- 版本由 changesets 递进管理；**面向发布的包有行为变化时随提交写 `.changeset/` 条目**（纯内部 / 文档 / 工具链改动不写）。
- bump 类型：API 破坏 → major（1.x 前 → minor），新功能 → minor，修复 → patch。
- **发版走 CI 发布链**（`.github/workflows/release.yml`，OIDC 可信发布 + GitHub App 推送版本提交），不手动 `npm publish`；流程、环境前置与事故教训见 [../process/release.md](../process/release.md)。
- 已知坑：全新仓库在首次 commit 之前 `changeset status` 会报 "Failed to find where HEAD diverged from <分支>"——先做初始提交即可。

## 10. 依赖更新（Dependabot）

依赖漂移由 [.github/dependabot.yml](../../.github/dependabot.yml) 驱动，两条 update 条目：`bun`（根目录一条，沿根 `package.json` 的 `workspaces` 递归覆盖全部包）与 `github-actions`。

**两个必须知道的坑**：

1. **锁文件会被降级重写**：dependabot-core 的 bun updater 镜像内 Bun 版本不跟随仓库 `packageManager`（dependabot-core#15897），会把 `lockfileVersion: 2` 的 `bun.lock` 静默降级重写（#15848），后果是 PR diff 被整份锁文件重排淹没、真实依赖变更不可评审。CI 的 `gate` job 有一段**仅对 Dependabot PR 生效**（判据 `github.actor`）的格式守门 step；它红了就用仓库钉定的 Bun 重新 `bun install` 后提交，常规 PR 完全不受该 step 影响。
2. **Dependabot PR 的 token 是只读的**：GitHub 把 Dependabot 触发的 workflow 按 fork 处理——secrets 不可用、`GITHUB_TOKEN` 无写权限。故 Codecov 上传在 Dependabot PR 上会降级（`fail_ci_if_error: false`，不影响门禁结论）。

**启用前提（仓库设置，非代码）**：`dependabot.yml` 存在于默认分支即自动生效 version updates；Dependabot alerts 与 security updates 须在仓库 Settings → Code security 里手动开启（本仓当前**未开启**，属已知缺口）。
