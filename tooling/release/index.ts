// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 发布链（零第三方依赖，bun 直跑）。
 *
 * 用法：
 *   bun tooling/release/index.ts status             只读概览：pending changeset、各包本地 vs registry 版本
 *   bun tooling/release/index.ts version            消费 .changeset/ 条目并刷新 bun.lock（落地改动）
 *   bun tooling/release/index.ts build              按包构建（= bun run --filter './packages/*' build）
 *   bun tooling/release/index.ts test               与门禁同一口径的测试
 *   bun tooling/release/index.ts publish            逐包发布到 registry（已发布的版本自动跳过）
 *
 * 旗标：`--dry-run`（只打印计划，不落盘、不发包；对 publish 尤其有用）。
 *
 * 设计取舍（本仓按小仓裁剪，不搬旗舰仓 1857 行的发布引擎）：
 *   - **不做拓扑序**：三个包之间没有互相依赖，不存在发布先后约束。
 *   - **不做 workspace 协议改写**：本仓纪律本就禁用 `workspace:*`（跨包依赖写 semver
 *     range，见 AGENTS.md 基本约束），故没有改写对象。但保留**终局断言**：发布前
 *     扫描每个包的依赖字段，残留 `workspace:` / `file:` / `link:` 直接失败——首发包
 *     一旦带上这类协议就无法回滚（Koishi-CE 主仓 2026-08-31 事故同源教训）。
 *   - **只比对 registry 的实际版本**：不做「所有权预检」与「登录态检查」——OIDC 模式下
 *     npm 换到的是包级短时 token，`npm whoami` / `npm owner ls` 必然失败（见
 *     docs/process/release.md 第 7 节），登录态由 npm 自己校验并给出更准确的报错。
 *
 * 幂等性：已发布版本经 registry 比对自动跳过，重跑安全；**例外**是 npm 暂存区中的
 * 版本（不出现在 registry 的 versions 列表里，重跑必 409），处置见 docs/process/release.md 第 5 节。
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** 仓库根目录（本脚本位于 tooling/release/ 下）。 */
const ROOT = resolve(import.meta.dirname, "../..");

/** registry 查询源（可用 KOISHI_CE_REGISTRY 覆盖，便于对拍私有源）。 */
const REGISTRY = Bun.env.KOISHI_CE_REGISTRY ?? "https://registry.npmjs.org";

/** 禁止出现在依赖字段里的协议前缀：带上就无法回滚，必须拦在发布之前。 */
const FORBIDDEN_PROTOCOLS = ["workspace:", "file:", "link:"] as const;

/** 依赖字段（四个都扫，devDependencies 也会被打进发布物的 manifest）。 */
const DEP_BLOCKS = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
] as const;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const command = args.find((arg) => !arg.startsWith("-"));

function fail(message: string): never {
    console.error(`\n✗ ${message}`);
    process.exit(1);
}

/**
 * `--from-tarballs <目录>`：发布 `prepare` job 打好的 tarball，而不是在包目录里重新打包。
 * 这是 CI 的口径——发布物与构建产物逐字同一份，且 publish job 不必执行任何打包 /
 * 构建期代码（它持有 OIDC token，执行面越小越好）。本地不带该旗标时按包目录发布。
 */
const fromTarballsIndex = args.indexOf("--from-tarballs");
const fromTarballs = fromTarballsIndex === -1 ? undefined : args[fromTarballsIndex + 1];
if (fromTarballsIndex !== -1 && !fromTarballs) fail("--from-tarballs 需要跟一个目录参数。");

/** npm pack 的 tarball 名：作用域名去掉 @，其余非字母数字字符换成 `-`。 */
function tarballName(name: string, version: string): string {
    return `${name.replace(/^@/, "").replace(/[^a-zA-Z0-9-]/g, "-")}-${version}.tgz`;
}

