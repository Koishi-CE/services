# SPDX-License-Identifier: MIT
# Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

# PR 说明（依赖与工具链）

- **本仓一切改动都走 PR，禁止直推 `main`**：PR 由维护者合并，AI / agent 产出的 PR 不自审自并。规矩见根 `AGENTS.md` 的 git 提交流程节与 `docs/guides/development.md` 第 2 节。
- 标题与正文一律简体中文，标题用提交信息风格（`chore(deps): ……` / `build(ci): ……`）。
- 本模板适用于：依赖升版 / 替换 / 移除、CI 工作流与门禁脚本改动、仓库级配置（`biome.json` / `tsconfig*.json` / `.fallowrc*` / `.github/**`）。
- 空章节写「无」，不要删标题——便于对账。

## 1. 改了什么

<!-- 依赖：包名、旧版本 → 新版本、bump 类型；工具链：改了哪个文件、哪个 job / 门禁段。
     依赖变更请附 `bun.lock` 的 diff 规模（行数），确认未出现整份重排。 -->

## 2. 冻结线复核（依赖类必填）

<!-- 本仓有两道冻结线，动依赖前必须逐条确认：
     - cordis / minato / @satorijs 生态冻结在 3.x 线，勿跳代；
     - @koishi-ce/* 是本仓自发布包 / peer 契约面，不是普通升级对象。
     命中的依赖必须写清为何本次可动（或写明未动）。 -->

- [ ] 未触及 cordis / minato / @satorijs 3.x 冻结线
- [ ] 未改动 `@koishi-ce/*` 的 peer 契约形态（`^1.0.0`）
- [ ] 若触及，已在上方说明理由与影响面

## 3. 对账与等价性证据

- [ ] `bun install --frozen-lockfile` 通过（锁文件与清单一致）
- [ ] `bun run check` 全绿（实跑输出摘要）
- [ ] `bun run fallow` 无问题（依赖面 / 导出面改动时）
- [ ] CI 改动：本地等价执行的命令与实际输出（不能只贴 YAML）
- [ ] 门禁脚本改动：附正例与**负例**（故意注入违规确认会红）的实跑结果

## 4. 影响面与风险

<!-- 依赖升版的下游影响；CI / 门禁改动的口径变化（本地与 CI 是否仍逐字一致）；回滚方式。
     CI 工作流改动若涉及 ruleset 的必需状态检查名，必须显式列出需要维护者执行的仓库设置改动。 -->

## 5. changeset

<!-- 依赖升版一般不写；若升版改变了包的对外行为或依赖面声明（如新增运行时 dependency），需要 patch。 -->

- 无

## 6. 关联

<!-- 上游 release notes / 安全公告 / Dependabot PR 编号；无则写「无」。 -->
