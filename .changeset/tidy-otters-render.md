---
"@koishi-ce/plugin-puppeteer": minor
---

feat: 收编上游 koishi-plugin-puppeteer 的 core 包，落地浏览器服务 `@koishi-ce/plugin-puppeteer`

重构移植自 koishijs/koishi-plugin-puppeteer 的 packages/core（基线：上游 master c4d8bfe，对应 npm 3.9.0）：一个插件实现 `puppeteer`（开页 / 渲染截图 / SVG）、`canvas`（2D 绘图经 CDP 转译页内执行，零原生依赖）与 `component:html` 三个服务。按服务仓规范重写：peer 指向 `@koishi-ce/koishi`、ESM-only 产物、Config 显式化、index.html 内联注入、生命周期收口（page 用完即关 / 未就绪防御 / stop 幂等）、svg 几何错位修正（rect 对角点与 fill 四至）、canvas 转译器类型化语句队列（as any 清零），bun:test 用例含真实浏览器端到端链路（CI 无浏览器自动跳过）。
