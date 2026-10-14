import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiComposer } from "../components/ai-composer";
import { FurnitureVisual } from "@/features/account-library/components/furniture-visual";
import { FurnitureAiDialog } from "../components/furniture-ai-dialog";
import { defaultAdjustImage } from "../model/adjust-image";
import { AccountFurnitureDialog } from "@/features/account-library/components/account-furniture-dialog";
import { DEFAULT_AI_ENGINE } from "../model/models";
import { ATTACHMENT_ACCEPT, pickAttachments, readyFiles, readyImageUrls, uploadedImage, type AiImageDraft } from "../model/reference-images";
import { validateDesign } from "@/lib/floor-plan/validation";
import { HARD_CATEGORIES } from "@/lib/floor-plan/hard-materials";
import { blankDesign } from "@/lib/floor-plan/templates";
import type { LibraryItem } from "@/lib/floor-plan/types";

// 实时 3D 预览依赖 WebGL：测试里换成占位元素，只校验何时渲染、带上哪件家具与 3D 部件。
vi.mock("@/features/scene-3d", async () => {
  const { createElement: h } = await import("react");
  return {
    FurnitureModelPreview: ({ item, compact }: { item: LibraryItem; compact?: boolean }) =>
      h("div", { "data-testid": "model-preview", "data-parts": item.model3d?.parts.length ?? 0, "data-compact": compact ? "1" : "0" }, item.name),
  };
});

// 弹层内容在浏览器里经 Portal 挂到 body，静态渲染拿不到；测试里把打开的弹层原地渲染（头部 header、标题 h2、说明 p），关闭的不渲染。
vi.mock("@/components/ui/dialog", async () => {
  const { createElement: h } = await import("react");
  const as = (tag: string) => ({ children }: { children?: ReactNode }) => h(tag, null, children);
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? h("section", null, children) : null),
    DialogContent: as("div"), DialogHeader: as("header"), DialogTitle: as("h2"), DialogDescription: as("p"), DialogFooter: as("footer"),
  };
});

const sofa: LibraryItem = { catalogId: "11111111-1111-4111-8111-111111111111", name: "布艺沙发", category: "客厅", type: "sofa", w: 2000, d: 900, height: 800, color: "#998877" };
const file = (name: string, type = "", size = 10) => new File([new Uint8Array(size)], name, { type });
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);
/** 弹层头部（标题与说明）的 HTML。 */
const headerOf = (markup: string) => markup.match(/<header>(.*?)<\/header>/s)?.[1] ?? "";

