# SPDX-License-Identifier: MIT
# Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

# PR 说明（文档）

- **本仓一切改动都走 PR，禁止直推 `main`**：PR 由维护者合并，AI / agent 产出的 PR 不自审自并。规矩见根 `AGENTS.md` 的 git 提交流程节与 `docs/guides/development.md` 第 2 节。
- 标题与正文一律简体中文，标题用提交信息风格（`docs: ……`）。
- 空章节写「无」，不要删标题——便于对账。

## 1. 改了什么

<!-- 文件清单 + 每份改了什么（新建 / 重写 / 增补节）。文档分层与页面模板见 docs/README.md 的「文档组织约定」。 -->

## 2. 依据

<!-- 每处改动的依据：代码事实（文件与行为）、命令实跑输出、既有决策记录。不要写「按惯例」「应该」。 -->

## 3. 与现状的一致性

- [ ] 已核对文中数字 / 版本 / 命令与现状一致（不使用可能漂移的写死数据）
- [ ] 已删除或改写与现状矛盾的旧描述（若本次改动使某段描述失效）
- [ ] 与 `AGENTS.md` 不重复：AGENTS 放铁律，docs 放方法与理由

## 4. 验证

- [ ] `bun run check:docs-links` 通过（相对链接与锚点；覆盖 docs 全树、根部门面与 `.github/**`）
- [ ] `bun run check:pr-templates` 通过（改了 PR 模板时）
- [ ] `bun run check` 全绿（改了根级 md 时一并跑）

## 5. changeset

<!-- 纯文档改动 → 「无」。 -->

- 无

## 6. 影响面与风险

<!-- 文档改动一般无运行时影响；若改了发布流程 / 门禁口径的说明，需说明对协作流程的影响。 -->

## 7. 关联

<!-- 相关 issue / 决策记录（如 docs/decisions/）；无则写「无」。 -->
