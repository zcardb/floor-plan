import { useCallback, useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
async function invoke(name: string, body: object) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error instanceof FunctionsHttpError) {
    const value = await error.context.json().catch(() => ({}));
    throw new Error(value.message || value.error?.message || error.message);
  }
  if (error) throw new Error(error.message);
  if (data?.success === false) throw new Error(data.message || "图片任务失败");
  return data;
}
export function useFurnitureImage() {
  const [image, setImage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [taskId, setTaskId] = useState("");
  const epoch = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    cancelWait = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    cancelWait.current?.();
    setBusy(false);
    setImage('');
  }, []);
  useEffect(
    () => () => {
      epoch.current++;
      if (timer.current) clearTimeout(timer.current);
      cancelWait.current?.();
    },
    [],
  );
  const generate = async (prompt: string) => {
    cancel();
    const run = epoch.current;
    setBusy(true);
    setError("");
    setImage("");
    try {
      const data = await invoke("interior-furniture-image-submit", { prompt });
      if (run !== epoch.current) return;
      setTaskId(data.task_id);
      for (let i = 0; i < 120; i++) {
        if (run !== epoch.current) return;
        const result = await invoke("interior-furniture-image-status", {
          task_id: data.task_id,
        });
        if (run !== epoch.current) return;
        if (result.status === "failed")
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : result.error?.message || "图片生成失败",
          );
        if (result.status === "succeed") {
          const url = result.images?.[0]?.url;
          if (!url) throw new Error("生成结果没有图片");
          setImage(url);
          return;
        }
        await new Promise<void>((resolve) => {
          cancelWait.current = resolve;
          timer.current = setTimeout(resolve, 2000);
        });
      }
      throw new Error("图片仍在生成，请稍后重试");
    } catch (err) {
      if (run === epoch.current)
        setError(err instanceof Error ? err.message : "图片生成失败");
    } finally {
      if (run === epoch.current) setBusy(false);
    }
  };
  return { image, busy, error, taskId, generate, cancel };
}
