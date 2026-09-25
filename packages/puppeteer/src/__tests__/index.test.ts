// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 插件装配与端到端测试：
 * - 装配组不启动浏览器，覆盖服务注入、接口面与未就绪防御（CI 可跑）；
 * - 集成组经 findExecutable 探测本机浏览器，找不到整组 skip（保 CI 绿）。
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Context } from "@koishi-ce/koishi";
import HTTP from "@koishi-ce/plugin-http";
import { PuppeteerCanvas } from "../canvas.ts";
import { defaultConfig } from "../config.ts";
import * as puppeteerPlugin from "../index.ts";
import { findExecutable, name, Puppeteer } from "../index.ts";

describe("插件装配（无浏览器链路）", () => {
    it("插件导出面齐全", () => {
        expect(name).toBe("puppeteer");
        expect(puppeteerPlugin.inject).toEqual(["http"]);
        expect(puppeteerPlugin.Config).toBeDefined();
        expect(typeof puppeteerPlugin.apply).toBe("function");
        expect(typeof findExecutable).toBe("function");
    });

    it("start 前调用 page() 显式报错（竞态防御）", async () => {
        const app = new Context();
        const service = new Puppeteer(app, defaultConfig);
        await expect(service.page()).rejects.toThrow("尚未就绪");
    });

    it("start 前 createCanvas / loadImage 显式报错（常驻页未就绪）", async () => {
        const app = new Context();
        const canvas = new PuppeteerCanvas(app);
        await expect(canvas.createCanvas(10, 10)).rejects.toThrow("常驻页尚未就绪");
        await expect(canvas.loadImage(Buffer.from("png"))).rejects.toThrow("常驻页尚未就绪");
    });
});

const executable = (() => {
    try {
        return findExecutable();
    } catch {
        return null;
    }
})();

describe.skipIf(!executable)("端到端集成（需本机浏览器）", () => {
    // CI runner 冷启动 Chrome（spawn + CDP 握手 + 引导页）超过 bun 默认 5s
    // hook/测试超时，端到端组统一放宽到 30s（ubuntu-latest 预装 Chrome，
    // 本组在 CI 上真跑而非 skip）
    const e2eTimeout = 30_000;
    const app = new Context();
    app.plugin(HTTP);
    app.plugin(puppeteerPlugin, defaultConfig);

    beforeAll(async () => {
        await app.start();
    }, e2eTimeout);

    afterAll(async () => {
        await app.stop();
    }, e2eTimeout);

    it(
        "服务就绪后注入完成",
        () => {
            expect(app.puppeteer).toBeInstanceOf(Puppeteer);
            expect(app.canvas).toBeDefined();
        },
        e2eTimeout,
    );

    it(
        "svg() 返回指定尺寸的 SVG 构建器",
        () => {
            const svg = app.puppeteer.svg({ width: 30, height: 40 });
            expect(svg.width).toBe(30);
            expect(svg.height).toBe(40);
        },
        e2eTimeout,
    );

    it(
        "launch → setContent → 截图（PNG 魔数校验）",
        async () => {
            const output = await app.puppeteer.render(
                '<body style="margin:0"><h1 style="width: 200px; height: 60px">你好，Koishi</h1></body>',
            );
            expect(output).toContain("data:image/png;base64,");
            const base64 = output.slice(output.indexOf("base64,") + 7, output.lastIndexOf('"'));
            const buffer = Buffer.from(base64, "base64");
            expect([...buffer.subarray(0, 8)]).toEqual([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]);
        },
        e2eTimeout,
    );

    it(
        "canvas 全链路：转译语句在页内执行并产出位图",
        async () => {
            const canvas = await app.canvas.createCanvas(64, 32);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ff0000";
            ctx.fillRect(0, 0, 64, 32);
            const dataUrl = await canvas.toDataURL("image/png");
            const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
            expect([...buffer.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
            await canvas.dispose();
        },
        e2eTimeout,
    );

    it(
        "canvas render 模板方法产出图片消息",
        async () => {
            const image = await app.canvas.render(48, 48, (ctx) => {
                ctx.fillStyle = "#0000ff";
                ctx.fillRect(0, 0, 48, 48);
            });
            expect(image.toString()).toContain("data:image/png;base64,");
        },
        e2eTimeout,
    );

    it(
        "loadImage：Buffer base64 注入并回读尺寸",
        async () => {
            // 1x1 PNG
            const png = Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                "base64",
            );
            const image = await app.canvas.loadImage(png);
            expect(image.naturalWidth).toBe(1);
            expect(image.naturalHeight).toBe(1);
            await image.dispose();
        },
        e2eTimeout,
    );

    it(
        "SVG 渲染产出图片消息",
        async () => {
            const svg = app.puppeteer.svg({ width: 50, height: 50 });
            svg.fill("#00ff00");
            const image = await svg.render(app);
            expect(image.toString()).toContain("data:image/png;base64,");
        },
        e2eTimeout,
    );

    it(
        "stop 后 page() 显式报错（幂等清理）",
        async () => {
            // stop 会在服务卸载后令 ctx 上的访问失效，先持有实例引用
            const puppeteerService = app.puppeteer;
            const canvasService = app.canvas;
            await app.stop();
            await expect(puppeteerService.page()).rejects.toThrow("尚未就绪");
            await expect(canvasService.createCanvas(1, 1)).rejects.toThrow("常驻页尚未就绪");
        },
        e2eTimeout,
    );
});
