# 发布流程（RELEASE）

> `services` 三个可发布包（`@koishi-ce/plugin-am-i-alt` / `-cron` / `-puppeteer`）的版本与发布管理：changesets 管版本，`release.yml` 发布链管执行。**铁律：一切发布走发布链，禁止手动 `npm publish`。** 发布链的版本提交会把提交直推 `main`，**这是全仓唯一允许直推 `main` 的路径**（其余一切改动走 PR，见 [../guides/development.md](../guides/development.md) 第 2 节与根 [AGENTS.md](../../AGENTS.md) 的 git 提交流程节）。
> **先读**：开发与门禁见 [../guides/development.md](../guides/development.md)；包结构与依赖纪律见 [../reference/architecture.md](../reference/architecture.md)；改造背景见 [../decisions/services-modernization.md](../decisions/services-modernization.md)。
> **本文结构**：1 发布链与环境前置 · 2 触发与两 job 分工 · 3 changesets 约定 · 4 发布顺序与补发 · 5 暂存区（staged publish）与 409 · 6 事故记录（为什么禁止手动 publish） · 7 OIDC 的信任边界。
>
> **实施状态（阶段 4 写作时）**：阶段 5 落地 `release.yml` 与发布脚本。在此之前，仓内 `bun run release`（`changeset version && bun run --filter './packages/*' build && changeset publish`）与宿主实例发布链仍是仅有的通道；阶段 5 合并后以本文为准。文中已实测的坑（暂存区、事故记录、OIDC 三类）在两种通道下同样适用。

## 1. 发布链与环境前置

发布由 CI 编排为四个环节，本地脚本与 CI 共用同一份实现（`tooling/release/`，零第三方依赖、`bun` 直跑）：

```bash
bun tooling/release/index.ts version    # 消费 .changeset/ 条目（changeset version）+ 刷新 bun.lock
bun tooling/release/index.ts build      # bun run --filter './packages/*' build
bun tooling/release/index.ts test       # 与门禁同一口径的测试
bun tooling/release/index.ts publish    # registry 版本比对 → 逐包 npm publish --access public
```

行为约定：任何一步失败立即中断并保留现场；重跑幂等（已发布版本经 registry 比对自动跳过）——例外是 npm 暂存区中的版本不计入比对，此时重跑不幂等（见第 5 节）。

**本仓按小仓裁剪，刻意不做**：拓扑序（三个包之间无互依赖）、`workspace:*` 改写（本仓纪律本就禁用该协议）。但发布前保留一条**终局断言**：扫描各包依赖字段，不得残留 `workspace:` / `file:` / `link:`——首发包一旦带上这类协议就无法回滚。

环境前置（仓库设置，非代码）：

1. `release` Environment：Required reviewers（`prevent_self_review: true`），Deployment branches 限制为 `main`；
2. 主分支 ruleset 的 bypass 名单里有发布用的 GitHub App（模式 `exempt`），否则 `prepare` 推不上 `main`；variable `APP_CLIENT_ID` 与 secret `APP_PRIVATE_KEY` 指向该 App；
3. npm 侧为**三个包各配一条** OIDC 可信发布关系（见第 7 节）。

## 2. 触发与两 job 分工

触发为 `push: main` 且 `paths: ['.changeset/**']`（只有携带 changeset 的合并才值得跑），外加 `workflow_dispatch` 作补发 / 重跑逃生舱；`concurrency: group: release` 且 **`cancel-in-progress: false`**——两个运行同时消费 changeset 会撞版本号。

| job | 职责 | 权限 |
| --- | --- | --- |
| `prepare` | 消费 changeset → build → test → 用 GitHub App token 推送版本提交 → 打包 artifact | `contents: write`，**无** `id-token` |
| `publish` | 解包 artifact → 逐包 `npm publish` | `id-token: write` + `environment: release` 审批，**无** `contents: write`，且**不跑 `bun install`** |

`workflow_dispatch` 另带 `skip-version` 布尔输入：changeset 一旦被消费，重跑就再也走不到 publish（version 环无条目可消费 → `changed=false` → publish 被跳过），此时置 `skip-version=true` 跳过 version 环、直接构建当前 `main` 交给 publish，由 registry 比对决定哪些版本真要发（已发布的自动跳过）。它不改变审批语义——publish 依旧卡在 `environment: release`。

设计约束（每条都对应一次真实事故，改 workflow 前先读）：

