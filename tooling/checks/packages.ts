// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * workspace 包元数据与生态纪律门禁（零依赖，bun 直跑）。
 *
 * 用法：bun tooling/checks/packages.ts
 *
 * 把 AGENTS.md「基本约束」与「生态纪律」中靠人工遵守的规矩固化为自动检查。
 * 本仓只有 packages 一层（三个服务型插件包），故按此规模裁剪，共五类：
 *
 *   1. 包名纪律：依赖声明与源码导入一律 @koishi-ce 命名空间，不得写回上游名
 *      （koishi 裸名 / @koishijs 作用域）；本仓无豁免项（上游名一次都不该出现）；
 *   2. 元数据统一：顶层类型字段一律 types，不混用旧别名 typings
 *      （exports 内的 types 条件是标准解析字段，不受约束）；
 *   3. ESM-only 形态：全部包 type: module，exports 不得出现 require 条件，
 *      main 不得指向 CJS 形态（.cjs / .js；.mjs 与指向源码的 .ts 合法）；
 *   4. 依赖方向：peerDependencies 一律指向 @koishi-ce/koishi ^1.0.0
 *      （不要写回上游名，也不要放松到 wildcard / 空 range）；dependencies 与
 *      peerDependencies 不得声明 @koishi-ce/koishi 之外的 @koishi-ce 运行时依赖
 *      ——本仓三包之间互不依赖，包间关系只能经 peer 的宿主契约；
 *   5. 源码导入纪律：packages 下源码不得 import 上游名（规则 1 的源码侧对账）。
 *
 * 经评估**不**纳入检查的项：
 *   - sideEffects 字段声明——上游官方包同样不标，且本仓产物为 bundle 单文件，
 *     逐包判断误摇风险的成本高于 tree-shaking 收益；
 *   - 版本号一致性——各包独立版本，由 changesets 管理，不做跨包对齐。
 *
 * 发现任何问题时退出码置 1。
 */
import { join, relative, resolve, sep } from "node:path";

/** 仓库根目录（本脚本位于 tooling/checks/ 下）。 */
const ROOT = resolve(import.meta.dirname, "../..");

/** path 分隔符归一为 posix（Win32 下 glob 与 relative 都可能返回反斜杠）。 */
function toPosix(path: string): string {
    return path.split(sep).join("/");
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** 检查关注的 package.json 字段；其余字段经索引签名放行。 */
interface PackageJson {
    name?: unknown;
    type?: unknown;
    main?: unknown;
    exports?: unknown;
    dependencies?: unknown;
    devDependencies?: unknown;
    peerDependencies?: unknown;
    optionalDependencies?: unknown;
    [key: string]: unknown;
}

const DEP_BLOCKS = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
] as const;

function depNames(data: PackageJson, block: (typeof DEP_BLOCKS)[number]): string[] {
    const value = asRecord(data[block]);
    return value ? Object.keys(value) : [];
}

/** 违规项收集：目标（文件或 文件:行）加一行描述。 */
const issues: string[] = [];
function report(target: string, message: string): void {
    issues.push(`${target}\n    ${message}`);
}

// ---------------------------------------------------------------------------
// workspace 包收集（以根 package.json 的 workspaces 声明为准）
// ---------------------------------------------------------------------------

interface WorkspacePackage {
    /** 相对仓库根的 posix 路径（如 packages/am-i-alt/package.json）。 */
    file: string;
    /** 包目录的相对 posix 前缀（如 packages/am-i-alt）。 */
    dir: string;
    /** 包名，缺失时以占位符参与输出。 */
    name: string;
    data: PackageJson;
}

const rootConfig = asRecord(await Bun.file(join(ROOT, "package.json")).json());
const workspaceGlobs = Array.isArray(rootConfig?.workspaces)
    ? rootConfig.workspaces.filter((glob): glob is string => typeof glob === "string")
    : [];

const packages: WorkspacePackage[] = [];
for (const glob of workspaceGlobs) {
    for (const abs of new Bun.Glob(`${glob}/package.json`).scanSync({
        cwd: ROOT,
        dot: true,
        absolute: true,
    })) {
        const file = toPosix(relative(ROOT, abs));
        const data = asRecord(await Bun.file(abs).json()) as PackageJson | null;
        if (!data) continue;
        packages.push({
            file,
            dir: file.slice(0, -"/package.json".length),
            name: typeof data.name === "string" ? data.name : "(无名)",
            data,
        });
    }
}

