// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * am-i-alt 插件测试：三平台核心判定与 onError 策略、overrides 按次覆盖、
 * isAlt 三态映射，以及命令层的跨平台 binding 综合输出。
 * 平台回落路径的 warn 日志在模块体统一静音，afterAll 恢复。
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Context, Logger, Time } from "@koishi-ce/koishi";
import memory from "@koishi-ce/plugin-database-memory";
import mock from "@koishi-ce/plugin-mock";
import { defaultConfig } from "./config.ts";
import * as amIAlt from "./index.ts";

(Logger.levels as Record<string, number>)["am-i-alt"] = 0;

const app = new Context();

app.plugin(amIAlt, defaultConfig);
app.plugin(mock);
app.plugin(memory);

const client = app.mock.client("123", "321");

beforeAll(async () => {
    await app.start();
    await app.mock.initUser("123", 1, { name: "foo" });
});

afterAll(() => {
    delete (Logger.levels as Record<string, number>)["am-i-alt"];
    return app.stop();
});

describe("核心判定", () => {
    it("discord：账号年龄低于阈值判为小号", async () => {
        const result = await app.amIAlt.check({
            platform: "discord",
            userId: "u1",
            event: { user: { createdAt: new Date(Date.now() - 10 * Time.day) } },
        });
        expect(result.decision).toBe("alt");
        expect(result.reason).toBe("discord-account-age");
        expect(result.details?.accountAgeDays).toBeGreaterThan(9);
        expect(result.details?.threshold).toBe(30);
    });

    it("discord：老账号判为正常（时间戳形态的注册时间同样归一）", async () => {
        const result = await app.amIAlt.check({
            platform: "discord",
            userId: "u2",
            event: { user: { createdAt: Date.now() - 100 * Time.day } },
        });
        expect(result.decision).toBe("normal");
        expect(result.reason).toBe("discord-account-age");
    });

    it("discord：缺注册时间按 onError 策略回落", async () => {
        const session = { platform: "discord", userId: "u3" };
        expect((await app.amIAlt.check(session)).decision).toBe("unknown");
        expect((await app.amIAlt.check(session, { onError: "pass" })).decision).toBe("normal");
        expect((await app.amIAlt.check(session, { onError: "block" })).decision).toBe("alt");
        expect((await app.amIAlt.check(session)).reason).toBe("missing-discord-created-at");
    });

    it("overrides 可按次覆盖阈值", async () => {
        const session = {
            platform: "discord",
            userId: "u1",
            event: { user: { createdAt: new Date(Date.now() - 10 * Time.day) } },
        };
        expect((await app.amIAlt.check(session, { minDiscordAccountAgeDays: 5 })).decision).toBe(
            "normal",
        );
    });

    it("关闭平台检测时直接按正常处理", async () => {
        const result = await app.amIAlt.check(
            { platform: "discord", userId: "u1" },
            { enableDiscordCheck: false },
        );
        expect(result.decision).toBe("normal");
        expect(result.reason).toBe("platform-check-disabled");
    });

    it("onebot：QQ 等级低于阈值判为小号", async () => {
        const result = await app.amIAlt.check({
            platform: "onebot",
            userId: "10001",
            bot: {
                platform: "onebot",
                internal: { getStrangerInfo: async () => ({ qqLevel: 3 }) },
            },
        });
        expect(result.decision).toBe("alt");
        expect(result.reason).toBe("qq-level");
        expect(result.details?.qqLevel).toBe(3);
    });

    it("onebot：兼容 qq_level 字段命名，等级达标判为正常", async () => {
        const result = await app.amIAlt.check({
            platform: "onebot",
            userId: "10002",
            bot: {
                platform: "onebot",
                internal: { getStrangerInfo: async () => ({ qq_level: 20 }) },
            },
        });
        expect(result.decision).toBe("normal");
    });

    it("onebot：返回缺等级字段时回落为 unknown", async () => {
        const result = await app.amIAlt.check({
            platform: "onebot",
            userId: "10003",
            bot: {
                platform: "onebot",
                internal: { getStrangerInfo: async () => ({ nickname: "x" }) },
            },
        });
        expect(result.decision).toBe("unknown");
        expect(result.reason).toBe("qq-level-fetch-failed");
    });

    it("onebot：无可用 bot 实例时回落为 unknown", async () => {
        const result = await app.amIAlt.check({ platform: "onebot", userId: "10004" });
        expect(result.decision).toBe("unknown");
        expect(result.reason).toBe("missing-onebot-bot");
    });

    it("onebot：userId 非正整数时判为非法", async () => {
        const result = await app.amIAlt.check({
            platform: "onebot",
            userId: "abc",
            bot: {
                platform: "onebot",
                internal: { getStrangerInfo: async () => ({ qqLevel: 3 }) },
            },
        });
        expect(result.decision).toBe("unknown");
        expect(result.reason).toBe("invalid-user-id");
    });

    it("onebot：bot 实例也可经 options 注入", async () => {
        const result = await app.amIAlt.check({ platform: "onebot", userId: "10005" }, undefined, {
            onebotBot: {
                platform: "onebot",
                internal: { getStrangerInfo: async () => ({ level: 8 }) },
            },
        });
        expect(result.decision).toBe("alt");
        expect(result.details?.qqLevel).toBe(8);
    });

    it("telegram：新 ID 段估算低年龄判为小号", async () => {
        const result = await app.amIAlt.check({ platform: "telegram", userId: "8100000000" });
        expect(result.decision).toBe("alt");
        expect(result.reason).toBe("telegram-id-estimate");
        expect(result.details?.estimatedAccountAgeDays).toBe(7);
        expect(result.details?.estimationConfidence).toBe("low");
    });

    it("telegram：老 ID 段判为正常", async () => {
        const result = await app.amIAlt.check({ platform: "telegram", userId: "5000000000" });
        expect(result.decision).toBe("normal");
    });

    it("不支持的平台按正常处理", async () => {
        const result = await app.amIAlt.check({ platform: "irc", userId: "u9" });
        expect(result.decision).toBe("normal");
        expect(result.reason).toBe("unsupported-platform");
    });

    it("isAlt 把 unknown 映射为 null", async () => {
        expect(
            await app.amIAlt.isAlt({
                platform: "discord",
                userId: "u1",
                event: { user: { createdAt: new Date(Date.now() - 10 * Time.day) } },
            }),
        ).toBe(true);
        expect(await app.amIAlt.isAlt({ platform: "discord", userId: "u3" })).toBe(null);
        expect(await app.amIAlt.isAlt({ platform: "irc" })).toBe(false);
    });
});

describe("命令", () => {
    it("我是小号吗：单账号直出结果", async () => {
        await client.shouldReply("我是小号吗", "检测结果：非小号（当前平台暂不支持检测）");
    });

    it("小号检查：别名可用", async () => {
        await client.shouldReply("小号检查", "检测结果：非小号（当前平台暂不支持检测）");
    });

    it("他是小号吗：缺目标时提示", async () => {
        await client.shouldReply("他是小号吗", "请提供目标用户：@某人 或 输入平台用户 ID。");
    });

    it("他是小号吗：按当前平台检测目标", async () => {
        await client.shouldReply(
            "他是小号吗 888",
            "目标 888 的检测结果：非小号（当前平台暂不支持检测）",
        );
    });

    it("绑定同 aid 的多账号时输出跨平台综合", async () => {
        const user = await app.database.getUser("mock", "123");
        await app.database.create("binding", {
            platform: "discord",
            pid: "777",
            aid: user!.id,
            bid: user!.id,
        });
        await client.shouldReply(
            "我是小号吗",
            ["跨平台综合结果：非小号", "共检测 2 个绑定账号：非小号 1，疑似小号 0，未知 1"].join(
                "\n",
            ),
        );
    });
});
