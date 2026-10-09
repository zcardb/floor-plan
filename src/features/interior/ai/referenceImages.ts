import { useCallback } from "react";
import { notify } from "@/lib/notify";
import { AI_IMAGE_LIMIT, uploadReferenceImage } from "./client";

/** 参考图草稿：先本地预览，上传完成后换成公开地址。 */
export interface AiImageDraft {
  id: string;
  preview: string;
  url?: string;
  uploading: boolean;
}

export type ImagesUpdate = (fn: (images: AiImageDraft[]) => AiImageDraft[]) => void;

export const readyImageUrls = (images: AiImageDraft[]) => images.flatMap((image) => (image.url ? [image.url] : []));
export const imagesUploading = (images: AiImageDraft[]) => images.some((image) => image.uploading);

/** 选图即上传；超出张数、类型或大小不符时给出原因，不静默丢弃。 */
export function useReferenceImages(images: AiImageDraft[], update: ImagesUpdate) {
  const add = useCallback(
    (files: File[]) => {
      const room = AI_IMAGE_LIMIT - images.length;
      if (room <= 0) { notify.fail(`最多添加 ${AI_IMAGE_LIMIT} 张参考图`); return; }
      if (files.length > room) notify.fail(`最多添加 ${AI_IMAGE_LIMIT} 张参考图，已忽略多出的 ${files.length - room} 张`);
      for (const file of files.slice(0, room)) {
        const draft: AiImageDraft = { id: crypto.randomUUID(), preview: URL.createObjectURL(file), uploading: true };
        update((list) => [...list, draft]);
        uploadReferenceImage(file).then(
          (url) => update((list) => list.map((image) => (image.id === draft.id ? { ...image, url, uploading: false } : image))),
          (cause) => {
            update((list) => list.filter((image) => image.id !== draft.id));
            URL.revokeObjectURL(draft.preview);
            notify.error(`参考图「${file.name}」上传失败`, cause);
          },
        );
      }
    },
    [images.length, update],
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
