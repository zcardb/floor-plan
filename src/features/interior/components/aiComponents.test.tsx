import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { library } from "../data/catalog";
import { furnitureTypes } from "../model/furnitureAppearance";
import { AiResults } from "./AiResults";
import { AiCreateProjectForm } from "./AiCreateProjectDialog";
import { filterPickerItems, furniturePickerItems, groupPickerItems, typePickerItems } from "./pickerItems";
import type { LibraryItem } from "../model/types";

const mine: LibraryItem = { catalogId: "33333333-3333-4333-8333-333333333333", name: "胡桃木边柜", category: "客厅", type: "cabinet", w: 1200, d: 400, color: "#775533" };

describe("统一家具选择器", () => {
  const items = furniturePickerItems([mine, ...library]);
  it("显示完整家具目录：账号家具单独分组带角标，其余按分类分组", () => {
    expect(items).toHaveLength(library.length + 1);
    const groups = groupPickerItems(items);
    expect(groups[0][0]).toBe("我的家具");
    expect(groups[0][1][0]).toMatchObject({ label: "胡桃木边柜", badge: "账号库" });
    expect(groups.map(([group]) => group)).toContain("卧室");
    expect(items.filter((item) => item.badge)).toHaveLength(1);
  });
  it("按名称、分类、类型搜索；没有结果时返回空", () => {
    expect(filterPickerItems(items, "床头").map((item) => item.label)).toEqual(["床头柜"]);
    expect(filterPickerItems(items, "卫浴").every((item) => item.group === "卫浴")).toBe(true);
    expect(filterPickerItems(items, "TREADMILL").map((item) => item.label)).toEqual(["跑步机"]);
    expect(filterPickerItems(items, "不存在的家具")).toEqual([]);
    expect(filterPickerItems(items, "  ")).toHaveLength(items.length);
  });
  it("参考类型共用同一个选择器：保留自动匹配项，可按类型下的家具名搜索", () => {
    const types = typePickerItems(furnitureTypes, "通用物件");
    expect(types[0]).toMatchObject({ id: "auto", label: "自动匹配 · 通用物件" });
    expect(types).toHaveLength(furnitureTypes.length + 1);
    expect(filterPickerItems(types, "床头柜").map((item) => item.id)).toEqual(["nightstand"]);
  });
});

describe("候选方案网格", () => {
  const echo = { description: "双人床靠北墙", images: ["https://example.com/a.png"], details: "家具：双人床、书桌" };
  it("回显需求；按真实完成数显示进度；先完成的先出现，失败的写明原因", () => {
    const html = renderToStaticMarkup(createElement(AiResults<string>, {
      echo,
      slots: [{ status: "ready", candidate: { id: "c1", index: 0, summary: "床靠北墙", result: "x" } }, { status: "pending" }, { status: "failed", error: "方案里的家具与指定清单不一致" }],
      selected: 0,
      onSelect: () => {},
      preview: () => createElement("svg", { "data-preview": "1" }),
    }));
    expect(html).toContain("双人床靠北墙");
    expect(html).toContain("家具：双人床、书桌");
    expect(html).toContain("已完成 2 / 3");
    expect(html).toContain("床靠北墙");
    expect(html).toContain("方案 2 · 生成中");
    expect(html).toContain("方案里的家具与指定清单不一致");
    expect(html).toContain('aria-checked="true"');
  });
  it("全部失败时给出错误提示", () => {
    const html = renderToStaticMarkup(createElement(AiResults<string>, {
      echo, slots: [{ status: "failed", error: "AI 额度不足" }], selected: null, onSelect: () => {}, preview: () => null,
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("AI 额度不足");
  });
});

describe("AI 创建户型表单", () => {
  const html = renderToStaticMarkup(createElement(AiCreateProjectForm, { pending: false, onClose: () => {}, onSubmit: () => {} }));
  it("长宽必填，默认 9 × 10 m；描述为空时不能发送；数量默认 2；没有模型选择", () => {
    expect(html).toContain('id="ai-project-width"');
    expect(html).toContain('value="9.00"');
    expect(html).toContain('value="10.00"');
    expect(html).toMatch(/aria-label="生成"[^>]*disabled/);
    expect(html).toContain("2 个方案");
    expect(html).not.toContain("模型");
  });
});
