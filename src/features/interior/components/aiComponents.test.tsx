import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { library } from "../data/catalog";
import { furnitureTypes } from "../model/furnitureAppearance";
import { AiResults } from "./AiResults";
import { AiComposer } from "./AiComposer";
import { DEFAULT_AI_ENGINE } from "../ai/models";
import { AiCreateProjectForm, DEFAULT_PLAN_PROMPT } from "./AiCreateProjectDialog";
import { filterPickerItems, groupPickerItems } from "./pickerItems";
import { furniturePickerItems, typePickerItems } from "./furniturePickerItems";
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
    expect(html).toContain("方案 3 生成失败");
    expect(html).toContain('title="方案里的家具与指定清单不一致"');
    expect(html).toContain('aria-checked="true"');
  });
  it("失败的方案可以单独重试；成功的方案可以放大查看", () => {
    const html = renderToStaticMarkup(createElement(AiResults<string>, {
      echo, slots: [{ status: "failed", error: "AI 服务繁忙" }, { status: "ready", candidate: { id: "c2", index: 1, summary: "动静分区", result: "x" } }],
      selected: 1, onSelect: () => {}, onRetry: () => {}, preview: () => null,
    }));
    expect(html).toContain("方案 1 生成失败：AI 服务繁忙。点击重试");
    expect(html).toContain("重试");
    // 失败格子里只留重试按钮：不渲染说明文字（原因在 title / aria-label 里）。
    expect(html).not.toContain("ai-candidate-error");
    expect(html).toContain('aria-label="放大查看动静分区"');
  });
  it("全部失败时给出错误提示", () => {
    const html = renderToStaticMarkup(createElement(AiResults<string>, {
      echo, slots: [{ status: "failed", error: "AI 额度不足" }], selected: null, onSelect: () => {}, preview: () => null,
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("AI 额度不足");
  });
});

describe("共用 AI 输入区", () => {
  const renderComposer = (description: string) => renderToStaticMarkup(createElement(AiComposer, {
    value: { description, images: [], count: 2, engine: DEFAULT_AI_ENGINE },
    label: "布局需求", hint: "例如：家具靠墙，保留通道。", placeholder: "描述布局…",
    onDescription: () => {}, onImages: () => {}, onCount: () => {}, onEngine: () => {}, onSend: () => {},
  }));
  it("常驻标签和示例关联输入框，设置分组与文字主按钮共用", () => {
    const html = renderComposer("家具靠墙");
    const labelId = html.match(/<label for="([^"]+)"/)?.[1];
    expect(labelId).toBeTruthy();
    expect(html).toContain(`id="${labelId}"`);
    expect(html).toContain('aria-label="布局需求"');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("例如：家具靠墙，保留通道。");
    expect(html).toContain("ai-composer-settings");
    expect(html).toContain("<span>生成方案</span>");
    expect(html).not.toMatch(/aria-label="生成方案"[^>]*disabled/);
  });
  it.each(["", "   "])("空描述 %j 仍禁用生成", (description) => {
    expect(renderComposer(description)).toMatch(/aria-label="生成方案"[^>]*disabled/);
  });
});

describe("AI 创建户型表单", () => {
  const html = renderToStaticMarkup(createElement(AiCreateProjectForm, { pending: false, onClose: () => {}, onSubmit: () => {} }));
  it("需求描述默认填入示例（含长宽、几室几厅几卫），可编辑可直接发送；没有「高级设计」；数量默认 2；模型默认 Gemini 3.8 Flash", () => {
    expect(html).not.toContain("高级设计");
    expect(html).not.toContain('id="ai-project-width"');
    expect(html).toContain(DEFAULT_PLAN_PROMPT);
    expect(html).toContain("长 12 m × 宽 10 m");
    expect(html).toContain('aria-label="生成方案"');
    expect(html).not.toMatch(/aria-label="生成方案"[^>]*disabled/);
    expect(html).toContain('aria-label="户型需求"');
    expect(html).toContain("ai-field-optional");
    expect(html).toContain("数量 2");
    expect(html).not.toContain("个方案");
    expect(html).toContain("Gemini 3.8 Flash");
  });
});
