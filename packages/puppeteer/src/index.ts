// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.
// 重构移植自 koishijs/koishi-plugin-puppeteer 的 packages/core（MIT © Shigma et al.），
// 移植基线：上游 master c4d8bfe（2024-08-15，对应 npm koishi-plugin-puppeteer 3.9.0）。

/**
 * puppeteer 浏览器服务：一个插件实现三个服务——
 * 1. `puppeteer`：开新页 / HTML 渲染截图 / SVG 构建渲染；
 * 2. `canvas`：2D 绘图调用经 CDP 转译在页内执行（见 canvas.ts，零原生依赖）；
 * 3. `component:html`：satori html 组件（元素树 → 页面渲染 → body 截图）。
 *
 * 相对上游的重构点：Config 显式化（config.ts）、index.html 内联注入（html.ts）、
 * page 用完即关（finally 收口）、start 前调用的竞态防御、stop 幂等、
 * 不再需要 screenshot 的 declare module 增强（puppeteer-core 22.15 类型自带
 * base64 / binary 重载）。
 */
import type { Context } from "@koishi-ce/koishi";
import { h, Service } from "@koishi-ce/koishi";
import type {} from "@koishi-ce/plugin-proxy-agent";
import type { Browser, ElementHandle, Page } from "puppeteer-core";
import puppeteerCore from "puppeteer-core";
import find from "puppeteer-finder";
import PuppeteerCanvas from "./canvas.ts";
import type { Config as PluginConfig } from "./config.ts";
import { buildLaunchOptions, Config as ConfigSchema } from "./config.ts";
import { gotoBootstrapPage, renderInlineDocument } from "./html.ts";
import { SVG, type SVGOptions } from "./svg.ts";
import { parseTimeout } from "./utils.ts";

export type { Canvas, Canvas2DState, CanvasRenderingContext2D, Image } from "./canvas-service.ts";
export { CanvasService } from "./canvas-service.ts";
export type { ViewportConfig } from "./config.ts";
export { buildLaunchOptions, defaultArgs, defaultConfig, defaultViewport } from "./config.ts";
export * from "./svg.ts";

export const name = "puppeteer";
export const inject = ["http"];
export const Config = ConfigSchema;

export type RenderCallback = (
    page: Page,
    next: (handle?: ElementHandle) => Promise<string>,
) => Promise<string>;

/**
 * 自动探测系统中的 Chrome / Edge 可执行文件。
 * puppeteer-finder 的返回值类型缺失（any），此处显式收窄并给出可读错误。
 */
export function findExecutable(): string {
    const path: unknown = find();
    if (typeof path !== "string" || path.length === 0) {
        throw new Error(
            "未能在系统中自动找到 Chrome / Edge 可执行文件，请在配置中指定 executablePath",
        );
    }
    return path;
}

async function defaultRenderCallback(
    page: Page,
    next: (handle?: ElementHandle) => Promise<string>,
): Promise<string> {
    return next((await page.$("body")) ?? undefined);
}

export class Puppeteer extends Service {
    static inject = ["http"];

    private browser?: Browser | undefined;
    private readonly pluginConfig: PluginConfig;

    constructor(ctx: Context, config: PluginConfig) {
        super(ctx, "puppeteer");
        this.pluginConfig = config;
        // canvas 服务随插件挂载（依赖本服务与 http）
        ctx.plugin(PuppeteerCanvas);
    }

    override async start(): Promise<void> {
        let executablePath = this.pluginConfig.executablePath;
        if (!executablePath) {
            executablePath = findExecutable();
            this.logger.info("chrome executable found at %c", executablePath);
        }
        const args = [...this.pluginConfig.args];
        // @koishi-ce/plugin-proxy-agent 的类型增强：宿主装配了代理时自动透传
        const proxyAgent = this.ctx.http.config.proxyAgent;
        if (proxyAgent && !args.some((arg) => arg.startsWith("--proxy-server"))) {
            args.push(`--proxy-server=${proxyAgent}`);
        }
        this.browser = await puppeteerCore.launch(
            buildLaunchOptions(this.pluginConfig, executablePath, args),
        );
        this.logger.debug("browser launched");
        this.registerHtmlComponent();
    }

    override async stop(): Promise<void> {
        const browser = this.browser;
        this.browser = undefined;
        await browser?.close();
    }

    /** 新开一个浏览器页；浏览器未就绪（start 前调用 / stop 后 / 连接已断）时显式报错 */
    async page(): Promise<Page> {
        if (!this.browser?.connected) {
            throw new Error("puppeteer 服务尚未就绪（浏览器未启动或已停止）");
        }
        return this.browser.newPage();
    }

    svg(options?: SVGOptions): SVG {
        return new SVG(options);
    }

    /**
     * 渲染 HTML 内容并截图。先载入引导页（window 工具函数），再 setContent，
     * 随后执行回调产出结果；默认回调对 body 元素截取并返回图片消息。
     * page 用完即关（finally 收口）。
     */
    async render(content: string, callback?: RenderCallback): Promise<string> {
        const page = await this.page();
        try {
            await gotoBootstrapPage(page);
            if (content) await page.setContent(content);
            const screenshot = callback ?? defaultRenderCallback;
            return await screenshot(page, async (handle) => {
                const clip = handle ? await handle.boundingBox() : undefined;
                const buffer = await page.screenshot(clip ? { clip } : {});
                return h.image(buffer, "image/png").toString();
            });
        } finally {
            await page.close();
        }
    }

    private registerHtmlComponent(): void {
        this.ctx.component("html", async (attrs, children) => {
            const page = await this.page();
            try {
                const src = attrs["src"];
                if (typeof src === "string" && src) {
                    await page.goto(src);
                } else {
                    await page.setContent(renderInlineDocument(children, attrs));
                }
                const idleTimeout = parseTimeout(attrs["timeout"]);
                await page.waitForNetworkIdle(
                    idleTimeout === undefined ? {} : { timeout: idleTimeout },
                );
                const customSelector = attrs["selector"];
                const selector =
                    typeof customSelector === "string" && customSelector ? customSelector : "body";
                const body = await page.$(selector);
                if (!body) throw new Error(`component:html 未找到选择器命中的元素：${selector}`);
                const clip = await body.boundingBox();
                const buffer = await page.screenshot(clip ? { clip } : {});
                return h.image(buffer, "image/png");
            } finally {
                await page.close();
            }
        });
    }
}

declare module "@koishi-ce/koishi" {
    interface Context {
        /** puppeteer 浏览器服务 */
        puppeteer: Puppeteer;
    }
}

export function apply(ctx: Context, config: PluginConfig): void {
    ctx.plugin(Puppeteer, config);
}
