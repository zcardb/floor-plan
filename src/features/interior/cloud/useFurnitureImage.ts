import { useCallback, useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { LibraryItem } from '../model/types';
import { backend } from "../ai/client";
import type { AiFileRef } from "../ai/referenceImages";
import { notify } from "@/lib/notify";

async function invoke(name: string, body: object) {
  const supabase = await backend();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error instanceof FunctionsHttpError) {
    const value = await error.context.json().catch(() => ({}));
    throw new Error(value.message || value.error?.message || error.message);
  }
  if (error) throw new Error(error.message);
  if (data?.success === false) throw new Error(data.message || "图片任务失败");
  return data;
}

/** 家具图片的视角：top 为平面俯视符号图（2D），perspective 为 3D 透视效果图。 */
export type FurnitureView = 'top' | 'perspective';

export interface FurnitureImageOptions {
  requestId?: string;
  view?: FurnitureView;
  /** 用户的调整需求。 */
  description?: string;
  /** 参考图：第一张作为被调整的原图。 */
  images?: string[];
  /** 非图片素材（图纸、素材包、3D 模型等），由后端交给 AI 自行判断。 */
  files?: AiFileRef[];
  onTaskFailed?: () => void;
}

const wait = (ms: number, cancelled: () => boolean, onWait?: (resume: () => void) => void) => new Promise<void>((resolve) => {
  if (cancelled()) { resolve(); return; }
  const timer = setTimeout(resolve, ms);
  onWait?.(() => { clearTimeout(timer); resolve(); });
});

/**
 * 提交一次家具图片任务并轮询到出图；返回图片地址。cancelled() 为真时停止并返回 null。
 * 供详情弹窗的「AI 调整」（每个候选格子一次）与旧的单张生成共用。
 */
export async function generateFurnitureImage(
  item: LibraryItem,
  options: FurnitureImageOptions,
  cancelled: () => boolean,
  onWait?: (resume: () => void) => void,
  onTask?: (taskId: string) => void,
): Promise<string | null> {
  const { requestId, view, description, images, files, onTaskFailed } = options;
  const data = await invoke("interior-furniture-image-submit", {
    item,
    ...(requestId ? { request_id: requestId } : {}),
    ...(view ? { view } : {}),
    ...(description ? { description } : {}),
    ...(images?.length ? { images } : {}),
    ...(files?.length ? { files } : {}),
  });
  if (cancelled()) return null;
  onTask?.(data.task_id);
  for (let i = 0; i < 120; i++) {
    if (cancelled()) return null;
    const result = await invoke("interior-furniture-image-status", { task_id: data.task_id });
    if (cancelled()) return null;
    if (result.status === "failed") {
      onTaskFailed?.();
      throw new Error(typeof result.error === "string" ? result.error : result.error?.message || "图片生成失败");
    }
    if (result.status === "succeed") {
      const url = result.images?.[0]?.url;
      if (!url) throw new Error("生成结果没有图片");
      return url as string;
    }
    await wait(2000, cancelled, onWait);
  }
  throw new Error("图片仍在生成，请稍后重试");
}

export function useFurnitureImage() {
  const [image, setImage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [taskId, setTaskId] = useState("");
  const epoch = useRef(0),
    cancelWait = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    epoch.current++;
    cancelWait.current?.();
    setBusy(false);
    setImage('');
  }, []);
  useEffect(
    () => () => {
      epoch.current++;
      cancelWait.current?.();
    },
    [],
  );
  const generate = async (item: LibraryItem, requestId?: string, onTaskFailed?: () => void) => {
    cancel();
    const run = epoch.current;
    const cancelled = () => run !== epoch.current;
    setBusy(true);
    setError("");
    setImage("");
    try {
      const url = await generateFurnitureImage(item, { requestId, onTaskFailed }, cancelled,
        (resume) => { cancelWait.current = resume; }, setTaskId);
      if (url && !cancelled()) setImage(url);
      return url ?? undefined;
    } catch (err) {
      if (!cancelled()) {
        setError(err instanceof Error ? err.message : "图片生成失败");
        notify.error("家具图片生成失败", err);
      }
    } finally {
      if (!cancelled()) setBusy(false);
    }
  };
  return { image, busy, error, taskId, generate, cancel };
}
