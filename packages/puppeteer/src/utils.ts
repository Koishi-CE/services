// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 包内共享的小工具。@koishi-ce/koishi 的导出面较上游 koishi 有所精简
 * （不导出 hyphenate / Binary 等），此处自建等价实现以避免幽灵依赖。
 */

/** camelCase 属性名转 kebab-case（style 对象转 CSS / SVG 属性落名共用） */
export function hyphenateKey(key: string): string {
    return key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/** HTML 属性值与文本转义（SVG 序列化用） */
export function escapeHtml(source: string): string {
    return source
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** 二进制数据转 base64（替代上游所依赖的 koishi Binary.toBase64） */
export function toBase64(data: ArrayBufferLike | ArrayBufferView): string {
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
    }
    return Buffer.from(data).toString("base64");
}

/** 收窄为普通对象（防 null / 数组等非对象形态混入展开或 entries） */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * 宽松解析超时时长（毫秒）：接受有限数字或可转数字的非空字符串，
 * 其余形态一律视为未提供（上游 `attrs.timeout ? +attrs.timeout : undefined` 的类型安全版）。
 */
export function parseTimeout(timeout: unknown): number | undefined {
    if (typeof timeout === "number" && Number.isFinite(timeout)) return timeout;
    if (typeof timeout === "string" && timeout.trim() !== "") {
        const value = Number(timeout);
        if (Number.isFinite(value)) return value;
    }
    return undefined;
}
