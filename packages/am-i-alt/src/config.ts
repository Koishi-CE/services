// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

import { Schema } from "@koishi-ce/koishi";
import type { AltCheckOverrides, AmIAltConfig } from "./types.ts";

export type Config = AmIAltConfig;

export const defaultConfig: Config = {
    enableDiscordCheck: true,
    enableOneBotCheck: true,
    enableTelegramCheck: true,
    minDiscordAccountAgeDays: 30,
    minQqLevel: 16,
    minTelegramEstimatedAccountAgeDays: 30,
    onError: "unknown",
};

export const Config: Schema<Config> = Schema.object({
    enableDiscordCheck: Schema.boolean()
        .default(defaultConfig.enableDiscordCheck)
        .description("是否启用 Discord 小号检测"),
    enableOneBotCheck: Schema.boolean()
        .default(defaultConfig.enableOneBotCheck)
        .description("是否启用 OneBot 小号检测"),
    enableTelegramCheck: Schema.boolean()
        .default(defaultConfig.enableTelegramCheck)
        .description("是否启用 Telegram 小号检测（基于 ID 的模糊估算）"),
    minDiscordAccountAgeDays: Schema.number()
        .min(0)
        .default(defaultConfig.minDiscordAccountAgeDays)
        .description("Discord 账号年龄低于该天数将判定为疑似小号。"),
    minQqLevel: Schema.number()
        .min(0)
        .default(defaultConfig.minQqLevel)
        .description("QQ 等级低于该阈值将判定为疑似小号。"),
    minTelegramEstimatedAccountAgeDays: Schema.number()
        .min(0)
        .default(defaultConfig.minTelegramEstimatedAccountAgeDays)
        .description("Telegram 模糊估算账号年龄低于该天数时判定为疑似小号。"),
    onError: Schema.union([
        Schema.const("unknown").description("检测失败时返回未知（推荐）"),
        Schema.const("pass").description("检测失败时按非小号处理。"),
        Schema.const("block").description("检测失败时按小号处理。"),
    ])
        .default(defaultConfig.onError)
        .description("检测失败时的策略。"),
});

/** 运行时允许按次覆盖配置，不影响插件全局配置 */
export function resolveConfig(config: Config, overrides?: AltCheckOverrides): Config {
    if (!overrides) return config;
    return {
        enableDiscordCheck: overrides.enableDiscordCheck ?? config.enableDiscordCheck,
        enableOneBotCheck: overrides.enableOneBotCheck ?? config.enableOneBotCheck,
        enableTelegramCheck: overrides.enableTelegramCheck ?? config.enableTelegramCheck,
        minDiscordAccountAgeDays:
            overrides.minDiscordAccountAgeDays ?? config.minDiscordAccountAgeDays,
        minQqLevel: overrides.minQqLevel ?? config.minQqLevel,
        minTelegramEstimatedAccountAgeDays:
            overrides.minTelegramEstimatedAccountAgeDays ??
            config.minTelegramEstimatedAccountAgeDays,
        onError: overrides.onError ?? config.onError,
    };
}
