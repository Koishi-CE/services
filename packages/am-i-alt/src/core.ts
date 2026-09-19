// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 核心判定逻辑：按平台分发启发式检测，返回三态结果。
 *
 * - Discord：以 satori 事件携带的账号注册时间估算账龄；
 * - OneBot：经 internal.getStrangerInfo 拉取 QQ 等级（兼容
 *   NapCat / 其他实现返回的 qqLevel / qq_level / level 字段命名）；
 * - Telegram：平台不提供注册时间，仅按 userId 分段做低置信度估算。
 */
import type { Context } from "@koishi-ce/koishi";
import { resolveConfig } from "./config.ts";
import type {
    AltCheckDecision,
    AltCheckOptions,
    AltCheckOverrides,
    AltCheckResult,
    AltCheckSession,
    AmIAltConfig,
    OneBotLikeBot,
} from "./types.ts";

/** 插件日志域 */
const DOMAIN = "am-i-alt";

function getErrorDecision(policy: AmIAltConfig["onError"]): AltCheckDecision {
    if (policy === "pass") return "normal";
    if (policy === "block") return "alt";
    return "unknown";
}

function createSessionMeta(session?: AltCheckSession): Pick<AltCheckResult, "platform" | "userId"> {
    const meta: Pick<AltCheckResult, "platform" | "userId"> = {};
    if (session?.platform) meta.platform = session.platform;
    if (session?.userId) meta.userId = session.userId;
    return meta;
}

function buildErrorResult(
    config: AmIAltConfig,
    reason: AltCheckResult["reason"],
    session?: AltCheckSession,
): AltCheckResult {
    return {
        decision: getErrorDecision(config.onError),
        reason,
        ...createSessionMeta(session),
    };
}

