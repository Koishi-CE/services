# 贡献指南（CONTRIBUTING）

感谢关注 `services`（Koishi-CE 的**服务型插件** monorepo——收录向其他插件提供基础服务的 Koishi 插件）。本项目与 Koishijs 组织无隶属关系。

## 快速上手

1. 安装 [Bun](https://bun.sh) ≥ 1.4（唯一包管理器与运行时；版本由根 `package.json` 的 `packageManager` 钉定）。
2. `bun install` 安装依赖。
3. 参照 [docs/guides/development.md](./docs/guides/development.md) 了解门禁命令、编码约定与测试写法；仓库结构见 [docs/reference/architecture.md](./docs/reference/architecture.md)；常驻约定见根 [AGENTS.md](./AGENTS.md)。

## 提交前检查

```bash
bun run check    # lint + typecheck + test + 自研门禁五连（词典 / 包纪律 / 文档链接 / PR 模板 / SPDX）
bun run fallow   # 死代码与依赖审计（动了依赖或导出面时）
```

涉及构建改动时加跑 `bun run build`。

以上检查由 CI 自动执行（[workflows/ci.yml](./.github/workflows/ci.yml)）：PR、`main` push 与 merge queue 的 `merge_group` 都触发，两个并行 job——`gate`（lint / 类型检查 / 测试 / 自研门禁 / 构建 / 覆盖率）与 `fallow`（死代码与依赖审计，配置见根目录 `.fallowrc.jsonc`）。本地全绿而 CI 红时，优先核对本地与 CI 的命令是否逐字一致（口径清单见 [docs/guides/development.md](./docs/guides/development.md) 第 4 节）。

## 提交约定（PR only）

**本仓一切改动都走 Pull Request，禁止直接推送 `main`**——包括人类维护者与各类 AI / agent 工具产出的改动，改动再小也不例外。

1. 从最新 `main` 切出改动分支：`git switch -c <type>/<范围>`（`type` 取 `feat` / `fix` / `docs` / `chore` / `build` / `refactor`）。
2. 提交到该分支，提交信息用简体中文，格式参考历史：`feat:` / `fix:` / `docs:` / `chore:` / `build:`，可带 scope（如 `fix(puppeteer):`）。**提交必须签名**（ruleset 要求）。
3. 推送分支并开 PR（`git push -u origin <分支>` → `gh pr create`），正文按 [.github/PULL_REQUEST_TEMPLATE/](./.github/PULL_REQUEST_TEMPLATE/) 下对应领域的模板填写（清单与 CLI 用法见该目录 `config.yml`）。**禁止 `git push origin main` 与对 `main` 的强推。**
4. 等 CI 全绿、评审通过后由维护者经 merge queue 合并；合并后同步 `main` 并删除改动分支。AI / agent 产出的 PR 由维护者合并，工具不自行合并。

唯一的例外是发布链的版本提交：`release.yml` 的 `prepare` job 会把版本提交（含 `bun.lock`）直接推送到 `main`（见 [docs/process/release.md](./docs/process/release.md)），该行为是发布链既定设计，不构成直推 `main` 的许可。

- 面向发布的包有行为变化时，随提交写 changeset（`bun run changeset`），详见 [docs/process/release.md](./docs/process/release.md) 第 3 节。
- 命中 [.github/CODEOWNERS](./.github/CODEOWNERS) 敏感路径的 PR 需要对应 code owner 批准（`main` 的 ruleset 开了 "Require review from Code Owners"，且 PR 作者不能批准自己的 PR）。
