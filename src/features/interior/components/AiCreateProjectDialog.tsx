import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiComposer, type AiComposerValue } from "./AiComposer";
import { AiResults } from "./AiResults";
import { PlanThumbnail } from "./PlanThumbnail";
import { planToDesign } from "../ai/apply";
import { generatePlanCandidate, markCandidateApplied } from "../ai/client";
import { readyImageUrls } from "../ai/referenceImages";
import { sanitizePlan } from "../ai/sanitize";
import { useAiBatch } from "../ai/useAiBatch";
import { useAiCatalog } from "../ai/useAiCatalog";
import { DEFAULT_AI_COUNT } from "../ai/useRoomAi";
import { AI_TEMPLATE_ID } from "../data/templates";
import { area } from "../model/geometry";
import { formatMeters, meterDraft, parseMeterDraft } from "../model/lengthUnits";
import type { Design } from "../model/types";
import type { NewProjectInput } from "./NewProjectDialog";

/** AI 户型的长宽范围（mm）：太小放不下多个房间，太大超出单套住宅。 */
export const AI_SIZE_LIMITS = { min: 3000, max: 40000 } as const;
/** 默认 9 × 10 m：常见两到三居的尺度。 */
const DEFAULT_SIZE = { width: 9000, depth: 10000 };
const inRange = (mm: number) => Number.isFinite(mm) && mm >= AI_SIZE_LIMITS.min && mm <= AI_SIZE_LIMITS.max;

interface PlanRequest { description: string; images: string[]; width: number; depth: number }

/** 新建项目 →「AI 创建」：开着就保留输入；关掉弹窗会停止未完成的生成。 */
export function AiCreateProjectDialog({ open, pending, onClose, onSubmit }: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: NewProjectInput) => void;
}) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
    <DialogContent className="ai-dialog">
      <DialogHeader>
        <DialogTitle>AI 创建户型</DialogTitle>
        <DialogDescription>输入长宽与需求，AI 生成带门窗与家具的整套户型；选中一个方案后创建项目。</DialogDescription>
      </DialogHeader>
      {open && <AiCreateProjectForm pending={pending} onClose={onClose} onSubmit={onSubmit} />}
    </DialogContent>
  </Dialog>;
}

