// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.
// 重构移植自 koishijs/koishi-plugin-puppeteer 的 packages/core/src/canvas.ts
// （MIT © Shigma et al.），移植基线：上游 master c4d8bfe（2024-08-15，
// 对应 npm koishi-plugin-puppeteer 3.9.0）。

/**
 * canvas 服务实现：纯 CDP 代理转译，零原生依赖。
 *
 * 机制：2D 绘图调用经 Proxy 转译为 JS 语句收集进类型化队列，`toDataURL` 时
 * 包裹为 IIFE 经 `page.evaluate` 在浏览器页内一次性执行。相对上游的重构点：
 * - 语句队列由裸 string[] 改为类型化联合（assign / call），渲染与断言均可锁定；
 * - 转译代理的宿主状态由 `as unknown as` 强转的假上下文改为显式 Canvas2DState；
 * - `as any` 清零，页内返回值一律经类型守卫收窄；
 * - 依赖面最小化：页对象只按 `EvaluablePage`（evaluate 能力）注入，便于测试替身；
 * - 生命周期收口：常驻页未就绪时 createCanvas / loadImage 显式报错，stop 幂等。
 */
import type { Context } from "@koishi-ce/koishi";
import type { Page } from "puppeteer-core";
import type { Canvas, Canvas2DState, CanvasRenderingContext2D, Image } from "./canvas-service.ts";
import { CanvasService } from "./canvas-service.ts";
import { gotoBootstrapPage } from "./html.ts";
import { isRecord, toBase64 } from "./utils.ts";

/** 转译所需的页面最小能力面（真实 Page 结构即满足） */
export interface EvaluablePage {
    evaluate(expression: string): Promise<unknown>;
}

const kElement = Symbol("kElement");

/** 可被 drawImage 等调用引用的页内元素（参数序列化时替换为 DOM 查询表达式） */
export interface ElementRef {
    readonly [kElement]: true;
    readonly selector: string;
}

export function isElementRef(value: unknown): value is ElementRef {
    return typeof value === "object" && value !== null && kElement in value;
}

/**
 * 类型化语句队列：
 * - assign：属性赋值（ctx.fillStyle = "#fff"）
 * - call：方法调用（ctx.fillRect(0, 0, 10, 20)）
 * value / args 均已是序列化后的 JS 字面量文本。
 */
export type CanvasStatement =
    | { readonly kind: "assign"; readonly prop: string; readonly value: string }
    | { readonly kind: "call"; readonly method: string; readonly args: readonly string[] };

export function renderStatement(stmt: CanvasStatement): string {
    if (stmt.kind === "assign") return `ctx.${stmt.prop} = ${stmt.value};`;
    return `ctx.${stmt.method}(${stmt.args.join(", ")});`;
}

function serializeArg(value: unknown): string {
    if (isElementRef(value)) return value.selector;
    const json = JSON.stringify(value);
    return json === undefined ? "undefined" : json;
}

/** 与浏览器 2D 上下文出厂默认一致的本地状态（读取时直接返回，不回页查询） */
const INITIAL_STATE: Canvas2DState = {
    direction: "inherit",
    fillStyle: "#000000",
    filter: "none",
    font: "10px sans-serif",
    fontKerning: "auto",
    fontStretch: "normal",
    fontVariantCaps: "normal",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
    letterSpacing: "0px",
    lineCap: "butt",
    lineDashOffset: 0,
    lineJoin: "miter",
    lineWidth: 1,
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    strokeStyle: "#000000",
    textAlign: "start",
    textBaseline: "alphabetic",
    textRendering: "auto",
    wordSpacing: "0px",
};

type StateTarget = Canvas2DState & { readonly canvas: Canvas };

/**
 * 构建转译代理：状态字段读写落在本地状态并同步为语句；未声明成员（绘图方法）
 * 的调用转译为 call 语句。返回值经一次结构合法的下行断言对齐约定面
 * （StateTarget 是 CanvasRenderingContext2D 的结构子集）。
 */
function createContextProxy(canvas: Canvas, stmts: CanvasStatement[]): CanvasRenderingContext2D {
    const target: StateTarget = { ...INITIAL_STATE, canvas };
    const handler: ProxyHandler<StateTarget> = {
        get(dest, prop, receiver) {
            if (typeof prop === "symbol" || Reflect.has(dest, prop)) {
                return Reflect.get(dest, prop, receiver);
            }
            return (...args: unknown[]) => {
                stmts.push({ kind: "call", method: prop, args: args.map(serializeArg) });
            };
        },
        set(dest, prop, value, receiver) {
            if (typeof prop === "symbol" || !Reflect.has(dest, prop)) {
                return false;
            }
            stmts.push({ kind: "assign", prop, value: serializeArg(value) });
            return Reflect.set(dest, prop, value, receiver);
        },
    };
    return new Proxy(target, handler) as CanvasRenderingContext2D;
}

abstract class BaseElement implements ElementRef {
    readonly [kElement] = true as const;
    protected readonly page: EvaluablePage;
    id: string | null;

    constructor(page: EvaluablePage, id: string) {
        this.page = page;
        this.id = id;
    }