describe("AI 附件：图片 + 家装素材", () => {
  it("接受图片与 DXF / PDF / ZIP / SKP 等素材，拒绝不支持的格式", () => {
    const { accepted, rejected } = pickAttachments([file("a.png", "image/png"), file("plan.dxf"), file("spec.pdf", "application/pdf"), file("pack.zip"), file("model.skp"), file("virus.exe")], []);
    expect(accepted.map((a) => [a.file.name, a.kind])).toEqual([["a.png", "image"], ["plan.dxf", "file"], ["spec.pdf", "file"], ["pack.zip", "file"], ["model.skp", "file"]]);
    expect(rejected).toEqual(["「virus.exe」格式不支持"]);
  });
  it("图片最多 4 张、附件总数最多 6 个", () => {
    const four: AiImageDraft[] = Array.from({ length: 4 }, (_, i) => uploadedImage(`https://x/${i}.png`));
    const fifthImage = pickAttachments([file("5.png", "image/png"), file("a.dxf")], four);
    expect(fifthImage.accepted.map((a) => a.file.name)).toEqual(["a.dxf"]);
    expect(fifthImage.rejected[0]).toContain("最多添加 4 张图片");
    const six = [...four, { ...uploadedImage("https://x/f"), kind: "file" as const }, { ...uploadedImage("https://x/g"), kind: "file" as const }];
    expect(pickAttachments([file("b.pdf")], six).rejected[0]).toContain("最多添加 6 个附件");
  });
  it("素材超过 50 MB 被拒；图片和素材分别交给请求", () => {
    expect(pickAttachments([file("big.zip", "", 50 * 1024 * 1024 + 1)], []).rejected[0]).toContain("超过 50 MB");
    const drafts: AiImageDraft[] = [uploadedImage("https://x/a.png"), { id: "f", preview: "", url: "https://x/p.pdf", uploading: false, kind: "file", name: "p.pdf", ext: "pdf" }];
    expect(readyImageUrls(drafts)).toEqual(["https://x/a.png"]);
    expect(readyFiles(drafts)).toEqual([{ url: "https://x/p.pdf", name: "p.pdf", ext: "pdf" }]);
  });
  it("输入框：默认显示模型选择器，accept 含常用素材；showEngine=false 时隐藏", () => {
    const props = { value: { description: "x", images: [], count: 1, engine: DEFAULT_AI_ENGINE }, onDescription: () => {}, onImages: () => {}, onCount: () => {}, onEngine: () => {}, onSend: () => {}, placeholder: "" };
    const withEngine = html(createElement(AiComposer, props));
    for (const ext of [".dxf", ".pdf", ".zip", ".obj", ".dwg"]) expect(ATTACHMENT_ACCEPT).toContain(ext);
    expect(withEngine).toContain(ATTACHMENT_ACCEPT.replace(/&/g, "&amp;"));
    expect(withEngine).toContain("ai-engine");
    expect(html(createElement(AiComposer, { ...props, showEngine: false }))).not.toContain("ai-engine");
  });
  it("素材附件显示格式角标与文件名；上传中禁用发送", () => {
    const value = { description: "x", images: [{ id: "f", preview: "", uploading: true, kind: "file" as const, name: "户型.dxf", ext: "dxf" }], count: 1, engine: DEFAULT_AI_ENGINE };
    const out = html(createElement(AiComposer, { value, onDescription: () => {}, onImages: () => {}, onCount: () => {}, onEngine: () => {}, onSend: () => {}, placeholder: "" }));
    expect(out).toContain("户型.dxf");
    expect(out).toContain("DXF");
    expect(out).toMatch(/class="ai-composer-send"[^>]*disabled/);
  });
});

