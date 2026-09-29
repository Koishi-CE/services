---
"@koishi-ce/plugin-puppeteer": minor
---

feat: 新增 `timeout` 配置项（等待浏览器启动的最长时间，毫秒，默认 `30000`），透传给 puppeteer-core 的 `launch()`。

此前该项在 `buildLaunchOptions()` 里没有映射，等于钉死 puppeteer 自己的默认值 30000——上游的 Config 展开 `LaunchOptions` 时可以传 `timeout`，本包显式化配置后把这个旋钮丢了。冷启动较慢的环境（CI、低配容器、无浏览器缓存的首跑）会在插件 `start()` 处直接吃到 `Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!`，且无法调整。

默认值保持 30000 不变（与 puppeteer / 上游一致），需要更宽预算时显式调大即可。同时导出 `defaultTimeout` 常量供调用方对齐默认口径。
