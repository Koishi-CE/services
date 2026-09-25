
<div align="center">

<h1 id="services">
  <a href="https://github.com/Koishi-CE" target="_blank">
    <img src=".github/assets/koishi-ce-wordmark.svg" alt="Koishi-CE" width="514">
  </a>
</h1>

<img src=".github/assets/services-wordmark.svg" alt="Services" width="300">

**Koishi-CE 生态的服务型插件 monorepo**

[![CI](https://img.shields.io/github/actions/workflow/status/Koishi-CE/services/ci.yml?style=flat-square&label=CI)](https://github.com/Koishi-CE/services/actions/workflows/ci.yml)
&emsp;
[![Bun](https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square&logo=bun)](https://bun.sh)
&emsp;
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

<p>
  <a href="#包列表">包列表</a> •
  <a href="#开发">开发</a> •
  <a href="#发版">发版</a> •
  <a href="#english">English</a>
</p>

</div>

> [!NOTE]
> 全部包面向 [Koishi-CE](https://github.com/Koishi-CE/koishi) 社区再分发版生态：`peerDependencies` 一律指向 `@koishi-ce/koishi ^1.0.0`，产物 ESM-only，跨包依赖写 semver range 而非 `workspace:*`。

---

## 特性

* **服务注入模式**\
　每个包向其他插件提供开箱即用的 `ctx.*` 服务（`ctx.amIAlt` / `ctx.puppeteer` / `ctx.canvas`），供生态内组合调用
* **统一工程门禁**\
　一条 `bun run check` 串起 biome 检查、tsc 类型检查与 bun test，与 CI 同链把关，全仓严格类型约束
* **构建与发布链**\
　tsdown 只出 ESM 产物，Changesets 管版本，发包统一走宿主实例 koishi-scripts 发布链

---

## 包列表

| 包 | 说明 |
| --- | --- |
| [@koishi-ce/plugin-am-i-alt](./packages/am-i-alt) | 我是小号吗？跨平台小号检测服务：按 Discord 账龄 / QQ 等级 / Telegram ID 分布做启发式判定，结合 binding 表给出跨平台综合结论，注入 `ctx.amIAlt` 服务 |
| [@koishi-ce/plugin-puppeteer](./packages/puppeteer) | 基于 puppeteer-core 的浏览器服务：`ctx.puppeteer`（开页 / 渲染截图 / SVG）、`ctx.canvas`（2D 绘图经 CDP 转译页内执行，零原生依赖）与 `component:html` 组件 |

---

## 开发

```bash
bun install          # 仓根执行一次
bun run check        # 全量门禁：biome check + 类型检查 + bun test
bun run build        # 根级：--filter 构建全部子包（产物 packages/*/lib/index.mjs）
bun test             # 全量测试
```

开发约定详见 [AGENTS.md](./AGENTS.md)。

---

## 发版

走 [Changesets](https://github.com/changesets/changesets)：用户可见改动随提交在 `.changeset/` 写条目。发包统一走宿主实例自带的 koishi-scripts 发布链，在宿主根执行：

```bash
bun run release:dryrun   # 预演：version → build → publish --dry-run
bun run release          # 正式：koishi-scripts version → build → publish
```

仓内 `bun run version` / `bun run release`（changeset version → build → changeset publish）为独立检出时的备用链。

---

## License

[MIT](./LICENSE)

---

## English

Services is the service-plugin monorepo of the [Koishi-CE](https://github.com/Koishi-CE) organization, collecting Koishi plugins that provide foundation services to other plugins — `ctx.amIAlt`, `ctx.puppeteer`, `ctx.canvas` and friends. All packages are ESM-only, Bun-first, and published under the `@koishi-ce` scope with `peerDependencies` pointing at `@koishi-ce/koishi`.

*Not affiliated with the official Koishijs organization. Koishi-CE packages are community redistributions; see the [Koishi-CE project](https://github.com/Koishi-CE/koishi) for details.*