describe("家具详情：2D / 3D 预览与 AI 调整", () => {
  const visual = (item: LibraryItem, view: "top" | "perspective" = "top", adjust = true) =>
    html(createElement(FurnitureVisual, { item, view, onView: () => {}, onAdjust: adjust ? () => {} : undefined }));
  const withTop: LibraryItem = { ...sofa, imageUrl: "https://x/top.webp" };
  const ai3d: LibraryItem = { ...sofa, model3d: { version: 1, parts: [{ kind: "box", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, color: "#334455" }] } };
  const detail = (props: Partial<Parameters<typeof AccountFurnitureDialog>[0]>) => html(createElement(AccountFurnitureDialog, {
    item: sofa, isCustom: false, referencePrice: null, onOpenChange: () => {}, onChanged: () => {}, applyDefaultPrice: async () => true, remove: async () => true, ...props,
  }));

  it("软装：左上角 2D / 3D 切换，默认 2D——没有俯视图显示参考符号，有就显示俯视图", () => {
    const plain = visual(sofa), top = visual(withTop);
    expect(plain).toContain('aria-label="预览视角"');
    expect(plain).toContain('aria-checked="true" aria-label="2D 俯视图"');
    expect(plain).toContain('aria-checked="false" aria-label="3D 模型"');
    expect(plain).toContain('aria-label="布艺沙发参考符号"');
    expect(top).toContain('<img src="https://x/top.webp"');
    expect(top).not.toContain("model-preview");
  });
  it("软装切到 3D：实时渲染与 3D 场景同一套模型（带 AI 3D 部件），旧的 3D 效果图不再顶替", () => {
    const out = visual({ ...ai3d, image3dUrl: "https://x/3d.webp" }, "perspective");
    expect(out).toContain('aria-label="布艺沙发实时 3D 模型预览"');
    expect(out).toContain('data-testid="model-preview" data-parts="1" data-compact="0"');
    expect(out).not.toContain("https://x/3d.webp");
    expect(visual(sofa, "perspective")).toContain('data-parts="0"');
  });
  it("硬装只有 2D：不显示视角切换，即使传了 3D 也按俯视图显示；没有保存权限时不显示 AI 调整", () => {
    for (const category of HARD_CATEGORIES) {
      const out = visual({ ...sofa, category }, "perspective");
      expect(out).not.toContain("预览视角");
      expect(out).not.toContain("model-preview");
      expect(out).toContain("参考符号");
      expect(visual({ ...sofa, category }, "top", false)).not.toContain("AI 调整");
    }
    expect(visual(sofa)).toContain("AI 调整");
    expect(visual(sofa, "perspective", false)).not.toContain("AI 调整");
  });
  it("AI 调整默认参考图：2D 只用俯视图；3D 优先 3D 效果图，其次退回俯视图", () => {
    expect(defaultAdjustImage(withTop)).toBe("https://x/top.webp");
    expect(defaultAdjustImage({ ...sofa, image3dUrl: "https://x/3d.webp" })).toBeUndefined();
    expect(defaultAdjustImage(withTop, "perspective")).toBe("https://x/top.webp");
    expect(defaultAdjustImage({ ...withTop, image3dUrl: "https://x/3d.webp" }, "perspective")).toBe("https://x/3d.webp");
    expect(defaultAdjustImage(sofa, "perspective")).toBeUndefined();
  });
  it("AI 调整弹窗 · 2D：标题含家具名与「2D 俯视图」，默认附上当前俯视图，生成图片", () => {
    const out = html(createElement(FurnitureAiDialog, { item: withTop, onClose: () => {}, onApply: async () => true }));
    const header = headerOf(out);
    expect(header).toContain("<h2>AI 调整 · 布艺沙发 · 2D 俯视图</h2>");
    expect(header).toContain("在当前 2D 俯视图基础上调整");
    expect(out).toContain('<img src="https://x/top.webp" alt="附件 1"');
    expect(out).toContain('aria-label="生成图片"');
    expect(out).not.toContain("ai-engine");
  });
  it("AI 调整弹窗 · 3D：标题为「3D 模型」，按钮是「生成 3D 模型」；有 3D 效果图时默认带上", () => {
    const out = html(createElement(FurnitureAiDialog, { item: { ...withTop, image3dUrl: "https://x/3d.webp" }, view: "perspective", onClose: () => {}, onApply: async () => true }));
    const header = headerOf(out);
    expect(header).toContain("<h2>AI 调整 · 布艺沙发 · 3D 模型</h2>");
    expect(header).toContain("简易 3D 模型");
    expect(out).toContain('<img src="https://x/3d.webp" alt="附件 1"');
    expect(out).toContain('aria-label="生成 3D 模型"');
  });
  it("家具详情弹窗：软装有 2D / 3D 切换与 AI 调整，文案提到 3D 模型；只能设单价时不显示 AI 调整", () => {
    const builtin = detail({ saveFields: async () => true, saveAssets: async () => true });
    expect(headerOf(builtin)).toContain("并用「AI 调整」更换 2D 俯视图或 3D 模型");
    expect(builtin).toContain("furniture-visual-ai");
    expect(builtin).toContain('aria-label="预览视角"');
    expect(detail({ isCustom: true, saveGeometry: async () => true })).toContain("furniture-visual-ai");
    const priceOnly = detail({});
    expect(priceOnly).not.toContain("furniture-visual-ai");
    expect(priceOnly).toContain('aria-label="预览视角"');
  });
});

describe("旧数据兼容：3D 素材字段照常校验", () => {
  it("家具库条目的 image3dUrl 必须是 https", () => {
    const base = { ...blankDesign(), customCatalog: [{ ...sofa, image3dUrl: "https://x/3d.webp" }] };
    expect(validateDesign(JSON.parse(JSON.stringify(base))).customCatalog?.[0]?.image3dUrl).toBe("https://x/3d.webp");
    expect(() => validateDesign(JSON.parse(JSON.stringify({ ...base, customCatalog: [{ ...sofa, image3dUrl: "http://x/3d.webp" }] })))).toThrow();
  });
});
