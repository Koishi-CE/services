// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.
// 重构移植自 koishijs/koishi-plugin-puppeteer 的 packages/core/src/index.ts 中
// Puppeteer.Config 的 schema 定义（MIT © Shigma et al.），移植基线：上游 master
// c4d8bfe（2024-08-15，对应 npm koishi-plugin-puppeteer 3.9.0）。

/**
 * 显式化的插件配置：上游以 `interface Config extends LaunchOptions` +
 * `Schema.intersect(...) as Schema<Config>` 的类型体操表达，此处改为显式接口 +
 * 显式 Schema，launch 参数在 buildLaunchOptions 处显式映射，边界无断言。
 *
 * 字段形态与「经 schema 解析后的运行时配置」一致（有默认值的字段为必选，
 * executablePath 无默认故保持可选），与 am-i-alt 的 defaultConfig 先例对齐。
 * Config 描述沿用硬编码中文（对齐 am-i-alt 先例：词典覆盖运行时文案，
 * 配置描述不做多语言）。
 */
import { Schema } from "@koishi-ce/koishi";
import type { PuppeteerNodeLaunchOptions } from "puppeteer-core";

export interface ViewportConfig {
    width: number;
    height: number;
    deviceScaleFactor: number;
}

export interface Config {
    /** 浏览器可执行文件路径；缺省时自动从系统中寻找 */
    executablePath?: string;
    headless: boolean;
    args: string[];
    defaultViewport: ViewportConfig;
    ignoreHTTPSErrors: boolean;
}

export const defaultViewport: ViewportConfig = { width: 1280, height: 768, deviceScaleFactor: 2 };

/** root 用户启动 Chrome 需要显式关闭沙箱（与上游一致） */
export function defaultArgs(): string[] {
    return process.getuid?.() === 0 ? ["--no-sandbox"] : [];
}

export const defaultConfig: Config = {
    headless: true,
    args: defaultArgs(),
    defaultViewport,
    ignoreHTTPSErrors: false,
};

const ViewportSchema: Schema<ViewportConfig> = Schema.object({
    width: Schema.natural().description("默认的视图宽度。").default(defaultViewport.width),
    height: Schema.natural().description("默认的视图高度。").default(defaultViewport.height),
    deviceScaleFactor: Schema.number()
        .min(0)
        .description("默认的设备缩放比率。")
        .default(defaultViewport.deviceScaleFactor),
});

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        executablePath: Schema.string().description("可执行文件的路径。缺省时将自动从系统中寻找。"),
        headless: Schema.boolean()
            .description("是否开启[无头模式](https://developer.chrome.com/blog/headless-chrome/)。")
            .default(defaultConfig.headless),
        args: Schema.array(String)
            .description(
                "额外的浏览器参数。Chromium 参数可以参考[这个页面](https://peter.sh/experiments/chromium-command-line-switches/)。",
            )
            .default(defaultArgs()),
    }).description("启动设置"),
    Schema.object({
        defaultViewport: ViewportSchema,
        ignoreHTTPSErrors: Schema.boolean()
            .description("在导航时忽略 HTTPS 错误。")
            .default(defaultConfig.ignoreHTTPSErrors),
    }).description("浏览器设置"),
]);

/** 将显式配置映射为 puppeteer-core 的启动参数（不展开整包配置，逐字段显式传递） */
export function buildLaunchOptions(
    config: Config,
    executablePath: string,
    args: readonly string[],
): PuppeteerNodeLaunchOptions {
    return {
        executablePath,
        args: [...args],
        headless: config.headless,
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
        defaultViewport: {
            width: config.defaultViewport.width,
            height: config.defaultViewport.height,
            deviceScaleFactor: config.defaultViewport.deviceScaleFactor,
        },
    };
}
