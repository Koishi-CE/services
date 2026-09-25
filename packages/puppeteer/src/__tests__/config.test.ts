// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

import { describe, expect, it } from "bun:test";
import { buildLaunchOptions, defaultArgs, defaultConfig, defaultViewport } from "../config.ts";

describe("配置与启动参数映射", () => {
    it("默认配置与上游 schema 默认值一致", () => {
        expect(defaultConfig.headless).toBe(true);
        expect(defaultConfig.ignoreHTTPSErrors).toBe(false);
        expect(defaultConfig.defaultViewport).toEqual({
            width: 1280,
            height: 768,
            deviceScaleFactor: 2,
        });
        expect(defaultViewport).toEqual({ width: 1280, height: 768, deviceScaleFactor: 2 });
        expect(defaultConfig.executablePath).toBeUndefined();
    });

    it("defaultArgs 在非 root 环境为空数组", () => {
        // win32 无 process.getuid；CI（ubuntu 非 root）getuid() 非 0，两个环境均落空数组分支
        expect(defaultArgs()).toEqual([]);
    });

    it("buildLaunchOptions 显式映射全部字段", () => {
        const options = buildLaunchOptions(
            {
                executablePath: "/custom/chrome",
                headless: false,
                args: ["--a=1"],
                defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
                ignoreHTTPSErrors: true,
            },
            "/custom/chrome",
            ["--a=1", "--b=2"],
        );
        expect(options).toEqual({
            executablePath: "/custom/chrome",
            args: ["--a=1", "--b=2"],
            headless: false,
            ignoreHTTPSErrors: true,
            defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
        });
    });

    it("buildLaunchOptions 不共享调用方的 args 数组", () => {
        const args = ["--a"];
        const options = buildLaunchOptions(
            {
                headless: true,
                args,
                defaultViewport,
                ignoreHTTPSErrors: false,
            },
            "/chrome",
            args,
        );
        args.push("--mutated");
        expect(options.args).toEqual(["--a"]);
    });
});
