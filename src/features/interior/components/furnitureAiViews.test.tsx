import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiComposer } from "./AiComposer";
import { FurnitureVisual } from "./FurnitureVisual";
import { FurnitureAiDialog, defaultAdjustImage } from "./FurnitureAiDialog";
import { AccountFurnitureDialog } from "./AccountFurnitureDialog";
import { DEFAULT_AI_ENGINE } from "../ai/models";
import { ATTACHMENT_ACCEPT, pickAttachments, readyFiles, readyImageUrls, uploadedImage, type AiImageDraft } from "../ai/referenceImages";
import { validateDesign } from "../model/validation";
import { HARD_CATEGORIES } from "../model/hardMaterials";
import { blankDesign } from "../data/templates";
import type { LibraryItem } from "../model/types";

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

describe("家具详情只有 2D", () => {
  const visual = (item: LibraryItem, adjust = true) =>
    html(createElement(FurnitureVisual, { item, onAdjust: adjust ? () => {} : undefined }));
  const withTop: LibraryItem = { ...sofa, imageUrl: "https://x/top.webp" };
  /** 旧数据里可能存着 3D 效果图与 AI 3D 模型：数据照旧保留（3D 场景仍会用），详情里不再展示。 */
  const legacy3d: LibraryItem = { ...sofa, image3dUrl: "https://x/3d.webp", model3d: { version: 1, parts: [{ kind: "box", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, color: "#334455" }] } };
  const detail = (props: Partial<Parameters<typeof AccountFurnitureDialog>[0]>) => html(createElement(AccountFurnitureDialog, {
    item: sofa, isCustom: false, referencePrice: null, onOpenChange: () => {}, onChanged: () => {}, applyDefaultPrice: async () => true, remove: async () => true, ...props,
  }));

  it("软装：没有俯视图显示参考符号，有就显示俯视图；没有视角切换，也不渲染 3D", () => {
    const plain = visual(sofa), top = visual(withTop);
    expect(plain).toContain('aria-label="布艺沙发参考符号"');
    expect(plain).not.toContain("<img");
    expect(top).toContain('<img src="https://x/top.webp"');
    expect(top).toContain('alt="布艺沙发2D 俯视图"');
    expect(top).not.toContain("参考符号");
    for (const out of [plain, top]) {
      expect(out).not.toContain('role="radio');
      expect(out).not.toContain("预览视角");
      expect(out).not.toContain("3D");
    }
    // 旧的 3D 素材对视觉区没有任何影响：只有 3D 效果图时仍是参考符号，有俯视图时仍是俯视图。
    expect(visual(legacy3d)).toBe(plain);
    expect(visual({ ...legacy3d, imageUrl: "https://x/top.webp" })).toBe(top);
  });
  it("硬装同样只有 2D，和软装是同一个视觉区；没有保存权限时不显示 AI 调整", () => {
    for (const category of HARD_CATEGORIES) {
      expect(visual({ ...sofa, category })).toBe(visual(sofa));
      expect(visual({ ...withTop, category })).toBe(visual(withTop));
      expect(visual({ ...sofa, category }, false)).not.toContain("AI 调整");
    }
    expect(visual(sofa)).toContain("AI 调整");
    expect(visual(sofa, false)).not.toContain("AI 调整");
    expect(visual(withTop, false)).not.toContain("AI 调整");
  });
  it("AI 调整默认参考图只看 2D 俯视图，旧的 3D 效果图不拿来顶替", () => {
    expect(defaultAdjustImage(withTop)).toBe("https://x/top.webp");
    expect(defaultAdjustImage({ ...withTop, image3dUrl: "https://x/3d.webp" })).toBe("https://x/top.webp");
    expect(defaultAdjustImage({ ...sofa, image3dUrl: "https://x/3d.webp" })).toBeUndefined();
    expect(defaultAdjustImage(sofa)).toBeUndefined();
  });
  it("AI 调整弹窗只生成 2D 俯视图：标题含家具名，默认附上当前俯视图，无名称输入与模型选择器", () => {
    const dialog = (item: LibraryItem) => html(createElement(FurnitureAiDialog, { item, onClose: () => {}, onApply: async () => true }));
    const out = dialog(withTop), header = headerOf(out);
    expect(header).toContain("<h2>AI 调整 · 布艺沙发 · 2D 俯视图</h2>");
    expect(header).toContain("在当前 2D 俯视图基础上调整");
    expect(header).not.toContain("3D");
    expect(out).toContain('<img src="https://x/top.webp" alt="附件 1"');
    expect(out).toContain('aria-label="生成图片"');
    expect(out).not.toContain("ai-engine");
    expect(out).not.toContain("名称");
    // 只有旧的 3D 效果图时不带附件，按需求重新生成。
    const legacy = dialog(legacy3d);
    expect(legacy).not.toContain("https://x/3d.webp");
    expect(legacy).not.toContain('aria-label="附件"');
  });
  it("家具详情弹窗：文案只提 2D 俯视图；只能设单价（没有保存权限）时不显示 AI 调整", () => {
    const builtin = detail({ saveFields: async () => true, saveAssets: async () => true });
    expect(headerOf(builtin)).toContain("并用「AI 调整」更换 2D 俯视图");
    expect(headerOf(builtin)).not.toContain("3D");
    expect(builtin).toContain("furniture-visual-ai");
    expect(builtin).toContain('aria-label="布艺沙发参考符号"');
    expect(builtin).not.toContain('role="radio');
    expect(detail({ isCustom: true, saveGeometry: async () => true })).toContain("furniture-visual-ai");
    const priceOnly = detail({});
    expect(priceOnly).not.toContain("furniture-visual-ai");
    expect(priceOnly).not.toContain("AI 调整");
  });
});

describe("旧数据兼容：3D 素材字段照常校验", () => {
  it("家具库条目的 image3dUrl 必须是 https", () => {
    const base = { ...blankDesign(), customCatalog: [{ ...sofa, image3dUrl: "https://x/3d.webp" }] };
    expect(validateDesign(JSON.parse(JSON.stringify(base))).customCatalog?.[0]?.image3dUrl).toBe("https://x/3d.webp");
    expect(() => validateDesign(JSON.parse(JSON.stringify({ ...base, customCatalog: [{ ...sofa, image3dUrl: "http://x/3d.webp" }] })))).toThrow();
  });
});
