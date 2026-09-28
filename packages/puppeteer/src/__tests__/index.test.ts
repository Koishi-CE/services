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
    // 三重预算，别再加错地方——三个超时各管一段，改前先读这段：
    // - `launchTimeoutMs`（= 插件 Config.timeout）：交给 puppeteer 自己。它的
    //   `launch()` 默认只等 30s（puppeteer-core 的 ProductLauncher 里
    //   `timeout = 30000`）就抛 "Timed out after 30000 ms while waiting for the
    //   WS endpoint URL to appear in stdout!"。这一段**不受 bun 的 timeout 约束**，
    //   bun 预算给多大都救不了它：2026-09-28 15:51 的 CI 红就是这个形态
    //   （同一棵树 15:40 那次 app.start 只花 10.4s、15:50 那次花了 35.9s，
    //   runner 之间的速度差足以把 30s 打满）。给 120s 是相对实测最慢的余量。
    // - `e2eTimeout`（= bun 的 hook / 用例预算）必须**大于** `launchTimeoutMs`，
    //   否则 bun 先杀 hook，现场的报错会退化成 "hook timed out" 而不是上一条可读信息。
    // - 更早的一次偶发红（2026-09-28，merge queue 那遍绿、push main 那遍红，
    //   61 pass / 1 fail）是 bun 的 30s hook 预算被冷启动吃满，故从 30s 提到 60s。
    //   `retry: 1` 只重跑单个用例，**不重跑 beforeAll**——beforeAll 一挂，全组立即秒红，
    //   所以 e2e 的抗抖动主要靠上面两个预算，而不是靠 retry。
    // - --no-sandbox：GH runner（Ubuntu 23.10+）经 AppArmor 禁用了非特权
    //   userns，Chrome 无可用沙箱会 FATAL 退出（zygote_host_impl_linux.cc）；
    //   测试环境统一关沙箱，不影响生产配置语义。
    const launchTimeoutMs = 120_000;
    const e2eTimeout = 150_000;
    const e2eOptions = { timeout: e2eTimeout, retry: 1 } as const;
    const app = new Context();
    app.plugin(HTTP);
    app.plugin(puppeteerPlugin, {
        ...defaultConfig,
        args: [...defaultConfig.args, "--no-sandbox"],
        timeout: launchTimeoutMs,
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
