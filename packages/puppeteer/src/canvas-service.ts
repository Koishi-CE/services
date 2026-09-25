// SPDX-License-Identifier: MIT
// Copyright (c) 2026-present Oppenheymu and Koishi-CE contributors.
// 约定面（Canvas / CanvasRenderingContext2D / Image）与 CanvasService 基类的
// 语义移植自上游 @koishijs/canvas（MIT © Shigma et al.），本包自建以解除对
// 上游 npm 名的依赖（Koishi-CE 生态纪律：代码内导入一律 @koishi-ce/*）。

/**
 * canvas 服务约定面。
 *
 * 与 DOM 全量 CanvasRenderingContext2D 的差异（转译实现的能力边界，见 canvas.ts）：
 * 绘图调用经 CDP 转译在浏览器页内执行，只支持「void 方法 + 可 JSON 序列化参数」，
 * 因此不含 createLinearGradient / createPattern / measureText / getImageData 等
 * 返回对象或需要回读像素的 API；渐变/图案类的样式属性也收窄为 CSS 字符串。
 */
import type { Context } from "@koishi-ce/koishi";
import { h, Service } from "@koishi-ce/koishi";

export interface Canvas {
    width: number;
    height: number;
    getContext(type: "2d"): CanvasRenderingContext2D;
    toBuffer(type: "image/png"): Promise<Buffer>;
    toDataURL(type: "image/png"): Promise<string>;
    dispose(): Promise<void>;
}

/** 2D 上下文的可转译状态面（转译器以属性赋值语句同步到页内） */
export interface Canvas2DState {
    direction: "ltr" | "rtl" | "inherit";
    fillStyle: string;
    filter: string;
    font: string;
    fontKerning: "auto" | "none" | "normal";
    /** CSS font-stretch 关键字（DOM 类型还允许百分比，此处收窄为常用关键字） */
    fontStretch: string;
    fontVariantCaps:
        | "normal"
        | "small-caps"
        | "all-small-caps"
        | "petite-caps"
        | "all-petite-caps"
        | "unicase"
        | "titling-caps";
    globalAlpha: number;
    globalCompositeOperation: string;
    imageSmoothingEnabled: boolean;
    imageSmoothingQuality: "low" | "medium" | "high";
    letterSpacing: string;
    lineCap: "butt" | "round" | "square";
    lineDashOffset: number;
    lineJoin: "bevel" | "round" | "miter";
    lineWidth: number;
    miterLimit: number;
    shadowBlur: number;
    shadowColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    strokeStyle: string;
    textAlign: "start" | "end" | "left" | "right" | "center";
    textBaseline: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
    textRendering: "auto" | "optimizeSpeed" | "optimizeLegibility" | "geometricPrecision";
    wordSpacing: string;
}

export interface CanvasRenderingContext2D extends Canvas2DState {
    readonly canvas: Canvas;
    arc(
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        counterclockwise?: boolean,
    ): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    beginPath(): void;
    bezierCurveTo(
        cp1x: number,
        cp1y: number,
        cp2x: number,
        cp2y: number,
        x: number,
        y: number,
    ): void;
    clearRect(x: number, y: number, w: number, h: number): void;
    clip(fillRule?: "nonzero" | "evenodd"): void;
    closePath(): void;
    drawImage(image: Canvas | Image, dx: number, dy: number): void;
    drawImage(image: Canvas | Image, dx: number, dy: number, dw: number, dh: number): void;
    drawImage(
        image: Canvas | Image,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
    ): void;
    ellipse(
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number,
        counterclockwise?: boolean,
    ): void;
    fill(fillRule?: "nonzero" | "evenodd"): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    lineTo(x: number, y: number): void;
    moveTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    restore(): void;
    rotate(angle: number): void;
    roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void;
    save(): void;
    scale(x: number, y: number): void;
    setLineDash(segments: number[]): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    stroke(): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    strokeText(text: string, x: number, y: number, maxWidth?: number): void;
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    translate(x: number, y: number): void;
}

export interface Image {
    readonly naturalWidth: number;
    readonly naturalHeight: number;
    dispose(): Promise<void>;
}

/** canvas 服务基类：createCanvas / loadImage 由实现方提供，render 是通用模板 */
export abstract class CanvasService extends Service {
    constructor(ctx: Context) {
        super(ctx, "canvas");
    }

    abstract createCanvas(width: number, height: number): Promise<Canvas>;

    abstract loadImage(
        source: string | URL | Buffer | ArrayBufferLike | ArrayBufferView,
    ): Promise<Image>;

    async render(
        width: number,
        height: number,
        callback: (ctx: CanvasRenderingContext2D) => void | Promise<void>,
    ): Promise<h> {
        const canvas = await this.createCanvas(width, height);
        try {
            await callback(canvas.getContext("2d"));
            const buffer = await canvas.toBuffer("image/png");
            return h.image(buffer, "image/png");
        } finally {
            await canvas.dispose();
        }
    }
}

declare module "@koishi-ce/koishi" {
    interface Context {
        /** canvas 绘图服务（本插件经 CDP 转译实现，零原生依赖） */
        canvas: CanvasService;
    }
}
