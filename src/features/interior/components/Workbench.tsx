import { useCallback, useEffect, useRef, useState } from "react";
import { formatMeters } from '../model/lengthUnits';
import { canEditWall, openingIsLocked } from '../model/wallPolicy';
import { ExportMenu, type ExportFormat } from './ExportMenu';
import { ProjectMenu, type ProjectNavigation } from './ProjectMenu';
import { AccountMenu } from './AccountMenu';
import { DimensionEditDialog } from './DimensionEditDialog';
import { WallSplitDialog } from './WallSplitDialog';
import { splitWall as splitWallModel } from '../model/wallSplit';
import { removeWall as removeWallModel } from '../model/wallRemoval';
import { mergeWall as mergeWallModel, wallMergeGroup } from '../model/wallMerge';
import { isBearingWall } from '../model/wallPolicy';
import { length } from '../model/geometry';
import { dimensionEditPolicy, editDimensionWalls } from '../model/dimensionWallEdit';
import type { DimensionBinding } from '../model/dimensionBinding';
import type { DimensionSegment } from '../model/perimeterDimensions';
import {
  Armchair,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  DoorOpen,
  Expand,
  Eye,
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
  ScanLine,
  Settings2,
  ShieldCheck,
  SquareDashed,
  Sun,
  Trash2,
  TriangleAlert,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { useDesign } from "../model/useDesign";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { center, norm, pushOut } from "../model/geometry";
import {
  uid,
  type CustomFloor,
  type CustomOpening,
  type CustomWall,
  type Design,
  type Layers,
  type LibraryItem,
  type Point,
  type Project,
  type Selection,
  type Tool,
} from "../model/types";
import { blankDesign, referenceDesign } from "../data/templates";
import { library } from "../data/catalog";
import { Library } from "./Library";
import { RoomList } from "./RoomList";
import { PropertyPanel } from "./PropertyPanel";
import { CostPanel } from "./CostPanel";
import { PanelModeTabs } from "./PanelModeTabs";
import { CustomFurnitureDialog } from "./CustomFurnitureDialog";
import { useFloorCatalog } from "../cloud/useFloorCatalog";
import { useWallCatalog } from "../cloud/useWallCatalog";
import { useOpeningCatalog } from "../cloud/useOpeningCatalog";
import { useCeilingCatalog, useRoofCatalog } from "../cloud/useSurfaceCatalogs";
import { useFurnitureCatalog } from "../cloud/useFurnitureCatalog";
import { SelectionEditor, type SelectionEditorHandle } from "./SelectionEditor";
import { furnitureKey } from "../model/costs";
import type { ScreenRect } from "../model/selectionAnchor";
import { PlanCanvas, type CanvasHandle } from "./PlanCanvas";
import type { Scene3D, SceneHandle, SceneOptions } from "../scene/Scene3D";
import { isSaveProblem, type SaveStatus } from "../cloud/useProjects";
import { useAsyncAction } from "@/hooks/useAsyncAction";
type SceneComponent = typeof Scene3D;
/** 3D 模块只下载一次：空闲时预加载，点击时复用同一个 promise。 */
let scenePromise: Promise<typeof import("../scene/Scene3D")> | null = null;
const loadScene = () =>
  (scenePromise ??= import("../scene/Scene3D").catch((e) => {
    scenePromise = null;
    throw e;
  }));
interface Props {
  project: Project;
  projectNavigation: ProjectNavigation;
  update: (d: Design) => void;
  status: SaveStatus;
  loggedIn: boolean;
  email?: string;
  projects: () => void;
  login: () => void;
  logout: () => void;
  loggingOut?: boolean;
  cloudSave: () => Promise<boolean>;
  /** 游客模式下对当前方案的编辑次数：>0 表示模版已被改动，顶部出现「登录并保存到云端」提示条。 */
  guestEdits: number;
}
function ToolButton({
  label,
  shortcut,
  active,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  const button = (
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
  );
  // 有文字的按钮只在有快捷键时才需要提示
  return shortcut ? <EditorTooltip label={label} shortcut={shortcut}>{button}</EditorTooltip> : button;
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
    [roomFocus, setRoomFocus] = useState<string | null>(null),
    [hideLib, setHideLib] = useState(false),
    [hidePanel, setHidePanel] = useState(false),
    [drawer, setDrawer] = useState<"lib" | "panel" | null>(null),
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
  const floorCatalog = useFloorCatalog(), loadAccountFloors = floorCatalog.load;
  const wallCatalog = useWallCatalog(), loadAccountWalls = wallCatalog.load;
  const openingCatalog = useOpeningCatalog(), loadAccountOpenings = openingCatalog.load;
  const roofCatalog = useRoofCatalog(), loadAccountRoofs = roofCatalog.load;
  const ceilingCatalog = useCeilingCatalog(), loadAccountCeilings = ceilingCatalog.load;
  const furnitureCatalog = useFurnitureCatalog(), loadAccountFurniture = furnitureCatalog.load;
  const accountFloors = p.loggedIn ? floorCatalog.items : [];
  const accountWalls = p.loggedIn ? wallCatalog.items : [];
  const accountOpenings = p.loggedIn ? openingCatalog.items : [];
  const accountRoofs = p.loggedIn ? roofCatalog.items : [];
  const accountCeilings = p.loggedIn ? ceilingCatalog.items : [];
  // 账号家具库（家具管理里新建的家具）并入左侧列表：已在本项目目录中的以项目版本为准。
  const projectCatalog = d.customCatalog || [];
  const accountFurniture = p.loggedIn
    ? furnitureCatalog.items.filter((item) => !projectCatalog.some((i) => i.catalogId === item.catalogId))
    : [];
  // 登录后读取账号地面 / 墙面 / 门窗 / 屋面 / 吊顶 / 家具库；新建弹窗关闭后刷新，让刚建的材料立即可选。
  useEffect(() => {
    if (!p.loggedIn || customOpen) return;
    void loadAccountFurniture(); void loadAccountFloors(); void loadAccountWalls(); void loadAccountOpenings(); void loadAccountRoofs(); void loadAccountCeilings();
  }, [p.loggedIn, customOpen, loadAccountFurniture, loadAccountFloors, loadAccountWalls, loadAccountOpenings, loadAccountRoofs, loadAccountCeilings]);
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
  const saveCustomWall = (wall: CustomWall) => {
    if (!p.loggedIn) return;
    change((d) => d.customWalls?.some((w) => w.key === wall.key)
      ? d : { ...d, customWalls: [...(d.customWalls || []), wall] });
    notify.success("墙面已加入当前项目，可在房间材质中选择");
  };
  const saveCustomOpening = (opening: CustomOpening) => {
    if (!p.loggedIn) return;
    change((d) => d.customOpenings?.some((o) => o.key === opening.key)
      ? d : { ...d, customOpenings: [...(d.customOpenings || []), opening] });
    notify.success("门窗款式已加入当前项目，选中门窗即可切换");
  };
  const stage = useRef<HTMLElement>(null),
    editor = useRef<SelectionEditorHandle>(null);
  const onAnchor = useCallback(
    (r: ScreenRect | null) => editor.current?.update(r),
    [],
  );
  const canvas = useRef<CanvasHandle>(null),
    scene = useRef<SceneHandle>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const preload = () => void loadScene().catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(preload, { timeout: 4000 });
      return () => {
        mounted.current = false;
        cancelIdleCallback(id);
      };
    }
    const id = setTimeout(preload, 1500);
    return () => {
      mounted.current = false;
      clearTimeout(id);
    };
  }, []);
  const select = useCallback((s: Selection) => {
      sizeTransaction.flush();
      setSelection(s);
      if (s?.kind === "room") scene.current?.flyTo(s.id);
    }, [sizeTransaction]),
    closePanels = useCallback(() => { sizeTransaction.flush(); setDrawer(null); }, [sizeTransaction]);
  const toggleView = async (next: "2d" | "3d") => {
    setTool("select");
    if (next === view) return;
    if (next === "2d") {
      setView("2d");
      setSceneLoading(false);
      return;
    }
    // 先切到 3D 并显示加载遮罩，场景首帧编译完成（onReady）后再撤掉
    setView("3d");
    setSceneLoading(true);
    if (Scene) return;
    try {
      const m = await loadScene();
      if (mounted.current) setScene(() => m.Scene3D);
    } catch {
      if (mounted.current) {
        setView("2d");
        setSceneLoading(false);
      }
      notify.error("3D 引擎加载失败，2D 仍可编辑", "模块加载失败，请检查网络后重试");
    }
  };
  const focusRoom = (id: string) => {
    setRoomFocus(id);
    if (view === "2d") {
      if (id === "all") canvas.current?.fit();
      else select({ kind: "room", id });
    } else if (id === "all" && sceneOptions.mode === "walk")
      setSceneOptions((o) => ({ ...o, mode: "orbit" }));
    else scene.current?.flyTo(id);
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
      // 账号库家具放进画布时登记进项目目录，报价与导出沿用它的名称与单价。
      const entry = it.catalogId && !library.some((l) => l.catalogId === it.catalogId) ? it : null;
      change((d) => ({
        ...d,
        customCatalog:
          entry && !d.customCatalog?.some((i) => i.catalogId === entry.catalogId)
            ? [...(d.customCatalog || []), entry]
            : d.customCatalog,
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
  const removeWall = useCallback(
    (wallId: string) => {
      const w = d.walls.find((w) => w.id === wallId);
      if (!w || !canEditWall(d, w)) return notify.fail("此墙体不可删除");
      change((d) => removeWallModel(d, wallId));
      notify.success("已删除墙体，可撤销恢复");
      setSelection(null);
    },
    [d, change],
  );
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
    else if (s.kind === "wall") return removeWall(s.id);
    setSelection(null);
  }, [d, selection, change, removeWall]);
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
  const cloudSave = useAsyncAction(p.cloudSave);
  // 游客改过模版才提示登录保存；「暂不保存」只关掉当前这一版，再改一次会重新出现。
  const [bannerClosed, setBannerClosed] = useState(0);
  const showGuestBanner = !p.loggedIn && p.guestEdits > 0 && p.guestEdits !== bannerClosed;
  const exportAction = useAsyncAction(async (format: ExportFormat) => {
    if (format === "png") {
      if (view === "2d") canvas.current?.exportImage();
      else scene.current?.shot();
      return;
    }
    const snapshot = structuredClone(model.current.current);
    try {
      const { downloadDrawing, downloadProjectJson } = await import("../model/drawingExport");
      if (format === "json") downloadProjectJson(snapshot, p.project.name);
      else await downloadDrawing(snapshot, format, p.project.name);
      notify.success(`已导出 ${format.toUpperCase()} 文件`);
    } catch (error) {
      notify.error("导出失败", error);
    }
  });
  const exportFile = (format: ExportFormat) => {
    sizeTransaction.cancel();
    void exportAction.run(format);
  };
  const clearFurniture = async () => {
    if (!d.furniture.length) return;
    const ok = await confirm({
      title: "清空所有家具？",
      description: "墙体、材质会保留，可撤销恢复。",
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
      description: "墙体与家具都会恢复到初始模板，可撤销恢复。",
      confirmText: "重置方案",
      tone: "destructive",
    });
    if (!ok) return;
    change((d) => ({
      ...(d.template === "blank" ? blankDesign() : referenceDesign()),
      ...(d.structureUnlocked ? { structureUnlocked: true } : {}),
    }));
    setSelection(null);
    notify.success("已重置为初始模板，可撤销恢复");
  };
  const tip =
    tool === "wall"
      ? "点击起点与转角连续绘墙 · 可拖动起段 · 双击 / 右键 / Enter 完成 · Esc 取消草稿"
      : tool === "door" || tool === "window"
        ? "点击墙体放置门窗，选中后可沿墙拖动或使用可视编辑工具条调整"
        : view === "3d"
          ? "拖动旋转 · 滚轮缩放 · 选中家具可移动 · 点击门开关"
          : "拖入家具，开始规划你的理想空间";
  return (
    <div className="workbench-shell">
      {showGuestBanner && (
        <div className="guest-cloud-banner" role="status" aria-label="模版已更改">
          <span className="guest-cloud-banner-badge"><TriangleAlert size={14} /></span>
          <span className="guest-cloud-banner-copy">
            <b>模版已经更改</b>
            <span>登录后即可保存到云端，换设备也能继续编辑</span>
          </span>
          <Button
            size="sm"
            className="guest-cloud-banner-save"
            loading={cloudSave.pending}
            onClick={() => { sizeTransaction.cancel(); void cloudSave.run(); }}
          >
            <Cloud size={14} />
            <span>登录并保存</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="guest-cloud-banner-dismiss"
            disabled={cloudSave.pending}
            onClick={() => setBannerClosed(p.guestEdits)}
          >
            <X size={14} />
            <span>暂不保存</span>
          </Button>
        </div>
      )}
    <div
      className={
        "workbench " +
        (hideLib ? "hide-library " : "") +
        (hidePanel ? "hide-properties" : "")
      }
    >
      <div className="main-toolbar">
        <ProjectMenu
          {...p.projectNavigation}
          project={p.project}
          loggedIn={p.loggedIn}
          onBack={() => { sizeTransaction.cancel(); p.projects(); }}
          onOpen={async (row) => { sizeTransaction.cancel(); return p.projectNavigation.onOpen(row); }}
        />
        <span className="toolbar-divider" />
        <div className="toolbar-scroll">
        <div className="view-switch">
          <EditorTooltip
            label="2D 平面"
            shortcut="T"
          >
            <button
              className={view === "2d" ? "active" : ""}
              onClick={() => void toggleView("2d")}
            >
              <LayoutTemplate size={15} />
              2D<span className="view-switch-suffix">平面</span>
            </button>
          </EditorTooltip>
          <EditorTooltip
            label="3D 场景"
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
              3D<span className="view-switch-suffix">场景</span>
            </button>
          </EditorTooltip>
        </div>
        <span className="toolbar-divider" />
        {view === "2d" ? (
          <div className="tool-group">
            <ToolButton
              label="选择"
              shortcut="V"
              active={tool === "select"}
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={16} />
            </ToolButton>
            {d.template === "blank" && (
              <ToolButton
                label="绘墙"
                active={tool === "wall"}
                onClick={() => setTool("wall")}
              >
                <SquareDashed size={16} />
              </ToolButton>
            )}
            {d.template === "blank" && (
              <>
                <ToolButton label="门" active={tool === "door"} onClick={() => setTool("door")}>
                  <DoorOpen size={16} />
                </ToolButton>
                <ToolButton label="窗" active={tool === "window"} onClick={() => setTool("window")}>
                  <ScanLine size={16} />
                </ToolButton>
              </>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="tool-button compact-only" aria-label="更多">
                    <Settings2 size={16} />
                    <span>更多</span>
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem className="danger-item compact-only" onSelect={resetDesign}>
                  <RotateCcw />
                  重置方案
                </DropdownMenuItem>
                <DropdownMenuItem className="danger-item compact-only" disabled={!d.furniture.length} onSelect={clearFurniture}>
                  <Trash2 />
                  清空家具
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="tool-group">
            <ToolButton
              label="鸟瞰"
              active={sceneOptions.mode === "orbit"}
              onClick={() => setSceneOptions((o) => ({ ...o, mode: "orbit" }))}
            >
              <Eye size={16} />
            </ToolButton>
            <ToolButton
              label="漫游"
              active={sceneOptions.mode === "walk"}
              onClick={() => {
                setSelection(null);
                setSceneOptions((o) => ({ ...o, mode: "walk", cut: false }));
              }}
            >
              <UserRound size={16} />
            </ToolButton>
            <ToolButton label="俯视" onClick={() => scene.current?.top()}>
              <LayoutTemplate size={16} />
            </ToolButton>
            <ToolButton
              label="剖切"
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
            shortcut="Ctrl Z"
            onClick={undo}
            disabled={!counts.undo}
          >
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton
            label="重做"
            shortcut="Ctrl ⇧ Z"
            onClick={redo}
            disabled={!counts.redo}
          >
            <Redo2 size={16} />
          </ToolButton>
        </div>
        <span className="toolbar-divider" />
        <div className="tool-group danger-actions">
          <ToolButton label="重置方案" onClick={resetDesign}>
            <RotateCcw size={16} />
          </ToolButton>
          <ToolButton
            label="清空家具"
            disabled={!d.furniture.length}
            onClick={clearFurniture}
          >
            <Trash2 size={16} />
          </ToolButton>
        </div>
        </div>
        <div className="toolbar-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="tool-button" aria-label="视图">
                <Layers3 size={16} />
                <span>视图</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
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
              <DropdownMenuSeparator />
              {[60, 100].map((ratio) => (
                <DropdownMenuItem key={ratio} disabled={view !== "2d"} onSelect={() => canvas.current?.ratio(ratio)}>
                  <Ruler />
                  显示比例 1:{ratio}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ExportMenu view={view} pending={exportAction.pending} onExport={exportFile} />
          <EditorTooltip label="全屏">
            <button
              className="toolbar-icon toolbar-fullscreen"
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
          <span className="toolbar-divider" />
          <AccountMenu email={p.email} loggedIn={p.loggedIn} loggingOut={p.loggingOut} onLogin={p.login} onLogout={p.logout} />
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
          customItems={[...projectCatalog, ...accountFurniture]}
          onNew={p.loggedIn ? () => setCustomOpen(true) : undefined}
          rooms={
            <RoomList
              rooms={d.rooms}
              active={selection?.kind === "room" ? selection.id : roomFocus}
              onPick={focusRoom}
            />
          }
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
            <EditorTooltip label={hideLib ? "展开家具库" : "收起家具库"}>
              <button onClick={() => togglePane("lib")} aria-label={hideLib ? "展开家具库" : "收起家具库"}>
                {hideLib ? (
                  <PanelLeftOpen size={16} />
                ) : (
                  <PanelLeftClose size={16} />
                )}
              </button>
            </EditorTooltip>
            <EditorTooltip label={hidePanel ? "展开属性面板" : "收起属性面板"}>
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
              setSceneLoading(false);
              notify.fail("设备无法启动 3D，请继续使用 2D 编辑");
            }}
            onReady={() => setSceneLoading(false)}
            onAnchor={onAnchor}
            exitWalk={() => setSceneOptions((o) => ({ ...o, mode: "orbit" }))}
          />
        ) : null}
        {view === "3d" && sceneLoading && (
          <div className="scene-loading">
            <Loader2 className="animate-spin" />
            正在加载 3D 场景…
          </div>
        )}
        {tool !== "select" && tool !== "wall" && (
          <div className="mode-hint">
            {tip}
            <EditorTooltip label="退出当前工具" shortcut="Esc">
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
            <EditorTooltip label="日照时间" side="top">
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
          removeWall={view === '2d' ? removeWall : undefined}
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
          accountFloors={accountFloors} accountWalls={accountWalls} accountOpenings={accountOpenings}
          accountRoofs={accountRoofs} accountCeilings={accountCeilings}
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
        <EditorTooltip label="家具库" side="top">
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
              mergeWall={view === '2d' && tool === 'select' ? id => void cancelWallSplit(id) : undefined}
              removeWall={view === '2d' && tool === 'select' ? removeWall : undefined}
              transaction={sizeTransaction} showCosts={p.loggedIn}
              accountFloors={accountFloors} accountWalls={accountWalls} accountOpenings={accountOpenings}
              accountRoofs={accountRoofs} accountCeilings={accountCeilings}
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
                : "结构编辑"}
          </b>
        </span>
        <span className="status-coordinates" ref={coordLabel}>
          X 0 / Y 0 m
        </span>
        <span className="status-tip" title={tip}>{tip}</span>
        {tool === 'wall' && <EditorTooltip label="完成绘墙" side="top"><button className="status-finish-wall" onClick={() => setTool('select')}>完成绘墙</button></EditorTooltip>}
        <span className={'workspace-save-status' + (isSaveProblem(p.status) ? ' is-error' : '')} role="status" title={p.status.label}><span className={isSaveProblem(p.status) ? 'error-dot' : 'status-dot'} />{p.status.label}</span>
        <span className="status-safe">
          <ShieldCheck size={13} />
          设计示意 · 拆改须专业确认
        </span>
      </footer>
      {p.loggedIn && <CustomFurnitureDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        loggedIn={p.loggedIn}
        login={p.login}
        ownerKey={p.email || "guest"}
        onCreate={saveCustom}
        onImport={saveCustom}
        onCreateFloor={saveCustomFloor}
        onCreateWall={saveCustomWall}
        onCreateOpening={saveCustomOpening}
      />}
    </div>
    </div>
  );
}
