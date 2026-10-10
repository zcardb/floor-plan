import { useCallback } from "react";
import { notify } from "@/lib/notify";
import { AI_ATTACHMENT_LIMIT, AI_IMAGE_LIMIT, MATERIAL_MAX, uploadReferenceImage, uploadReferenceMaterial } from "./client";

/**
 * 附件草稿：图片先本地预览，上传完成后换成公开地址；
 * 素材（kind = file）原文件上传，只显示格式角标与文件名。
 */
export interface AiImageDraft {
  id: string;
  preview: string;
  url?: string;
  uploading: boolean;
  /** 缺省为 image（旧数据只有图片）。 */
  kind?: "image" | "file";
  name?: string;
  /** 小写扩展名，不带点。 */
  ext?: string;
}

/** 交给后端的素材引用。 */
export interface AiFileRef { url: string; name: string; ext: string }

export type ImagesUpdate = (fn: (images: AiImageDraft[]) => AiImageDraft[]) => void;

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
/** 家装常用素材：图纸 / 文档、素材包、3D 模型、表格与文本。 */
export const MATERIAL_EXTS = [
  "dxf", "dwg", "pdf",
  "zip", "rar", "7z",
  "obj", "stl", "fbx", "glb", "gltf", "3ds", "skp", "max", "rvt", "ifc",
  "txt", "csv", "json", "xlsx", "docx",
] as const;
export const ATTACHMENT_ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif", ...MATERIAL_EXTS.map((ext) => "." + ext)].join(",");

const isImage = (image: AiImageDraft) => image.kind !== "file";
export const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
export const readyImageUrls = (images: AiImageDraft[]) => images.flatMap((image) => (isImage(image) && image.url ? [image.url] : []));
export const readyFiles = (images: AiImageDraft[]): AiFileRef[] =>
  images.flatMap((image) => (!isImage(image) && image.url ? [{ url: image.url, name: image.name ?? "素材", ext: image.ext ?? "" }] : []));
export const imagesUploading = (images: AiImageDraft[]) => images.some((image) => image.uploading);
/** 已上传好的图片直接作为附件（例如「AI 调整」默认带上的当前家具图）。 */
export const uploadedImage = (url: string): AiImageDraft => ({ id: crypto.randomUUID(), preview: url, url, uploading: false, kind: "image" });

type Classified = { file: File; kind: "image" | "file"; ext: string };

/**
 * 按类型、数量与大小筛选：图片最多 AI_IMAGE_LIMIT 张，附件总数最多 AI_ATTACHMENT_LIMIT 个。
 * 被拒的给出原因，不静默丢弃。
 */
export function pickAttachments(files: File[], current: AiImageDraft[]): { accepted: Classified[]; rejected: string[] } {
  const rejected: string[] = [], accepted: Classified[] = [];
  let images = current.filter(isImage).length, total = current.length;
  for (const file of files) {
    const ext = extOf(file.name);
    const image = file.type.startsWith("image/") && (IMAGE_EXTS as readonly string[]).includes(ext || file.type.split("/")[1]);
    const material = !image && (MATERIAL_EXTS as readonly string[]).includes(ext);
    if (!image && !material) { rejected.push(`「${file.name}」格式不支持`); continue; }
    if (total >= AI_ATTACHMENT_LIMIT) { rejected.push(`最多添加 ${AI_ATTACHMENT_LIMIT} 个附件，已忽略「${file.name}」`); continue; }
    if (image && images >= AI_IMAGE_LIMIT) { rejected.push(`最多添加 ${AI_IMAGE_LIMIT} 张图片，已忽略「${file.name}」`); continue; }
    if (material && file.size > MATERIAL_MAX) { rejected.push(`「${file.name}」超过 50 MB`); continue; }
    accepted.push({ file, kind: image ? "image" : "file", ext });
    total++;
    if (image) images++;
  }
  return { accepted, rejected };
}

/** 选择即上传；超出张数、类型或大小不符时给出原因，不静默丢弃。 */
export function useReferenceImages(images: AiImageDraft[], update: ImagesUpdate) {
  const add = useCallback(
    (files: File[]) => {
      const { accepted, rejected } = pickAttachments(files, images);
      if (rejected.length) notify.fail(rejected.slice(0, 3).join("；") + (rejected.length > 3 ? ` 等 ${rejected.length} 个` : ""));
      for (const { file, kind, ext } of accepted) {
        const draft: AiImageDraft = { id: crypto.randomUUID(), preview: kind === "image" ? URL.createObjectURL(file) : "", uploading: true, kind, name: file.name, ext };
        update((list) => [...list, draft]);
        (kind === "image" ? uploadReferenceImage(file) : uploadReferenceMaterial(file, ext)).then(
          (url) => update((list) => list.map((image) => (image.id === draft.id ? { ...image, url, uploading: false } : image))),
          (cause) => {
            update((list) => list.filter((image) => image.id !== draft.id));
            if (draft.preview) URL.revokeObjectURL(draft.preview);
            notify.error(`${kind === "image" ? "参考图" : "素材"}「${file.name}」上传失败`, cause);
          },
        );
      }
    },
    [images, update],
  );
  const remove = useCallback(
    (id: string) => update((list) => {
      const target = list.find((image) => image.id === id);
      if (target?.preview.startsWith("blob:")) URL.revokeObjectURL(target.preview);
      return list.filter((image) => image.id !== id);
    }),
    [update],
  );
  return { add, remove };
}
