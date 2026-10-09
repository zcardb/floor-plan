import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/lib/notify";
import type { FurnitureSpec } from "../data/floorplanBuilder";
import type { Design } from "../model/types";
import { applyRoomLayout } from "./apply";
import { generateRoomCandidate, markCandidateApplied } from "./client";
import { furnitureInRoom, planSnapshot, roomContext, roomZone } from "./context";
import { initialPicks, pickNames, requiredOf, withPickSizes } from "./picks";
import { readyImageUrls, type AiImageDraft } from "./referenceImages";
import { sanitizeRoomItems } from "./sanitize";
import { useAiBatch } from "./useAiBatch";
import type { AiCatalog, AiFurniturePick } from "./types";

/** 输入草稿：每个房间一份，关掉弹窗、切换选中对象都保留。 */
export interface AiRoomDraft {
  description: string;
  images: AiImageDraft[];
  count: number;
  picks: AiFurniturePick[];
}

/** 一批候选对应的请求：回显内容 + 发送时的目录（应用时必须用同一份目录解析）。 */
export interface AiRoomRequest {
  roomId: string;
  roomName: string;
  description: string;
  images: string[];
  furniture: string[];
  catalog: AiCatalog;
}

/** 候选：家具简写 + 用它在发送时的方案上算出的预览。 */
export interface AiRoomResult {
  items: FurnitureSpec[];
  preview: Design;
}

export type AiEntryTone = "idle" | "running" | "unseen";

/** 默认 2 个方案：Opus 成本最高，2 个已能比较，又不让等待和花费翻倍。 */
export const DEFAULT_AI_COUNT = 2;

/**
 * 房间 AI 布局：同一时间只跑一批（新一批会替换旧的），结果在关掉弹窗后仍保留；
 * 弹窗关闭期间完成会提示，并在工具条入口上标记「有未查看的结果」。
 */