/** 跑一个子进程命令；失败即中断（发布链的每一步都不可降级跳过）。 */
function run(step: string, cmd: string, cmdArgs: string[]): void {
    console.log(`\n── ${step}\n   $ ${cmd} ${cmdArgs.join(" ")}`);
    if (dryRun) {
        console.log("   （--dry-run：跳过执行）");
        return;
    }
    const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: false });
    if (result.status !== 0) fail(`${step} 失败（退出码 ${String(result.status)}）`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

interface Pkg {
    /** 相对仓库根的 posix 路径。 */
    file: string;
    name: string;
    version: string;
    data: Record<string, unknown>;
}

/** 以根 package.json 的 workspaces 声明为准收集包（排除根包自身）。 */
const rootConfig = asRecord(await Bun.file(join(ROOT, "package.json")).json()) ?? {};
const workspaceGlobs = (Array.isArray(rootConfig.workspaces) ? rootConfig.workspaces : []).filter(
    (glob): glob is string => typeof glob === "string",
);

const packages: Pkg[] = [];
for (const glob of workspaceGlobs) {
    for (const abs of new Bun.Glob(`${glob}/package.json`).scanSync({
        cwd: ROOT,
        dot: true,
        absolute: true,
    })) {
        const data = asRecord(await Bun.file(abs).json());
        if (!data) continue;
        if (data.private === true) continue;
        packages.push({
            file: abs.slice(ROOT.length + 1).replaceAll("\\", "/"),
            name: typeof data.name === "string" ? data.name : fail(`${abs} 缺少 name`),
            version:
                typeof data.version === "string" ? data.version : fail(`${abs} 缺少 version`),
            data,
        });
    }
}
if (!packages.length) fail("未发现任何可发布包，检查脚本可能需要调整。");

// ---------------------------------------------------------------- 终局断言

/** 发布前扫描：依赖字段不得残留 workspace / file / link 协议。 */
function assertNoForbiddenProtocols(): void {
    const hits: string[] = [];
    for (const pkg of packages) {
        for (const block of DEP_BLOCKS) {
            const deps = asRecord(pkg.data[block]);
            if (!deps) continue;
            for (const [dep, range] of Object.entries(deps)) {
                if (typeof range !== "string") continue;
                for (const protocol of FORBIDDEN_PROTOCOLS) {
                    if (range.startsWith(protocol)) {
                        hits.push(`${pkg.file} → ${block}.${dep} = "${range}"`);
                    }
                }
            }
        }
    }
    if (hits.length) {
        fail(
            `依赖字段残留不可发布的协议（发布后无法回滚，已中止）：\n${hits.map((hit) => `   - ${hit}`).join("\n")}`,
        );
    }
    console.log(
        `终局断言通过：${packages.length} 个包的依赖字段无 ${FORBIDDEN_PROTOCOLS.join(" / ")} 协议。`,
    );
}

// ---------------------------------------------------------------- registry 侧

/** 某包的已发布版本集合；包从未发布过时返回空集（404 不是错误）。 */
async function publishedVersions(name: string): Promise<Set<string>> {
    // 作用域包的 `/` 必须整体转义（用 replaceAll 而非 replace——后者只换第一处；
    // CodeQL 的 js/incomplete-sanitization 在 PR #9 上正是咬这里，属真实缺陷）。
    const encoded = name.replaceAll("/", "%2f");
    const response = await fetch(`${REGISTRY}/${encoded}`, {
        headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (response.status === 404) return new Set();
    if (!response.ok) fail(`查询 ${name} 的 registry 版本失败：HTTP ${response.status}`);
    const body = asRecord(await response.json());
    const versions = asRecord(body?.versions);
    return new Set(versions ? Object.keys(versions) : []);
}

// ---------------------------------------------------------------- 子命令

const USAGE = `发布链（详见 docs/process/release.md）

用法：bun tooling/release/index.ts <status|version|build|test|publish> [--dry-run]`;

/** status：只读概览（不做任何写入，适合本地与 CI 的干跑）。 */
async function status(): Promise<void> {
    const pending = readdirSync(join(ROOT, ".changeset")).filter(
        (name) => name.endsWith(".md") && name !== "README.md",
    );
    console.log(`pending changeset：${pending.length} 条`);
    for (const name of pending.sort()) console.log(`   - .changeset/${name}`);
    console.log("\n本地版本 vs registry：");
    for (const pkg of packages) {
        const published = await publishedVersions(pkg.name);
        const state = published.has(pkg.version)
            ? "已发布（重跑将跳过）"
            : published.size
              ? "待发布"
              : "从未发布（首发，不可回滚）";
        console.log(`   ${pkg.name}@${pkg.version}  ${state}（registry 上 ${published.size} 个版本）`);
    }
    if (Bun.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
        console.log("\n检测到 OIDC 环境（ACTIONS_ID_TOKEN_REQUEST_URL 已设）：走可信发布，无登录态。");
    }
}

/** version：消费 changeset 并刷新锁文件。 */
function version(): void {
    run("消费 changeset", "bunx", ["changeset", "version"]);
    run("刷新锁文件", "bun", ["install"]);
}

/** publish：逐包发布，registry 上已有同版本则跳过。 */
async function publish(): Promise<void> {
    assertNoForbiddenProtocols();

    // 先算清计划再动手：任一包查询失败都在发包之前暴露出来。
    const plan: { pkg: Pkg; action: "publish" | "skip" }[] = [];
    for (const pkg of packages) {
        const published = await publishedVersions(pkg.name);
        plan.push({ pkg, action: published.has(pkg.version) ? "skip" : "publish" });
    }
    console.log("\n发布计划：");
    for (const { pkg, action } of plan) {
        console.log(`   ${action === "skip" ? "跳过" : "发布"}  ${pkg.name}@${pkg.version}`);
    }

    for (const { pkg, action } of plan) {
        if (action === "skip") continue;
        // 发布对象与工作目录：
        //   --from-tarballs 时发 prepare 打好的 .tgz（发布物与构建产物逐字同一份，
        //     且本 job 不执行任何打包代码）；否则在本包目录里就地打包发布（本地备用链）。
        // 两个旗标都是必须项：
        //   --access public   scoped 包默认受限，不发公开就装不到；
        //   --provenance      CI 的 OIDC 环境下自动附来源证明（本地无 OIDC 时会跳过）。
        const pubArgs = ["publish", "--access", "public", "--provenance"];
        let cwd = join(ROOT, pkg.file, "..");
        if (fromTarballs) {
            const file = resolve(ROOT, fromTarballs, tarballName(pkg.name, pkg.version));
            if (!(await Bun.file(file).exists())) {
                fail(`找不到 ${pkg.name}@${pkg.version} 的发布物：${file}（--from-tarballs 目录内容不符）`);
            }
            pubArgs.push(file);
        }
        console.log(`\n── 发布 ${pkg.name}@${pkg.version}\n   $ npm ${pubArgs.join(" ")}`);
        if (dryRun) {
            console.log("   （--dry-run：跳过执行）");
            continue;
        }
        const result = spawnSync("npm", pubArgs, { cwd, stdio: "inherit", shell: false });
        if (result.status !== 0) {
            fail(
                `发布 ${pkg.name}@${pkg.version} 失败（退出码 ${String(result.status)}）。\n` +
                    "   后续包未发布。排查指引见 docs/process/release.md 第 5 节（暂存区与 409）与第 7 节（OIDC 信任配置）。",
            );
        }
    }
    const toPublish = plan.filter((item) => item.action === "publish").length;
    const skipped = plan.filter((item) => item.action === "skip").length;
    if (dryRun) {
        console.log(`\n（--dry-run：未发包）计划发布 ${toPublish} 个、跳过 ${skipped} 个。`);
    } else {
        console.log(`\n✓ 发布链完成：${toPublish} 个包已发（${skipped} 个跳过）。`);
    }
}

// ---------------------------------------------------------------- 入口

switch (command) {
    case "status":
        await status();
        break;
    case "version":
        version();
        break;
    case "build":
        run("按包构建", "bun", ["run", "--filter", "./packages/*", "build"]);
        break;
    case "test":
        run("测试", "bun", ["test", "--isolate"]);
        break;
    case "publish":
        await publish();
        break;
    default:
        console.error(USAGE);
        process.exit(command === undefined ? 0 : 1);
}
