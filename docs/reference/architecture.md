# 仓库架构（ARCHITECTURE）

> `services`（Koishi-CE 服务型插件 monorepo）的**仓库结构文档**：包清单、依赖纪律、构建 / 类型检查 / 测试体系、许可证与来源。以实际代码为准，文档滞后时听代码的。
> **先读**：开发环境与命令见 [../guides/development.md](../guides/development.md)；发布见 [../process/release.md](../process/release.md)；改造背景见 [../decisions/services-modernization.md](../decisions/services-modernization.md)。
> **本文结构**：1 定位 · 2 目录与包清单 · 3 依赖纪律 · 4 构建体系 · 5 类型检查体系 · 6 测试体系 · 7 许可证与来源。

## 1. 定位

- **是什么**：[Koishi](https://koishi.chat) 聊天机器人框架的服务型插件集合。收录**向其他插件提供基础服务**的插件——首个成员 `@koishi-ce/plugin-am-i-alt`（小号检测），另有 `cron`（计划任务）与 `puppeteer`（浏览器 / canvas 渲染）。
- **与旗舰仓的分工**：[Koishi-CE/koishi](https://github.com/Koishi-CE/koishi) 承载框架本体与通用插件（`cron` 已于 2026-09 从该仓迁出，由本仓 `packages/cron` 继续维护）；本仓只放**服务型**插件，规模刻意保持小（三个包），工程规矩与旗舰仓对齐。
- **发布身份**：GitHub 组织 [Koishi-CE](https://github.com/Koishi-CE)，npm 作用域 `@koishi-ce`，包名一律 `@koishi-ce/plugin-*`。与 Koishijs 组织无隶属关系。
- **运行时取向**：Bun-first。三者均为 ESM-only 产物，`peerDependencies` 指向 `@koishi-ce/koishi`。

## 2. 目录与包清单

三个 workspace 包（`packages/*`），全部 `"type": "module"`：

```
services/（Bun workspaces：packages/*）
├── packages/am-i-alt/   小号检测服务（ctx.amIAlt），带七语种词典
├── packages/cron/       计划任务服务（ctx.cron），自 Koishi-CE/koishi 迁入
├── packages/puppeteer/  浏览器服务（ctx.puppeteer / ctx.canvas / component:html）
├── tooling/             工程工具集（门禁检查脚本，见 tooling/README.md）
├── types/yml.d.ts       .yml 导入的类型面（根 tsconfig 的 files 注入）
└── docs/                本手册集
```

| 目录 | 包名 | 注入的服务 | 来源 | 词典 |
| --- | --- | --- | --- | --- |
| `packages/am-i-alt` | `@koishi-ce/plugin-am-i-alt` | `ctx.amIAlt` | 收编自社区插件 `koishi-plugin-am-i-alt`（Oppenheymu，MIT），按本仓规范重写 | 七语种（`locales/*.yml`） |
| `packages/cron` | `@koishi-ce/plugin-cron` | `ctx.cron` | 自 [Koishi-CE/koishi](https://github.com/Koishi-CE/koishi) 的 `plugins/common/cron` 原样迁入（v1.1.0 基线） | 无 |
| `packages/puppeteer` | `@koishi-ce/plugin-puppeteer` | `ctx.puppeteer` · `ctx.canvas` · `component:html` | 重构移植自 [koishijs/koishi-plugin-puppeteer](https://github.com/koishijs/koishi-plugin-puppeteer) 的 `packages/core`（上游 master `c4d8bfe`，对应 npm 3.9.0） | 无 |

包版本不在本文罗列（由 changesets 递进，以各包 `package.json` 与发布面实况为准）。

**测试文件的两种放置**：`am-i-alt` 与 `cron` 贴被测模块（`src/*.test.ts`）；`puppeteer` 因模块多而收进包级 `src/__tests__/`。新增测试随所在包的既有约定。

## 3. 依赖纪律

### 两个依赖世界

1. **cordis 生态运行时（冻结线）**：`cordis` / `minato` / `@satorijs/*` 冻结在 3.x 线，勿跳代——本仓经 `@koishi-ce/koishi` 间接依赖这一线，跳代会引入双 DI 容器。
2. **工具链（现代线）**：TypeScript 7（`@typescript/native` 的 `npm:` alias）、tsdown、biome 2.5、Bun（包管理器 / 测试运行器 / CI 运行时）。

### 硬性规则

- **包名纪律**：依赖声明与源码导入一律 `@koishi-ce/*`，不得写回上游名（`koishi` 裸名 / `@koishijs/*`）。本仓**没有豁免项**。
- **跨包依赖写 semver range，禁写 `workspace:*`**：changeset publish 不改写 workspace 协议，原样上 npm 会炸下游（Koishi-CE 主仓 2026-08-31 事故同源）；bun 按 range 一样会链接 workspace 本地包，本地开发不受影响。
- **peer 契约**：三包的 `peerDependencies` 逐字为 `@koishi-ce/koishi ^1.0.0`；三包**互不依赖**（各自独立服务，无调用关系），故 `dependencies` / `peerDependencies` 里不应出现其他 `@koishi-ce/*` 包（测试用包放 `devDependencies`）。
- **产物 ESM-only**：`type: module`、`main: lib/index.mjs`、`types: lib/index.d.ts`、`exports` 以 `default` 条件兜底；不得出现 `require` 条件或 CJS 形态的 `main`。
- **类型导入一律 `import type`**（`verbatimModuleSyntax` 强制）；相对导入带 `.ts` 后缀。

以上包名纪律、元数据形态、ESM-only 形态、peer 契约与依赖方向由 `check:packages` 门禁强制（`tooling/checks/packages.ts`，已并入 `bun run check`），不靠人工记忆。

## 4. 构建体系

### 按包 tsdown（无根构建）

每个包自带 `packages/<包>/tsdown.config.ts`，根 `bun run build` 经 `--filter './packages/*'` 逐包调用：

```bash
bun run build    # = bun run --filter './packages/*' build，产出各包 lib/
```

- **单入口 ESM-only**：`entry: ["src/index.ts"]`、`format: "esm"`、`outExtensions` 把产物命名为 `.mjs` + `.d.ts`，`platform: "node"`。
- **依赖全部外部化**：`deps.bundle: false`——`@koishi-ce/*` 为 peer 单实例，`puppeteer-core` / `puppeteer-finder` 为运行时 dependency，都不打进产物。
- **d.ts 打包的 `neverBundle`**：koishi 生态的 d.ts 含 namespace 成员 re-export（dts 打包无法解析），`puppeteer-core` 类型面庞大且自带 exports 边界，故保持在外部引用。
- **词典随产物拷贝**：`loader: { ".yml": "copy" }` 把**被 import 的** yml 以 `<语种>-<内容哈希>.yml` 写进 `packages/<包>/lib/assets/`。这条是「语种是否真的生效」的权威判据：没被 import 的 yml 不会出现在产物里（本仓 `check:locales` 的「存在但未 import」对账正是为此）。

产物布局：

| 产物 | 位置 | 说明 |
| --- | --- | --- |
| 入口 ESM | `packages/<包>/lib/index.mjs` | `exports` 的 `import` / `default` 条件指向它 |
| 类型声明 | `packages/<包>/lib/index.d.ts` | `types` 字段与 `exports.types` 条件指向它（另出 `.map`） |
| 词典拷贝 | `packages/am-i-alt/lib/assets/<语种>-<哈希>.yml` | 仅 `am-i-alt`；数量应等于被 import 的语种数 |
| source map | `packages/<包>/lib/*.map` | `.mjs.map` 与 `.d.ts.map` |

`lib/` 与 `dist/` 均被 `.gitignore` 忽略，不入库；发布时现构建。

## 5. 类型检查体系

**一条命令、一个程序**：`bun run typecheck` = `tsc -p tsconfig.json`（TS7 原生编译器，由 `@typescript/native` 的 `npm:typescript@7.0.2` alias 提供）。

- 根 `tsconfig.json` 的 `include: ["packages/*/src"]` 把三个包的源码一次查完；`files: ["types/yml.d.ts"]` 注入 `.yml` 导入的类型面。
- 根 `tsconfig.json` 的 `paths` 按**具体文件**登记各包入口（`@koishi-ce/plugin-*` → `packages/*/src/index.ts`），编辑器可跳转子包源码。新增包时同步补一行。
- `tsconfig.base.json` 是严格全家桶：`strict` + `noUncheckedIndexedAccess` + `noPropertyAccessFromIndexSignature` + `exactOptionalPropertyTypes` + `noUnusedLocals/Parameters` + `noImplicitOverride` + `verbatimModuleSyntax` + `erasableSyntaxOnly`（禁 enum 与构造器参数属性）等。
- **不需要先 build**：paths 指向 `src`，干净检出（无 `lib/`）下 typecheck 与 test 都能过。一旦有 paths 改指 `lib/*.d.ts`，或测试去读 `lib` 真实产物，就**必须**把 build 提到它们之前（旗舰仓即因此踩过 TS2307）。

## 6. 测试体系

- 运行器与断言：`bun:test` 的 `describe` / `it` / `expect`（不引入 chai）；测试依赖注入用 `@koishi-ce/plugin-mock` + `@koishi-ce/plugin-database-memory`。
- 命令：`bun test`（本地全量）；CI 另跑一遍 `bun test --isolate --coverage --coverage-reporter=lcov --coverage-dir=coverage` 供 Codecov。全仓 `mock.module` 当前用量为 0，`--isolate` 属预防性口径统一。
- **端到端组**：`packages/puppeteer/src/__tests__/index.test.ts` 的浏览器用例由 `describe.skipIf(!executable)` 包裹——本机探测到浏览器才真跑（CI runner 有 `/usr/bin/chromium`，故 CI 上真跑）。launch args 追加 `--no-sandbox`（GitHub runner 的 AppArmor 禁非特权 userns，无沙箱的 Chrome 直接 FATAL）。该组是 `bun test` 耗时的绝对大头（冷启动 Chrome 占绝大部分）。
- 覆盖率基线（2026-09-28 实跑，`--coverage-reporter=text`）：`All files` 行覆盖 92.26% / 函数 96.04%；最低两项是 `packages/puppeteer/src/utils.ts` 与 `packages/puppeteer/src/index.ts`。ruleset 的 `code_coverage` 规则按 90% / 允许下降 1 个百分点设置。
- 文件与用例数不在本文写死，以 `bun test` 实跑输出为准。

## 7. 许可证与来源

全仓 **MIT**（根 `LICENSE`），无分区。各包来源与版权归属：

| 包 | 来源 | 版权行形态 |
| --- | --- | --- |
| `am-i-alt` | 收编自社区插件 `koishi-plugin-am-i-alt`（Oppenheymu，MIT），按本仓规范重写 | `Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors` |
| `cron` | 自 Koishi-CE/koishi 迁入（上游源自 koishijs/koishi） | 双行：`Copyright (c) 2019-present Shigma and Koishijs contributors` + `Copyright (c) 2026-present Koishi-CE contributors` |
| `puppeteer` | 重构移植自 koishijs/koishi-plugin-puppeteer 的 `packages/core`（MIT © Shigma et al.） | `Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors` |

因此 `check:spdx` 只校验 `SPDX-License-Identifier` 标识符、**不**校验版权行——强行统一会抹掉上游署名。新增文件时照所在包的既有形态写头。