if (!packages.length) {
    console.error("未发现任何 workspace 包，检查脚本可能需要调整。");
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 检查 1：包名纪律（依赖声明不写回上游名）
// ---------------------------------------------------------------------------

const UPSTREAM_NAME_RE = /^(?:koishi|@koishijs\/.+)$/;

for (const pkg of packages) {
    for (const block of DEP_BLOCKS) {
        for (const dep of depNames(pkg.data, block)) {
            if (!UPSTREAM_NAME_RE.test(dep)) continue;
            report(
                pkg.file,
                `包名纪律：${block} 引用上游名 "${dep}"（应指向 @koishi-ce/*）`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// 检查 2：元数据统一（顶层类型字段一律 types）
// ---------------------------------------------------------------------------

for (const pkg of packages) {
    if ("typings" in pkg.data) {
        report(pkg.file, "元数据统一：顶层类型字段用了旧别名 typings，应统一为 types");
    }
}

// ---------------------------------------------------------------------------
// 检查 3：ESM-only 形态
// ---------------------------------------------------------------------------

/** exports 条件树中是否出现 require 条件。 */
function hasRequireCondition(value: unknown): boolean {
    const record = asRecord(value);
    if (!record) return false;
    return Object.entries(record).some(
        ([key, child]) => key === "require" || hasRequireCondition(child),
    );
}

for (const pkg of packages) {
    if (pkg.data.type !== "module") {
        const actual = typeof pkg.data.type === "string" ? `"${pkg.data.type}"` : "未声明";
        report(pkg.file, `ESM-only：type 应为 "module"（实为 ${actual}）`);
    }
    if (hasRequireCondition(pkg.data.exports)) {
        report(pkg.file, "ESM-only：exports 出现 require 条件（产物只允许 default 兜底的 ESM）");
    }
    if (typeof pkg.data.main === "string" && /\.(?:cjs|js)$/.test(pkg.data.main)) {
        report(
            pkg.file,
            `ESM-only：main 指向 CJS 形态 "${pkg.data.main}"（.mjs 或源码 .ts 合法）`,
        );
    }
}

// ---------------------------------------------------------------------------
// 检查 4：依赖方向
// ---------------------------------------------------------------------------

/** peer 的宿主契约：唯一的合法形态。 */
const PEER_NAME = "@koishi-ce/koishi";
const PEER_RANGE = "^1.0.0";

for (const pkg of packages) {
    const peer = asRecord(pkg.data.peerDependencies);
    if (!peer) {
        report(pkg.file, `依赖方向：缺少 peerDependencies（应声明 ${PEER_NAME} ${PEER_RANGE}）`);
    } else {
        const range = peer[PEER_NAME];
        if (typeof range !== "string") {
            report(pkg.file, `依赖方向：peerDependencies 未声明 ${PEER_NAME}`);
        } else if (range !== PEER_RANGE) {
            report(
                pkg.file,
                `依赖方向：peerDependencies 的 ${PEER_NAME} range 为 "${range}"，本仓约定逐字为 "${PEER_RANGE}"`,
            );
        }
        for (const dep of Object.keys(peer)) {
            if (dep === PEER_NAME) continue;
            report(
                pkg.file,
                `依赖方向：peerDependencies 声明了 "${dep}" —— 本仓三包互不依赖，包间关系只经 ${PEER_NAME} 的宿主契约`,
            );
        }
    }

    for (const block of ["dependencies", "peerDependencies"] as const) {
        for (const dep of depNames(pkg.data, block)) {
            if (!dep.startsWith("@koishi-ce/")) continue;
            if (dep === PEER_NAME) continue;
            report(
                pkg.file,
                `依赖方向：${block} 声明了同组织包 "${dep}" —— 三包互不依赖；确需协作时经 peer 的宿主契约或 devDependencies（测试面）`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// 检查 5：源码导入纪律（不 import 上游名）
// ---------------------------------------------------------------------------

/**
 * 排除的路径段：第三方区 / 构建产物 / 测试数据 / 覆盖率报告。测试文件本身
 * 会真实 import 被测模块，故**不**排除。
 */
const EXCLUDED_SEGMENTS = ["node_modules", "lib", "dist", "coverage"];

const IMPORT_RE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(["'])(koishi|@koishijs\/[^"']*)\1/g;

for (const abs of new Bun.Glob("packages/**/*.{ts,mts,cts,js,mjs,cjs,yml}").scanSync({
    cwd: ROOT,
    dot: true,
    absolute: true,
})) {
    const file = toPosix(relative(ROOT, abs));
    if (EXCLUDED_SEGMENTS.some((segment) => file.includes(`/${segment}/`))) continue;
    const text = await Bun.file(abs).text();
    for (const match of text.matchAll(IMPORT_RE)) {
        const line = text.slice(0, match.index ?? 0).split("\n").length;
        report(
            `${file}:${line}`,
            `包名纪律：源码导入上游名 "${match[2] ?? ""}"（应导入 @koishi-ce/*）`,
        );
    }
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

if (issues.length > 0) {
    console.error(`check:packages 发现 ${issues.length} 处违规：\n`);
    for (const issue of issues) console.error(issue);
    process.exit(1);
}
console.log(
    `check:packages 通过：${packages.length} 个 workspace 包（${packages.map((pkg) => pkg.name).join(" / ")}）元数据与导入纪律无违规。`,
);
