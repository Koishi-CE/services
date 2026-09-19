// 词典 yml 导入的类型面：ctx.i18n.define 只读键值树，
// 具体词条结构不做静态约束（与各包 locales/*.yml 实际内容对应）。
declare module "*.yml" {
    const dict: Record<string, unknown>;
    export default dict;
}
