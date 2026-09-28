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
    // 60s + retry 1：CI 上这两条都是实证必需，不是保守取值。
    // - 冷启动 Chrome（spawn + CDP 握手 + 引导页 goto）在 ubuntu-latest 上实测
    //   10–25s，超过 bun 默认 5s hook/测试超时；而 runner 在跑 CodeQL 的
    //   javascript-typescript 分析（与 gate 并行的另一个 job）时会更慢。
    // - 2026-09-28 实证一次偶然红：同一个提交在 merge queue 那一遍绿、在 push main
    //   那一遍红，失败形态是「beforeEach/afterEach hook timed out for this test」
    //   30s 后报 `Protocol error: Connection closed`（canvas.ts 的 start 收尾），
    //   61 pass / 1 fail。门禁必须抗住偶发红——队列会对偶发红直接剔单。
    //   retry 只作用于 e2e 组；断言类用例不加 retry，避免掩盖真实缺陷。
    // - --no-sandbox：GH runner（Ubuntu 23.10+）经 AppArmor 禁用了非特权
    //   userns，Chrome 无可用沙箱会 FATAL 退出（zygote_host_impl_linux.cc）；
    //   测试环境统一关沙箱，不影响生产配置语义。
    const e2eTimeout = 60_000;
    const e2eOptions = { timeout: e2eTimeout, retry: 1 } as const;
    const app = new Context();
    app.plugin(HTTP);
    app.plugin(puppeteerPlugin, {
        ...defaultConfig,
        args: [...defaultConfig.args, "--no-sandbox"],
    });

    beforeAll(async () => {
        await app.start();
    }, e2eOptions);

    afterAll(async () => {
        await app.stop();
    }, e2eOptions);

    it(
        "服务就绪后注入完成",
        () => {
            expect(app.puppeteer).toBeInstanceOf(Puppeteer);
            expect(app.canvas).toBeDefined();
        },
        e2eOptions,
    );

    it(
        "svg() 返回指定尺寸的 SVG 构建器",
        () => {
            const svg = app.puppeteer.svg({ width: 30, height: 40 });
            expect(svg.width).toBe(30);
            expect(svg.height).toBe(40);
        },
        e2eOptions,
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
        e2eOptions,
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
        e2eOptions,
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
        e2eOptions,
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
        e2eOptions,
    );

    it(
        "SVG 渲染产出图片消息",
        async () => {
            const svg = app.puppeteer.svg({ width: 50, height: 50 });
            svg.fill("#00ff00");
            const image = await svg.render(app);
            expect(image.toString()).toContain("data:image/png;base64,");
        },
        e2eOptions,
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
        e2eOptions,
    );
});
