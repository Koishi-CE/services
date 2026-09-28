---
"@koishi-ce/plugin-am-i-alt": minor
---

feat(i18n): 补全七语种文案注册（zh-TW / ja-JP / fr-FR / de-DE / ru-RU）

`locales/` 下一直存在七语种词典且键路径完全对齐（各 26 叶键、无缺键多键、
无假翻译），但 `apply()` 里只 `ctx.i18n.define` 了 zh-CN 与 en-US，另外五个
语种从未被 import —— 于是既不参与运行时注册，也不会被 tsdown 的 yml copy
loader 拷进 `lib/assets`（发布产物里只有两个 yml），等于五个语种文件是死文件。

本次补齐注册，七语种真正生效；`koishi.locales` 声明从 `["zh","en"]` 同步为
七项。新增语种不改动任何既有键，zh-CN / en-US 文案逐字未变，故对现有用户
是纯增量。
