/** 金额显示：整数元，千分位；未定价返回 null 由调用方处理文案。 */
export const yuan = (n: number) =>
  "¥" + Math.round(n).toLocaleString("zh-CN");
export const yuanPrecise = (n: number) =>
  "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
/** 顶栏这类空间紧的位置：一万以上按「万」显示一位小数。 */
export const yuanShort = (n: number) =>
  Math.abs(n) >= 10000 ? `¥${(n / 10000).toFixed(1)} 万` : yuan(n);
