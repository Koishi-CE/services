// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 命令层：`我是小号吗`（自检）与 `他是小号吗 <target>`（目标检测）。
 *
 * 两条命令都会先按 binding 表找目标账号的绑定关系，对同一用户名下的
 * 全部平台账号逐一检测后给出综合结论：任一账号非小号即整体按非小号，
 * 全部疑似小号才判小号，存在未知则结果未知。
 */
import type { Context, Session } from "@koishi-ce/koishi";
import type { Config } from "./config.ts";
import { checkAltAccount } from "./core.ts";
import type { AltCheckDecision, AltCheckOptions, AltCheckResult, OneBotLikeBot } from "./types.ts";

interface TargetResolution {
    targetUserId: string;
    targetLabel: string;
}

interface CrossPlatformAccount {
    platform: string;
    userId: string;
}

interface CrossPlatformSummary {
    decision: AltCheckDecision;
    normalCount: number;
    altCount: number;
    unknownCount: number;
    total: number;
}

function resolveDecisionText(session: Session, result: AltCheckResult): string {
    return session.text(`am-i-alt.decision.${result.decision}`);
}

function resolveReasonText(session: Session, result: AltCheckResult): string {
    return session.text(`am-i-alt.reason.${result.reason}`);
}

function formatSingleResult(
    session: Session,
    result: AltCheckResult,
    targetLabel?: string,
): string {
    const decisionText = resolveDecisionText(session, result);
    const reasonText = resolveReasonText(session, result);

    const base = targetLabel
        ? session.text("am-i-alt.command.target.result", {
              target: targetLabel,
              decision: decisionText,
              reason: reasonText,
          })
        : session.text("am-i-alt.command.self.result", {
              decision: decisionText,
              reason: reasonText,
          });

    if (result.reason === "telegram-id-estimate") {
        return `${base}\n${session.text("am-i-alt.note.telegramHeuristic")}`;
    }

    return base;
}

function formatCrossSummary(
    session: Session,
    summary: CrossPlatformSummary,
    targetLabel?: string,
): string {
    const decisionText = session.text(`am-i-alt.decision.${summary.decision}`);

    const head = targetLabel
        ? session.text("am-i-alt.command.target.crossResult", {
              target: targetLabel,
              decision: decisionText,
          })
        : session.text("am-i-alt.command.self.crossResult", {
              decision: decisionText,
          });

    const detail = session.text("am-i-alt.command.crossDetail", {
        total: summary.total,
        normal: summary.normalCount,
        alt: summary.altCount,
        unknown: summary.unknownCount,
    });

    return `${head}\n${detail}`;
}

/**
 * 目标解析（简化版）：
 * 1) 优先 @某人
 * 2) 其次命令参数
 */
function resolveTarget(session: Session, target?: string): TargetResolution | null {
    const atElement = session.elements?.find(
        (element) => element.type === "at" && typeof element.attrs["id"] === "string",
    );

    const atId = atElement?.attrs["id"];
    if (typeof atId === "string" && atId.trim()) {
        const targetUserId = atId.trim();
        return {
            targetUserId,
            targetLabel: `@${targetUserId}`,
        };
    }

    const targetUserId = target?.trim();
    if (!targetUserId) return null;

    return {
        targetUserId,
        targetLabel: targetUserId,
    };
}

function buildOneBotOptions(session: Session): AltCheckOptions | undefined {
    const { bot } = session;
    if (!bot?.internal?.getStrangerInfo) return undefined;
    return { onebotBot: bot as OneBotLikeBot };
}

function toPositiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

/** 查询 aid 名下的全部平台账号 */
async function getAccountsByAid(ctx: Context, aid: number): Promise<CrossPlatformAccount[]> {
    const rows = await ctx.database.get("binding", { aid });
    return rows.map((row) => ({ platform: row.platform, userId: row.pid }));
}

/** 查询平台账号（platform + pid）归属的 aid */
async function getAidByPlatformAccount(
    ctx: Context,
    platform: string,
    userId: string,
): Promise<number | null> {
    const [row] = await ctx.database.get("binding", { platform, pid: userId });
    return row?.aid ?? null;
}