export function AiCreateProjectForm({ pending, onClose, onSubmit }: { pending: boolean; onClose: () => void; onSubmit: (input: NewProjectInput) => void }) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState(meterDraft(DEFAULT_SIZE.width)), [depth, setDepth] = useState(meterDraft(DEFAULT_SIZE.depth));
  const [composer, setComposer] = useState<AiComposerValue>({ description: "", images: [], count: DEFAULT_AI_COUNT });
  const [view, setView] = useState<"input" | "results">("input"), [picked, setPicked] = useState<number | null>(null);
  const { catalog } = useAiCatalog(undefined, true);
  const ai = useAiBatch<PlanRequest, { design: Design }>();
  const size = useMemo(() => ({ width: parseMeterDraft(width), depth: parseMeterDraft(depth) }), [width, depth]);
  const sizeValid = inRange(size.width) && inRange(size.depth);

  const send = () => {
    const description = composer.description.trim();
    if (!description || !sizeValid) return;
    const request: PlanRequest = { description, images: readyImageUrls(composer.images), width: Math.round(size.width), depth: Math.round(size.depth) };
    const aiCatalog = catalog;
    ai.start(request, composer.count, async (index, generationId) => {
      const { candidate } = await generatePlanCandidate({ generationId, index, description, images: request.images, catalog: aiCatalog.entries, width: request.width, depth: request.depth });
      const spec = sanitizePlan(candidate!.result, { width: request.width, depth: request.depth, catalog: aiCatalog });
      return { id: candidate!.candidateId, index, summary: candidate!.summary, result: { design: planToDesign(spec, aiCatalog) } };
    });
    setPicked(null);
    setView("results");
  };
  const back = () => { if (ai.running) ai.clear(); setView("input"); };
  const slots = ai.batch?.slots ?? [];
  const firstReady = slots.findIndex((slot) => slot.status === "ready");
  const selected = picked !== null && slots[picked]?.status === "ready" ? picked : firstReady >= 0 ? firstReady : null;
  const chosen = selected === null ? undefined : slots[selected];
  const confirm = () => {
    if (chosen?.status !== "ready") return;
    void markCandidateApplied(chosen.candidate.id).catch(() => undefined);
    onSubmit({ name: name.trim() || chosen.candidate.summary || "AI 户型", template: AI_TEMPLATE_ID, design: chosen.candidate.result.design });
  };

  if (view === "results" && ai.batch) return <div className="ai-create-results">
    <AiResults
      echo={{ description: ai.batch.request.description, images: ai.batch.request.images, details: `室内净尺寸 ${formatMeters(ai.batch.request.width)} × ${formatMeters(ai.batch.request.depth)} m` }}
      slots={slots}
      selected={selected}
      onSelect={setPicked}
      preview={(candidate) => <PlanThumbnail design={candidate.result.design} label={`${candidate.summary || "候选户型"}平面预览`} />}
      caption={(candidate) => <>{candidate.summary || `方案 ${candidate.index + 1}`}<small>{candidate.result.design.rooms.length} 个房间 · {candidate.result.design.rooms.reduce((sum, r) => sum + area(r), 0).toFixed(1)} m²</small></>}
    />
    <div className="ai-dialog-actions">
      <Button type="button" variant="ghost" disabled={pending} onClick={back}><ArrowLeft />{ai.running ? "停止并返回修改" : "返回修改"}</Button>
      <span />
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button>
      <Button type="button" loading={pending} disabled={chosen?.status !== "ready"} onClick={confirm}>{pending ? "正在创建…" : "确认创建"}</Button>
    </div>
  </div>;

  return <div className="ai-create-form">
    <div className="cms-field"><Label htmlFor="ai-project-name">项目名称</Label><Input id="ai-project-name" maxLength={100} placeholder="留空则用方案名称" value={name} onChange={(e) => setName(e.target.value)} /></div>
    <div className="new-project-size">
      <div className="cms-field"><Label htmlFor="ai-project-width">长 / m</Label><Input id="ai-project-width" type="number" inputMode="decimal" step={0.1} min={AI_SIZE_LIMITS.min / 1000} max={AI_SIZE_LIMITS.max / 1000} required aria-invalid={!inRange(size.width)} value={width} onChange={(e) => setWidth(e.target.value)} /></div>
      <div className="cms-field"><Label htmlFor="ai-project-depth">宽 / m</Label><Input id="ai-project-depth" type="number" inputMode="decimal" step={0.1} min={AI_SIZE_LIMITS.min / 1000} max={AI_SIZE_LIMITS.max / 1000} required aria-invalid={!inRange(size.depth)} value={depth} onChange={(e) => setDepth(e.target.value)} /></div>
    </div>
    <p className={"ai-size-hint" + (sizeValid ? "" : " is-error")} role={sizeValid ? undefined : "alert"}>
      {sizeValid ? `室内净尺寸 ${formatMeters(size.width)} × ${formatMeters(size.depth)} m · ${(size.width * size.depth / 1e6).toFixed(1)} m²，上方为北` : `长、宽需在 ${AI_SIZE_LIMITS.min / 1000}–${AI_SIZE_LIMITS.max / 1000} m 之间`}
    </p>
    {ai.batch && <button type="button" className="ai-link" onClick={() => setView("results")}>查看上一次的 {ai.batch.slots.length} 个方案</button>}
    <AiComposer
      value={composer}
      placeholder="描述户型需求，例如：三室两厅两卫，主卧朝南带卫生间，开放式厨房，原木风"
      blocked={sizeValid ? undefined : "请先填写有效的长宽"}
      onDescription={(description) => setComposer((c) => ({ ...c, description }))}
      onImages={(fn) => setComposer((c) => ({ ...c, images: fn(c.images) }))}
      onCount={(count) => setComposer((c) => ({ ...c, count }))}
      onSend={send}
    />
  </div>;
}