function parsePositiveInteger(input: string): number | null {
    const parsed = Number(input);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

/** 把各适配器形态不一的注册时间归一为 Date；无效输入返回 null */
function toDate(value: string | number | Date): Date | null {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getDiscordCreatedAt(session: AltCheckSession, ctx: Context): Date | null {
    const createdAtRaw = session.event?.user?.createdAt ?? session.author?.createdAt;

    if (!createdAtRaw) {
        ctx.logger(DOMAIN).warn("无法获取 Discord 用户创建时间");
        return null;
    }

    const createdAt = toDate(createdAtRaw);
    if (!createdAt) {
        ctx.logger(DOMAIN).warn(`Discord 用户创建时间无效: ${String(createdAtRaw)}`);
    }
    return createdAt;
}

// OneBot 实例选择顺序：调用参数 > 当前会话 bot > 全局 bot 列表
function resolveOneBotBot(
    ctx: Context,
    session?: AltCheckSession,
    options?: AltCheckOptions,
): OneBotLikeBot | null {
    if (options?.onebotBot?.internal?.getStrangerInfo) return options.onebotBot;

    const sessionBot = session?.bot;
    if (sessionBot?.internal?.getStrangerInfo) return sessionBot;

    for (const bot of ctx.bots) {
        if (bot.platform === "onebot" && bot.internal?.getStrangerInfo) {
            return bot;
        }
    }

    return null;
}

// 兼容 NapCat / 其他 OneBot 实现的不同字段命名
function parseQqLevel(response: unknown): number | null {
    if (!response || typeof response !== "object") return null;
    const payload = response as Record<string, unknown>;
    for (const key of ["qqLevel", "qq_level", "level"] as const) {
        const value = payload[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}

export async function getQqLevel(
    numericUserId: number,
    bot: OneBotLikeBot,
    ctx: Context,
): Promise<number | null> {
    try {
        const response = await bot.internal?.getStrangerInfo(numericUserId);
        const level = parseQqLevel(response);
        if (level === null) {
            ctx.logger(DOMAIN).warn("OneBot 返回中未找到有效 QQ 等级字段");
            return null;
        }
        return level;
    } catch (error) {
        ctx.logger(DOMAIN).error("获取 QQ 等级时发生异常", error);
        return null;
    }
}

/**
 * Telegram 账号年龄模糊估算。
 *
 * 注意：
 * 1) Telegram 并不会直接提供可靠的账号创建时间；
 * 2) 这里只能基于 userId 的大致分布做「低置信度」推断；
 * 3) 因此该结果只适合风控前置筛选，不建议单独作为封禁依据。
 */
function estimateTelegramAccountAgeDays(numericUserId: number): number | null {
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) return null;

    if (numericUserId >= 8_000_000_000) return 7;
    if (numericUserId >= 7_000_000_000) return 30;
    if (numericUserId >= 6_000_000_000) return 120;
    if (numericUserId >= 5_000_000_000) return 365;
    if (numericUserId >= 3_000_000_000) return 730;
    if (numericUserId >= 1_000_000_000) return 1460;
    return 2190;
}

/**
 * 核心检测入口。
 * - 返回三态：alt / normal / unknown
 * - 失败策略由 onError 决定
 * - 支持配置覆盖（overrides）
 */
export async function checkAltAccount(
    session: AltCheckSession | undefined,
    ctx: Context,
    config: AmIAltConfig,
    overrides?: AltCheckOverrides,
    options?: AltCheckOptions,
): Promise<AltCheckResult> {
    const resolvedConfig = resolveConfig(config, overrides);

    if (!session) {
        return buildErrorResult(resolvedConfig, "missing-session");
    }

    const { platform, userId } = session;

    if (platform === "discord") {
        if (!resolvedConfig.enableDiscordCheck) {
            return {
                decision: "normal",
                reason: "platform-check-disabled",
                ...createSessionMeta(session),
            };
        }

        const createdAt = getDiscordCreatedAt(session, ctx);
        if (!createdAt) {
            return buildErrorResult(resolvedConfig, "missing-discord-created-at", session);
        }

        const accountAgeDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (!Number.isFinite(accountAgeDays)) {
            return buildErrorResult(resolvedConfig, "invalid-discord-created-at", session);
        }

        const isAlt = accountAgeDays < resolvedConfig.minDiscordAccountAgeDays;
        return {
            decision: isAlt ? "alt" : "normal",
            reason: "discord-account-age",
            ...createSessionMeta(session),
            details: {
                accountAgeDays,
                threshold: resolvedConfig.minDiscordAccountAgeDays,
            },
        };
    }

    if (platform === "onebot") {
        if (!resolvedConfig.enableOneBotCheck) {
            return {
                decision: "normal",
                reason: "platform-check-disabled",
                ...createSessionMeta(session),
            };
        }

        if (!userId) {
            return buildErrorResult(resolvedConfig, "missing-user-id", session);
        }

        const numericUserId = parsePositiveInteger(userId);
        if (numericUserId === null) {
            return buildErrorResult(resolvedConfig, "invalid-user-id", session);
        }

        const bot = resolveOneBotBot(ctx, session, options);
        if (!bot) {
            ctx.logger(DOMAIN).warn("未找到可用的 OneBot bot 实例");
            return buildErrorResult(resolvedConfig, "missing-onebot-bot", session);
        }

        const qqLevel = await getQqLevel(numericUserId, bot, ctx);
        if (qqLevel === null) {
            return buildErrorResult(resolvedConfig, "qq-level-fetch-failed", session);
        }

        const isAlt = qqLevel < resolvedConfig.minQqLevel;
        return {
            decision: isAlt ? "alt" : "normal",
            reason: "qq-level",
            ...createSessionMeta(session),
            details: {
                qqLevel,
                threshold: resolvedConfig.minQqLevel,
            },
        };
    }

    if (platform === "telegram") {
        if (!resolvedConfig.enableTelegramCheck) {
            return {
                decision: "normal",
                reason: "platform-check-disabled",
                ...createSessionMeta(session),
            };
        }

        if (!userId) {
            return buildErrorResult(resolvedConfig, "missing-telegram-user-id", session);
        }

        const numericUserId = parsePositiveInteger(userId);
        if (numericUserId === null) {
            return buildErrorResult(resolvedConfig, "invalid-user-id", session);
        }

        const estimatedAccountAgeDays = estimateTelegramAccountAgeDays(numericUserId);
        if (estimatedAccountAgeDays === null) {
            return buildErrorResult(resolvedConfig, "telegram-estimate-failed", session);
        }

        const isAlt = estimatedAccountAgeDays < resolvedConfig.minTelegramEstimatedAccountAgeDays;
        return {
            decision: isAlt ? "alt" : "normal",
            reason: "telegram-id-estimate",
            ...createSessionMeta(session),
            details: {
                estimatedAccountAgeDays,
                threshold: resolvedConfig.minTelegramEstimatedAccountAgeDays,
                estimationConfidence: "low",
            },
        };
    }

    return {
        decision: "normal",
        reason: "unsupported-platform",
        ...createSessionMeta(session),
    };
}

/** 简易判定接口：unknown 三态回落为 null，其余映射为布尔 */
export async function isAltAccount(
    session: AltCheckSession | undefined,
    ctx: Context,
    config: AmIAltConfig,
    overrides?: AltCheckOverrides,
    options?: AltCheckOptions,
): Promise<boolean | null> {
    const result = await checkAltAccount(session, ctx, config, overrides, options);
    if (result.decision === "unknown") return null;
    return result.decision === "alt";
}
