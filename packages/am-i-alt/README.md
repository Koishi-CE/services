# @koishi-ce/plugin-am-i-alt

简体中文 | [English](#english)

## 简介

为 Koishi 注入 `ctx.amIAlt` 小号检测服务：按各平台可得的公开信息做启发式判定，支持 `discord`、`onebot`（QQ）、`telegram`，并结合 binding 表对同一用户名下的多平台账号给出综合结论。

- **Discord**：账号注册时间早于阈值天数视为正常，过新判为疑似小号
- **OneBot (QQ)**：QQ 等级低于阈值判为疑似小号（兼容 NapCat 等实现的字段命名差异）
- **Telegram**：基于 userId 分布的粗略年龄估算（低置信度）

检测失败时的回落策略可配（unknown / pass / block）。

> 收编自社区插件 [koishi-plugin-am-i-alt](https://www.npmjs.com/package/koishi-plugin-am-i-alt)（Oppenheymu，MIT），本包面向 Koishi-CE 生态（peer `@koishi-ce/koishi`，ESM-only 产物）。

## 服务 API

启用后注入 `ctx.amIAlt`，供其他插件调用：

### ctx.amIAlt.check(session, overrides?, options?)

执行检测，返回三态结果（`decision: "alt" | "normal" | "unknown"`），`reason` 为判定原因编码，命中规则时 `details` 携带判定依据（账号年龄 / QQ 等级 / 阈值等）。

### ctx.amIAlt.isAlt(session, overrides?, options?)

简易接口，返回布尔；unknown 结果映射为 `null`。

`session` 接受完整 koishi Session，也接受 `{ platform, userId }` 最小形态（跨平台检测即以合成会话调用）；`overrides` 可按次覆盖任意配置项。

## 命令

- `我是小号吗`（别名 `小号检查`）：检测当前账号；若名下绑定了多平台账号，输出跨平台综合结论
- `他是小号吗 [target]`：检测目标账号，支持 @某人 或直接传平台 userId

跨平台综合规则：任一绑定账号非小号即整体按非小号；全部疑似小号才判小号；存在未知则结果未知。

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `enableDiscordCheck` | `true` | 是否启用 Discord 检测 |
| `enableOneBotCheck` | `true` | 是否启用 OneBot 检测 |
| `enableTelegramCheck` | `true` | 是否启用 Telegram 检测 |
| `minDiscordAccountAgeDays` | `30` | Discord 账号年龄低于该天数判为疑似小号 |
| `minQqLevel` | `16` | QQ 等级低于该值判为疑似小号 |
| `minTelegramEstimatedAccountAgeDays` | `30` | Telegram 估算年龄低于该天数判为疑似小号 |
| `onError` | `unknown` | 检测失败时策略：返回未知 / 按非小号 / 按小号 |

## 说明

- Telegram 检测是启发式规则，不建议单独作为封禁依据；风控场景建议作为前置筛选信号之一，叠加行为数据或人工复核。

## English

Injects a `ctx.amIAlt` service for alt-account detection with per-platform heuristics (Discord account age, QQ level via OneBot, Telegram ID-segment estimation), plus a cross-platform verdict aggregated over the `binding` table. Commands: `我是小号吗` (self check) and `他是小号吗 <target>` (target check). See the Chinese section above for the full API and configuration reference; dictionaries cover seven locales.
