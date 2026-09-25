// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

import { describe, expect, it } from "bun:test";
import { SVG, Tag } from "./svg.ts";

describe("SVG 构建器", () => {
    it("默认尺寸 200 与自动 viewBox", () => {
        const svg = new SVG();
        expect(svg.width).toBe(200);
        expect(svg.height).toBe(200);
        expect(svg.outer).toContain('width="200"');
        expect(svg.outer).toContain('height="200"');
        expect(svg.outer).toContain('viewBox="0 0 200 200"');
        expect(svg.outer).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg.outer).toContain('version="1.1"');
    });

    it("rect 以对角点落 width/height（修正上游 x/y 互串）", () => {
        const svg = new SVG();
        svg.rect(10, 20, 110, 70);
        expect(svg.outer).toContain('<rect x="10" y="20" width="100" height="50">');
    });

    it("fill 以 viewBox 四至画背景矩形（修正上游传参错位）", () => {
        const svg = new SVG({ width: 10, height: 20 });
        svg.fill("#f00");
        // 属性键序与上游一致：自定义 attr 在前、几何属性在后
        expect(svg.outer).toContain('<rect style="fill: #f00" x="0" y="0" width="10" height="20">');
    });

    it("自定义 viewBox 时 fill 跟随四至", () => {
        const svg = new SVG({
            width: 100,
            height: 100,
            viewBox: { left: 10, top: 5, right: 90, bottom: 95 },
        });
        expect(svg.outer).toContain('viewBox="10 5 90 95"');
        svg.fill("red");
        expect(svg.outer).toContain('<rect style="fill: red" x="10" y="5" width="80" height="90">');
    });

    it("line / circle / text 落几何属性，camelCase 属性名转 kebab-case", () => {
        const svg = new SVG();
        svg.line(0, 0, 1, 1, { strokeWidth: 2 });
        svg.circle(5, 5, 3);
        svg.text("hi", 1, 2);
        expect(svg.outer).toContain('<line stroke-width="2" x1="0" y1="0" x2="1" y2="1">');
        expect(svg.outer).toContain('<circle cx="5" cy="5" r="3">');
        expect(svg.outer).toContain('<text x="1" y="2">hi</text>');
    });

    it("属性值转义 HTML 敏感字符", () => {
        const svg = new SVG();
        svg.circle(0, 0, 1, { "data-label": `a<&>"'` });
        expect(svg.outer).toContain('data-label="a&lt;&amp;&gt;&quot;&#39;"');
    });

    it("child / attr / data 支持链式嵌套，g 返回子标签", () => {
        const svg = new SVG();
        const group = svg.g({ opacity: 0.5 });
        group.child("rect").attr({ width: 4, height: 4 });
        expect(svg.outer).toContain('<g opacity="0.5"><rect width="4" height="4"></rect></g>');
        expect(svg.outer.startsWith("<svg")).toBe(true);
        expect(svg.outer.endsWith("</svg>")).toBe(true);
    });

    it("data 与 child 互斥：有子元素时输出子元素序列化", () => {
        const tag = new Tag("text");
        expect(tag.outer).toBe("<text></text>");
        tag.data("内容");
        expect(tag.outer).toBe("<text>内容</text>");
        tag.child("tspan");
        expect(tag.outer).toContain("<tspan></tspan>");
        expect(tag.outer).not.toContain("内容");
    });
});
