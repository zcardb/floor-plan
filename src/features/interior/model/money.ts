/** 金额显示：整数元，千分位；未定价返回 null 由调用方处理文案。 */
export const yuan = (n: number) =>
  "¥" + Math.round(n).toLocaleString("zh-CN");
export const yuanPrecise = (n: number) =>
  "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
