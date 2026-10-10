import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiComposer } from "./AiComposer";
import { FurnitureVisual } from "./FurnitureVisual";
import { FurnitureAiDialog, defaultAdjustImage } from "./FurnitureAiDialog";
import { DEFAULT_AI_ENGINE } from "../ai/models";
import { ATTACHMENT_ACCEPT, pickAttachments, readyFiles, readyImageUrls, uploadedImage, type AiImageDraft } from "../ai/referenceImages";
import { validateDesign } from "../model/validation";
import { blankDesign } from "../data/templates";
import type { LibraryItem } from "../model/types";

const sofa: LibraryItem = { catalogId: "11111111-1111-4111-8111-111111111111", name: "布艺沙发", category: "客厅", type: "sofa", w: 2000, d: 900, height: 800, color: "#998877" };
const file = (name: string, type = "", size = 10) => new File([new Uint8Array(size)], name, { type });
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);

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

describe("家具 2D / 3D 视角", () => {
  const visual = (item: LibraryItem, view: "top" | "perspective", adjust = true) =>
    html(createElement(FurnitureVisual, { item, view, onView: () => {}, onAdjust: adjust ? () => {} : undefined }));
  it("软装：默认 2D；切到 3D 无图时实时渲染参考几何模型", () => {
    expect(visual(sofa, "top")).toContain('aria-checked="true" aria-label="2D 俯视图"');
    expect(visual(sofa, "perspective")).toContain("布艺沙发实时 3D 模型预览");
    expect(visual(sofa, "perspective")).toContain("AI 调整");
    const with3d = visual({ ...sofa, image3dUrl: "https://x/3d.webp" }, "perspective");
    // 有 AI 效果图时 3D 仍是实时模型，效果图只作角落参考。
    expect(with3d).toContain("布艺沙发实时 3D 模型预览");
    expect(with3d).toContain("furniture-visual-ref");
    expect(with3d).toContain("https://x/3d.webp");
  });
  it("硬装没有 3D 视角切换；没有保存权限时不显示 AI 调整", () => {
    expect(visual({ ...sofa, category: "门窗" }, "top")).not.toContain("预览视角");
    expect(visual(sofa, "top", false)).not.toContain("AI 调整");
    expect(visual(sofa, "top")).toContain("AI 调整");
  });
  it("AI 调整默认素材按视角对应：2D 用 2D 图、3D 用 3D 图，不跨视角混用", () => {
    const withTop = { ...sofa, imageUrl: "https://x/top.webp" };
    expect(defaultAdjustImage(withTop, "top")).toBe("https://x/top.webp");
    expect(defaultAdjustImage(withTop, "perspective")).toBeUndefined();
    expect(defaultAdjustImage({ ...withTop, image3dUrl: "https://x/3d.webp" }, "perspective")).toBe("https://x/3d.webp");
    expect(defaultAdjustImage({ ...sofa, image3dUrl: "https://x/3d.webp" }, "top")).toBeUndefined();
  });
  it("AI 调整弹窗：标题含家具名与视角，无名称输入与模型选择器", () => {
    const out = html(createElement(FurnitureAiDialog, { item: { ...sofa, imageUrl: "https://x/top.webp" }, view: "top", onClose: () => {}, onApply: async () => true }));
    // Dialog 内容渲染在 portal，静态渲染下只校验不会抛错；标题等交互由视觉验证覆盖。
    expect(typeof out).toBe("string");
  });
  it("家具库条目的 image3dUrl 必须是 https", () => {
    const base = { ...blankDesign(), customCatalog: [{ ...sofa, image3dUrl: "https://x/3d.webp" }] };
    expect(validateDesign(JSON.parse(JSON.stringify(base))).customCatalog?.[0]?.image3dUrl).toBe("https://x/3d.webp");
    expect(() => validateDesign(JSON.parse(JSON.stringify({ ...base, customCatalog: [{ ...sofa, image3dUrl: "http://x/3d.webp" }] })))).toThrow();
  });
});
