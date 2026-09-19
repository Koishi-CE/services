// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 小号检测插件（am-i-alt）：向 Context 注入 ctx.amIAlt 服务，
 * 按 Discord 账龄 / QQ 等级 / Telegram ID 分布做跨平台小号启发式判定，
 * 并结合 binding 表对同一用户名下的多平台账号给出综合结论。
 *
 * 收编自社区插件 koishi-plugin-am-i-alt（Oppenheymu，MIT），按 Koishi-CE
 * 服务仓规范重写：@koishi-ce 命名空间、ESM-only 产物、类型化 binding
 * 查询、bun:test 用例与七语种词典。
 */
import type { Context } from "@koishi-ce/koishi";
import { Service } from "@koishi-ce/koishi";
import enUS from "../locales/en-US.yml";
import zhCN from "../locales/zh-CN.yml";
import { registerAmIAltCommands } from "./commands.ts";
import type { Config as PluginConfig } from "./config.ts";
import { Config as ConfigSchema } from "./config.ts";
import { checkAltAccount, isAltAccount } from "./core.ts";
import type {
    AltCheckOptions,
    AltCheckOverrides,
    AltCheckResult,
    AltCheckSession,
} from "./types.ts";

export const name = "am-i-alt";
export const inject = ["database"];
export const Config = ConfigSchema;

/** 对外暴露的小号检测服务 */
export class AmIAltService extends Service {
    private readonly pluginConfig: PluginConfig;

    constructor(ctx: Context, config: PluginConfig) {
        super(ctx, "amIAlt", true);
        this.pluginConfig = config;
    }

    /** 执行检测，返回三态结果（alt / normal / unknown） */
    check(
        session: AltCheckSession | undefined,
        overrides?: AltCheckOverrides,
        options?: AltCheckOptions,
    ): Promise<AltCheckResult> {
        return checkAltAccount(session, this.ctx, this.pluginConfig, overrides, options);
    }

    /** 简易判定接口；unknown 结果映射为 null */
    isAlt(
        session: AltCheckSession | undefined,
        overrides?: AltCheckOverrides,
        options?: AltCheckOptions,
    ): Promise<boolean | null> {
        return isAltAccount(session, this.ctx, this.pluginConfig, overrides, options);
    }
}

declare module "@koishi-ce/koishi" {
    interface Context {
        /** 小号检测服务 */
        amIAlt: AmIAltService;
    }
}

export type {
    AltCheckDecision,
    AltCheckErrorPolicy,
    AltCheckOptions,
    AltCheckOverrides,
    AltCheckReason,
    AltCheckResult,
    AltCheckSession,
    AmIAltConfig,
    OneBotLikeBot,
} from "./types.ts";

export function apply(ctx: Context, config: PluginConfig) {
    // 注册插件内置文案
    ctx.i18n.define("zh-CN", zhCN);
    ctx.i18n.define("en-US", enUS);

    // 先挂载服务，再注册命令（命令与下游消费者都通过 ctx.amIAlt 调用）
    ctx.plugin(AmIAltService, config);
    registerAmIAltCommands(ctx, config);
}