export function useRoomAi({ design, catalog, projectId, change }: {
  design: Design;
  catalog: AiCatalog;
  projectId?: string;
  change: (fn: (d: Design) => Design) => void;
}) {
  const ai = useAiBatch<AiRoomRequest, AiRoomResult>();
  const [drafts, setDrafts] = useState<Record<string, AiRoomDraft>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"input" | "results">("input");
  const [picked, setPicked] = useState<number | null>(null);
  const latest = useRef({ design, catalog });
  const relaunch = useRef<(() => void) | null>(null);
  latest.current = { design, catalog };

  const batchRoom = ai.batch?.request.roomId;
  const viewing = !!openId && openId === batchRoom && view === "results";
  const { running, markSeen } = ai;
  useEffect(() => { if (viewing && !running) markSeen(); }, [viewing, running, markSeen]);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && ai.batch && !viewing) {
      const ok = ai.batch.slots.some((slot) => slot.status === "ready");
      if (ok) notify.success(`「${ai.batch.request.roomName}」的 AI 布局已生成`, "选中该房间，点工具条上的「AI 布局」查看");
      else notify.fail(`「${ai.batch.request.roomName}」的 AI 布局生成失败，可重新打开修改后重试`);
    }
    wasRunning.current = running;
  }, [running, ai.batch, viewing]);

  const open = useCallback((roomId: string) => {
    const { design: d, catalog: c } = latest.current;
    const room = d.rooms.find((r) => r.id === roomId);
    if (!room) return;
    setDrafts((all) => (all[roomId] ? all : { ...all, [roomId]: { description: "", images: [], count: DEFAULT_AI_COUNT, picks: initialPicks(d, room, c) } }));
    setView(batchRoom === roomId ? "results" : "input");
    setOpenId(roomId);
  }, [batchRoom]);
  const close = useCallback(() => setOpenId(null), []);
  const updateDraft = useCallback((fn: (draft: AiRoomDraft) => AiRoomDraft) => {
    if (!openId) return;
    setDrafts((all) => (all[openId] ? { ...all, [openId]: fn(all[openId]) } : all));
  }, [openId]);

  const send = useCallback(() => {
    const { design: source } = latest.current;
    const room = openId ? source.rooms.find((r) => r.id === openId) : undefined;
    const draft = openId ? drafts[openId] : undefined;
    if (!room || !draft || !draft.description.trim()) return;
    const description = draft.description.trim(), images = readyImageUrls(draft.images);
    const aiCatalog = withPickSizes(latest.current.catalog, draft.picks);
    const required = requiredOf(draft.picks, aiCatalog);
    const context = roomContext(source, room), plan = planSnapshot(source, room.id);
    const existing = furnitureInRoom(source, room).slice(0, 60).map((f) => ({ name: f.name, w: Math.round(f.w), d: Math.round(f.d) }));
    const request: AiRoomRequest = { roomId: room.id, roomName: room.name, description, images, furniture: pickNames(draft.picks, aiCatalog), catalog: aiCatalog };
    const count = draft.count;
    const launch = () => ai.start(request, count, async (index, generationId) => {
      const { candidate } = await generateRoomCandidate({
        generationId, index, description, images, catalog: aiCatalog.entries, projectId, room: context, plan, existing, required,
      });
      const items = sanitizeRoomItems(candidate!.result, { zone: roomZone(room), catalog: aiCatalog, required });
      return { id: candidate!.candidateId, index, summary: candidate!.summary, warnings: candidate!.warnings, result: { items, preview: applyRoomLayout(source, room.id, items, aiCatalog) } };
    });
    relaunch.current = launch;
    launch();
    setPicked(null);
    setView("results");
  }, [openId, drafts, ai, projectId]);

  /** 重新生成：同样的描述、图片、家具与数量再来一批。 */
  const regenerate = useCallback(() => { relaunch.current?.(); setPicked(null); }, []);

  /** 返回输入：生成中则停止这一批；输入内容保留。 */
  const back = useCallback(() => { if (ai.running) ai.clear(); setView("input"); }, [ai]);

  const readyIndex = ai.batch?.slots.findIndex((slot) => slot.status === "ready") ?? -1;
  const selected = picked !== null && ai.batch?.slots[picked]?.status === "ready" ? picked : readyIndex >= 0 ? readyIndex : null;

  /** 应用选中的候选：一次 change，可一次撤销；只改这个房间的家具。 */
  const apply = useCallback(() => {
    const batch = ai.batch, slot = selected === null ? undefined : batch?.slots[selected];
    if (!batch || slot?.status !== "ready") return;
    const { roomId, roomName, catalog: aiCatalog } = batch.request;
    if (!latest.current.design.rooms.some((r) => r.id === roomId)) { notify.fail("房间已不存在，方案未改动"); return; }
    change((d) => applyRoomLayout(d, roomId, slot.candidate.result.items, aiCatalog));
    notify.success(`已应用到「${roomName}」`, "可按 Ctrl Z 撤销");
    void markCandidateApplied(slot.candidate.id).catch(() => undefined);
    ai.clear();
    setDrafts((all) => { const next = { ...all }; delete next[roomId]; return next; });
    setView("input");
    setOpenId(null);
  }, [ai, selected, change]);

  /** 工具条入口的状态：生成中显示 loading，完成但没看过显示提示点。 */
  const toneOf = (roomId: string): AiEntryTone =>
    batchRoom !== roomId ? "idle" : ai.running ? "running" : ai.batch && !ai.batch.seen ? "unseen" : "idle";

  const room = openId ? design.rooms.find((r) => r.id === openId) : undefined;
  return {
    room,
    draft: openId ? drafts[openId] : undefined,
    batch: openId && openId === batchRoom ? ai.batch : null,
    running: ai.running,
    /** 另一个房间正在生成：再发送会替换它。 */
    busyElsewhere: ai.running && !!batchRoom && batchRoom !== openId,
    view: openId === batchRoom ? view : "input",
    selected,
    select: setPicked,
    open, close, updateDraft, send, back, apply, toneOf, regenerate,
    showResults: () => setView("results"),
  };
}
