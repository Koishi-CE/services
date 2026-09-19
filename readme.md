# services

[![CI](https://github.com/Koishi-CE/services/actions/workflows/ci.yml/badge.svg?style=flat-square)](https://github.com/Koishi-CE/services/actions/workflows/ci.yml)

[Koishi-CE](https://github.com/Koishi-CE) 组织的服务型插件 monorepo：收录「向其他插件提供基础服务」的 Koishi 插件，统一构建、类型检查、测试与发版流程。

全部包面向 Koishi-CE 社区再分发版生态（`peerDependencies` 指向 `@koishi-ce/koishi`，产物 ESM-only）。

## 包列表

| 包 | 说明 |
| --- | --- |
| [@koishi-ce/plugin-am-i-alt](./packages/am-i-alt) | 我是小号吗？跨平台小号检测服务：按 Discord 账龄 / QQ 等级 / Telegram ID 分布做启发式判定，结合 binding 表给出跨平台综合结论，注入 `ctx.amIAlt` 服务供其他插件调用 |

## 开发

```bash
bun install          # 仓根执行一次
bun run check        # 全量门禁：biome check + 类型检查 + bun test
bun run build        # 根级：--filter 构建全部子包（产物 packages/*/lib/index.mjs）
bun test             # 全量测试
```

约定详见 `AGENTS.md`。

## 发版

走 Changesets：改动随提交在 `.changeset/` 写条目，CI（changesets action）自动开 version PR，合并后自动 build + publish。需在仓库 Secrets 配置 `NPM_TOKEN`。

## License

[MIT](./LICENSE)
