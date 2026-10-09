import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AiComposer } from "./AiComposer";
import { AiResults } from "./AiResults";
import { FurnitureChips } from "./FurnitureChips";
import { PlanThumbnail } from "./PlanThumbnail";
import { roomZone } from "../ai/context";
import { area } from "../model/geometry";
import { formatMeters } from "../model/lengthUnits";
import type { useRoomAi } from "../ai/useRoomAi";
import type { LibraryItem } from "../model/types";

type RoomAi = ReturnType<typeof useRoomAi>;

/**
 * 房间「AI 布局」弹窗：输入态（面积 + 家具清单 + 输入框）→ 原地换成候选方案 →
 * 选中一个「应用」。随时可返回输入态，输入内容保留；关掉弹窗后生成继续进行。
 */
export function AiRoomDialog({ ai, furniture }: { ai: RoomAi; furniture: LibraryItem[] }) {
  const { room, draft, batch } = ai;
  if (!room || !draft) return null;
  const [x1, y1, x2, y2] = roomZone(room);
  const results = ai.view === "results" && batch;
  const ready = !!batch?.slots.some((slot) => slot.status === "ready");
  return <Dialog open onOpenChange={(open) => { if (!open) ai.close(); }}>
    <DialogContent className="ai-dialog">
      <DialogHeader>
        <DialogTitle>AI 布局 · {room.name}</DialogTitle>
        <DialogDescription>结合整套户型生成家具布局，先预览再应用，可撤销。</DialogDescription>
      </DialogHeader>
      {results
        ? <>
          <AiResults
            echo={{ description: batch.request.description, images: batch.request.images, details: `家具：${batch.request.furniture.join("、") || "由 AI 从家具库挑选"}` }}
            slots={batch.slots}
            selected={ai.selected}
            onSelect={ai.select}
            onRegenerate={ai.regenerate}
            onRetry={ai.retry}
            preview={(candidate) => <PlanThumbnail design={candidate.result.preview} focusRoomId={room.id} label={`${candidate.summary || "候选方案"}平面预览`} />}
          />
          <div className="ai-dialog-actions">
            <Button type="button" variant="ghost" onClick={ai.back}><ArrowLeft />{ai.running ? "停止并返回修改" : "返回修改"}</Button>
            <span />
            <Button type="button" variant="outline" onClick={ai.close}>{ai.running ? "后台生成" : "取消"}</Button>
            <Button type="button" disabled={!ready || ai.selected === null} onClick={ai.apply}>应用方案</Button>
          </div>
        </>
        : <>
          <dl className="ai-room-facts">
            <div><dt>房间面积</dt><dd className="ai-room-area"><strong>{area(room).toFixed(2)} m²</strong><span>{formatMeters(x2 - x1)} × {formatMeters(y2 - y1)} m</span></dd></div>
            <div><dt>家具<span className="ai-field-optional">可选</span></dt><dd>
              <FurnitureChips picks={draft.picks} catalog={furniture} onChange={(picks) => ai.updateDraft((d) => ({ ...d, picks }))} />
              <small>{draft.picks.length ? "AI 只摆放清单里的家具，件数一致" : "未指定时由 AI 从家具库挑选"}</small>
            </dd></div>
          </dl>
          {ai.busyElsewhere && <p className="ai-note" role="status">另一个房间正在生成，发送后会停止那一批。</p>}
          {batch && <button type="button" className="ai-link" onClick={ai.showResults}>查看上一次的 {batch.slots.length} 个方案</button>}
          <AiComposer
            value={draft}
            label="布局需求"
            hint="例如：双人床靠北墙，留出梳妆位，整体原木风。"
            placeholder="描述家具位置、使用需求或喜欢的风格…"
            onDescription={(description) => ai.updateDraft((d) => ({ ...d, description }))}
            onImages={(fn) => ai.updateDraft((d) => ({ ...d, images: fn(d.images) }))}
            onCount={(count) => ai.updateDraft((d) => ({ ...d, count }))}
            onEngine={(engine) => ai.updateDraft((d) => ({ ...d, engine }))}
            onSend={ai.send}
          />
        </>}
    </DialogContent>
  </Dialog>;
}
