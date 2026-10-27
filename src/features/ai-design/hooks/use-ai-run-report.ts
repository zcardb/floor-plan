import { useEffect, useRef } from 'react';
import { trackAiGenerationCompleted, trackAiGenerationFailed, type AiRun } from '@/lib/analytics/events';

/**
 * 把一批 AI 生成的结果接到统计上：从「生成中」变成结束时上报一次成功或失败，
 * 判据与界面提示一致（一批全部失败才算失败）；停止、返回、应用后清空的一批不上报。
 * run 是本次发送时的上下文（场景、引擎、候选数、是否带参考图），成功、失败、采纳共用同一份。
 */
export function useAiRunReport(
  running: boolean,
  batch: { slots: { status: string }[] } | null,
  run: AiRun,
) {
  const latest = useRef(run);
  latest.current = run;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && batch) {
      if (batch.slots.some((slot) => slot.status === 'ready')) trackAiGenerationCompleted(latest.current);
      else trackAiGenerationFailed(latest.current);
    }
    wasRunning.current = running;
  }, [running, batch]);
}
