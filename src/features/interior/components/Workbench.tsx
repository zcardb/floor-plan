import { useCallback, useEffect, useRef, useState } from "react";
import { formatMeters } from '../model/lengthUnits';
import { canEditWall, openingIsLocked } from '../model/wallPolicy';
import { DrawingExportItems } from './DrawingExportItems';
import type { DrawingFormat } from '../model/drawingExport';
import { DimensionEditDialog } from './DimensionEditDialog';
import { WallSplitDialog } from './WallSplitDialog';
import { splitWall as splitWallModel } from '../model/wallSplit';
import { mergeWall as mergeWallModel, wallMergeGroup } from '../model/wallMerge';
import { isBearingWall } from '../model/wallPolicy';
import { length } from '../model/geometry';
import { dimensionEditPolicy, editDimensionWalls } from '../model/dimensionWallEdit';
import type { DimensionBinding } from '../model/dimensionBinding';
import type { DimensionSegment } from '../model/perimeterDimensions';
import {
  Armchair,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  DoorOpen,
  Download,
  Eraser,
  Expand,
  Eye,
  FolderOpen,
  HelpCircle,
  Layers3,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Minus,
  Moon,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  ScanLine,
  Settings2,
  ShieldCheck,
  SquareDashed,
  Sun,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { WorkbenchHeader, type WorkbenchHeaderProps } from "./WorkbenchHeader";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { useDesign } from "../model/useDesign";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { center, norm, pushOut, rebuildRooms } from "../model/geometry";
import {
  uid,
  type CustomFloor,
  type Design,
  type Layers,
  type LibraryItem,
  type Point,
  type Project,
  type Selection,
  type Tool,
} from "../model/types";
import { blankDesign, referenceDesign } from "../data/templates";
import { validateDesign } from "../model/validation";
import { Library } from "./Library";
import { PropertyPanel } from "./PropertyPanel";
import { CostPanel } from "./CostPanel";
import { PanelModeTabs } from "./PanelModeTabs";
import { CustomFurnitureDialog } from "./CustomFurnitureDialog";
import { SelectionEditor, type SelectionEditorHandle } from "./SelectionEditor";
import { furnitureKey } from "../model/costs";
import type { ScreenRect } from "../model/selectionAnchor";
import { PlanCanvas, type CanvasHandle } from "./PlanCanvas";
import type { Scene3D, SceneHandle, SceneOptions } from "../scene/Scene3D";
import { isSaveProblem, type SaveStatus } from "../cloud/useProjects";
import { useAsyncAction } from "@/hooks/useAsyncAction";
type SceneComponent = typeof Scene3D;
interface Props {
  project: Project;
  projectNavigation: Pick<WorkbenchHeaderProps, 'projectList' | 'hasMore' | 'listLoading' | 'onOpen' | 'onLoadMore'>;
  update: (d: Design) => void;
  status: SaveStatus;
  loggedIn: boolean;
  email?: string;
  projects: () => void;
  login: () => void;
  logout: () => void;
  loggingOut?: boolean;
  save: () => void;
  cloudSave: () => Promise<boolean>;
  importProject: (d: Design, name: string) => Promise<boolean>;
}
function ToolButton({
  label,
  note,
  shortcut,
  active,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  note?: string;
  shortcut?: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <EditorTooltip label={label} description={note} shortcut={shortcut}>
      <span className="tool-button-wrap">
        <button
          className={"tool-button " + (active ? "active" : "")}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
        >
          {children}
          <span>{label}</span>
        </button>
      </span>
    </EditorTooltip>
  );
}
export function Workbench(p: Props) {
  const confirm = useConfirm();
  const model = useDesign(p.project.state, p.update),
    { design: d, change, commit, preview, undo, redo, counts, sizeTransaction } = model;
  const [selection, setSelection] = useState<Selection>(null),
    [tool, setTool] = useState<Tool>("select"),
    [view, setView] = useState<"2d" | "3d">("2d"),
    [Scene, setScene] = useState<SceneComponent | null>(null),
    [sceneLoading, setSceneLoading] = useState(false),
    [hideLib, setHideLib] = useState(false),
    [hidePanel, setHidePanel] = useState(false),
    [drawer, setDrawer] = useState<"lib" | "panel" | null>(null),
    [help, setHelp] = useState(false),
    [scale, setScale] = useState(0.05);
  useEffect(()=>{ sizeTransaction.flush(); },[selection?.id,tool,view,sizeTransaction]);
  const coordLabel = useRef<HTMLSpanElement>(null);
  const onCoord = useCallback((p: Point) => {
    if (coordLabel.current)
      coordLabel.current.textContent = `X ${formatMeters(p[0])}  /  Y ${formatMeters(p[1])} m`;
  }, []);
  const [layerState, setLayers] = useState<Layers>({
      grid: false,
      dims: true,
      labels: true,
      furn: true,
      bearing: true,
      snap: true,
    }),
    [sceneOptions, setSceneOptions] = useState<SceneOptions>({
      cut: false,
      night: false,
      hour: 10,
      mode: "orbit",
    });
  const layers: Layers = { ...layerState, dims: d.dimensionSettings?.visible ?? true };
  const [dimensionEdit, setDimensionEdit] = useState<{ binding: DimensionBinding; before: Design } | null>(null);
  const dimensionValid = dimensionEdit && view === '2d' && tool === 'select' && layers.dims &&
    d === dimensionEdit.before;
  useEffect(() => { if (dimensionEdit && !dimensionValid) setDimensionEdit(null); }, [dimensionEdit, dimensionValid]);
  const openDimension = (segment: DimensionSegment) => {
    sizeTransaction.cancel();
    const before = model.current.current;
    const policy = dimensionEditPolicy(before, segment.binding);
    if (policy.reason || !segment.binding) { notify.info(policy.reason || '此尺寸仅供查看'); return; }
    setSelection(null);
    setDimensionEdit({ binding: segment.binding, before });
  };
  const [wallSplit, setWallSplit] = useState<{ wallId: string; before: Design } | null>(null);
  const splitValid = wallSplit && view === '2d' && tool === 'select' && d === wallSplit.before &&
    selection?.kind === 'wall' && selection.id === wallSplit.wallId;
  useEffect(() => { if (wallSplit && !splitValid) setWallSplit(null); }, [wallSplit, splitValid]);
  const openWallSplit = (wallId: string) => {
    sizeTransaction.cancel();
    const before = model.current.current;
    if (!before.walls.some(w => w.id === wallId) || before.demolished.includes(wallId)) return;
    setDimensionEdit(null);
    setDrawer(null);
    setWallSplit({ wallId, before });
  };
  const cancelWallSplit = async (wallId: string) => {
    sizeTransaction.cancel();
    const before = model.current.current;
    const group = wallMergeGroup(before, wallId);
    if (group.length < 2) return;
    const bearing = group.some(isBearingWall);
    const ok = await confirm({ title: '取消分割并合并墙段？', description: `将 ${group.length} 段合并为 ${(group.reduce((sum, w) => sum + length(w), 0) / 1000).toFixed(2)} m 的整段墙。${bearing ? '承重保护将保留；若原来只有局部用户标记，合并后整段将被保护。' : '不会自动标记承重。'} 门窗位置保持不变，可撤销。`, confirmText: '取消分割' });
    if (!ok) return;
    try {
      if (model.current.current !== before) throw new Error('设计已变化，请重新选择墙体');
      const result = mergeWallModel(before, wallId);
      commit(result.design, before);
      setSelection({ kind: 'wall', id: result.selectedId });
      notify.success('已取消分割，连续墙段已合并');
    } catch (e) { notify.fail(e instanceof Error ? e.message : '取消分割失败'); }
  };
  const [panelMode, setPanelMode] = useState<"props" | "cost">("props"),
    [customOpen, setCustomOpen] = useState(false);
  const saveCustom = (item: LibraryItem) => {
    if (!p.loggedIn) return;
    change((d) => d.customCatalog?.some((i) => i.catalogId === item.catalogId)
      ? d : { ...d, customCatalog: [...(d.customCatalog || []), item] });
    notify.success("家具已加入当前项目目录");
  };
  const saveCustomFloor = (floor: CustomFloor) => {
    if (!p.loggedIn) return;
    change((d) => d.customFloors?.some((f) => f.key === floor.key)
      ? d : { ...d, customFloors: [...(d.customFloors || []), floor] });
    notify.success("地面已加入当前项目，可在房间材质中选择");
  };
  const stage = useRef<HTMLElement>(null),
    editor = useRef<SelectionEditorHandle>(null);
  const onAnchor = useCallback(
    (r: ScreenRect | null) => editor.current?.update(r),
    [],
  );
  const canvas = useRef<CanvasHandle>(null),
    scene = useRef<SceneHandle>(null),
    file = useRef<HTMLInputElement>(null),
    mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const select = useCallback((s: Selection) => {
      sizeTransaction.flush();
      setSelection(s);
      if (s?.kind === "room") scene.current?.room(s.id);
    }, [sizeTransaction]),
    closePanels = useCallback(() => { sizeTransaction.flush(); setDrawer(null); }, [sizeTransaction]);
  const toggleView = async (next: "2d" | "3d") => {
    if (next === "3d" && !Scene) {
      setSceneLoading(true);
      try {
        const m = await import("../scene/Scene3D");
        if (mounted.current) {
          setScene(() => m.Scene3D);
          setView("3d");
        }
      } catch {
        notify.error("3D 引擎加载失败，2D 仍可编辑", "模块加载失败，请检查网络后重试");
      } finally {
        if (mounted.current) setSceneLoading(false);
      }
    } else setView(next);
    setTool("select");
  };
  const add = useCallback(
    (it: LibraryItem, point?: Point) => {
      const r =
          selection?.kind === "room"
            ? d.rooms.find((r) => r.id === selection.id)
            : null,
        p =
          point ||
          (view === "3d" ? scene.current?.ground() : null) ||
          (r ? center(r) : [d.width / 2, d.depth / 2]);
      const f = pushOut(
        {
          ...it,
          catalogId: it.catalogId || `${it.type}:${it.name}`,
          id: uid(),
          cx: Math.round(p[0] / 10) * 10,
          cy: Math.round(p[1] / 10) * 10,
          rot: 0,
        },
        d,
      );
      change((d) => ({
        ...d,
        furniture:
          it.type === "rug" ? [f, ...d.furniture] : [...d.furniture, f],
      }));
      setSelection({ kind: "furniture", id: f.id });
      setTool("select");
      setDrawer(null);
      notify.success("已添加 " + it.name);
    },
    [d, selection, view, change],
  );
  const rotate = useCallback(
    (angle = 90) => {
      sizeTransaction.flush();
      if (selection?.kind === "furniture")
        change((d) => ({
          ...d,
          furniture: d.furniture.map((f) =>
            f.id === selection.id ? { ...f, rot: norm(f.rot + angle) } : f,
          ),
        }));
    },
    [selection, change, sizeTransaction],
  );
  const duplicate = useCallback(() => {
    if (selection?.kind !== "furniture") return;
    const f = d.furniture.find((f) => f.id === selection.id);
    if (!f) return;
    const next = {
      ...f,
      catalogId: furnitureKey(f),
      id: uid(),
      cx: f.cx + 200,
      cy: f.cy + 200,
    };
    change((d) => ({ ...d, furniture: [...d.furniture, next] }));
    setSelection({ kind: "furniture", id: next.id });
    notify.success(`已复制「${f.name}」`);
  }, [d, selection, change]);
  const remove = useCallback(() => {
    if (!selection) return;
    const s = selection;
    if (s.kind === "furniture") {
      const f = d.furniture.find((f) => f.id === s.id);
      change((d) => ({
        ...d,
        furniture: d.furniture.filter((f) => f.id !== s.id),
      }));
      if (f) notify.success(`已删除「${f.name}」，可撤销恢复`);
    }
    else if (s.kind === "opening") {
      const opening = d.openings.find(o => o.id === s.id);
      if (opening && openingIsLocked(d, opening.wallId)) return notify.fail('承重墙上的门窗洞口不可删除');
      change((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== s.id) }));
      if (opening) notify.success(`已删除${opening.kind === "door" ? "门" : "窗"}，可撤销恢复`);
    }
    else if (s.kind === "wall") {
      const w = d.walls.find((w) => w.id === s.id);
      if (!w || !canEditWall(d, w))
        return notify.fail("此墙体不可删除");
      change((d) =>
        rebuildRooms({
          ...d,
          walls: d.walls.filter((w) => w.id !== s.id),
          openings: d.openings.filter((o) => o.wallId !== s.id),
        }),
      );
      notify.success("已删除墙体，可撤销恢复");
    }
    setSelection(null);
  }, [d, selection, change]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input,textarea,select") ||
        sceneOptions.mode === "walk"
      )
        return;
      const mod = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "escape") {
        setSelection(null);
        setTool("select");
        setDrawer(null);
      } else if (k === "delete" || k === "backspace") {
        e.preventDefault();
        remove();
      } else if (k === "r") rotate(e.shiftKey ? -90 : 90);
      else if (k === "t") void toggleView(view === "2d" ? "3d" : "2d");
      else if (k === "f") {
        if (view === "2d") canvas.current?.fit();
        else scene.current?.iso();
      } else if (k === "v") setTool("select");
      else if (k === "m" && view === "2d") setTool("measure");
      else if (k === "x" && view === "2d") setTool("demolish");
      else if (k.startsWith("arrow") && selection?.kind === "furniture") {
        e.preventDefault();
        const st = e.shiftKey ? 100 : 10;
        change((d) => ({
          ...d,
          furniture: d.furniture.map((f) =>
            f.id === selection.id
              ? {
                  ...f,
                  cx:
                    f.cx +
                    (k === "arrowright" ? st : k === "arrowleft" ? -st : 0),
                  cy:
                    f.cy + (k === "arrowdown" ? st : k === "arrowup" ? -st : 0),
                }
              : f,
          ),
        }));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const togglePane = (which: "lib" | "panel") => {
    if (matchMedia("(max-width:1100px)").matches)
      setDrawer((v) => (v === which ? null : which));
    else if (which === "lib") setHideLib((v) => !v);
    else setHidePanel((v) => !v);
  };
  const exportImage = () => {
    sizeTransaction.cancel();
    if (view === "2d") canvas.current?.exportImage();
    else scene.current?.shot();
  };
  const cloudSave = useAsyncAction(p.cloudSave);
  const importJson = useAsyncAction(async (f: File) => {
    try {
      const raw = JSON.parse(await f.text()),
        d = validateDesign(raw.state || raw);
      return await p.importProject(d, raw.name || f.name.replace(/\.json$/, ""));
    } catch (e) {
      notify.error("导入失败，文件格式不正确", e);
      return false;
    }
  });
  const exportDrawingAction = useAsyncAction(async (format: DrawingFormat) => {
    const snapshot = structuredClone(model.current.current);
    try {
      const { downloadDrawing } = await import('../model/drawingExport');
      downloadDrawing(snapshot, layers, format, p.project.name);
      notify.success(format === 'dxf' ? '已导出 CAD 图纸（DXF）' : '已导出矢量图（SVG）');
    } catch (error) {
      notify.error('工程图导出失败', error);
    }
  });
  const exportDrawing = (format: DrawingFormat) => {
    sizeTransaction.cancel();
    return exportDrawingAction.run(format);
  };
  const exportJson = () => {
    sizeTransaction.cancel();
    const blob = new Blob(
        [JSON.stringify({ name: p.project.name, ...model.current.current }, null, 2)],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = p.project.name + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify.success("JSON 备份已下载");
  };
  const clearFurniture = async () => {
    if (!d.furniture.length) return;
    const ok = await confirm({
      title: "清空所有家具？",
      description: "墙体、材质和测量会保留，可撤销恢复。",
      confirmText: "清空家具",
      tone: "destructive",
    });
    if (!ok) return;
    const count = d.furniture.length;
    change((d) => ({ ...d, furniture: [] }));
    setSelection(null);
    notify.success(`已清空 ${count} 件家具，可撤销恢复`);
  };
  const resetDesign = async () => {
    const ok = await confirm({
      title: "重置当前项目为其初始模板？",
      description: "墙体、家具与测量都会恢复到初始模板，可撤销恢复。",
      confirmText: "重置方案",
      tone: "destructive",
    });
    if (!ok) return;
    change(() => (d.template === "blank" ? blankDesign() : referenceDesign()));
    setSelection(null);
    notify.success("已重置为初始模板，可撤销恢复");
  };
  const clearMeasures = () => {
    if (!d.measures.length) return;
    change((d) => ({ ...d, measures: [] }));
    notify.success("已清除全部测量");
  };
  const tip =
    tool === "wall"
      ? "点击起点与转角连续绘墙 · 可拖动起段 · 双击 / 右键 / Enter 完成 · Esc 取消草稿"
      : tool === "measure"
        ? "点击起点与转角连续测量 · 可拖动起段 · 双击 / 右键 / Enter 完成 · Esc 取消草稿 · 在「更多」菜单清除测量线"
        : tool === "demolish"
          ? "点击非承重墙标记拆除，再次点击恢复"
          : tool === "door" || tool === "window"
            ? "点击墙体放置门窗，选中后可沿墙拖动或使用可视编辑工具条调整"
            : view === "3d"
              ? "拖动旋转 · 滚轮缩放 · 选中家具可移动 · 点击门开关"
              : "拖入家具，开始规划你的理想空间";
  return (
    <div
      className={
        "workbench " +
        (hideLib ? "hide-library " : "") +
        (hidePanel ? "hide-properties" : "")
      }
    >
      {p.loggedIn ? <WorkbenchHeader {...p.projectNavigation} project={p.project} email={p.email} view={view} onBack={()=>{sizeTransaction.cancel();p.projects();}} onOpen={async row=>{sizeTransaction.cancel();return p.projectNavigation.onOpen(row);}} onLogout={p.logout} loggingOut={p.loggingOut} onDownload={exportImage} onExportDrawing={format => void exportDrawing(format)} /> : <header className="main-header">
        <div className="brand-mark">
          <LayoutTemplate size={23} />
        </div>
        <div className="brand-text">
          <b>
            筑间<span>STUDIO</span>
          </b>
          <small>把想象，变成家的模样</small>
        </div>
        <span className="header-divider" />
        <span className="project-title">参考户型</span>
        <span className="save-indicator">
          <span
            className={isSaveProblem(p.status) ? "error-dot" : "status-dot"}
          />
          {p.status.label}
        </span>
        <div className="header-spacer" />
        <>
        <EditorTooltip label="登录" description="登录后项目自动保存到云端，可管理多个方案">
          <Button size="sm" className="login-button" onClick={p.login}>
            <UserRound />
            <span>登录</span>
          </Button>
        </EditorTooltip>
        <DropdownMenu>
          <EditorTooltip label="保存" description="下载图片 / 工程图，或保存到云端">
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="save-button">
                <Save />
                <span>保存</span>
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
          </EditorTooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportImage}>
              <Download />
              保存到本地
            </DropdownMenuItem>
            <DrawingExportItems disabled={view !== '2d' || exportDrawingAction.pending} onExport={format => void exportDrawing(format)} />
            <DropdownMenuItem disabled={cloudSave.pending} onClick={() => void cloudSave.run()}>
              {cloudSave.pending ? <Loader2 className="animate-spin" /> : <Cloud />}
              保存到云端
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu></>
      </header>}
      <div className="main-toolbar">
        <div className="view-switch">
          <EditorTooltip
            label="2D 平面"
            description="俯视平面图，布置家具与墙体"
            shortcut="T"
          >
            <button
              className={view === "2d" ? "active" : ""}
              onClick={() => void toggleView("2d")}
            >
              <LayoutTemplate size={15} />
              2D 平面
            </button>
          </EditorTooltip>
          <EditorTooltip
            label="3D 场景"
            description="立体预览，可漫游与查看光照"
            shortcut="T"
            disabled={sceneLoading}
          >
            <button
              className={view === "3d" ? "active" : ""}
              onClick={() => void toggleView("3d")}
              disabled={sceneLoading}
            >
              {sceneLoading ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <Layers3 size={15} />
              )}
              3D 场景
            </button>
          </EditorTooltip>
        </div>
        <span className="toolbar-divider" />
        {view === "2d" ? (
          <div className="tool-group">
            <ToolButton
              label="选择"
              note="点选对象查看属性，拖动移动家具与隔墙"
              shortcut="V"
              active={tool === "select"}
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={16} />
            </ToolButton>
            {d.template === "blank" && (
              <ToolButton
                label="绘墙"
                note="连续点击绘制隔墙，双击 / 右键 / Enter 完成"
                active={tool === "wall"}
                onClick={() => setTool("wall")}
              >
                <SquareDashed size={16} />
              </ToolButton>
            )}
            {d.template === "blank" && (
              <>
                <ToolButton label="门" note="点击墙体放置门" active={tool === "door"} onClick={() => setTool("door")}>
                  <DoorOpen size={16} />
                </ToolButton>
                <ToolButton label="窗" note="点击墙体放置窗" active={tool === "window"} onClick={() => setTool("window")}>
                  <ScanLine size={16} />
                </ToolButton>
              </>
            )}
            <DropdownMenu>
              <EditorTooltip label="更多" description="测量距离、清除测量线、拆改非承重墙">
                <DropdownMenuTrigger asChild>
                  <button
                    className={
                      "tool-button " + (tool === "measure" || tool === "demolish" ? "active" : "")
                    }
                    aria-label="更多"
                  >
                    <Settings2 size={16} />
                    <span>更多</span>
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
              </EditorTooltip>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setTool("measure")}>
                  <Ruler />
                  测量距离
                  {tool === "measure" ? (
                    <Check size={13} className="menu-mark" />
                  ) : (
                    <kbd className="menu-kbd">M</kbd>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="danger-item"
                  disabled={!d.measures.length}
                  onSelect={clearMeasures}
                >
                  <Eraser />
                  清除测量线
                  {d.measures.length > 0 && (
                    <span className="menu-count">{d.measures.length}</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="danger-item"
                  onSelect={() => setTool("demolish")}
                >
                  <Trash2 />
                  拆改非承重墙
                  {tool === "demolish" ? (
                    <Check size={13} className="menu-mark" />
                  ) : (
                    <kbd className="menu-kbd">X</kbd>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="tool-group">
            <ToolButton
              label="鸟瞰"
              note="拖动旋转视角，滚轮缩放"
              active={sceneOptions.mode === "orbit"}
              onClick={() => setSceneOptions((o) => ({ ...o, mode: "orbit" }))}
            >
              <Eye size={16} />
            </ToolButton>
            <ToolButton
              label="漫游"
              note="以人的视角在室内行走"
              active={sceneOptions.mode === "walk"}
              onClick={() => {
                setSelection(null);
                setSceneOptions((o) => ({ ...o, mode: "walk", cut: false }));
              }}
            >
              <UserRound size={16} />
            </ToolButton>
            <ToolButton label="俯视" note="切换到正上方俯视角度" onClick={() => scene.current?.top()}>
              <LayoutTemplate size={16} />
            </ToolButton>
            <ToolButton
              label="剖切"
              note="隐藏墙体上半部分，看清室内布局"
              active={sceneOptions.cut}
              onClick={() => setSceneOptions((o) => ({ ...o, cut: !o.cut }))}
            >
              <ScanLine size={16} />
            </ToolButton>
          </div>
        )}
        <span className="toolbar-divider" />
        <div className="tool-group">
          <ToolButton
            label="撤销"
            note="回退上一步修改"
            shortcut="Ctrl Z"
            onClick={undo}
            disabled={!counts.undo}
          >
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton
            label="重做"
            note="恢复刚撤销的修改"
            shortcut="Ctrl ⇧ Z"
            onClick={redo}
            disabled={!counts.redo}
          >
            <Redo2 size={16} />
          </ToolButton>
        </div>
        <span className="toolbar-divider" />
        <div className="tool-group danger-actions">
          <ToolButton label="重置方案" note="墙体、家具与测量恢复为初始模板，可撤销" onClick={resetDesign}>
            <RotateCcw size={16} />
          </ToolButton>
          <ToolButton
            label="清空家具"
            note={d.furniture.length ? "移除所有家具，保留墙体与材质，可撤销" : "当前没有家具"}
            disabled={!d.furniture.length}
            onClick={clearFurniture}
          >
            <Trash2 size={16} />
          </ToolButton>
        </div>
        <div className="header-spacer" />
        <div className="toolbar-right">
          <DropdownMenu>
            <EditorTooltip label="图层" description="显示或隐藏尺寸、房间名、家具、网格、承重高亮与吸附">
              <DropdownMenuTrigger asChild>
                <button className="tool-button" aria-label="图层">
                  <Layers3 size={16} />
                  <span>图层</span>
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
            </EditorTooltip>
            <DropdownMenuContent align="end">
              {(
                ["dims", "labels", "furn", "grid", "bearing", "snap"] as const
              ).map((key, i) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (key === 'dims') change(d => ({ ...d, dimensionSettings: { ...d.dimensionSettings, visible: !(d.dimensionSettings?.visible ?? true) } }));
                    else setLayers((l) => ({ ...l, [key]: !l[key] }));
                  }}
                >
                  <span
                    className={
                      "layer-checkbox " + (layers[key] ? "checked" : "")
                    }
                  >
                    {layers[key] && <Check size={11} />}
                  </span>
                  {
                    [
                      "尺寸标注",
                      "房间名称",
                      "家具显示",
                      "辅助网格",
                      "承重墙高亮",
                      "贴墙吸附",
                    ][i]
                  }
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <EditorTooltip label="文件" description="下载图片与工程图、保存、导出或导入方案 JSON">
              <DropdownMenuTrigger asChild>
                <button className="tool-button" aria-label="文件">
                  <FolderOpen size={16} />
                  <span>文件</span>
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
            </EditorTooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportImage}>
                <Download />
                {view === "2d" ? "下载 2D 图片" : "下载当前 3D 视角"}
              </DropdownMenuItem>
              <DrawingExportItems disabled={view !== '2d' || exportDrawingAction.pending} onExport={format => void exportDrawing(format)} />
              <DropdownMenuItem onClick={()=>{sizeTransaction.cancel();p.save();}}>
                <Save />
                立即保存当前项目
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={view !== "2d"}
                onClick={() => canvas.current?.ratio(60)}
              >
                <Ruler />
                显示比例 1:60
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={view !== "2d"}
                onClick={() => canvas.current?.ratio(100)}
              >
                <Ruler />
                显示比例 1:100
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportJson}>
                <ArrowDownToLine />
                下载方案 JSON
              </DropdownMenuItem>
              {p.loggedIn && (
                <DropdownMenuItem disabled={importJson.pending} onClick={() => file.current?.click()}>
                  {importJson.pending ? <Loader2 className="animate-spin" /> : <FolderOpen />}
                  导入 JSON 为新项目
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="compact-only" />
              <DropdownMenuItem
                className="danger-item compact-only"
                onClick={resetDesign}
              >
                <RotateCcw />
                重置当前方案
              </DropdownMenuItem>
              <DropdownMenuItem
                className="danger-item compact-only"
                onClick={clearFurniture}
              >
                <Trash2 />
                清空家具布置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <EditorTooltip label="操作帮助" description="三步上手说明">
            <button
              className="toolbar-icon"
              aria-label="操作帮助"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={17} />
            </button>
          </EditorTooltip>
          <EditorTooltip label="全屏" description="全屏查看设计，再次点击退出">
            <button
              className="toolbar-icon"
              aria-label="全屏"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else
                  document.documentElement
                    .requestFullscreen?.()
                    .catch(() => notify.info("当前浏览器不支持全屏"));
              }}
            >
              <Expand size={17} />
            </button>
          </EditorTooltip>
        </div>
      </div>
      <aside
        className={"library-panel " + (drawer === "lib" ? "drawer-open" : "")}
      >
        <Library
          add={(it) => add(it)}
          setTool={(t) => {
            setTool(t);
            setDrawer(null);
          }}
          blank={d.template === "blank"}
          customItems={d.customCatalog || []}
          onNew={p.loggedIn ? () => setCustomOpen(true) : undefined}
        />
      </aside>
      <main className="stage" ref={stage}>
        <div className="stage-topline">
          <div className="canvas-context">
            <span className="context-dot" />
            {view === "2d" ? "平面布置图" : "立体空间预览"}
            <span>
              /{d.template === "blank" ? " 自定义户型" : " 三室两厅两卫"}
            </span>
          </div>
          <div className="stage-pane-buttons">
            <EditorTooltip label={hideLib ? "展开家具库" : "收起家具库"} description="左侧构件与家具面板">
              <button onClick={() => togglePane("lib")} aria-label={hideLib ? "展开家具库" : "收起家具库"}>
                {hideLib ? (
                  <PanelLeftOpen size={16} />
                ) : (
                  <PanelLeftClose size={16} />
                )}
              </button>
            </EditorTooltip>
            <EditorTooltip label={hidePanel ? "展开属性面板" : "收起属性面板"} description="右侧属性与成本面板">
              <button onClick={() => togglePane("panel")} aria-label={hidePanel ? "展开属性面板" : "收起属性面板"}>
                {hidePanel ? (
                  <PanelRightOpen size={16} />
                ) : (
                  <PanelRightClose size={16} />
                )}
              </button>
            </EditorTooltip>
          </div>
        </div>
        {view === "2d" ? (
          <PlanCanvas
            ref={canvas}
            design={d}
            selection={selection}
            select={select}
            tool={tool}
            layers={layers}
            preview={preview}
            commit={commit}
            add={add}
            closePanels={closePanels}
            onScale={setScale}
            onCoord={onCoord}
            onAnchor={onAnchor}
            finishTool={()=>setTool('select')}
            onDimensionSelect={openDimension}
            selectedDimension={dimensionValid ? dimensionEdit.binding : undefined}
          />
        ) : Scene ? (
          <Scene
            ref={scene}
            design={d}
            selection={selection}
            select={select}
            options={sceneOptions}
            layers={layers}
            commit={commit}
            add={add}
            onError={() => {
              setView("2d");
              notify.fail("设备无法启动 3D，请继续使用 2D 编辑");
            }}
            onAnchor={onAnchor}
            exitWalk={() => setSceneOptions((o) => ({ ...o, mode: "orbit" }))}
          />
        ) : (
          <div className="scene-loading">
            <Loader2 className="animate-spin" />
            正在加载 3D 场景…
          </div>
        )}
        {tool !== "select" && tool !== "wall" && (
          <div className="mode-hint">
            {tip}
            <EditorTooltip label="退出当前工具" description="回到选择模式" shortcut="Esc">
              <button onClick={() => setTool("select")} aria-label="退出当前工具">
                <X size={13} />
              </button>
            </EditorTooltip>
          </div>
        )}
        {view === "3d" && (
          <div className="scene-light-control">
            <EditorTooltip
              label={sceneOptions.night ? "切换到白天" : "切换到夜晚"}
              description="改变 3D 场景的光照氛围"
              side="top"
            >
              <button
                aria-label={sceneOptions.night ? "切换到白天" : "切换到夜晚"}
                onClick={() =>
                  setSceneOptions((o) => ({ ...o, night: !o.night }))
                }
              >
                {sceneOptions.night ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </EditorTooltip>
            <EditorTooltip label="日照时间" description="拖动调整 7:00–18:00 的阳光角度" side="top">
              <input
                aria-label="日照时间"
                type="range"
                min={7}
                max={18}
                step={0.25}
                value={sceneOptions.hour}
                onChange={(e) =>
                  setSceneOptions((o) => ({ ...o, hour: Number(e.target.value) }))
                }
              />
            </EditorTooltip>
            <span>
              {String(Math.floor(sceneOptions.hour)).padStart(2, "0")}:
              {String(Math.round((sceneOptions.hour % 1) * 60)).padStart(
                2,
                "0",
              )}
            </span>
          </div>
        )}
        {view === "2d" && (
          <div className="scale-bar">
            <span>1 m</span>
            <div style={{ width: Math.max(15, scale * 1000) }} />
          </div>
        )}
        <div className="canvas-zoom">
          <EditorTooltip label="缩小" side="top">
            <button
              aria-label="缩小"
              onClick={() =>
                view === "2d"
                  ? canvas.current?.zoom(0.8)
                  : scene.current?.zoom(0.8)
              }
            >
              <Minus size={16} />
            </button>
          </EditorTooltip>
          <EditorTooltip
            label={view === "2d" ? "当前显示比例" : "3D 视图"}
            description={view === "2d" ? "可在「文件」菜单切换 1:60 / 1:100" : undefined}
            side="top"
          >
            <span tabIndex={0}>
              {view === "2d" ? "1:" + Math.round(96 / 25.4 / scale) : "3D"}
            </span>
          </EditorTooltip>
          <EditorTooltip label="放大" side="top">
            <button
              aria-label="放大"
              onClick={() =>
                view === "2d"
                  ? canvas.current?.zoom(1.25)
                  : scene.current?.zoom(1.25)
              }
            >
              <Plus size={16} />
            </button>
          </EditorTooltip>
          <i />
          <EditorTooltip
            label="适应窗口"
            description={view === "2d" ? "让整个户型完整显示在画布中" : "回到默认斜视角"}
            shortcut="F"
            side="top"
          >
            <button
              aria-label="适应窗口"
              onClick={() =>
                view === "2d" ? canvas.current?.fit() : scene.current?.iso()
              }
            >
              <Maximize2 size={15} />
            </button>
          </EditorTooltip>
        </div>
        {dimensionValid && <DimensionEditDialog design={dimensionEdit.before} binding={dimensionEdit.binding}
          onClose={() => setDimensionEdit(null)} onApply={(millimeters, fixed) => {
            const current = model.current.current;
            if (current !== dimensionEdit.before) throw new Error('设计已变化，请重新选择标注');
            const next = editDimensionWalls(current, dimensionEdit.binding, millimeters, fixed);
            setDimensionEdit(null);
            if (next !== current) commit(next, current);
          }} />}
        {splitValid && <WallSplitDialog design={wallSplit.before} wallId={wallSplit.wallId}
          onClose={() => setWallSplit(null)} onApply={(cuts, selectedSegment) => {
            const current = model.current.current;
            if (current !== wallSplit.before) throw new Error('设计已变化，请重新选择墙体');
            const result = splitWallModel(current, wallSplit.wallId, cuts, selectedSegment);
            commit(result.design, current);
            setWallSplit(null);
            setSelection({ kind: 'wall', id: result.selectedId });
          }} />}
        <SelectionEditor
          splitWall={view === '2d' ? openWallSplit : undefined}
          mergeWall={view === '2d' ? id => void cancelWallSplit(id) : undefined}
          key={`${selection?.kind}:${selection?.id}`}
          ref={editor}
          design={d}
          selection={selection}
          stage={stage}
          change={change}
          rotate={() => rotate()}
          duplicate={duplicate}
          remove={remove}
          close={() => setSelection(null)}
          transaction={sizeTransaction} showCosts={p.loggedIn}
          hidden={tool !== 'select' || !!drawer || (view === "3d" && sceneOptions.mode === "walk")}
          details={() => {
            setPanelMode("props");
            if (matchMedia("(max-width:1100px)").matches) setDrawer("panel");
            else setHidePanel(false);
          }}
          costs={() => {
            setPanelMode("cost");
            if (matchMedia("(max-width:1100px)").matches) setDrawer("panel");
            else setHidePanel(false);
          }}
        />
        <EditorTooltip label="家具库" description="打开构件与家具列表" side="top">
          <button className="mobile-library" onClick={() => togglePane("lib")}>
            <Armchair size={19} />
            家具库
          </button>
        </EditorTooltip>
      </main>
      <aside
        className={
          "property-panel " + (drawer === "panel" ? "drawer-open" : "")
        }
      >
        {p.loggedIn && (
          <PanelModeTabs
            design={d}
            mode={panelMode}
            onChange={setPanelMode}
          />
        )}
        <div className="panel-scroll">
          {p.loggedIn && panelMode === "cost" ? (
            <CostPanel
              design={d}
              selection={selection}
              change={change}
              select={select}
              back={() => select(null)}
            />
          ) : (
            <PropertyPanel
              splitWall={view === '2d' && tool === 'select' ? openWallSplit : undefined}
              transaction={sizeTransaction} showCosts={p.loggedIn}
              design={d}
              selection={selection}
              select={select}
              change={change}
              duplicate={duplicate}
              remove={remove}
              rotate={() => rotate()}
              openCosts={() => setPanelMode("cost")}
            />
          )}
        </div>
      </aside>
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="关闭侧栏"
          onClick={() => setDrawer(null)}
        />
      )}
      <footer className="status-bar">
        <span>
          <MousePointer2 size={13} />
          <b>
            {tool === "select"
              ? "选择模式"
              : tool === "wall"
                ? "绘制墙体"
                : tool === "measure"
                  ? "测量模式"
                  : "结构编辑"}
          </b>
        </span>
        <span className="status-coordinates" ref={coordLabel}>
          X 0 / Y 0 m
        </span>
        <span className="status-tip" title={tip}>{tip}</span>
        {(tool === 'wall' || tool === 'measure') && <EditorTooltip label={tool === 'wall' ? '完成绘墙' : '完成测量'} description="结束当前草稿并回到选择模式" side="top"><button className="status-finish-wall" onClick={() => setTool('select')}>{tool === 'wall' ? '完成绘墙' : '完成测量'}</button></EditorTooltip>}
        {p.loggedIn && <span className={'workspace-save-status' + (isSaveProblem(p.status) ? ' is-error' : '')} role="status" title={p.status.label}><span className={isSaveProblem(p.status) ? 'error-dot' : 'status-dot'} />{p.status.label}</span>}
        <span className="status-safe">
          <ShieldCheck size={13} />
          设计示意 · 拆改须专业确认
        </span>
      </footer>
      <input
        type="file"
        ref={file}
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !p.loggedIn || importJson.pending) return;
          if (f.size > 5000000) {
            notify.fail("导入失败：文件不得超过 5 MB");
            return;
          }
          await importJson.run(f);
        }}
      />
      {p.loggedIn && <CustomFurnitureDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        loggedIn={p.loggedIn}
        login={p.login}
        ownerKey={p.email || "guest"}
        onCreate={saveCustom}
        onImport={saveCustom}
        onCreateFloor={saveCustomFloor}
      />}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>从灵感到空间，只需三步</DialogTitle>
            <DialogDescription>
              无需登录即可设计与下载；云端项目需要登录。
            </DialogDescription>
          </DialogHeader>
          <ol className="help-steps">
            <li>
              <b>01</b>
              <div>
                <strong>规划户型</strong>
                <p>
                  打开参考项目，或新建空白户型；在户型设置中调整尺寸，绘制隔墙并添加门窗。
                </p>
              </div>
            </li>
            <li>
              <b>02</b>
              <div>
                <strong>布置空间</strong>
                <p>
                  点击或拖入家具，选中后调整尺寸与材质。测量与绘墙一样连续取点，双击、右键或 Enter 完成，Esc 取消草稿；测量线可在顶部「更多」菜单中一键清除。点击
                  3D 预览，走进你的设计。
                </p>
              </div>
            </li>
            <li>
              <b>03</b>
              <div>
                <strong>保存你的创作</strong>
                <p>
                  直接下载 2D 图与当前 3D 视角，导出 JSON
                  备份；登录后项目自动保存到云端，可在项目管理中管理多个方案。
                </p>
              </div>
            </li>
          </ol>
          <Button onClick={() => setHelp(false)}>开始设计</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
