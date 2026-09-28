// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * SPDX 许可证头门禁（零依赖，bun 直跑）。
 *
 * 用法：bun tooling/checks/spdx.ts
 *
 * 检查**手写源码**是否带 SPDX 许可证标识头：
 *
 *   // SPDX-License-Identifier: MIT
 *
 * 扫描面（当前）：
 *   - packages 下各包的源码与测试（`packages/<包>/src/**`，.ts/.mts/.cts）；
 *   - 本目录的工程脚本（`tooling/**`，.ts/.mts/.cts）。
 *
 * 明确豁免（不扫）：
 *   - 生成物：`lib/**`、`dist/**`（tsdown 产出的 .mjs 与 .d.ts 无头，属正常）；
 *   - `node_modules/**`（第三方）；
 *   - **尚未纳入的两类手写文件**：`packages/<包>/tsdown.config.ts` 与根
 *     `types/yml.d.ts` —— 本仓还有 4 个这类文件缺头（计划书 §7.5 的 G16），
 *     留待补齐那 4 个头时一并把扫描面扩过去；在那之前本闸门对它们是绿的。
 *
 * 只校验 SPDX 标识符，**不**校验版权行：版权归属随文件来源而不同（自研文件是
 * 「Oppenheymu and Koishi-CE contributors」，自上游迁入的 cron 是「Shigma and
 * Koishijs contributors」+「Koishi-CE contributors」双行），强行统一会抹掉
 * 上游署名。标识符的检查窗口为文件前 3 行（留出 shebang 与 BOM 的余地）。
 *
 * 发现任何问题时退出码置 1。
 */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

/** 仓库根目录（本脚本位于 tooling/checks/ 下）。 */
const ROOT = resolve(import.meta.dirname, "../..");

/** 许可证标识（本仓统一 MIT）。 */
const LICENSE_ID = "SPDX-License-Identifier: MIT";

/** 扫描面：手写源码的两类载体。 */
const GLOBS = ["packages/*/src/**/*.{ts,mts,cts}", "tooling/**/*.{ts,mts,cts}"];

/** 排除的路径段：生成物与第三方区（与 .fallowrc / biome 的豁免口径一致）。 */
const EXCLUDED_SEGMENTS = ["node_modules", "lib", "dist", "coverage"];

/** 头部检查窗口：前 3 行内出现即算合规。 */
const HEAD_LINES = 3;

/** path 分隔符归一为 posix（Win32 下 glob 与 relative 都可能返回反斜杠）。 */
function toPosix(path: string): string {
    return path.split(sep).join("/");
}

const problems: string[] = [];
const files: string[] = [];

for (const glob of GLOBS) {
    for (const abs of new Bun.Glob(glob).scanSync({ cwd: ROOT, dot: true, absolute: true })) {
        const file = toPosix(relative(ROOT, abs));
        if (EXCLUDED_SEGMENTS.some((segment) => file.includes(`/${segment}/`))) continue;
        files.push(file);
    }
}

if (!files.length) {
    console.error("未匹配到任何待检查文件，检查脚本可能需要调整。");
    process.exit(1);
}

for (const file of files.sort()) {
    const head = readFileSync(resolve(ROOT, file), "utf8")
        .split(/\r?\n/)
        .slice(0, HEAD_LINES);
    if (head.some((line) => line.includes(LICENSE_ID))) continue;
    problems.push(`${file}：缺少 SPDX 许可证标识（前 ${HEAD_LINES} 行内未找到 "${LICENSE_ID}"）`);
}

if (problems.length) {
    console.error(`SPDX 头检查发现 ${problems.length} 个问题：`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}
console.log(
    `SPDX 头检查通过：${files.length} 个手写源文件均带许可证头（生成物 lib/dist 与 node_modules 已豁免）。`,
);
