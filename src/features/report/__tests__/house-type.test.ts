import { describe, expect, it } from "vitest";
import { AI_EXAMPLE_PLANS } from "@/features/ai-design/model/example-plans";
import { TEMPLATE_PRESETS, blankDesign } from "@/lib/floor-plan/templates";
import { houseTypeLabel, houseTypeOf } from "../model/house-type";

const typeOf = (...names: string[]) => houseTypeOf(names.map((name) => ({ name })));

describe("户型（几室几厅几卫）", () => {
  it("与内置模板、AI 范例户型自己写的户型一致", () => {
    for (const preset of TEMPLATE_PRESETS) expect(houseTypeLabel(houseTypeOf(preset.build().rooms))).toBe(preset.layout);
    for (const plan of AI_EXAMPLE_PLANS) expect(houseTypeLabel(houseTypeOf(plan.design().rooms))).toBe(plan.layout);
  });

  it("卧室、书房、儿童房这类居室算室；客厅、餐厅算厅，客餐厅算两厅；卫生间算卫", () => {
    expect(typeOf("主卧", "次卧", "儿童房", "书房", "客厅", "餐厅", "主卫", "客卫")).toEqual({ bedrooms: 4, halls: 2, bathrooms: 2 });
    expect(typeOf("卧室 2", "客餐厅", "卫生间")).toEqual({ bedrooms: 1, halls: 2, bathrooms: 1 });
    expect(typeOf("起居室", "浴室", "洗手间", "老人房", "多功能室")).toEqual({ bedrooms: 2, halls: 1, bathrooms: 2 });
  });

  it("飘窗、阳台、衣帽间、过道、厨房等附属与服务空间不计，名称里带「卧 / 房 / 厅」也一样", () => {
    const names = ["主卧飘窗", "卧室阳台", "洗衣阳台", "衣帽间", "储藏室", "玄关过道", "门厅", "厨房", "洗衣房", "设备房", "楼梯间", "地下室", "露台"];
    expect(typeOf(...names)).toEqual({ bedrooms: 0, halls: 0, bathrooms: 0 });
  });

  it("写法：十以内用中文数字，「两」不写「二」；一间也识别不出时写「—」", () => {
    expect(houseTypeLabel({ bedrooms: 2, halls: 1, bathrooms: 0 })).toBe("两室一厅零卫");
    expect(houseTypeLabel({ bedrooms: 10, halls: 3, bathrooms: 4 })).toBe("十室三厅四卫");
    expect(houseTypeLabel({ bedrooms: 12, halls: 2, bathrooms: 3 })).toBe("12室两厅三卫");
    expect(houseTypeLabel(typeOf("露台", "车库"))).toBe("—");
    expect(houseTypeLabel(houseTypeOf([]))).toBe("—");
    // 空白户型的默认房间「房间 1」按一间居室计。
    expect(houseTypeLabel(houseTypeOf(blankDesign().rooms))).toBe("一室零厅零卫");
  });
});
