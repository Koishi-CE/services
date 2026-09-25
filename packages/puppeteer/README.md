# @koishi-ce/plugin-puppeteer

简体中文 | [English](#english)

## 简介

基于 puppeteer-core 的浏览器服务插件，一个插件实现三个服务，供其他插件调用：

- **`ctx.puppeteer`**：开新页（`page()`）、HTML 渲染截图（`render()`）、SVG 构建渲染（`svg()`）
- **`ctx.canvas`**：2D 绘图服务——绘图调用经 CDP 转译在浏览器页内执行，**零原生依赖**（无需安装 node-canvas / skia-canvas）
- **`component:html`**：satori html 组件（元素树 → 页面渲染 → body 截图 → 图片消息）

> 重构移植自上游 [koishijs/koishi-plugin-puppeteer](https://github.com/koishijs/koishi-plugin-puppeteer) 的 `packages/core`（MIT © Shigma et al.）。
> **移植基线**：上游 master 提交 `c4d8bfe`（2024-08-15），对应 npm `koishi-plugin-puppeteer` 3.9.0（上游发包未回写 master，npm 3.9.0 产物与该提交源码语义一致，已比对核实）。
> 本包面向 Koishi-CE 生态（peer `@koishi-ce/koishi`，ESM-only 产物），内部按服务仓规范重写。

## 服务 API

### ctx.puppeteer.page()

新开一个浏览器页。服务未就绪（start 前调用 / stop 后 / 连接断开）时抛出可读错误。

### ctx.puppeteer.render(content, callback?)

渲染 HTML 并截图，返回图片消息字符串。默认对 `body` 元素截取；`callback` 可自定义（`page` 操作 + `next(handle?)` 产出结果）。page 用完即关。

### ctx.puppeteer.svg(options?)

返回 SVG 构建器（`SVG` / `Tag`，链式 API：`rect` / `circle` / `line` / `text` / `g` / `fill` / `attr` / `data`），`render(ctx)` 渲染为图片消息。

### ctx.canvas.createCanvas(width, height) / loadImage(source)

创建页内画布 / 加载图像（支持远程 URL、Buffer、ArrayBuffer 等）。`canvas.getContext("2d")` 后的绘图调用会被转译为语句在页内执行，`toDataURL()` / `toBuffer()` 时一次性执行并取回位图。

**能力边界**：只支持「void 方法 + 可 JSON 序列化参数」，不支持 `createLinearGradient` / `measureText` / `getImageData` 等返回对象或需回读像素的 API；渐变/图案类样式属性收窄为 CSS 字符串（约定面见 `CanvasRenderingContext2D` 类型）。

### ctx.canvas.render(width, height, callback)

模板方法：createCanvas → 绘图回调 → toBuffer → 图片消息，finally 释放画布。

### component:html

```ts
h("html", { lang: "zh-CN", selector: "#target", timeout: 5000 }, [
    h("head", {}, [...]),
    h("div", { style: { color: "red" } }, "内容"),
])
```

元素树组装为文档在页内渲染（`head` 子元素会被收集进 `<head>`；`style` 对象自动转 CSS），`waitForNetworkIdle` 后按 `selector`（默认 `body`）截取。设置 `src` 属性时改为直接访问该 URL 并整页截取。

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `executablePath` | 自动探测 | 浏览器可执行文件路径；缺省时经 puppeteer-finder 自动寻找 Chrome / Edge |
| `headless` | `true` | 是否开启无头模式 |
| `args` | `[]`（root 下 `["--no-sandbox"]`） | 额外的浏览器启动参数 |
| `defaultViewport` | `1280×768, deviceScaleFactor: 2` | 默认视图尺寸与缩放 |
| `ignoreHTTPSErrors` | `false` | 导航时忽略 HTTPS 错误 |

宿主装配了 `@koishi-ce/plugin-proxy-agent` 时，代理地址会自动透传为 `--proxy-server` 启动参数。

## 与上游的行为差异（有意修正）

- **几何修正**：`rect(x1, y1, x2, y2)` 以对角点落 `width = x2 - x1`、`height = y2 - y1`（上游 x/y 互串）；`SVG.fill()` 按 viewBox 四至 `(left, top)-(right, bottom)` 画背景矩形（上游传参随之一同错位）。
- **死代码清理**：移除上游 `Tag.parent` 死属性与 `SVGOptions.magnif` 死选项。
- **资源内联**：上游 `index.html`（两个页内工具函数）内联为模板字符串经 data URL 注入，不落资源文件；顺带修正其 base64 清洗正则（上游 `/\\s/g` 匹配字面反斜杠，应为 `/\s/g`）。
- **不再需要 screenshot 类型增强**：puppeteer-core 22.15 类型已自带 base64 / binary 截图重载，上游的 `declare module 'puppeteer-core/lib/types'` 补丁移除。
- **loadImage 远程来源**：经注入的 `http` 服务以 `responseType: "arraybuffer"` 拉取（上游走 koishi 的 `http.file`，支持本地路径；本包依赖的 http 服务无本地文件语义）。
- **生命周期收口**：page 用完即关（finally）；start 前调用 / stop 后调用一律显式报错；stop 先清状态再关闭，幂等可重入。
- **Config 显式化**：显式接口 + 显式 Schema，launch 参数逐字段映射（上游以 `LaunchOptions` 展开加 `as` 强转表达）。

## English

A browser service plugin based on puppeteer-core, implementing three services in one plugin: `ctx.puppeteer` (page / render / svg), `ctx.canvas` (2D drawing proxied into the browser page via CDP, zero native dependencies), and the `component:html` satori component. Ported from upstream koishijs/koishi-plugin-puppeteer `packages/core` (MIT), baseline: upstream master commit `c4d8bfe` (2024-08-15, matching npm 3.9.0). See the Chinese section above for the full API, configuration reference, and the list of intentional behavior fixes applied during the rewrite.