- **消费 changeset 与构建必须同处一个 job**。拆成两个 job、由 version 输出 commit SHA 供 build 用 `actions/checkout` 的 `ref:` 检出，会被 CodeQL 判 `actions/cache-poisoning`（「可被 `workflow_dispatch` 影响的 ref 被特权 job 检出并执行」，旗舰仓在该文件上稳定报 3 条 high）。合成一个 job 后用默认 checkout，既消掉污点也免掉 SHA 传递。
- **推送排在构建与测试之后**：这样构建或测试失败时，`main` 上不会留下「版本已升、包却没发出去」的提交；推送用 `git push … HEAD:main`（runner 上未必存在名为 `main` 的本地分支）。
- **推送凭证是 GitHub App 的 installation token**：默认 `GITHUB_TOKEN` 推 `main` 会被 ruleset 以 `GH013` 拒绝，且它**无法被加入 ruleset 的 bypass 名单**（GitHub 的安全限制），能进该名单的只有 GitHub App。
- **`prepare` 的 `actions/checkout` 必须 `persist-credentials: false`**：否则 checkout 会把 `GITHUB_TOKEN` 持久化到 `.git/config` 的 `http.<url>.extraheader`，与推送 URL 里的 App token 争同一个 `Authorization` 头。
- **推送用完整 URL 而非 `git remote`，并加 `-c core.hooksPath=/dev/null`**：`prepare` 里有 `bun install` / `build` / `test` 这些构建期代码，被污染时可在 `.git/hooks/pre-push` 里读到那个 token。这是「让持 `contents: write` 的 job 拿到 bypass 能力」的固有代价，剩余面靠 CODEOWNERS 对构建文件的强制复核兜底。
- **token 经 `env` 传递而非内联进 `run`**（内联会把 token 明文写进日志）。
- **`publish` 里把 npm 装进用户级 prefix**：runner 的 npm 是系统级安装（属 root），`npm install -g npm@11` 会因写 `/usr/local/share/man` 而 EACCES（旗舰仓实测 exit 243）。改为 `npm install -g npm@11 --prefix "$HOME/.npm-global"` 并把该 bin 写进 `GITHUB_PATH`（后者只对后续步骤生效，故安装与写 PATH 必须在同一步）。OIDC 发布需 npm ≥ 11.5.1。
- **`environment` 用对象形式**（`environment: { name: release }`）：简写在部分 schema 版本下会被编辑器误报。

## 3. changesets 约定

- 面向发布的包有行为变化时，**随提交写 `.changeset/` 条目**（`bun run changeset`）；纯内部 / 文档 / 工具链改动不写。攒到发版前再写必漏。
- bump 类型：API 破坏 → major（1.x 前 → minor），新功能 → minor，修复 → patch。
- 手写模板形态：

  ```md
  ---
  "@koishi-ce/plugin-am-i-alt": patch
  ---

  fix: ……（简体中文说明）
  ```

- `.changeset/config.json` 当前口径：`access: public`、`baseBranch: main`、`commit: false`、`changelog: false`、`updateInternalDependencies: patch`、无 `ignore` 名单（根包 `private: true` 无需）。
- **首发包要格外当心**：`@koishi-ce/plugin-am-i-alt` 与 `@koishi-ce/plugin-puppeteer` 在 npm 上从未发布过，**首发不可回滚**（版本号只能前进、发出去的内容不能撤回）。首发前的动作：本地 `npm publish --dry-run` 预演、或用 `workflow_dispatch` 空跑一次确认链路，并核对 `files` 白名单（`lib` / `src` / `locales` 是否齐）与 `exports` 映射。

## 4. 发布顺序与补发

- **顺序**：三个包互不依赖，无拓扑约束；发布链逐包串行，任一步失败后续包不发布。
- **补发 / 重发坏版本**：先 bump 该包版本，再走 `workflow_dispatch`（changeset 已被消费时必须置 `skip-version=true`），或本地 `bun tooling/release/index.ts publish`。
- **漏发排查**：`npm view <包名> versions --json` 看 registry 实况，不要只看本地版本号。

## 5. 暂存区（staged publish）与 409

npm 的暂存发布（staged publishing）会在版本公开前插入人工批准环节：提交先进入 registry 的**暂存区**，须由有权限者带 2FA 批准后才正式上线；浏览器认证（web auth）的发布也会被 registry 转入暂存区。

