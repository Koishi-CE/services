
<div align="center">

<h1 id="services">
  <a href="https://github.com/Koishi-CE" target="_blank">
    <img src=".github/assets/koishi-ce-wordmark.svg" alt="Koishi-CE" width="514">
    <br>
    <img src=".github/assets/services-wordmark.svg" alt="Services" width="257">
  </a>
</h1>

[![CI](https://img.shields.io/github/actions/workflow/status/Koishi-CE/services/ci.yml?style=flat-square&label=CI)](https://github.com/Koishi-CE/services/actions/workflows/ci.yml)
&emsp;
[![codecov](https://img.shields.io/codecov/c/gh/Koishi-CE/services?style=flat-square&logo=codecov)](https://codecov.io/gh/Koishi-CE/services)
&emsp;
[![Bun](https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square&logo=bun)](https://bun.sh)
&emsp;
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

<p>
  <a href="#列表">列表</a> •
  <a href="#开发">开发</a> •
  <a href="#许可与来源">许可与来源</a> •
  <a href="#english">English</a>
</p>

</div>

> [!NOTE]\
> 　向其他 Koishi 插件提供基础服务的插件合集，面向 [Koishi-CE](https://github.com/Koishi-CE/koishi)。定位与工程规矩见 [docs/reference/architecture.md](./docs/reference/architecture.md)。

---

## 列表

| 包 | 说明 |
| --- | --- |
| [am-i-alt](./packages/am-i-alt) | 我是小号吗？跨平台小号检测服务：按 Discord 账龄 / QQ 等级 / Telegram ID 分布做启发式判定，结合 binding 表给出跨平台综合结论，注入 `ctx.amIAlt` 服务 |
| [cron](./packages/cron) | 计划任务服务：`ctx.cron(input, callback)` 按 cron 表达式注册周期任务，基于 Bun.cron 原生调度，免疫上游 `setTimeout` 32 位溢出风暴缺陷，支持 tz 时区配置 |
| [puppeteer](./packages/puppeteer) | 基于 puppeteer-core 的浏览器服务：`ctx.puppeteer`（开页 / 渲染截图 / SVG）、`ctx.canvas`（2D 绘图经 CDP 转译页内执行，零原生依赖）与 `component:html` 组件 |

三个包互相独立（无相互依赖），均 ESM-only，`peerDependencies` 指向 `@koishi-ce/koishi ^1.0.0`。

---

## 开发

```bash
bun install          # 仓根执行一次
bun run check        # 全量门禁：lint → typecheck → test → 自研门禁五连（提交前必跑）
bun run build        # 按包构建（产物 packages/*/lib/index.mjs + .d.ts）
bun test             # 全量测试
```

- 开发手册（环境 / 门禁八段构成 / 编码约定 / 测试写法 / 已知坑）：[docs/guides/development.md](./docs/guides/development.md)
- 仓库结构与依赖纪律：[docs/reference/architecture.md](./docs/reference/architecture.md)
- 发布流程（changesets + CI 发布链）：[docs/process/release.md](./docs/process/release.md)
- 贡献指南：[.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md)；仓库常驻约定：[AGENTS.md](./AGENTS.md)

**本仓一切改动都走 PR，禁止直接推送 `main`**；合并由维护者执行。

---

## 许可与来源

全部包 **MIT**（根 [LICENSE](./LICENSE)），无许可证分区。各包来源：

| 包 | 来源 | 版权 |
| --- | --- | --- |
| `@koishi-ce/plugin-am-i-alt` | 收编自社区插件 `koishi-plugin-am-i-alt`（Oppenheymu），按本仓规范重写 | © 2026-present Oppenheymu and Koishi-CE contributors |
| `@koishi-ce/plugin-cron` | 自 [Koishi-CE/koishi](https://github.com/Koishi-CE/koishi) 迁入（上游源自 [koishijs/koishi](https://github.com/koishijs/koishi)） | © 2019-present Shigma and Koishijs contributors；© 2026-present Koishi-CE contributors |
| `@koishi-ce/plugin-puppeteer` | 重构移植自 [koishijs/koishi-plugin-puppeteer](https://github.com/koishijs/koishi-plugin-puppeteer) 的 `packages/core` | © Shigma et al.；© 2026-present Oppenheymu and Koishi-CE contributors |

每个手写源文件带 SPDX 标识符头（由 `check:spdx` 强制）；详细来源与移植基线见各包 README 与 [docs/reference/architecture.md](./docs/reference/architecture.md) 第 7 节。

---

## English

Services is the **service-plugin** monorepo of the [Koishi-CE](https://github.com/Koishi-CE) organization: it collects Koishi plugins that provide foundation services to other plugins — `ctx.amIAlt`, `ctx.cron`, `ctx.puppeteer`, `ctx.canvas` and friends. All packages are ESM-only, Bun-first, and published under the `@koishi-ce` scope with `peerDependencies` pointing at `@koishi-ce/koishi`.

Every change goes through a pull request; `main` is protected by repository rulesets (signed commits, linear history, merge queue, required status checks). Start with [docs/guides/development.md](./docs/guides/development.md) for the toolchain and gate layout; [docs/reference/architecture.md](./docs/reference/architecture.md) describes the package layout and dependency discipline.

*Not affiliated with the official Koishijs organization. Koishi-CE packages are community redistributions; see the [Koishi-CE project](https://github.com/Koishi-CE/koishi) for details.*
