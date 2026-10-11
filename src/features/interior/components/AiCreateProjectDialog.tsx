import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiComposer, type AiComposerValue } from "./AiComposer";
import { AiResults } from "./AiResults";
import { PlanThumbnail } from "./PlanThumbnail";
import { planLayout } from "../ai/apply";
import { generatePlanCandidate, markCandidateApplied } from "../ai/client";
import { planExamples } from "../ai/examples";
import { readyFiles, readyImageUrls } from "../ai/referenceImages";
import { sanitizePlan } from "../ai/sanitize";
import { useAiBatch } from "../ai/useAiBatch";
import { useAiCatalog } from "../ai/useAiCatalog";
import { DEFAULT_AI_COUNT } from "../ai/useRoomAi";
import { DEFAULT_AI_ENGINE, engineFields } from "../ai/models";
import { AI_TEMPLATE_ID } from "../data/templates";
import { area } from "../model/geometry";
import { reportCount } from "../model/layoutRules";
import type { Design } from "../model/types";
import type { NewProjectInput } from "./NewProjectDialog";

/** 默认填入的示例需求：长宽、几室几厅几卫都写在描述里由模型读取，用户可直接改。 */
export const DEFAULT_PLAN_PROMPT = "长 12 m × 宽 10 m，三室两厅两卫，主卧朝南带卫生间，开放式厨房，原木风";

interface PlanRequest { description: string; images: string[] }

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
        <DialogDescription>描述户型需求，生成带门窗与家具的方案，预览后创建项目。</DialogDescription>
      </DialogHeader>
      {open && <AiCreateProjectForm pending={pending} onClose={onClose} onSubmit={onSubmit} />}
    </DialogContent>
  </Dialog>;
}

export function AiCreateProjectForm({ pending, onClose, onSubmit }: { pending: boolean; onClose: () => void; onSubmit: (input: NewProjectInput) => void }) {
  const [name, setName] = useState("");
  const [composer, setComposer] = useState<AiComposerValue>({ description: DEFAULT_PLAN_PROMPT, images: [], count: DEFAULT_AI_COUNT, engine: DEFAULT_AI_ENGINE });
  const [view, setView] = useState<"input" | "results">("input"), [picked, setPicked] = useState<number | null>(null);
  const { catalog } = useAiCatalog(undefined, true);
  const ai = useAiBatch<PlanRequest, { design: Design }>();
  const relaunch = useRef<(() => void) | null>(null);

  const send = () => {
    const description = composer.description.trim();
    if (!description) return;
    const request: PlanRequest = { description, images: readyImageUrls(composer.images) };
    const files = readyFiles(composer.images);
    const aiCatalog = catalog, count = composer.count, engine = engineFields(composer.engine);
    const examples = planExamples(aiCatalog);
    const launch = () => ai.start(request, count, async (index, generationId) => {
      const { candidate } = await generatePlanCandidate({
        generationId, index, description, images: request.images, files, catalog: aiCatalog.entries, examples, ...engine,
      });
      const spec = sanitizePlan(candidate!.result, { catalog: aiCatalog });
      const { design, notes } = planLayout(spec, aiCatalog);
      return { id: candidate!.candidateId, index, summary: candidate!.summary, notes: reportCount(notes) ? notes : undefined, result: { design } };
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
  const echo = ai.batch && { description: ai.batch.request.description, images: ai.batch.request.images };

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
    <div className="cms-field"><Label htmlFor="ai-project-name">项目名称 <span className="ai-field-optional">可选</span></Label><Input id="ai-project-name" maxLength={100} placeholder="留空则用方案名称" value={name} onChange={(e) => setName(e.target.value)} /></div>
    {ai.batch && <button type="button" className="ai-link" onClick={() => setView("results")}>查看上一次的 {ai.batch.slots.length} 个方案</button>}
    <AiComposer
      value={composer}
      label="户型需求"
      hint="写下长宽、几室几厅几卫，以及朝向或风格偏好。"
      placeholder="描述户型尺寸、房间数量与设计偏好…"
      onDescription={(description) => setComposer((c) => ({ ...c, description }))}
      onImages={(fn) => setComposer((c) => ({ ...c, images: fn(c.images) }))}
      onCount={(count) => setComposer((c) => ({ ...c, count }))}
      onEngine={(engine) => setComposer((c) => ({ ...c, engine }))}
      onSend={send}
    />
  </div>;
}
