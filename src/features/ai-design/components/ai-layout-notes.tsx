import { useState } from "react";
import { ChevronDown, CircleCheck, TriangleAlert } from "lucide-react";
import type { AiCandidate, AiSlot } from "../types";

/**
 * 候选落地时的校正说明：电视柜改靠实墙、衣柜避开门扇等已自动微调的，
 * 以及仍需手动处理的问题。默认收起，只显示一行汇总。
 */
export function AiLayoutNotes<T>({ slots }: { slots: AiSlot<T>[] }) {
  const [open, setOpen] = useState(false);
  const ready = slots.filter((slot): slot is { status: "ready"; candidate: AiCandidate<T> } => slot.status === "ready" && !!slot.candidate.notes);
  const adjusted = ready.reduce((n, slot) => n + slot.candidate.notes!.adjusted.length, 0);
  const unresolved = ready.reduce((n, slot) => n + slot.candidate.notes!.unresolved.length, 0);
  if (!adjusted && !unresolved) return null;
  const summary = [adjusted ? `已自动微调 ${adjusted} 处` : "", unresolved ? `${unresolved} 处需要手动调整` : ""].filter(Boolean).join("，");
  return <div className="ai-layout-notes">
    <button type="button" className="ai-layout-notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      {unresolved ? <TriangleAlert size={13} /> : <CircleCheck size={13} />}
      <span>{summary}</span>
      <ChevronDown size={13} className={open ? "is-open" : undefined} />
    </button>
    {open && <div className="ai-layout-notes-body">
      {ready.map((slot) => {
        const { adjusted: done, unresolved: todo } = slot.candidate.notes!;
        if (!done.length && !todo.length) return null;
        return <section key={slot.candidate.index}>
          <h4>{slot.candidate.summary || `方案 ${slot.candidate.index + 1}`}</h4>
          <ul>
            {done.map((text) => <li key={"a" + text}><CircleCheck size={12} />{text}</li>)}
            {todo.map((text) => <li key={"u" + text} className="is-warning"><TriangleAlert size={12} />{text}</li>)}
          </ul>
        </section>;
      })}
    </div>}
  </div>;
}
