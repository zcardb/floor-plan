import { useCallback, useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { LibraryItem } from '../model/types';
import { backend } from "../ai/client";
import type { AiFileRef } from "../ai/referenceImages";
import { sanitizeModel3d, type FurnitureModel3d } from "../model/furniture3d";
import { furnitureHeight } from "../model/layoutRules";
import { stairRiser } from "../model/stairs";
import { notify } from "@/lib/notify";

/**
 * 发给 AI 的家具参数：内置家具、楼梯常常没有存高度，这里补上典型高度
 * （楼梯 = 踏步数 × 踏步高，其余按类型），避免后端因缺字段拒绝。
 */
export const aiFurnitureItem = (item: LibraryItem): LibraryItem => ({
  ...item,
  height: item.height || (item.stair ? Math.round(item.stair.steps * stairRiser(item.stair)) : furnitureHeight(item)),
});

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
    item: aiFurnitureItem(item),
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

/**
 * 生成家具的简易 3D 模型：后端用可读图的模型照着效果图 / 需求拼出基本体，
 * 返回前再按前端同一套规则整理一次。失败抛错，由调用方展示重试。
 */
export async function generateFurnitureModel(
  item: LibraryItem,
  options: { description?: string; images?: string[]; files?: AiFileRef[]; model?: string },
): Promise<FurnitureModel3d> {
  const data = await invoke("interior-furniture-model", {
    item: aiFurnitureItem(item),
    ...(options.description ? { description: options.description } : {}),
    ...(options.images?.length ? { images: options.images } : {}),
    ...(options.files?.length ? { files: options.files } : {}),
    ...(options.model ? { model: options.model } : {}),
  });
  const model3d = sanitizeModel3d(data?.model3d);
  if (!model3d) throw new Error("AI 没有给出可用的 3D 模型，请重试");
  return model3d;
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
