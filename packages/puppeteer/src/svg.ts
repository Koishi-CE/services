// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.
// 重构移植自 koishijs/koishi-plugin-puppeteer 的 packages/core/src/svg.ts
// （MIT © Shigma et al.），移植基线：上游 master c4d8bfe（2024-08-15，
// 对应 npm koishi-plugin-puppeteer 3.9.0）。

/**
 * SVG 构建器：链式构建 SVG 标签树并序列化。
 *
 * 相对上游的有意行为修正（上游输出本身有误，无兼容负担）：
 * - `rect(x1, y1, x2, y2)` 以 (x1, y1) / (x2, y2) 为对角点，width = x2 - x1、
 *   height = y2 - y1（上游写成了 height: y2 - y1 / width: x2 - x1 的 x/y 互串）；
 * - `SVG.fill()` 以 viewBox 四至 (left, top)-(right, bottom) 画背景矩形
 *   （上游四个参数按 top/left/bottom/right 传入，随 rect 的错位一同落错）；
 * - 移除上游 `Tag.parent` 死属性（赋值后无任何消费方）与 `SVGOptions.magnif`
 *   死选项（声明后从未参与计算）。
 */
import { h } from "@koishi-ce/koishi";
import type { Page } from "puppeteer-core";
import { escapeHtml, hyphenateKey } from "./utils.ts";

export interface Attributes {
    [key: string]: string | number;
}

function hyphenate(source: Attributes): Attributes {
    const result: Attributes = {};
    for (const [key, value] of Object.entries(source)) {
        result[hyphenateKey(key)] = value;
    }
    return result;
}

export class Tag {
    readonly tag: string;
    private children: Tag[] = [];
    private attributes: Attributes = {};
    private innerText = "";

    constructor(tag: string) {
        this.tag = tag;
    }

    child(tag: string): Tag {
        const child = new Tag(tag);
        this.children.push(child);
        return child;
    }

    attr(attributes: Attributes): this {
        this.attributes = { ...this.attributes, ...attributes };
        return this;
    }

    data(innerText: string): this {
        this.innerText = innerText;
        return this;
    }

    line(x1: number, y1: number, x2: number, y2: number, attr: Attributes = {}): this {
        this.child("line").attr({ ...hyphenate(attr), x1, y1, x2, y2 });
        return this;
    }

    circle(cx: number, cy: number, r: number, attr: Attributes = {}): this {
        this.child("circle").attr({ ...hyphenate(attr), cx, cy, r });
        return this;
    }

    /** (x1, y1) 与 (x2, y2) 为矩形对角点 */
    rect(x1: number, y1: number, x2: number, y2: number, attr: Attributes = {}): this {
        this.child("rect").attr({
            ...hyphenate(attr),
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
        });
        return this;
    }

    text(text: string, x: number, y: number, attr: Attributes = {}): this {
        this.child("text")
            .attr({ ...hyphenate(attr), x, y })
            .data(text);
        return this;
    }

    g(attr: Attributes = {}): Tag {
        return this.child("g").attr(hyphenate(attr));
    }

    get outer(): string {
        const attrText = Object.entries(this.attributes)
            .map(([key, value]) => ` ${key}="${escapeHtml(String(value))}"`)
            .join("");
        return `<${this.tag}${attrText}>${this.inner}</${this.tag}>`;
    }

    get inner(): string {
        return this.children.length
            ? this.children.map((child) => child.outer).join("")
            : this.innerText;
    }
}

export interface ViewBox {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
}

export interface SVGOptions {
    size?: number;
    width?: number;
    height?: number;
    viewBox?: ViewBox;
    viewSize?: number;
}

export interface SVGView {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export class SVG extends Tag {
    readonly view: SVGView;
    readonly width: number;
    readonly height: number;

    constructor(options: SVGOptions = {}) {
        super("svg");
        const { size = 200, viewSize = size, width = size, height = size } = options;
        this.width = width;
        this.height = height;
        const ratio = viewSize / size;
        const {
            left = 0,
            top = 0,
            bottom = height * ratio,
            right = width * ratio,
        } = options.viewBox ?? {};
        this.view = { left, top, right, bottom };
        this.attr({
            width,
            height,
            viewBox: `${left} ${top} ${right} ${bottom}`,
            xmlns: "http://www.w3.org/2000/svg",
            version: "1.1",
        });
    }

    fill(color: string): this {
        this.rect(this.view.left, this.view.top, this.view.right, this.view.bottom, {
            style: `fill: ${color}`,
        });
        return this;
    }

    async render(ctx: SVGRenderContext): Promise<h> {
        const page = await ctx.puppeteer.page();
        try {
            await page.setContent(this.outer);
            const buffer = await page.screenshot({
                clip: { x: 0, y: 0, width: this.width, height: this.height },
            });
            return h.image(buffer, "image/png");
        } finally {
            await page.close();
        }
    }
}

/** render 只依赖「能开页的 puppeteer 服务」这一最小形态（Context 即满足） */
export interface SVGRenderContext {
    puppeteer: { page(): Promise<Page> };
}