function summarizeResults(results: AltCheckResult[]): CrossPlatformSummary {
    const normalCount = results.filter((item) => item.decision === "normal").length;
    const altCount = results.filter((item) => item.decision === "alt").length;
    const unknownCount = results.filter((item) => item.decision === "unknown").length;

    let decision: AltCheckDecision = "unknown";
    if (normalCount > 0) {
        // 任一绑定账号非小号，整体就按非小号
        decision = "normal";
    } else if (altCount > 0 && unknownCount === 0) {
        decision = "alt";
    }

    return {
        decision,
        normalCount,
        altCount,
        unknownCount,
        total: results.length,
    };
}

async function checkAcrossBindings(
    ctx: Context,
    config: Config,
    session: Session,
    seedAccount: CrossPlatformAccount,
    // 操作者的用户 aid：由命令 action 内预取（userFields 窄化后读取）
    operatorAid: number | null,
): Promise<{ summary: CrossPlatformSummary; results: AltCheckResult[] }> {
    let accounts: CrossPlatformAccount[] = [];

    // 优先按「被检测账号」找绑定，避免误用操作者自身的 aid
    const aidFromSeed = await getAidByPlatformAccount(
        ctx,
        seedAccount.platform,
        seedAccount.userId,
    );
    if (aidFromSeed !== null) {
        accounts = await getAccountsByAid(ctx, aidFromSeed);
    }

    // 仅在「检测自己」且前一步无结果时，才回退到操作者自身的 aid
    const isSelfQuery =
        seedAccount.platform === session.platform && seedAccount.userId === session.userId;
    if (!accounts.length && isSelfQuery && operatorAid !== null) {
        accounts = await getAccountsByAid(ctx, operatorAid);
    }

    if (!accounts.length) {
        accounts = [seedAccount];
    }

    const results: AltCheckResult[] = [];
    for (const account of accounts) {
        results.push(
            await checkAltAccount(
                { platform: account.platform, userId: account.userId },
                ctx,
                config,
                undefined,
                buildOneBotOptions(session),
            ),
        );
    }

    return {
        summary: summarizeResults(results),
        results,
    };
}

export function registerAmIAltCommands(ctx: Context, config: Config): void {
    // 自检命令：优先按当前账号绑定做跨平台综合判断
    ctx.command("我是小号吗", "检测当前用户是否疑似小号")
        .alias("小号检查")
        .userFields(["id"])
        .action(async ({ session }) => {
            if (!session) {
                return "当前无会话，无法检测。";
            }

            try {
                if (!session.userId) {
                    return session.text("am-i-alt.reason.missing-user-id");
                }

                const seedAccount: CrossPlatformAccount = {
                    platform: session.platform,
                    userId: session.userId,
                };

                const { summary, results } = await checkAcrossBindings(
                    ctx,
                    config,
                    session,
                    seedAccount,
                    toPositiveInt(session.user?.id),
                );
                const [first] = results;

                if (summary.total <= 1 && first) {
                    return formatSingleResult(session, first);
                }

                return formatCrossSummary(session, summary);
            } catch (error) {
                return session.text("am-i-alt.command.self.failed", {
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        });

    // 目标检测命令：支持 @某人 或直接传平台 userId（默认按当前平台检测）
    ctx.command("他是小号吗 <target:string>", "检测目标用户是否疑似小号")
        .userFields(["id"])
        .action(async ({ session }, target) => {
            if (!session) {
                return "当前无会话，无法检测。";
            }

            const resolved = resolveTarget(session, target);
            if (!resolved) {
                return session.text("am-i-alt.command.target.missing");
            }

            try {
                const seedAccount: CrossPlatformAccount = {
                    platform: session.platform,
                    userId: resolved.targetUserId,
                };

                const { summary, results } = await checkAcrossBindings(
                    ctx,
                    config,
                    session,
                    seedAccount,
                    toPositiveInt(session.user?.id),
                );
                const [first] = results;
                if (summary.total <= 1 && first) {
                    return formatSingleResult(session, first, resolved.targetLabel);
                }

                return formatCrossSummary(session, summary, resolved.targetLabel);
            } catch (error) {
                return session.text("am-i-alt.command.target.failed", {
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        });
}
