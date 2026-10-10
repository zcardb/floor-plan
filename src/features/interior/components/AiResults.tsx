import { useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2, Maximize2, RefreshCw, RotateCw } from "lucide-react";
import { ImagePreview, MediaPreview } from "./ImagePreview";
import type { AiCandidate, AiSlot } from "../ai/types";

/** 请求回显：描述、参考图，以及一行补充信息（指定家具、长宽等）。 */
export interface AiEcho {
  description: string;
  images: string[];
  details?: string;
}

/**
 * 候选方案网格：顶部回显本次请求；每个格子先是生成中，完成即显示真实几何预览，
 * 失败的格子只留一个重试按钮。进度只统计真实完成的请求。
 */
export function AiResults<T>({ echo, slots, selected, onSelect, preview, zoomPreview = preview, zoomLabel = "平面图", caption, onRegenerate, onRetry }: {
  echo: AiEcho;
  slots: AiSlot<T>[];
  selected: number | null;
  onSelect: (index: number) => void;
  preview: (candidate: AiCandidate<T>) => ReactNode;
  /** 放大查看时的内容（默认与卡片相同），例如可拖动旋转的 3D 模型。 */
  zoomPreview?: (candidate: AiCandidate<T>) => ReactNode;
  /** 放大查看的内容名称，用于无障碍标签。 */
  zoomLabel?: string;
  caption?: (candidate: AiCandidate<T>) => ReactNode;
  /** 生成结束后显示「重新生成」：同样的需求再来一批。 */
  onRegenerate?: () => void;
  /** 单个失败的方案重试。 */
  onRetry?: (index: number) => void;
}) {
  const done = slots.filter((slot) => slot.status !== "pending").length;
  const ready = slots.filter((slot) => slot.status === "ready").length;
  const failed = slots.filter((slot): slot is Extract<AiSlot<T>, { status: "failed" }> => slot.status === "failed");
  const running = done < slots.length;
  const warnings = slots.reduce((sum, slot) => sum + (slot.status === "ready" ? slot.candidate.warnings ?? 0 : 0), 0);
  const [zoomed, setZoomed] = useState<number | null>(null), [enlarged, setEnlarged] = useState<number | null>(null);
  const big = enlarged === null ? undefined : slots[enlarged];
  const bigCandidate = big?.status === "ready" ? big.candidate : null;
  const titleOf = (candidate: AiCandidate<T>) => candidate.summary || `方案 ${candidate.index + 1}`;
  return <div className="ai-results">
    <section className="ai-echo" aria-label="本次需求">
      <p>{echo.description}</p>
      {(echo.images.length > 0 || !!echo.details) && <div className="ai-echo-meta">
        {echo.images.map((url, i) => <button type="button" key={url} aria-label={`放大查看参考图 ${i + 1}`} onClick={() => setZoomed(i)}><img src={url} crossOrigin="anonymous" alt={`参考图 ${i + 1}`} /></button>)}
        {echo.details && <span>{echo.details}</span>}
      </div>}
    </section>
    <ImagePreview src={zoomed === null ? null : echo.images[zoomed] ?? null} alt={`参考图 ${(zoomed ?? 0) + 1}`} onClose={() => setZoomed(null)} />
    <div className="ai-progress-row">
      {!running && !ready
        ? <p className="ai-progress is-error" role="alert"><AlertCircle size={14} />{failed[0]?.error ?? "生成失败，请返回修改后重试"}</p>
        : <p className="ai-progress" role="status" aria-live="polite">
          {running && <Loader2 size={13} className="animate-spin" />}
          {running ? `正在生成 ${slots.length} 个方案 · 已完成 ${done} / ${slots.length}` : `已生成 ${ready} 个方案${failed.length ? `，${failed.length} 个失败` : ""} · 选择一个应用`}
        </p>}
      {!running && warnings > 0 && <span className="ai-note">其中 {warnings} 处尺寸或间距可能需要微调</span>}
      {onRegenerate && !running && <button type="button" className="ai-regenerate" onClick={onRegenerate}><RefreshCw size={13} />重新生成</button>}
    </div>
    <div className="ai-candidate-grid" role="radiogroup" aria-label="候选方案">
      {slots.map((slot, i) => {
        if (slot.status === "pending") return <div key={i} className="ai-candidate is-pending" aria-busy="true"><div className="ai-candidate-preview"><Loader2 size={15} className="animate-spin" /></div><span>方案 {i + 1} · 生成中</span></div>;
        // 失败格子与生成中同尺寸（1:1 预览 + 标题行），预览里只放重试按钮；错误原因在 title / aria-label 里。
        if (slot.status === "failed") return <div key={i} className="ai-candidate is-failed">
          <div className="ai-candidate-preview">
            {onRetry && <button type="button" className="ai-candidate-retry" title={slot.error} aria-label={`方案 ${i + 1} 生成失败：${slot.error}。点击重试`} onClick={() => onRetry(i)}><RotateCw size={13} />重试</button>}
          </div>
          {onRetry ? <span>方案 {i + 1} · 生成失败</span> : <span className="ai-candidate-error" title={slot.error}>方案 {i + 1} 生成失败</span>}
        </div>;
        const active = selected === i;
        // 选中与放大是两个独立按钮（按钮不能嵌套）：点卡片选中，点左上角放大查看。
        return <div key={i} className="ai-candidate-cell">
          <button type="button" role="radio" aria-checked={active} className={"ai-candidate" + (active ? " is-selected" : "")} onClick={() => onSelect(i)}>
            <div className="ai-candidate-preview">{preview(slot.candidate)}{active && <span className="ai-candidate-check"><Check size={12} /></span>}</div>
            <span>{caption ? caption(slot.candidate) : titleOf(slot.candidate)}</span>
          </button>
          <button type="button" className="ai-candidate-zoom" aria-label={`放大查看${titleOf(slot.candidate)}`} onClick={() => setEnlarged(i)}><Maximize2 size={13} /></button>
        </div>;
      })}
    </div>
    <MediaPreview open={!!bigCandidate} label={bigCandidate ? `${titleOf(bigCandidate)}${zoomLabel}` : `方案${zoomLabel}`} onClose={() => setEnlarged(null)}>
      {bigCandidate && <figure className="image-lightbox-plan">
        <div className="image-lightbox-plan-paper">{zoomPreview(bigCandidate)}</div>
        <figcaption>{titleOf(bigCandidate)}</figcaption>
      </figure>}
    </MediaPreview>
  </div>;
}
