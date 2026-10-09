import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, SlidersHorizontal } from "lucide-react";
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
import { parseMeterDraft } from "../model/lengthUnits";
import type { Design } from "../model/types";
import { AI_ROOM_LIMITS, AI_SIZE_LIMITS, advancedLabel, planHints } from "../ai/planFields";
import type { NewProjectInput } from "./NewProjectDialog";

interface PlanRequest { description: string; images: string[]; width?: number; depth?: number; hints: string[]; label: string }

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
        <DialogDescription>描述需求，AI 生成带门窗与家具的整套户型；选中一个方案后创建项目。</DialogDescription>
      </DialogHeader>
      {open && <AiCreateProjectForm pending={pending} onClose={onClose} onSubmit={onSubmit} />}
    </DialogContent>
  </Dialog>;
}

export function AiCreateProjectForm({ pending, onClose, onSubmit }: { pending: boolean; onClose: () => void; onSubmit: (input: NewProjectInput) => void }) {
  const [name, setName] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [width, setWidth] = useState(""), [depth, setDepth] = useState("");
  const [rooms, setRooms] = useState({ bedrooms: "", livingRooms: "", bathrooms: "" });
  const [composer, setComposer] = useState<AiComposerValue>({ description: "", images: [], count: DEFAULT_AI_COUNT });
  const [view, setView] = useState<"input" | "results">("input"), [picked, setPicked] = useState<number | null>(null);
  const { catalog } = useAiCatalog(undefined, true);
  const ai = useAiBatch<PlanRequest, { design: Design }>();
  const size = useMemo(() => ({ width: parseMeterDraft(width), depth: parseMeterDraft(depth) }), [width, depth]);
  const badSize = [size.width, size.depth].some((n) => Number.isFinite(n) && (n < AI_SIZE_LIMITS.min || n > AI_SIZE_LIMITS.max));
  const summary = advancedLabel(size, rooms);
  const sizeError = badSize ? `长、宽需在 ${AI_SIZE_LIMITS.min / 1000}–${AI_SIZE_LIMITS.max / 1000} m 之间，或留空由 AI 决定` : "";
  const relaunch = useRef<(() => void) | null>(null);

  const send = () => {
    const description = composer.description.trim();
    if (!description || badSize) return;
    const hints = planHints(rooms);
    const request: PlanRequest = {
      description, images: readyImageUrls(composer.images), hints, label: summary,
      ...(Number.isFinite(size.width) ? { width: Math.round(size.width) } : {}),
      ...(Number.isFinite(size.depth) ? { depth: Math.round(size.depth) } : {}),
    };
    const aiCatalog = catalog, count = composer.count;
    const launch = () => ai.start(request, count, async (index, generationId) => {
      const { candidate } = await generatePlanCandidate({
        generationId, index, description, images: request.images, catalog: aiCatalog.entries, hints, width: request.width, depth: request.depth,
      });
      const spec = sanitizePlan(candidate!.result, { width: request.width, depth: request.depth, catalog: aiCatalog });
      return { id: candidate!.candidateId, index, summary: candidate!.summary, warnings: candidate!.warnings, result: { design: planToDesign(spec, aiCatalog) } };
    });
    relaunch.current = launch;
    launch();
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
  const echo = ai.batch && { description: ai.batch.request.description, images: ai.batch.request.images, details: ai.batch.request.label };

  if (view === "results" && ai.batch && echo) return <div className="ai-create-results">
    <AiResults
      echo={echo}
      slots={slots}
      selected={selected}
      onSelect={setPicked}
      onRegenerate={() => { relaunch.current?.(); setPicked(null); }}
      onRetry={ai.retry}
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
    {ai.batch && <button type="button" className="ai-link" onClick={() => setView("results")}>查看上一次的 {ai.batch.slots.length} 个方案</button>}
    <AiComposer
      value={composer}
      placeholder="描述户型需求，例如：三室两厅两卫，主卧朝南带卫生间，开放式厨房，原木风"
      blocked={badSize ? "高级设计里的长、宽有误，请修改或清空" : undefined}
      onDescription={(description) => setComposer((c) => ({ ...c, description }))}
      onImages={(fn) => setComposer((c) => ({ ...c, images: fn(c.images) }))}
      onCount={(count) => setComposer((c) => ({ ...c, count }))}
      onSend={send}
    />
    <section className={"ai-advanced" + (advanced ? " is-open" : "")}>
      <button type="button" className="ai-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>
        <SlidersHorizontal size={15} />
        <span>高级设计</span>
        <small>{summary || "选填 · 长宽、几室几厅几卫"}</small>
        <ChevronDown size={15} className="ai-advanced-caret" />
      </button>
      {advanced && <div className="ai-advanced-body">
        <div className="ai-advanced-row">
          <div className="cms-field"><Label htmlFor="ai-project-width">长 / m</Label><Input id="ai-project-width" type="number" inputMode="decimal" step={0.1} min={AI_SIZE_LIMITS.min / 1000} max={AI_SIZE_LIMITS.max / 1000} placeholder="留空由 AI 决定" aria-invalid={badSize || undefined} value={width} onChange={(e) => setWidth(e.target.value)} /></div>
          <div className="cms-field"><Label htmlFor="ai-project-depth">宽 / m</Label><Input id="ai-project-depth" type="number" inputMode="decimal" step={0.1} min={AI_SIZE_LIMITS.min / 1000} max={AI_SIZE_LIMITS.max / 1000} placeholder="留空由 AI 决定" aria-invalid={badSize || undefined} value={depth} onChange={(e) => setDepth(e.target.value)} /></div>
        </div>
        <div className="ai-advanced-row is-three">
          {([["bedrooms", "卧室", AI_ROOM_LIMITS.bedrooms], ["livingRooms", "厅", AI_ROOM_LIMITS.livingRooms], ["bathrooms", "卫生间", AI_ROOM_LIMITS.bathrooms]] as const).map(([key, label, max]) =>
            <div className="cms-field" key={key}><Label htmlFor={`ai-project-${key}`}>{label}</Label><Input id={`ai-project-${key}`} type="number" inputMode="numeric" min={1} max={max} placeholder="不限" value={rooms[key]} onChange={(e) => setRooms((current) => ({ ...current, [key]: e.target.value }))} /></div>)}
        </div>
        {sizeError ? <p className="ai-size-hint is-error" role="alert">{sizeError}</p> : <p className="ai-note">填写的内容会一并交给 AI；留空则由 AI 按描述决定。</p>}
      </div>}
    </section>
  </div>;
}

