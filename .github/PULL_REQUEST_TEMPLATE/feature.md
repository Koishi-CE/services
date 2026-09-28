# SPDX-License-Identifier: MIT
# Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

# PR 说明（新特性）

- **本仓一切改动都走 PR，禁止直推 `main`**：PR 由维护者合并，AI / agent 产出的 PR 不自审自并。规矩见根 `AGENTS.md` 的 git 提交流程节与 `docs/guides/development.md` 第 2 节。
- 标题与正文一律简体中文，标题用提交信息风格（`feat(am-i-alt): ……`）。
- 空章节写「无」，不要删标题——便于对账。

## 1. 新增了什么

<!-- 能力 / 服务 / 配置项的用途，以及为什么放在本仓（服务型插件的定位见 docs/reference/architecture.md 第 1 节）。 -->

## 2. 接口与服务面

<!-- 对外可观测的接口变化：
     - 注入的服务名与类型（`ctx.<服务>` 的 `declare module` 增强）
     - 新增 / 变更的 Config 字段（含默认值与取值域）
     - 新增 / 变更的命令与选项
     破坏性变化必须显式写出，并在第 5 节给 major（1.x 前 → minor）。 -->

## 3. 实现要点

<!-- 关键设计取舍、与既有代码的分工、被否掉的替代方案。 -->

## 4. 用例与词典

- [ ] 新增用例：文件与用例名（覆盖正常路径与边界）
- [ ] 端到端路径（若涉及 puppeteer / canvas）在本机实跑情况
- [ ] 词典：新增文案是否七语种齐全、是否 import 并 `ctx.i18n.define`（`bun run check:locales` 通过）
- [ ] `koishi.locales` 声明是否需要同步

## 5. 验证

- [ ] `bun run check` 全绿（实跑输出摘要）
- [ ] `bun run build` 通过（涉及产物形态时核对 `lib/` 与 `lib/assets/`）
- [ ] 手改复现路径实测通过（写清怎么跑的）

## 6. changeset

<!-- 新功能 → minor；API 破坏 → major（1.x 前 → minor）。附条目文件名。 -->

- minor

## 7. 影响面与风险

<!-- 对下游插件的影响、是否需要他们改代码、回滚方式。 -->

## 8. 关联

<!-- 相关 issue / 上游对应实现；无则写「无」。 -->
