# SPDX-License-Identifier: MIT
# Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

# PR 说明（通用）

- **本仓一切改动都走 PR，禁止直推 `main`**：PR 由维护者合并，AI / agent 产出的 PR 不自审自并。规矩见根 `AGENTS.md` 的 git 提交流程节与 `docs/guides/development.md` 第 2 节。
- 本模板用于**跨领域 / 一次性**改动；域内改动请选对应领域的模板（修复 / 特性 / 文档 / 依赖与工具链）。
- 标题与正文一律简体中文，标题用提交信息风格（`chore: ……`）。
- 空章节写「无」，不要删标题——便于对账。

## 1. 改了什么

<!-- 一句话结论 + 分点列改动；涉及文档 / 配置 / 构建链时点名文件。 -->

## 2. 验证证据

<!-- 实跑结论，不写「应该没问题」：门禁与命令的实际输出摘要（附退出码）。 -->

- [ ] `bun run check` 全绿（八段构成见 `docs/guides/development.md` 第 4 节）
- [ ] `bun run build` 通过（改了源码 / 构建链时必跑）
- [ ] `bun run fallow` 无问题（动了依赖 / 导出面时必跑）
- [ ] 负例验证（改门禁 / 校验类逻辑时：故意注入违规确认会红，并附输出）

## 3. changeset

<!-- 面向发布的包有行为变化 → 随 PR 写 .changeset/ 条目；纯内部 / 文档 / 工具链改动 → 「无」。 -->

- 无

## 4. 影响面与风险

<!-- 兼容性、发布面、需要人工复核的点、回滚方式；无则写「无」。
     若需要维护者执行仓库设置改动（ruleset / secrets / variables / environments / npm 信任配置），在此列出确切命令或网页路径。 -->

## 5. 关联

<!-- 相关 issue / 决策记录 / 前置 PR；无则写「无」。 -->