- **症状**：`npm error code E409` + `Cannot publish over previously staged version "<version>"`，发布链在该包中断（后续包均未发布）。
- **为何重跑也是错**：暂存版本**不出现在 registry 的 versions 列表**里，版本比对看不到它，于是每次重跑都重新尝试同一版本，每次都 409——这种情形下重跑**不幂等**。
- **处置（三选一）**：① npmjs.com → **Staged Packages** 页 → 对目标版本 Approve（转正式发布）或 Reject（丢弃后重发）；② npm CLI ≥ 11.15：`npm stage list` / `npm stage view <stage-id>` / `npm stage approve <stage-id>` / `npm stage reject <stage-id>`；③ 不处理暂存版本，直接 bump 一个补丁版本重发。
- **同批其余包**：中断点之后的包尚未发布——先处理掉阻断版本，再补发。
- **本仓的预防**：npm 信任配置里的权限只勾 `publish`、**不勾** stage publish（见第 7 节），从源头避开暂存流程。

## 6. 事故记录（为什么禁止手动 publish）

2026-08-31（Koishi-CE 主仓，本仓同源教训）：绕链手动 `npm publish` 把 `workspace:*` 原样带上 npm（config@1.0.5 / market@1.0.6 / hmr@1.0.3 污染，koishi@1.0.3 漏发），下游 `bun install` 全部解析失败。处置：发布链补齐 workspace 协议改写的终局断言，坏版本用补发流程覆盖。

**workspace 协议的消费从不靠 changesets，只靠发布链**——这也是禁止手动 publish 的根本原因。本仓的对应纪律更前置一层：**跨包依赖根本不写 `workspace:*`**（写 semver range），发布链仍保留终局断言兜底。

## 7. OIDC 的信任边界

npm 侧走**可信发布（Trusted Publisher / OIDC）**，不存在任何长期 token。信任配置把 `repository` / `workflow_ref.file` / `environment` 三个 claim 钉死，语义是**「谁能让 `.github/workflows/release.yml` 在 `Koishi-CE/services` 里跑起来，谁就能发这三个包」**——授的是工作流文件，不是人。因此：

- **job 上的 `environment: release` 不可删**：npm 侧声明了 environment claim，缺了它 OIDC 校验直接不通过；反过来，若当初不声明 environment，删掉这一行就能绕过 GitHub 的审批——这正是声明它的意义。
- **`.github/workflows/**` 与 `tooling/release/**` 必须开 CODEOWNERS 复核**：本模型下改这两处等于拿到发布权。
- **`release` Environment 的 Deployment branches 必须限制为 `main`**：`workflow_dispatch` 是在**被 dispatch 的那个 ref** 上取 workflow 文件的，不限制的话，有写权限者可以在分支上改本文件后 dispatch，借这个 environment 拿到 OIDC。限制到 `main` 后，非 main ref 的运行访不到该 environment，`environment: release` 的 claim 也就无从满足。
- **三个 claim 任何一处与实际不符 OIDC 都不认**（仓库名大小写、workflow 文件名、environment 名）。要改必须 revoke 后重建——registry 每包只允许一条信任配置，没有 update 语义。

三个包各自的信任配置（npm 网页侧 package settings → Trusted Publisher，**无法用 `gh` CLI 读写**）：

| 字段 | 值 |
| --- | --- |
| repository | `Koishi-CE/services` |
| workflow 文件名 | `release.yml` |
| environment | `release`（须与 workflow 里的 `environment.name` 严格同名） |
| 权限 | 仅 `publish`（**不勾** stage publish） |

其它要点：

- OIDC 模式下 `npm whoami` / `npm owner ls` 必然失败（没有登录态——npm 换到的是**包级**短时 token），故发布脚本检测到 `ACTIONS_ID_TOKEN_REQUEST_URL` 时应跳过登录与所有权预检。
- 发布产物自动带 provenance（npm 侧 OIDC 成功即自动开启），下游可核验来源 commit 与 workflow。
- **版本先落 `main`、发布待审批**：`prepare` 不挂 environment，故版本提交会在构建测试通过后立即进 `main`，而包要等 `release` environment 的批准才真正上线。若某次审批长期不点，`main` 的版本会暂时领先 npm——用 registry 比对能安全处理这种中间态，但排查「版本号对不上」时要知道它的存在。
- **App token 推送会触发新的 workflow 运行**（GitHub 只对 `GITHUB_TOKEN` 免触发）：版本提交里被消费的 changeset 以**删除**形式入库，命中本 workflow 的 `paths: ['.changeset/**']`，因此一次发布会多出一次运行——那次消费不到 changeset，只跑 install 与 version 即空转退出；`concurrency: group: release` 保证两者串行。
- **App token 推送的提交不会被 GitHub 自动签名**：bypass 让签名规则不适用，故无关紧要；若将来撤掉 bypass 改用签名过 `required_signatures`，需在 workflow 里另配 GPG / SSH 签名并再放一份私钥。
