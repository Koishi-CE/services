// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

import { describe, expect, it } from "bun:test";
import { Context } from "@koishi-ce/koishi";
import type { CanvasStatement } from "../canvas.ts";
import { CanvasElement, ImageElement, isElementRef, renderStatement } from "../canvas.ts";

interface FakePage {
    expressions: string[];
    evaluate(expression: string): Promise<unknown>;
}

function createFakePage(returnValue: unknown = ""): FakePage {
    const expressions: string[] = [];
    return {
        expressions,
        async evaluate(expression: string) {
            expressions.push(expression);
            return returnValue;
        },
    };
}

describe("canvas 转译器", () => {
    it("状态字段出厂默认与浏览器 2D 上下文一致，canvas 指回宿主", () => {
        const fake = createFakePage();
        const canvas = new CanvasElement(fake, "canvas_1", 100, 80);
        const ctx = canvas.getContext("2d");
        expect(ctx.fillStyle).toBe("#000000");
        expect(ctx.strokeStyle).toBe("#000000");
        expect(ctx.lineWidth).toBe(1);
        expect(ctx.globalAlpha).toBe(1);
        expect(ctx.font).toBe("10px sans-serif");
        expect(ctx.textAlign).toBe("start");
        expect(ctx.canvas).toBe(canvas);
        expect(fake.expressions).toEqual([]);
    });

    it("赋值同时更新本地状态并收集 assign 语句", () => {
        const fake = createFakePage();
        const canvas = new CanvasElement(fake, "canvas_1", 100, 80);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        expect(ctx.fillStyle).toBe("#fff");
        expect(renderStatement({ kind: "assign", prop: "fillStyle", value: '"#fff"' })).toBe(
            'ctx.fillStyle = "#fff";',
        );
    });

    it("方法调用转译为 call 语句，toDataURL 时包裹 IIFE 经 evaluate 执行", async () => {
        const fake = createFakePage("data:image/png;base64,QUJD");
        const canvas = new CanvasElement(fake, "canvas_1", 100, 80);
        const ctx = canvas.getContext("2d");
        ctx.fillRect(0, 0, 10, 20);
        ctx.setLineDash([1, 2]);
        ctx.beginPath();
        const url = await canvas.toDataURL("image/png");
        expect(url).toBe("data:image/png;base64,QUJD");
        expect(fake.expressions.length).toBe(2);
        const program = fake.expressions[0]!;
        expect(program.startsWith("(async (ctx) => {")).toBe(true);
        expect(program).toContain("ctx.fillRect(0, 0, 10, 20);");
        expect(program).toContain("ctx.setLineDash([1,2]);");
        expect(program).toContain("ctx.beginPath();");
        expect(program.endsWith("})(document.querySelector(\"#canvas_1\").getContext('2d'))")).toBe(
            true,
        );
        expect(fake.expressions[1]).toContain('.toDataURL("image/png")');
    });

    it("toBuffer 解码 base64 为二进制", async () => {
        // "QUJD" -> "ABC"
        const fake = createFakePage("data:image/png;base64,QUJD");
        const canvas = new CanvasElement(fake, "canvas_1", 10, 10);
        const buffer = await canvas.toBuffer("image/png");
        expect(buffer.toString()).toBe("ABC");
    });

    it("drawImage 引用页内元素时参数替换为 DOM 查询表达式", async () => {
        const fake = createFakePage("data:image/png;base64,");
        const source = new CanvasElement(fake, "canvas_2", 10, 10);
        const canvas = new CanvasElement(fake, "canvas_1", 10, 10);
        canvas.getContext("2d").drawImage(source, 0, 0);
        await canvas.toDataURL("image/png");
        expect(fake.expressions[0]).toContain(
            'ctx.drawImage(document.querySelector("#canvas_2"), 0, 0);',
        );
    });

    it("语句队列在 toDataURL 后清空，不重复执行", async () => {
        const fake = createFakePage("data:image/png;base64,");
        const canvas = new CanvasElement(fake, "canvas_1", 10, 10);
        const ctx = canvas.getContext("2d");
        ctx.fillRect(0, 0, 1, 1);
        await canvas.toDataURL("image/png");
        await canvas.toDataURL("image/png");
        expect(fake.expressions[0]).not.toBe(fake.expressions[1]);
        expect(fake.expressions[1]).not.toContain("fillRect");
    });

    it("dispose 移除页内元素，此后 toDataURL 报错", async () => {
        const fake = createFakePage("data:image/png;base64,");
        const canvas = new CanvasElement(fake, "canvas_1", 10, 10);
        await canvas.dispose();
        expect(fake.expressions[0]).toBe('document.querySelector("#canvas_1")?.remove()');
        expect(canvas.getContext("2d").fillStyle).toBe("#000000");
        await expect(canvas.toDataURL("image/png")).rejects.toThrow("canvas has been disposed");
    });
});

describe("canvas 语句渲染", () => {
    it("assign / call 两种语句形态", () => {
        const assign: CanvasStatement = { kind: "assign", prop: "lineWidth", value: "3" };
        const call: CanvasStatement = { kind: "call", method: "arc", args: ["0", "0", "5"] };
        expect(renderStatement(assign)).toBe("ctx.lineWidth = 3;");
        expect(renderStatement(call)).toBe("ctx.arc(0, 0, 5);");
    });
});

describe("图像元素", () => {
    it("Buffer 来源经 base64 注入页内并回读尺寸", async () => {
        const fake = createFakePage({ width: 3, height: 4 });
        const image = new ImageElement(new Context(), fake, "image_1", Buffer.from("png"));
        await image.initialize();
        expect(image.naturalWidth).toBe(3);
        expect(image.naturalHeight).toBe(4);
        expect(fake.expressions[0]).toContain('loadImage("image_1"');
        expect(fake.expressions[0]).toContain(Buffer.from("png").toString("base64"));
    });

    it("页内返回尺寸无效时报错", async () => {
        const fake = createFakePage({ width: "3" });
        const image = new ImageElement(new Context(), fake, "image_1", Buffer.from("png"));
        await expect(image.initialize()).rejects.toThrow("未返回有效的图像尺寸");
    });

    it("dispose 同样移除页内元素", async () => {
        const fake = createFakePage({ width: 1, height: 1 });
        const image = new ImageElement(new Context(), fake, "image_1", Buffer.from("png"));
        await image.dispose();
        expect(fake.expressions[0]).toBe('document.querySelector("#image_1")?.remove()');
    });
});

describe("元素引用判别", () => {
    it("仅 canvas / image 元素实例被识别", () => {
        const fake = createFakePage();
        const canvas = new CanvasElement(fake, "canvas_1", 10, 10);
        expect(isElementRef(canvas)).toBe(true);
        expect(isElementRef({ selector: "fake" })).toBe(false);
        expect(isElementRef(null)).toBe(false);
    });
});
