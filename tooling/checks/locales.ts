// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.

/**
 * 词典门禁（零依赖，bun 直跑）。
 *
 * 用法：bun tooling/checks/locales.ts
 *
 * 逐个检查 packages 下各包的 locales 目录：
 *
 *   1. 键对齐：目录内其他语种文件的键路径集合与基准 zh-CN.yml 逐键一致
 *      （缺失 / 多余键均报告；数组下标也参与键路径，保证列表形态词典同构）；
 *   2. 语种齐全：词典目录存在即要求七语种齐全（zh-CN 基准 + zh-TW /
 *      en-US / ja-JP / fr-FR / de-DE / ru-RU）；
 *   3. 假翻译：拉丁 / 西里尔语种（en-US / fr-FR / de-DE / ru-RU）的叶值若仍含
 *      汉字即视为占位。ja-JP 正常译文大量用汉字、zh-TW 与简体同源，均无法按
 *      字形区分真伪，不参与此项；
 *   4. 存在但未 import（本仓专属，防回归决策点 6）：packages 下的 locales
 *      目录内每个 yml 都必须被**同包**源码 import。词典文件躺在磁盘上但没进
 *      ctx.i18n.define() 时，运行时不会有任何报错——只是该语种静默缺失，只有
 *      产物里的 lib/assets 拷贝物才看得出来。故在门禁层面按「文件 → import
 *      语句」对账；
 *   5. koishi.locales 声明必须 ⊆ 实际（决策点 5 口径 A）：package.json 的
 *      koishi.locales 是语言**前缀**（zh 覆盖 zh-CN / zh-TW，en 覆盖 en-US），
 *      每一项都必须有对应的实际语种文件，不得声明不存在的语种。反方向不强制
 *      ——但声明是宿主与文档的承诺面，语种补齐后应同步。
 *
 * 发现任何问题时退出码置 1。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** 仓库根目录（本脚本位于 tooling/checks/ 下）。 */
const ROOT = resolve(import.meta.dirname, "../..");

/** 全仓标准的 7 个语种（zh-CN 为基准语种）。 */
const LOCALES = [
    "zh-CN",
    "zh-TW",
    "en-US",
    "ja-JP",
    "fr-FR",
    "de-DE",
    "ru-RU",
] as const;

/**
 * 参与假翻译检测的语种：仅拉丁 / 西里尔书写的语种。理由见文件头规则 3。
 */
const FAKE_CHECK_LOCALES = new Set(["en-US", "fr-FR", "de-DE", "ru-RU"]);

/** 需要逐文件对账 import 的源码扩展名（测试文件同样计入：它们也会 import 词典）。 */
const SOURCE_EXTENSIONS = ["ts", "mts", "cts"] as const;

/** path 分隔符归一为 posix（Win32 下 glob 与 relative 都可能返回反斜杠）。 */
function toPosix(path: string): string {
    return path.split(sep).join("/");
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/**
 * 递归提取词典对象的全部键路径。
 * - 普通对象的键拼入路径后继续下钻；
 * - 数组以下标拼入路径（保证列表形态词典的同构检查）；
 * - 其余值视为叶子，把末级键名计入（空对象除外）。
 */
function extractKeys(node: unknown, prefix: string, out: Set<string>): void {
    if (Array.isArray(node)) {
        node.forEach((item, index) => {
            extractKeys(item, `${prefix}.${index}`, out);
        });
        return;
    }
    if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            extractKeys(value, prefix ? `${prefix}.${key}` : key, out);
        }
        return;
    }
    if (prefix) out.add(prefix);
}

/** 判断文本是否包含汉字（用于非中文语种的假翻译检测）。 */
function containsChinese(text: string): boolean {
    return /[\u4e00-\u9fa5]/.test(text);
}

/** 收集全部报警，最后统一输出。 */
const problems: string[] = [];

// ---------------------------------------------------------------- 收集与逐个检查

const localeDirs = [
    ...new Bun.Glob("packages/*/locales").scanSync({
        cwd: ROOT,
        dot: true,
        absolute: true,
        onlyFiles: false,
    }),
].sort();

if (!localeDirs.length) {
    // 本仓当前仅 am-i-alt 带词典；一个都没有时说明目录约定变了，值得人工看一眼
    // （而不是静默「零问题」通过）。
    console.error("未找到任何 packages/*/locales 目录，检查脚本可能需要调整。");
    process.exit(1);
}

