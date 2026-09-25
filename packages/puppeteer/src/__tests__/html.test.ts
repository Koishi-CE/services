// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

import { describe, expect, it } from "bun:test";
import { h } from "@koishi-ce/koishi";
import { BOOTSTRAP_HTML, renderInlineDocument, styleObjectToCss } from "../html.ts";

describe("页内引导脚本", () => {
    it("包含两个工具函数，且 base64 清洗正则修正为匹配空白符", () => {
        expect(BOOTSTRAP_HTML).toContain("window.base64ToUint8Array");
        expect(BOOTSTRAP_HTML).toContain("window.loadImage");
        // 模板字符串里的 \\s 在产出文本中为 /\s/g（上游文件里是 /\\s/g，匹配字面反斜杠的笔误）
        expect(BOOTSTRAP_HTML).toContain("atob(base64.replace(/\\s/g, ''))");
    });
});

describe("style 对象转 CSS", () => {
    it("camelCase 键转 kebab-case，数组值以逗号连接", () => {
        expect(styleObjectToCss({ backgroundColor: "red", margin: [1, 2] })).toBe(
            "background-color: red; margin: 1, 2",
        );
    });

    it("base 先铺、source 后覆盖", () => {
        expect(styleObjectToCss({ color: "blue" }, { color: "red", display: "block" })).toBe(
            "color: blue; display: block",
        );
    });

    it("非对象形态回落为空", () => {
        expect(styleObjectToCss(null)).toBe("");
        expect(styleObjectToCss({ color: "red" }, null)).toBe("color: red");
    });
});

describe("component:html 文档组装", () => {
    it("组装 html 文档，body 默认强制 display: inline-block", () => {
        const html = renderInlineDocument([h("div", {}, [])], {});
        expect(html).toContain("<html>");
        expect(html).toContain('<body style="display: inline-block">');
    });

    it("style 为对象时与 display 合并（display: inline-block 强制保留）", () => {
        const html = renderInlineDocument([h("div", {}, [])], {
            style: { color: "red", display: "none" },
        });
        expect(html).toContain('style="color: red; display: inline-block"');
    });

    it("style 为字符串时追加在 display 之后", () => {
        const html = renderInlineDocument([h("div", {}, [])], { style: "margin: 4px" });
        expect(html).toContain('style="display: inline-block; margin: 4px"');
    });

    it("lang 属性透传到 html 标签", () => {
        const html = renderInlineDocument([h("div", {}, [])], { lang: "zh-CN" });
        expect(html).toContain('<html lang="zh-CN">');
    });

    it("子树中的 head 元素被收集进 head，不再出现在 body", () => {
        const html = renderInlineDocument(
            [h("head", {}, [h("meta", { charset: "utf-8" })]), h("div", {}, [h("span", {}, [])])],
            {},
        );
        expect(html).toContain('<head><meta charset="utf-8"/></head>');
        expect(html).toContain('<body style="display: inline-block"><div><span/></div></body>');
    });

    it("嵌套元素的 style 对象同样被转换", () => {
        const html = renderInlineDocument(
            [h("div", {}, [h("span", { style: { fontWeight: "bold" } }, [])])],
            {},
        );
        expect(html).toContain('<span style="font-weight: bold"/>');
    });
});
