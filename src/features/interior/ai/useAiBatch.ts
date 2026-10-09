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
  useEffect(() => () => { epoch.current++; }, []);

  const start = useCallback(
    (request: Request, count: number, run: (index: number, generationId: string) => Promise<AiCandidate<Result>>) => {
      const run_ = ++epoch.current;
      const generationId = crypto.randomUUID();
      setBatch({ generationId, request, seen: false, slots: Array.from({ length: count }, () => ({ status: "pending" as const })) });
      const settle = (index: number, slot: AiSlot<Result>) => {
        if (run_ !== epoch.current) return;
        setBatch((current) => current && { ...current, slots: current.slots.map((s, i) => (i === index ? slot : s)) });
      };
      for (let index = 0; index < count; index++)
        run(index, generationId).then(
          (candidate) => settle(index, { status: "ready", candidate }),
          (cause) => settle(index, { status: "failed", error: errorMessage(cause, "生成失败，请重试") }),
        );
      return generationId;
    },
    [],
  );
  /** 停止并清空：迟到的结果不再写入。 */
  const clear = useCallback(() => { epoch.current++; setBatch(null); }, []);
  const markSeen = useCallback(() => setBatch((current) => (current && !current.seen ? { ...current, seen: true } : current)), []);
  return { batch, running: batchRunning(batch), start, clear, markSeen };
}