/** 语种文件被源码 import 的两种形态：相对路径（`../locales/x.yml`）与包内路径。 */
const IMPORT_RE = /from\s*["']([^"']*\blocales\/[^"']+\.ya?ml)["']/g;

for (const dir of localeDirs) {
    const relDir = toPosix(relative(ROOT, dir));
    /** 包目录（相对仓库根的 posix 路径），如 packages/am-i-alt。 */
    const pkgDir = relDir.replace(/\/locales$/, "");
    const pkgJsonPath = join(ROOT, pkgDir, "package.json");
    const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
    const present = new Set(files.map((name) => name.replace(/\.ya?ml$/, "")));

    // ---- 规则 2：语种齐全（基准文件缺失时只能跳过该目录） ----
    if (!present.has("zh-CN")) {
        problems.push(`${relDir}：缺少基准文件 zh-CN.yml`);
        continue;
    }
    for (const locale of LOCALES) {
        if (!present.has(locale)) {
            problems.push(`${relDir}：缺少 ${locale}.yml`);
        }
    }

    // ---- 规则 1 与 3：键对齐 + 假翻译 ----
    const baseKeys = new Set<string>();
    try {
        const base = Bun.YAML.parse(readFileSync(join(dir, "zh-CN.yml"), "utf8"));
        extractKeys(base, "", baseKeys);
    } catch (error) {
        problems.push(`${relDir}/zh-CN.yml：YAML 解析失败（${String(error)}）`);
        continue;
    }

    for (const locale of present) {
        if (locale === "zh-CN") continue;
        const relFile = `${relDir}/${locale}.yml`;
        let parsed: unknown;
        try {
            parsed = Bun.YAML.parse(readFileSync(join(dir, `${locale}.yml`), "utf8"));
        } catch (error) {
            problems.push(`${relFile}：YAML 解析失败（${String(error)}）`);
            continue;
        }

        const keys = new Set<string>();
        extractKeys(parsed, "", keys);
        for (const key of baseKeys) {
            if (!keys.has(key)) problems.push(`${relFile}：缺少键 ${key}`);
        }
        for (const key of keys) {
            if (!baseKeys.has(key)) problems.push(`${relFile}：多余键 ${key}`);
        }

        if (!FAKE_CHECK_LOCALES.has(locale)) continue;
        const walk = (node: unknown, path: string): void => {
            if (Array.isArray(node)) {
                node.forEach((item, index) => walk(item, `${path}.${index}`));
            } else if (node && typeof node === "object") {
                for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
                    walk(value, path ? `${path}.${key}` : key);
                }
            } else if (typeof node === "string" && containsChinese(node)) {
                problems.push(`${relFile}：键 ${path} 疑似假翻译（值仍为中文）`);
            }
        };
        walk(parsed, "");
    }

    // ---- 规则 4：存在但未 import（同包源码对账） ----
    /** 源码里被 import 的词典文件名（取 specifier 的 basename）。 */
    const imported = new Set<string>();
    const sourceGlob = new Bun.Glob(`${pkgDir}/src/**/*.{${SOURCE_EXTENSIONS.join(",")}}`);
    for (const abs of sourceGlob.scanSync({ cwd: ROOT, dot: true, absolute: true })) {
        const text = readFileSync(abs, "utf8");
        for (const match of text.matchAll(IMPORT_RE)) {
            const specifier = match[1];
            if (!specifier) continue;
            imported.add(specifier.slice(specifier.lastIndexOf("/") + 1));
        }
    }
    for (const file of files) {
        if (!imported.has(file)) {
            problems.push(
                `${relDir}/${file}：存在但未被同包源码 import（该语种不会进 ctx.i18n.define()，产物里也不会被拷入 lib/assets）`,
            );
        }
    }

    // ---- 规则 5：koishi.locales 声明 ⊆ 实际 ----
    if (!existsSync(pkgJsonPath)) {
        problems.push(`${pkgDir}/package.json：不存在（无法核对 koishi.locales 声明）`);
        continue;
    }
    const pkgJson = asRecord(JSON.parse(readFileSync(pkgJsonPath, "utf8")));
    const koishi = asRecord(pkgJson?.koishi);
    const declared = koishi?.locales;
    if (declared !== undefined && !Array.isArray(declared)) {
        problems.push(`${pkgDir}/package.json：koishi.locales 不是数组`);
        continue;
    }
    for (const entry of (declared ?? []) as unknown[]) {
        if (typeof entry !== "string" || entry === "") {
            problems.push(`${pkgDir}/package.json：koishi.locales 含非字符串项 ${String(entry)}`);
            continue;
        }
        const covered = [...present].some(
            (locale) => locale === entry || locale.startsWith(`${entry}-`),
        );
        if (!covered) {
            problems.push(
                `${pkgDir}/package.json：koishi.locales 声明了 "${entry}"，但 ${relDir}/ 下没有对应语种文件（声明必须是实际语种的子集）`,
            );
        }
    }
}

// ---------------------------------------------------------------- 汇总输出

if (problems.length) {
    console.error(`词典检查发现 ${problems.length} 个问题：`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}
console.log(
    `词典检查通过：${localeDirs.length} 个词典目录，键对齐 / 七语种齐全 / 假翻译 / import 对账 / koishi.locales 子集均无问题。`,
);
