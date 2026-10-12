import type { Room } from "./types";

/**
 * 户型：几室几厅几卫。
 *
 * 房间没有「用途」字段，只能按名称识别，所以是参考值。口径与内置模板、AI 范例户型的写法一致：
 * 卧室、书房、儿童房这类居室都算「室」，「客餐厅」算两厅；飘窗、阳台、衣帽间、过道、厨房等附属与服务空间不计。
 * 与 ai/examples.ts 的 roomKindOf 同一思路（按名称关键词、顺序有意义），但那边给 AI 范例分类，不数「室」。
 */
export interface HouseType {
  bedrooms: number;
  halls: number;
  bathrooms: number;
}

/**
 * 按顺序匹配，先中先得：「主卧飘窗」「卧室阳台」「洗衣房」「厨房」先归不计的空间，
 * 「主卫」「浴室」先归卫，「起居室」先归厅，剩下带「卧 / 房 / 室」的才算室。
 */
const RULES: [kind: keyof HouseType | null, pattern: RegExp][] = [
  [null, /飘窗|阳台|露台|衣帽|储|杂物|工具|过道|走廊|玄关|门厅|过厅|电梯|楼梯|车库|地下室|设备|机房|洗衣|厨/],
  ["bathrooms", /卫|浴|厕|洗手间|盥洗/],
  ["halls", /厅|起居/],
  ["bedrooms", /卧|房|室/],
];
/** 客厅与餐厅合在一个房间里（「客餐厅」「餐客一体」）按两厅计。 */
const TWO_HALLS = /客.*餐|餐.*客/;

export function houseTypeOf(rooms: Pick<Room, "name">[]): HouseType {
  const type: HouseType = { bedrooms: 0, halls: 0, bathrooms: 0 };
  for (const { name } of rooms) {
    const kind = RULES.find(([, pattern]) => pattern.test(name))?.[0];
    if (kind) type[kind] += kind === "halls" && TWO_HALLS.test(name) ? 2 : 1;
  }
  return type;
}

const NUMERALS = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];
const numeral = (n: number) => NUMERALS[n] ?? String(n);

/** 「三室两厅两卫」；一间也没识别出来时写「—」。 */
export function houseTypeLabel({ bedrooms, halls, bathrooms }: HouseType): string {
  if (!bedrooms && !halls && !bathrooms) return "—";
  return `${numeral(bedrooms)}室${numeral(halls)}厅${numeral(bathrooms)}卫`;
}
