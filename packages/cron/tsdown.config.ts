import { defineConfig } from "tsdown";

// 源码 ESM，产物 ESM-only（.mjs + d.ts）：Koishi-CE 宿主的插件加载链由 Bun 的
// require() 直接加载 ESM（exports 以 default 条件兜底），与 @koishi-ce 框架
// 生态保持一致；Node 官方宿主不在本仓目标内（peer 即 @koishi-ce/koishi）。
const extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "lib",
    format: "esm",
    platform: "node",
    dts: true,
    outExtensions: () => ({ js: ".mjs", dts: ".d.ts" }),
    clean: true,
    inputOptions: {
        resolve: { extensions },
    },
    deps: {
        // 依赖全部 external（@koishi-ce 框架为 peer 单实例），不打进产物
        bundle: false,
        dts: {
            // koishi 生态 d.ts 含 namespace 成员 re-export，dts 打包无法解析，
            // 生成 d.ts 时保持外部引用（消费端由 peer 提供类型）
            neverBundle: [/^@koishi-ce/, /^@satorijs\//, /^cordis/, /^minato/, /^cosmokit/],
        },
    },
});
