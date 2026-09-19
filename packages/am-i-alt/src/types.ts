// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/** OneBot 适配器的最小结构面：判定只需要 internal.getStrangerInfo 拉取陌生人资料 */
export interface OneBotLikeBot {
    platform?: string;
    internal?: {
        getStrangerInfo(userId: number): Promise<unknown>;
    };
}

/**
 * 检测目标的最小会话形态（鸭子类型）。
 *
 * 跨平台综合检测会对每个绑定账号构造 `{ platform, userId }` 合成会话，
 * 不能要求完整的 koishi Session；真实 Session 在结构上兼容本接口，可直接传入。
 * Discord 注册时间按各适配器的实际形态放行字符串 / 时间戳 / Date 三种载体。
 */
export interface AltCheckSession {
    /** 目标所属平台 */
    platform: string;
    /** 目标的平台用户 ID */
    userId?: string;
    /** Discord：会话事件携带的账号资料（createdAt 为账号注册时间） */
    event?: { user?: { createdAt?: string | number | Date } };
    /** Discord 兜底：消息作者资料 */
    author?: { createdAt?: string | number | Date };
    /** OneBot：解析 bot 实例时优先取会话所属 bot */
    bot?: OneBotLikeBot;
}

/** 三态判定结果：alt = 疑似小号，normal = 非小号，unknown = 无法判定 */
export type AltCheckDecision = "alt" | "normal" | "unknown";

/** 检测失败时的回落策略 */
export type AltCheckErrorPolicy = "unknown" | "pass" | "block";

/** 判定原因编码：前三项为命中规则，其余为回落 / 失败路径 */
export type AltCheckReason =
    | "discord-account-age"
    | "qq-level"
    | "telegram-id-estimate"
    | "platform-check-disabled"
    | "unsupported-platform"
    | "missing-session"
    | "missing-user-id"
    | "missing-telegram-user-id"
    | "missing-discord-created-at"
    | "invalid-discord-created-at"
    | "missing-onebot-bot"
    | "invalid-user-id"
    | "qq-level-fetch-failed"
    | "telegram-estimate-failed";

/** 单账号检测结果 */
export interface AltCheckResult {
    /** 三态判定 */
    decision: AltCheckDecision;
    /** 判定原因编码（词典路径见 locales 的 am-i-alt.reason.*） */
    reason: AltCheckReason;
    /** 目标平台 */
    platform?: string;
    /** 目标用户 ID */
    userId?: string;
    /** 命中规则时的判定依据明细 */
    details?: {
        /** Discord：账号已存在天数 */
        accountAgeDays?: number;
        /** OneBot：QQ 等级 */
        qqLevel?: number;
        /** Telegram：估算的账号年龄天数 */
        estimatedAccountAgeDays?: number;
        /** 本次判定使用的阈值 */
        threshold?: number;
        /** Telegram 估算的置信度标记 */
        estimationConfidence?: "low";
    };
}

/** 插件配置 */
export interface AmIAltConfig {
    enableDiscordCheck: boolean;
    enableOneBotCheck: boolean;
    enableTelegramCheck: boolean;
    /** Discord：账号年龄低于该天数判为疑似小号 */
    minDiscordAccountAgeDays: number;
    /** OneBot：QQ 等级低于该值判为疑似小号 */
    minQqLevel: number;
    /** Telegram：估算年龄低于该天数判为疑似小号 */
    minTelegramEstimatedAccountAgeDays: number;
    /** 检测失败时的回落策略 */
    onError: AltCheckErrorPolicy;
}

/** 单次调用的配置覆盖（不影响插件全局配置） */
export interface AltCheckOverrides {
    enableDiscordCheck?: boolean;
    enableOneBotCheck?: boolean;
    enableTelegramCheck?: boolean;
    minDiscordAccountAgeDays?: number;
    minQqLevel?: number;
    minTelegramEstimatedAccountAgeDays?: number;
    onError?: AltCheckErrorPolicy;
}

/** 检测调用的附加选项 */
export interface AltCheckOptions {
    /** OneBot 检测使用的 bot 实例；缺省按 调用参数 > 会话 bot > ctx.bots 顺序解析 */
    onebotBot?: OneBotLikeBot;
}
