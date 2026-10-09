/** 材质卡片价格文案：未定价时不带货币和单位。 */
export const cardPrice = (price: number | null | undefined, unit: string) =>
  price === null || price === undefined ? '未定价' : `¥${price} / ${unit}`;
