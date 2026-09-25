// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.
// 内联自 koishijs/koishi-plugin-puppeteer 的 packages/core/index.html，
// component:html 的文档组装逻辑移植自同仓 packages/core/src/index.ts
// （MIT © Shigma et al.），移植基线：上游 master c4d8bfe（2024-08-15，
// 对应 npm koishi-plugin-puppeteer 3.9.0）。

import { h } from "@koishi-ce/koishi";
/**
 * 页内引导脚本（原上游 index.html 仅含这两个工具函数，直接内联为模板字符串，
 * 经 data URL 注入，不落资源文件——从根上消灭 CJS `__dirname` 在 ESM 产物下的
 * 定位问题与 import.meta.url 层级风险）。
 *
 * 与上游的差异：base64 清洗正则为 `/\s/g`（上游文件里是 `/\\s/g`，
 * 在 JS 正则里匹配字面反斜杠加 s，属笔误；此处修正为匹配空白符）。
 */
import type { Page } from "puppeteer-core";
import { hyphenateKey, isRecord } from "./utils.ts";

export const BOOTSTRAP_HTML = `<html>
  <head>
    <script>
      window.base64ToUint8Array = function (base64) {
        const binary = atob(base64.replace(/\\s/g, ''))
        const buffer = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          buffer[i] = binary.charCodeAt(i)
        }
        return buffer.buffer
      }

      window.loadImage = function (id, base64) {
        return new Promise((resolve, reject) => {
          const image = document.createElement('img')
          image.id = id
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
          image.onerror = reject
          const blob = new Blob([base64ToUint8Array(base64)])
          image.src = URL.createObjectURL(blob)
          document.body.appendChild(image)
        })
      }
    </script>
  </head>
</html>`;

const BOOTSTRAP_URL = `data:text/html;charset=utf-8,${encodeURIComponent(BOOTSTRAP_HTML)}`;

/**
 * 将引导页载入指定页面（与上游 `page.goto(file://index.html)` 语义对齐：
 * 真实导航使脚本执行，window 工具函数随后在同上下文内可用）。
 */
export async function gotoBootstrapPage(page: Page): Promise<void> {
    await page.goto(BOOTSTRAP_URL);
}

/** style 对象转 CSS 文本：base 先铺、source 后覆盖，数组值以逗号连接 */
export function styleObjectToCss(source: unknown, base: unknown = {}): string {
    const entries = Object.entries({ ...asRecord(base), ...asRecord(source) });
    return entries
        .map(
            ([key, value]) =>
                `${hyphenateKey(key)}: ${Array.isArray(value) ? value.join(", ") : value}`,
        )
        .join("; ");
}

function asRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

/**
 * body 样式解析：对象形态时 `display: inline-block` 强制保留（截取紧贴内容的
 * boundingBox 所必需，上游行为一致）；字符串形态时作为追加样式。
 */
function resolveBodyStyle(style: unknown): string {
    if (isRecord(style)) {
        return styleObjectToCss({ display: "inline-block" }, style);
    }
    return ["display: inline-block", typeof style === "string" ? style : ""]
        .filter(Boolean)
        .join("; ");
}

/**
 * 组装 component:html 的内联文档：收集子树中的 head 元素、递归转换属性
 * （style 对象转 CSS 文本），返回完整 HTML 字符串。纯函数，可独立测试。
 */
export function renderInlineDocument(
    children: readonly h[],
    attrs: Record<string, unknown>,
): string {
    const head: h[] = [];
    const content = transformChildren(children, head);
    const lang = attrs["lang"];
    const langAttr = typeof lang === "string" && lang ? ` lang="${lang}"` : "";
    return `<html${langAttr}>
  <head>${head.join("")}</head>
  <body style="${resolveBodyStyle(attrs["style"])}">${content}</body>
</html>`;
}

function transformChildren(children: readonly h[], head: h[]): string {
    return children
        .map((child) => transformElement(child, head))
        .filter((value): value is h => value !== null)
        .join("");
}

function transformElement(element: h, head: h[]): h | null {
    if (element.type === "head") {
        head.push(...element.children);
        return null;
    }
    const nextAttrs: Record<string, unknown> = { ...element.attrs };
    if (nextAttrs["style"] && typeof nextAttrs["style"] === "object") {
        nextAttrs["style"] = styleObjectToCss(nextAttrs["style"]);
    }
    return h(
        element.type,
        nextAttrs,
        element.children
            .map((child) => transformElement(child, head))
            .filter((value): value is h => value !== null),
    );
}
