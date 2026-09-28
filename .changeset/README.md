# Changesets

面向发布的包有**行为变化**时，**必须随改动一起**在本目录写 changeset 并提交，不要攒到发版前——攒必漏。纯内部 / 文档 / 工具链改动（无行为变化）不写。

## 写法

手写 `.changeset/<名字>.md`：

```md
---
"@koishi-ce/plugin-am-i-alt": patch
---

fix: 简体中文说明改动内容
```

或运行 `bun run changeset` 交互式创建。**包名一律写完整的 `@koishi-ce/plugin-*`**（不要写根包名或仓库名，那会让 changesets 找不到包）。

## bump 类型

- API 破坏 → major（1.x 之前 → minor）
- 新功能 → minor
- 修复 → patch
- 纯 chore（文档、CI、格式化等无行为变化）→ 不需要 changeset

## 发版

```bash
bun run release        # 本地备用链：changeset version → 按包构建 → changeset publish
```

正式发版走 CI 发布链（`.github/workflows/release.yml`，OIDC 可信发布 + `release` environment 审批），不手动 `npm publish`；流程与环境前置见 [../docs/process/release.md](../docs/process/release.md)。
