import type { ReactNode } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { AiCandidate, AiSlot } from "../ai/types";

/** 请求回显：描述、参考图，以及一行补充信息（指定家具、长宽等）。 */
export interface AiEcho {
  description: string;
  images: string[];
  details?: string;
}

/**
 * 候选方案网格：顶部回显本次请求；每个格子先是生成中，完成即显示真实几何预览，
 * 失败的格子写明原因。进度只统计真实完成的请求。
 */
export function AiResults<T>({ echo, slots, selected, onSelect, preview, caption }: {
  echo: AiEcho;
  slots: AiSlot<T>[];
  selected: number | null;
  onSelect: (index: number) => void;
  preview: (candidate: AiCandidate<T>) => ReactNode;
  caption?: (candidate: AiCandidate<T>) => ReactNode;
}) {
  const done = slots.filter((slot) => slot.status !== "pending").length;
  const ready = slots.filter((slot) => slot.status === "ready").length;
  const failed = slots.filter((slot): slot is Extract<AiSlot<T>, { status: "failed" }> => slot.status === "failed");
  const running = done < slots.length;
  return <div className="ai-results">
    <section className="ai-echo" aria-label="本次需求">
      <p>{echo.description}</p>
      {(echo.images.length > 0 || !!echo.details) && <div className="ai-echo-meta">
        {echo.images.map((url, i) => <img key={url} src={url} crossOrigin="anonymous" alt={`参考图 ${i + 1}`} />)}
        {echo.details && <span>{echo.details}</span>}
      </div>}
    </section>
    <p className="ai-progress" role="status" aria-live="polite">
      {running && <Loader2 size={13} className="animate-spin" />}
      {running ? `正在生成 ${slots.length} 个方案 · 已完成 ${done} / ${slots.length}` : ready ? `已生成 ${ready} 个方案${failed.length ? `，${failed.length} 个失败` : ""} · 选择一个应用` : "方案生成失败"}
    </p>
    {!running && !ready && <p className="ai-error" role="alert"><AlertCircle size={15} />{failed[0]?.error ?? "生成失败，请返回修改后重试"}</p>}
    <div className="ai-candidate-grid" role="radiogroup" aria-label="候选方案">
      {slots.map((slot, i) => {
        if (slot.status === "pending") return <div key={i} className="ai-candidate is-pending" aria-busy="true"><div className="ai-candidate-preview"><Loader2 size={15} className="animate-spin" /></div><span>方案 {i + 1} · 生成中</span></div>;
        if (slot.status === "failed") return <div key={i} className="ai-candidate is-failed"><div className="ai-candidate-preview"><AlertCircle size={15} /></div><span title={slot.error}>方案 {i + 1} · {slot.error}</span></div>;
        const active = selected === i;
        return <button key={i} type="button" role="radio" aria-checked={active} className={"ai-candidate" + (active ? " is-selected" : "")} onClick={() => onSelect(i)}>
          <div className="ai-candidate-preview">{preview(slot.candidate)}{active && <span className="ai-candidate-check"><Check size={12} /></span>}</div>
          <span>{caption ? caption(slot.candidate) : slot.candidate.summary || `方案 ${i + 1}`}</span>
        </button>;
      })}
    </div>
  </div>;
}