    get selector(): string {
        return `document.querySelector("#${this.id}")`;
    }

    async dispose(): Promise<void> {
        await this.page.evaluate(`${this.selector}?.remove()`);
        this.id = null;
    }
}

export class CanvasElement extends BaseElement implements Canvas, ElementRef {
    readonly width: number;
    readonly height: number;
    private readonly stmts: CanvasStatement[] = [];
    private readonly ctx2d: CanvasRenderingContext2D;

    constructor(page: EvaluablePage, id: string, width: number, height: number) {
        super(page, id);
        this.width = width;
        this.height = height;
        this.ctx2d = createContextProxy(this, this.stmts);
    }

    getContext(type: "2d"): CanvasRenderingContext2D {
        if (type !== "2d") throw new Error("puppeteer canvas 只支持 2d 上下文");
        return this.ctx2d;
    }

    async toDataURL(type: "image/png"): Promise<string> {
        if (!this.id) throw new Error("canvas has been disposed");
        try {
            const body = this.stmts.map(renderStatement).join("\n  ");
            this.stmts.length = 0;
            await this.page.evaluate(
                `(async (ctx) => {\n  ${body}\n})(${this.selector}.getContext('2d'))`,
            );
            const url: unknown = await this.page.evaluate(
                `${this.selector}.toDataURL(${JSON.stringify(type)})`,
            );
            if (typeof url !== "string") throw new Error("页内 toDataURL 未返回字符串");
            return url;
        } catch (err) {
            await this.dispose();
            throw err;
        }
    }

    async toBuffer(type: "image/png"): Promise<Buffer> {
        const url = await this.toDataURL(type);
        return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    }
}

interface ImageSize {
    width: number;
    height: number;
}

function isImageSize(value: unknown): value is ImageSize {
    return (
        isRecord(value) && typeof value["width"] === "number" && typeof value["height"] === "number"
    );
}

export class ImageElement extends BaseElement implements Image, ElementRef {
    naturalWidth = 0;
    naturalHeight = 0;
    private readonly ctx: Context;
    private source: string | URL | Buffer | ArrayBufferLike | ArrayBufferView;

    constructor(
        ctx: Context,
        page: EvaluablePage,
        id: string,
        source: string | URL | Buffer | ArrayBufferLike | ArrayBufferView,
    ) {
        super(page, id);
        this.ctx = ctx;
        this.source = source;
    }

    async initialize(): Promise<void> {
        const base64 = await this.readBase64();
        const size: unknown = await this.page.evaluate(
            `loadImage(${JSON.stringify(this.id)}, ${JSON.stringify(base64)})`,
        );
        if (!isImageSize(size)) throw new Error("页内 loadImage 未返回有效的图像尺寸");
        this.naturalWidth = size.width;
        this.naturalHeight = size.height;
    }

    private async readBase64(): Promise<string> {
        let source = this.source;
        if (source instanceof URL) source = source.href;
        if (typeof source === "string") {
            // proxyAgent 在该版本类型下为必填：将服务配置原样回填（空值运行时无副作用）
            const proxyAgent = this.ctx.http.config.proxyAgent;
            const data = await this.ctx.http.get(source, {
                responseType: "arraybuffer",
                proxyAgent,
            });
            if (!(data instanceof ArrayBuffer)) throw new Error("http 拉取图像未返回 ArrayBuffer");
            return toBase64(data);
        }
        if (Buffer.isBuffer(source)) return source.toString("base64");
        return toBase64(source);
    }
}

/** canvas 服务：`ctx.plugin(Puppeteer)` 时随插件挂载，常驻引导页承载页内执行 */
export class PuppeteerCanvas extends CanvasService {
    static inject = ["puppeteer", "http"];

    private residentPage?: Page | undefined;
    private counter = 0;

    override async start(): Promise<void> {
        const page = await this.ctx.puppeteer.page();
        try {
            await gotoBootstrapPage(page);
            this.residentPage = page;
        } catch (err) {
            await page.close();
            throw err;
        }
    }

    override async stop(): Promise<void> {
        const page = this.residentPage;
        this.residentPage = undefined;
        await page?.close();
    }

    override async createCanvas(width: number, height: number): Promise<Canvas> {
        const page = this.requirePage();
        const name = `canvas_${++this.counter}`;
        await page.evaluate(
            [
                `const ${name} = document.createElement('canvas');`,
                `${name}.width = ${width};`,
                `${name}.height = ${height};`,
                `${name}.id = ${JSON.stringify(name)};`,
                `document.body.appendChild(${name});`,
            ].join("\n"),
        );
        return new CanvasElement(page, name, width, height);
    }

    override async loadImage(
        source: string | URL | Buffer | ArrayBufferLike | ArrayBufferView,
    ): Promise<Image> {
        const page = this.requirePage();
        const id = `image_${++this.counter}`;
        const image = new ImageElement(this.ctx, page, id, source);
        await image.initialize();
        return image;
    }

    private requirePage(): Page {
        if (!this.residentPage) {
            throw new Error("canvas 服务的常驻页尚未就绪（puppeteer 浏览器未启动或已停止）");
        }
        return this.residentPage;
    }
}

export default PuppeteerCanvas;
