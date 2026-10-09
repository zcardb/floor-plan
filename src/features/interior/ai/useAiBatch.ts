import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/notify";
import type { AiCandidate, AiSlot } from "./types";

export interface AiBatch<Request, Result> {
  generationId: string;
  request: Request;
  slots: AiSlot<Result>[];
  /** 结果是否已被用户看过（未看过时入口显示提示点）。 */
  seen: boolean;
}

export const batchRunning = (batch: AiBatch<unknown, unknown> | null) => !!batch?.slots.some((slot) => slot.status === "pending");

/**
 * 一批 AI 候选：数量 N = 并行 N 个单候选请求，共用一个 generationId。
 * 每个请求完成就立刻落到对应格子（先完成的先出现）；只有全部失败才算失败。
 * 新的一批开始或 cancel 后，旧请求的迟到结果会被丢弃。
 */
export function useAiBatch<Request, Result>() {
  const [batch, setBatch] = useState<AiBatch<Request, Result> | null>(null);
  const epoch = useRef(0);
  /** 当前这一批的执行函数：单个格子重试时沿用同一个 generationId 与序号。 */
  const current = useRef<{ epoch: number; generationId: string; run: (index: number, generationId: string) => Promise<AiCandidate<Result>> } | null>(null);
  useEffect(() => () => { epoch.current++; }, []);

  const launch = useCallback((index: number) => {
    const job = current.current;
    if (!job || job.epoch !== epoch.current) return;
    const settle = (slot: AiSlot<Result>) => {
      if (job.epoch !== epoch.current) return;
      setBatch((batch) => batch && { ...batch, slots: batch.slots.map((s, i) => (i === index ? slot : s)) });
    };
    job.run(index, job.generationId).then(
      (candidate) => settle({ status: "ready", candidate }),
      (cause) => settle({ status: "failed", error: errorMessage(cause, "生成失败，请重试") }),
    );
  }, []);

  const start = useCallback(
    (request: Request, count: number, run: (index: number, generationId: string) => Promise<AiCandidate<Result>>) => {
      const generationId = crypto.randomUUID();
      current.current = { epoch: ++epoch.current, generationId, run };
      setBatch({ generationId, request, seen: false, slots: Array.from({ length: count }, () => ({ status: "pending" as const })) });
      for (let index = 0; index < count; index++) launch(index);
      return generationId;
    },
    [launch],
  );
  /** 单个失败的格子重试：其他格子不动。 */
  const retry = useCallback((index: number) => {
    setBatch((batch) => batch && batch.slots[index]?.status === "failed"
      ? { ...batch, seen: false, slots: batch.slots.map((s, i) => (i === index ? { status: "pending" as const } : s)) }
      : batch);
    launch(index);
  }, [launch]);
  /** 停止并清空：迟到的结果不再写入。 */
  const clear = useCallback(() => { epoch.current++; setBatch(null); }, []);
  const markSeen = useCallback(() => setBatch((current) => (current && !current.seen ? { ...current, seen: true } : current)), []);
  return { batch, running: batchRunning(batch), start, retry, clear, markSeen };
}
