import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { canDeleteWall } from '../model/wallPolicy';
import { ExportMenu, type ExportFormat } from './ExportMenu';
import { ProjectMenu, type ProjectNavigation } from './ProjectMenu';
import { WorkbenchBanner } from './WorkbenchBanner';
import { AiChatPanel, AiRoomDialog, CustomFurnitureDialog, DimensionEditDialog, ReportPreview, WallSplitDialog } from './lazyDialogs';
import { CompassRose } from './CompassRose';
import { northAngle } from '../model/northAngle';
import { syncAccountFurniture, syncAccountMaterials } from '../model/furnitureSync';
import { libraryWithOverrides, syncBuiltinFurniture } from '../model/builtinAssets';
import { splitWall as splitWallModel } from '../model/wallSplit';
import { removeWall as removeWallModel } from '../model/wallRemoval';
import { clearRoomFurniture } from '../model/roomFurniture';
import { removeRoom as removeRoomModel, type RoomRemoval } from '../model/roomRemoval';
import { duplicateFurniture, expandToGroups, groupFurniture, groupIds, isPersistentGroup, moveGroup, removeGroup, ungroupFurniture } from '../model/furnitureGroup';
import { reorderFurniture } from '../model/furnitureLayer';
import { rotateUnit } from '../model/movableUnit';
import { deriveRooms } from '../model/roomDerive';
import { isStairs, resizeStair } from '../model/stairs';
import { removeSeparator } from '../model/separators';
import { migrateSeparators } from '../model/roomDerive';
import { followWallFurniture } from '../model/furnitureFollow';
import { splitAtJunctionsOf } from '../model/wallAutoSplit';
import { mergeWall as mergeWallModel, wallMergeGroup } from '../model/wallMerge';
import { bearingWalls, clearBearing, mergeAllSplits, splitPointCount } from '../model/wallBulk';
import { isBearingWall, canEditStructure } from '../model/wallPolicy';
import { length } from '../model/geometry';
import { dimensionEditPolicy, editDimensionWalls } from '../model/dimensionWallEdit';
import type { DimensionBinding } from '../model/dimensionBinding';
import type { DimensionSegment } from '../model/perimeterDimensions';
import {
  Armchair,
  ChevronDown,
  Combine,
  DoorOpen,
  Layers3,
  LayoutTemplate,
  Loader2,
  Minus,
  Moon,
  Plus,
  Redo2,
  RotateCcw,
  Scan,
  ShieldOff,
  Sun,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { afterFirstScreen } from "@/lib/afterFirstScreen";
import { onPageHide, saveFile } from "@/lib/platform";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SaveFileDialog, type PendingFile } from "./SaveFileDialog";
import { useSceneLifecycle } from "./useSceneLifecycle";
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
  isOpeningTool,
  uid,
  type CustomFloor,
  type CustomOpening,
  type CustomWall,
  type Design,
  type Layers,
  type LibraryItem,
  type Furniture,
  type Point,
  type Project,
  type Selection,
  selectionKey,
  type Tool,
} from "../model/types";
import { blankDesign, designForTemplate, isAiDesign, presetById } from "../data/templates";
import { openingKindLabel } from "../model/hardMaterials";
import { useRoomAi } from "../ai/useRoomAi";
import { useAiCatalog } from "../ai/useAiCatalog";
import { library } from "../data/catalog";
import { Library } from "./Library";
import { CostPanel } from "./CostPanel";
import { CostChip } from "./CostChip";
import { StylePanel } from "./StylePanel";
import { PlanRailTools, SceneRailPanels, SceneRailTools } from "./RailTools";
import { SidePanel, type PanelKind } from "./SidePanel";
import { CanvasRail } from "./CanvasRail";
import { ViewMenu } from "./ViewMenu";
import { HouseSettingsPanel } from "./HouseSettingsPanel";
import { saveAccountStyle } from "../cloud/accountStyles";
import { useAccountLibrary } from "../cloud/useAccountLibrary";
import { SelectionEditor, type SelectionEditorHandle } from "./SelectionEditor";
import type { ScreenRect } from "../model/selectionAnchor";
import { PlanCanvas, type CanvasHandle } from "./PlanCanvas";
import type { Scene3D, SceneHandle, SceneOptions } from "../scene/Scene3D";
import type { SaveStatus } from "../cloud/useProjects";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { AccountCostSettings } from "../model/costDefaults";
import { tidyLayout, type LayoutReport } from "../model/layoutRules";
import { LayoutPanel, LayoutTidyButton } from "./LayoutPanel";
import type { DecorStyle } from "../model/decorStyles";
import { DXF_TEMPLATE_ID } from "../model/externalDxf/recognize";
type SceneComponent = typeof Scene3D;
/** 3D 模块只下载一次：首屏（2D 页面与数据）完成后空闲时预加载，悬停 / 点击 3D 时复用同一个 promise。 */
let scenePromise: Promise<typeof import("../scene/Scene3D")> | null = null;
/** 未登录时没有素材覆盖：固定引用，同步副作用不会因为新数组反复触发。 */
const emptyOverrides: LibraryItem[] = [];
const loadScene = () =>
  (scenePromise ??= import("../scene/Scene3D").catch((e) => {
    scenePromise = null;
    throw e;
  }));
/** 预加载失败不提示：真正点 3D 时会重新下载并走失败提示。 */
const preloadScene = () => void loadScene().catch(() => undefined);
/** 窄屏（≤1100px）侧栏以抽屉形式覆盖画布：放置家具、点画布、Esc 后自动收起。 */
const isDrawerLayout = () => typeof matchMedia !== "undefined" && matchMedia("(max-width:1100px)").matches;
const PANEL_TITLES: Record<PanelKind, string> = { library: "家具列表", ai: "AI 设计", settings: "户型设置", cost: "方案与成本", style: "装修风格", layout: "布局整理" };
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
  createFromTemplate?: (templateId: string) => Promise<boolean>;
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
  iconOnly = false,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** 只显示图标（名称放进提示里）。 */
  iconOnly?: boolean;
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
        {!iconOnly && <span>{label}</span>}
      </button>
    </span>
  );
  // 有文字的按钮只在有快捷键时才需要提示；纯图标按钮总是提示名称
  return shortcut || iconOnly ? <EditorTooltip label={label} shortcut={shortcut}>{button}</EditorTooltip> : button;
}
export function Workbench(p: Props) {
  const confirm = useConfirm();
  const readOnly = !!p.project.builtin;
  const model = useDesign(p.project.state, p.update, readOnly),
    { design: d, change, commit, sync, preview, undo, redo, counts, sizeTransaction, current: designRef } = model;
  const structureTools = canEditStructure(d, readOnly);
  const [selection, setSelection] = useState<Selection>(null),
    [tool, setTool] = useState<Tool>("select");
  // 3D 的打开 / 首帧 / 失败 / 自动恢复全部由这一个状态机决定
  const lifecycle = useSceneLifecycle(),
    view = lifecycle.view,
    sceneLoading = lifecycle.loading;
  const [Scene, setScene] = useState<SceneComponent | null>(null),
    // 右侧统一侧栏：同一时间只开一个；默认收起，画布完整可见，需要时从竖条打开。
    [sidePanel, setSidePanel] = useState<PanelKind | null>(null),
    [scale, setScale] = useState(0.05),
    [pendingFile, setPendingFile] = useState<PendingFile | null>(null),
    [reportOpen, setReportOpen] = useState(false),
    [lastTidy, setLastTidy] = useState<LayoutReport | null>(null);
  const selectionId = selectionKey(selection);
  useEffect(()=>{ sizeTransaction.flush(); },[selectionId,tool,view,sizeTransaction]);
  // 3D 没有成组选择。
  useEffect(() => { if (view !== "2d") setSelection(s => (s?.kind === "group" ? null : s)); }, [view]);
  // 页面被切走前，先把尺寸输入框里未提交的修改并入设计，随后的立即保存才能带上它
  useEffect(() => onPageHide(() => sizeTransaction.flush(), "flush"), [sizeTransaction]);
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
    if (isDrawerLayout()) setSidePanel(null);
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
  const [customOpen, setCustomOpen] = useState(false),
    // 自定义家具弹窗按需下载：第一次打开后才挂载，之后保持挂载以保留关闭动画。
    [customMounted, setCustomMounted] = useState(false);
  const openCustom = () => { setCustomMounted(true); setCustomOpen(true); };
  // 账号库（家具与各类材料）一次读完，来源是数据库里的合并视图。
  const accountLibrary = useAccountLibrary(), loadAccountLibrary = accountLibrary.load;
  const accountFloors = p.loggedIn ? accountLibrary.floors : [];
  const accountWalls = p.loggedIn ? accountLibrary.walls : [];
  const accountOpenings = p.loggedIn ? accountLibrary.openings : [];
  const accountRoofs = p.loggedIn ? accountLibrary.roofs : [];
  const accountCeilings = p.loggedIn ? accountLibrary.ceilings : [];
  // 账号家具库（家具管理里新建的家具）并入左侧列表：已在本项目目录中的以项目版本为准。
  const projectCatalog = d.customCatalog || [];
  const accountFurniture = p.loggedIn
    ? accountLibrary.furniture.filter((item) => !projectCatalog.some((i) => i.catalogId === item.catalogId))
    : [];
  // 打开项目时补一次：房间按「墙 + 分隔线」重算（之后由改墙流程负责）。
  const projectId = p.project.id;
  useEffect(() => {
    if (readOnly) return;
    const current = designRef.current, next = deriveRooms(migrateSeparators(current));
    if (next !== current) {
      sync(next);
      notify.info('已按墙体与房间分隔线重新划分房间，请检查名称与地面材质');
    }
  }, [projectId, readOnly, sync, designRef]);
  // 内置家具套用账号里的 2D / 3D 素材覆盖：左侧素材库、新放置的家具都用调整后的素材。
  const builtinOverrides = p.loggedIn ? accountLibrary.overrides : emptyOverrides;
  const builtinLibrary = libraryWithOverrides(builtinOverrides);
  // 已放置的内置家具跟随素材覆盖（只改素材字段）。
  useEffect(() => {
    if (readOnly || !builtinOverrides.length) return;
    const next = syncBuiltinFurniture(designRef.current, builtinOverrides);
    if (next) sync(next);
  }, [readOnly, d.furniture, builtinOverrides, sync, designRef]);
  // 账号家具库里改过的家具同步到本项目（项目内单独改过的单价、尺寸等保留）。
  const accountFurnitureItems = accountLibrary.furniture;
  useEffect(() => {
    if (!p.loggedIn || readOnly || !d.customCatalog?.length) return;
    const next = syncAccountFurniture(designRef.current, accountFurnitureItems);
    if (next) sync(next);
  }, [p.loggedIn, readOnly, d.customCatalog, accountFurnitureItems, sync, designRef]);
  // 账号硬装库（地面 / 墙面 / 门窗 / 屋面 / 吊顶）里改过的材料同步到本项目副本（单价以项目为准）。
  useEffect(() => {
    if (!p.loggedIn || readOnly) return;
    const next = syncAccountMaterials(designRef.current, { customFloors: accountLibrary.floors, customWalls: accountLibrary.walls, customOpenings: accountLibrary.openings, customRoofs: accountLibrary.roofs, customCeilings: accountLibrary.ceilings });
    if (next) sync(next);
  }, [p.loggedIn, readOnly, d.customFloors, d.customWalls, d.customOpenings, d.customRoofs, d.customCeilings, accountLibrary.floors, accountLibrary.walls, accountLibrary.openings, accountLibrary.roofs, accountLibrary.ceilings, sync, designRef]);
  // 登录后一次读完账号库（家具 + 各类材料）；新建弹窗关闭后刷新，让刚建的条目立即可选。
  useEffect(() => {
    if (!p.loggedIn || customOpen) return;
    void loadAccountLibrary();
  }, [p.loggedIn, customOpen, loadAccountLibrary]);
  // AI 布局：登录且可编辑时才有入口；目录 = 内置 + 项目 + 账号家具，新建家具弹窗关闭后刷新。
  const aiEnabled = p.loggedIn && !readOnly;
  const aiCatalog = useAiCatalog(d.customCatalog, aiEnabled && !customOpen);
  const roomAi = useRoomAi({ design: d, catalog: aiCatalog.catalog, projectId: p.project.cloud ? p.project.id : undefined, change });
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
    // 默认是 2D：3D 引擎不和首屏抢带宽，等页面与数据加载完、浏览器空闲时再静默预加载。
    const cancel = afterFirstScreen(preloadScene);
    return () => {
      mounted.current = false;
      cancel();
    };
  }, []);
  const select = useCallback((s: Selection) => {
      sizeTransaction.flush();
      setSelection(s);
      if (s?.kind === "room") scene.current?.flyTo(s.id);
    }, [sizeTransaction]),
    closePanels = useCallback(() => { sizeTransaction.flush(); if (isDrawerLayout()) setSidePanel(null); }, [sizeTransaction]);
  const toggleView = async (next: "2d" | "3d") => {
    // 无论切到哪边，竖条都回到最上面的「选择」：2D 退出绘制工具，3D 退出漫游回到可点选的视角。
    setTool("select");
    setSceneOptions((o) => (o.mode === "orbit" ? o : { ...o, mode: "orbit" }));
    if (next === view) return;
    if (next === "2d") return lifecycle.close();
    // 先切到 3D 并显示加载遮罩，场景首帧编译完成（onReady）后再撤掉
    lifecycle.open();
    if (Scene) return;
    try {
      const m = await loadScene();
      if (mounted.current) setScene(() => m.Scene3D);
    } catch {
      if (mounted.current) lifecycle.fail("module");
    }
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
      const placed: LibraryItem & Furniture = {
        ...it,
        catalogId: it.catalogId || `${it.type}:${it.name}`,
        id: uid(),
        cx: Math.round(p[0] / 10) * 10,
        cy: Math.round(p[1] / 10) * 10,
        rot: 0,
      };
      // 楼梯按当前层高推算踏步数，外框随梯段长同步。
      const f = pushOut(isStairs(placed) ? resizeStair(placed, {}, d.height) : placed, d);
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
      if (isDrawerLayout()) setSidePanel(null);
      notify.success("已添加 " + it.name);
    },
    [d, selection, view, change],
  );
  const rotate = useCallback(
    (angle = 90) => {
      sizeTransaction.flush();
      // 单件原地转；整组绕整体中心转，组内相对位置不变。
      const ids = selection?.kind === "furniture" ? [selection.id] : selection?.kind === "group" ? selection.ids : [];
      if (ids.length) change((d) => rotateUnit(d, ids, angle));
    },
    [selection, change, sizeTransaction],
  );
  /** 组合 / 解除组合：选中的多件家具写入同一个 groupId，之后点选、拖动都作为整体。 */
  const toggleGroup = useCallback(() => {
    if (selection?.kind !== "group") return;
    const ids = groupIds(d, selection);
    if (ids.length < 2) return;
    if (isPersistentGroup(d, ids)) {
      change((d) => ungroupFurniture(d, ids));
      notify.success(`已解除组合，${ids.length} 件家具可单独编辑`);
      return;
    }
    const members = expandToGroups(d, ids);
    change((d) => groupFurniture(d, members, uid()));
    setSelection({ kind: "group", ids: members });
    notify.success(`已将 ${members.length} 件家具组合，可整体移动`);
  }, [d, selection, change]);
  /** 复制：单件家具，或多选 / 组合（整组一起复制，复制件仍是一个组合）。 */
  const duplicate = useCallback(() => {
    const ids = selection?.kind === "furniture" ? [selection.id] : selection?.kind === "group" ? groupIds(d, selection) : [];
    const { design, ids: copied } = duplicateFurniture(d, ids);
    if (!copied.length) return;
    change(() => design);
    if (copied.length === 1) {
      setSelection({ kind: "furniture", id: copied[0] });
      notify.success(`已复制「${design.furniture.find(f => f.id === copied[0])!.name}」`);
    } else {
      setSelection({ kind: "group", ids: copied });
      notify.success(`已复制 ${copied.length} 件家具`);
    }
  }, [d, selection, change]);
  const removeWall = useCallback(
    (wallId: string) => {
      const w = d.walls.find((w) => w.id === wallId);
      if (!w) return notify.fail("墙体不存在，请重新选择");
      if (!canDeleteWall(w)) return notify.fail("承重墙不可删除，请先取消承重标记");
      if (d.walls.length <= 1) return notify.fail("至少保留一面墙体");
      const before = designRef.current;
      let next: typeof before;
      try {
        next = removeWallModel(before, wallId);
      } catch (cause) {
        return notify.fail(cause instanceof Error ? cause.message : "无法删除这面墙");
      }
      commit(next, before);
      const lostFurniture = before.furniture.length - next.furniture.length;
      notify.success(lostFurniture > 0
        ? `已删除墙体，不再围合的房间及其中 ${lostFurniture} 件家具一并删除，可撤销恢复`
        : "已删除墙体，可撤销恢复");
      setSelection(null);
    },
    [d, commit, designRef],
  );
  const remove = useCallback(() => {
    if (!selection) return;
    const s = selection;
    if (s.kind === "room") {
      // 房间的删除 = 清空房间内家具；房间本身由墙体决定，不单独删除。
      const before = designRef.current;
      try {
        const next = clearRoomFurniture(before, s.id);
        if (next === before) return notify.info("这个房间里没有家具");
        commit(next, before);
        notify.success(`已清空房间内 ${before.furniture.length - next.furniture.length} 件家具，可撤销恢复`);
      } catch (cause) {
        return notify.fail(cause instanceof Error ? cause.message : "无法清空房间");
      }
      return;
    }
    else if (s.kind === "furniture") {
      const f = d.furniture.find((f) => f.id === s.id);
      change((d) => ({
        ...d,
        furniture: d.furniture.filter((f) => f.id !== s.id),
      }));
      if (f) notify.success(`已删除「${f.name}」，可撤销恢复`);
    }
    else if (s.kind === "opening") {
      const opening = d.openings.find(o => o.id === s.id);
      change((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== s.id) }));
      if (opening) notify.success(`已删除${openingKindLabel(opening.kind)}，可撤销恢复`);
    }
    else if (s.kind === "wall") return removeWall(s.id);
    else if (s.kind === "separator") {
      const before = designRef.current;
      try {
        commit(removeSeparator(before, s.id), before);
      } catch (cause) {
        return notify.fail(cause instanceof Error ? cause.message : "无法删除分隔线");
      }
      notify.success("已删除房间分隔线，两侧房间已合并，可撤销恢复");
    }
    else if (s.kind === "group") {
      const ids = groupIds(d, s), count = ids.length;
      if (!count) return setSelection(null);
      change((d) => removeGroup(d, ids));
      notify.success(`已删除选中的 ${count} 件家具，可撤销恢复`);
    }
    setSelection(null);
  }, [d, selection, change, commit, designRef, removeWall]);
  const removeRoom = useCallback(
    async (roomId: string) => {
      if (readOnly) return;
      const before = designRef.current;
      const room = before.rooms.find(r => r.id === roomId);
      if (!room) return notify.fail("房间不存在，请重新选择");
      const ok = await confirm({
        title: `删除「${room.name}」？`,
        description: "将删除这个房间、房内家具，以及只属于这个房间的墙（含墙上门窗）；与相邻房间共用的墙和承重墙保留。可撤销恢复。",
        confirmText: "删除房间",
        tone: "destructive",
      });
      if (!ok) return;
      let result: RoomRemoval;
      try {
        result = removeRoomModel(before, roomId);
      } catch (cause) {
        return notify.fail(cause instanceof Error ? cause.message : "无法删除这个房间");
      }
      if (designRef.current !== before) return notify.fail("设计已变化，请重新选择房间");
      commit(result.design, before);
      setSelection(null);
      const parts = [`已删除「${room.name}」及 ${result.removedWalls} 面独立墙`];
      if (result.protectedWalls) parts.push(`${result.protectedWalls} 面承重墙保留`);
      if (result.furniture) parts.push(`清理 ${result.furniture} 件家具`);
      if (result.exposed.length) parts.push(`${result.exposed.join("、")} 不再被墙围住，已一并移除`);
      notify.success(parts.join("，") + "，可撤销恢复");
    },
    [readOnly, confirm, commit, designRef],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (readOnly && !['t', 'f', 'escape'].includes(e.key.toLowerCase())) return;
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
      } else if (mod && k === "g") {
        e.preventDefault();
        if (selection?.kind === "group" && isPersistentGroup(d, groupIds(d, selection)) === e.shiftKey) toggleGroup();
      } else if (mod && (e.code === "BracketRight" || e.code === "BracketLeft") && (selection?.kind === "furniture" || selection?.kind === "group")) {
        // 图层顺序：Ctrl ] 上移一层、Ctrl [ 下移一层，加 Shift 为置顶 / 置底（与图层下拉一致）。
        e.preventDefault();
        const up = e.code === "BracketRight", ids = selection.kind === "group" ? groupIds(d, selection) : [selection.id];
        change((d) => reorderFurniture(d, ids, up ? (e.shiftKey ? "front" : "forward") : (e.shiftKey ? "back" : "backward")));
      } else if (mod && k === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "escape") {
        setSelection(null);
        setTool("select");
        if (isDrawerLayout()) setSidePanel(null);
      } else if (k === "delete" || k === "backspace") {
        e.preventDefault();
        remove();
      } else if (k === "r") rotate(e.shiftKey ? -90 : 90);
      else if (k === "t") void toggleView(view === "2d" ? "3d" : "2d");
      else if (k === "f") {
        if (view === "2d") canvas.current?.fit();
        else scene.current?.iso();
      } else if (k === "v") setTool("select");
      else if (k.startsWith("arrow") && (selection?.kind === "furniture" || selection?.kind === "group")) {
        e.preventDefault();
        const st = e.shiftKey ? 100 : 10;
        const ids = selection.kind === "group" ? selection.ids : [selection.id];
        change((d) => moveGroup(d, ids, [
          k === "arrowright" ? st : k === "arrowleft" ? -st : 0,
          k === "arrowdown" ? st : k === "arrowup" ? -st : 0,
        ]));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  /** 竖条入口：再点同一个就关闭。 */
  const togglePanel = (kind: PanelKind) => { sizeTransaction.flush(); setSidePanel(sidePanel === kind ? null : kind); };
  const openPanel = (kind: PanelKind) => { sizeTransaction.flush(); setSidePanel(kind); };
  const cloudSave = useAsyncAction(p.cloudSave);
  const templateCreate = useAsyncAction(async () => { if (p.createFromTemplate) await p.createFromTemplate(p.project.templateId ?? 'reference'); });
  // 游客改过模版才提示登录保存；「暂不保存」只关掉当前这一版，再改一次会重新出现。
  const [bannerClosed, setBannerClosed] = useState(0);
  const showGuestBanner = !p.loggedIn && p.guestEdits > 0 && p.guestEdits !== bannerClosed;
  /** 所有导出的唯一出口：调用方只负责生成文件，这里统一保存和提示。 */
  const exportAction = useAsyncAction(async (label: string, make: () => Promise<PendingFile | undefined>) => {
    try {
      const file = await make();
      if (!file) return;
      const result = saveFile(file.blob, file.name);
      if (result.kind === "downloaded") notify.success(`已导出${label}`);
      else setPendingFile({ blob: result.blob, name: result.name });
    } catch (error) {
      notify.error("导出失败", error);
    }
  });
  const exportFile = (format: ExportFormat) => {
    sizeTransaction.cancel();
    if (format === "png") {
      const plan = view === "2d";
      void exportAction.run(plan ? "2D 图片" : "3D 视角图片", async () => {
        const blob = plan ? await canvas.current?.exportImage() : await scene.current?.shot();
        return blob ? { blob, name: plan ? "户型方案-2D.png" : "户型方案-3D视角.png" } : undefined;
      });
      return;
    }
    const snapshot = structuredClone(model.current.current);
    void exportAction.run(`${format.toUpperCase()} 文件`, async () => {
      const { drawingFile, projectJsonFile } = await import("../model/drawingExport");
      return format === "json" ? projectJsonFile(snapshot, p.project.name) : drawingFile(snapshot, format, p.project.name);
    });
  };
  /** 方案报告：预览弹窗把它读到的账号默认价交回来，PDF 与预览同一口径；pdf-lib 按需加载，不进首屏包。保存成功后关闭预览。 */
  const exportReport = (defaults: AccountCostSettings) => {
    sizeTransaction.cancel();
    const snapshot = structuredClone(model.current.current);
    void exportAction.run("方案报告", async () => {
      const { reportFile } = await import("../model/reportExport");
      const file = await reportFile(snapshot, p.project.name, defaults);
      setReportOpen(false);
      return file;
    });
  };
  /** 新建风格：存进账号风格库并重读，套用由风格面板完成。 */
  const createStyle = async (style: DecorStyle) => {
    await saveAccountStyle(style);
    await loadAccountLibrary();
    notify.success(`已新建「${style.name}」并套用`);
  };
  /**
   * 布局整理：逐间把挡门、压窗、背后没墙、出了房间的家具挪到最近的合法位置（一步撤销即可还原），
   * 然后打开「布局整理」侧栏，列出仍需手动处理的问题。
   */
  const tidyFurniture = () => {
    if (readOnly) return;
    sizeTransaction.flush();
    const before = model.current.current, { design: next, report } = tidyLayout(before);
    if (next !== before) change(() => next);
    setLastTidy(report);
    setSidePanel("layout");
  };
  const clearFurniture = async () => {
    if (readOnly) return;
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
  const clearOpenings = async () => {
    if (readOnly) return;
    const count = d.openings.length;
    if (!count) return;
    const ok = await confirm({
      title: "清空所有门窗？",
      description: `将删除 ${count} 个门窗（含承重墙上的洞口），墙体和家具会保留，可撤销恢复。`,
      confirmText: "清空门窗",
      tone: "destructive",
    });
    if (!ok) return;
    change((d) => ({ ...d, openings: [] }));
    if (selection?.kind === "opening") setSelection(null);
    notify.success(`已清空 ${count} 个门窗，可撤销恢复`);
  };
  const clearSplits = async () => {
    if (readOnly) return;
    const count = splitPointCount(d);
    if (!count) return;
    const ok = await confirm({
      title: "清空所有墙体分割？",
      description: `将合并 ${count} 处分割：同一直线上相连的墙段一拉到底合并为一面墙（交界处也不打断）。类型按外围墙 > 承重墙 > 隔墙 > 矮墙取，含承重段的整面墙保留承重；门窗位置不变，可撤销恢复。`,
      confirmText: "清空分割",
      tone: "destructive",
    });
    if (!ok) return;
    const before = model.current.current;
    const result = mergeAllSplits(before);
    if (!result.merged) return notify.fail("没有可合并的墙段");
    commit(result.design, before);
    if (selection?.kind === "wall" && !result.design.walls.some(w => w.id === selection.id)) setSelection(null);
    notify.success(`已合并 ${result.merged} 处分割，可撤销恢复` + (result.skipped ? `（${result.skipped} 段因门窗冲突未合并）` : ""));
  };
  const clearBearingWalls = async () => {
    if (readOnly) return;
    const count = bearingWalls(d).length;
    if (!count) return;
    const ok = await confirm({
      title: "清空所有承重标记？",
      description: `${count} 面承重墙将改为普通墙，取消承重保护后可自由拆改；仅用于方案示意，可撤销恢复。`,
      confirmText: "清空承重",
      tone: "destructive",
    });
    if (!ok) return;
    change(clearBearing);
    notify.success(`已将 ${count} 面承重墙改为普通墙，可撤销恢复`);
  };
  /** 「清空」菜单：先对象（家具、门窗），再墙体（分割、承重）；宽屏下拉与窄屏「更多」共用。 */
  const clearActions = [
    { label: "清空家具", icon: Armchair, count: d.furniture.length, run: clearFurniture },
    { label: "清空门窗", icon: DoorOpen, count: d.openings.length, run: clearOpenings },
    { label: "清空分割", icon: Combine, count: splitPointCount(d), run: clearSplits, group: true },
    { label: "清空承重", icon: ShieldOff, count: bearingWalls(d).length, run: clearBearingWalls },
  ];
  const resetDesign = async () => {
    if (readOnly) return;
    // CAD 导入、AI 生成、以及来自已下线模板的户型都没有可重建的初始模板，重置会把它换成参考户型。
    const retired = d.template !== "blank" && !!d.templateId && !isAiDesign(d) && d.templateId !== DXF_TEMPLATE_ID && !presetById(d.templateId);
    if (d.templateId === DXF_TEMPLATE_ID || isAiDesign(d) || retired) {
      notify.fail(`${isAiDesign(d) ? "AI 生成" : retired ? "来自已下线模板" : "CAD 导入"}的户型没有初始模板，请用撤销逐步恢复`);
      return;
    }
    const ok = await confirm({
      title: "重置当前项目为其初始模板？",
      description: "墙体与家具都会恢复到初始模板，可撤销恢复。",
      confirmText: "重置方案",
      tone: "destructive",
    });
    if (!ok) return;
    change((d) => (d.template === "blank" ? blankDesign() : d.templateId ? designForTemplate(d.templateId) : designForTemplate("reference")));
    setSelection(null);
    notify.success("已重置为初始模板，可撤销恢复");
  };
  /** 画布上的操作提示：只在非选择工具时出现（原来底部状态条的那一行）。 */
  const tip =
    tool === "wall"
      ? "点击起点与转角连续绘墙 · 可拖动起段 · 双击 / 右键 / Enter 完成"
      : tool === "separator"
        ? "点击起点与转角绘制房间分隔线 · 两端贴墙即把空间分成两个房间 · 双击 / 右键 / Enter 完成"
        : isOpeningTool(tool)
        ? "点击墙体放置门窗或垭口，选中后可沿墙拖动或使用可视编辑工具条调整"
        : view === "3d"
          ? "拖动旋转 · 滚轮缩放 · 选中家具可移动 · 点击门开关"
          : "拖动空白处框选 · 双指滑动平移 · 拖入家具，开始规划你的理想空间";
  return (
    <div className="workbench-shell">
      {readOnly && (
        <WorkbenchBanner label="只读预览" description="内置模板仅供预览，用此模板新建后即可自由编辑并保存">
          <Button size="sm" className="workbench-banner-action" loading={templateCreate.pending} onClick={() => void templateCreate.run()}>
            用此模板新建
          </Button>
        </WorkbenchBanner>
      )}
      {showGuestBanner && (
        <WorkbenchBanner label="模版已更改" description="模版已更改，登录后即可保存到云端，换设备也能继续编辑">
          <Button
            size="sm"
            variant="ghost"
            className="workbench-banner-dismiss"
            disabled={cloudSave.pending}
            onClick={() => setBannerClosed(p.guestEdits)}
          >
            暂不保存
          </Button>
          <Button
            size="sm"
            className="workbench-banner-action"
            loading={cloudSave.pending}
            onClick={() => { sizeTransaction.cancel(); void cloudSave.run(); }}
          >
            登录并保存
          </Button>
        </WorkbenchBanner>
      )}
    <div className={"workbench" + (sidePanel ? " has-side-panel" : "")}>
      <div className="main-toolbar">
        <ProjectMenu
          {...p.projectNavigation}
          project={p.project}
          loggedIn={p.loggedIn}
          onBack={() => { sizeTransaction.cancel(); p.projects(); }}
          onOpen={async (row) => { sizeTransaction.cancel(); return p.projectNavigation.onOpen(row); }}
          onCreateProject={p.projectNavigation.onCreateProject && (async (project) => { sizeTransaction.cancel(); return p.projectNavigation.onCreateProject!(project); })}
          onDuplicate={p.projectNavigation.onDuplicate && (async (row) => { sizeTransaction.cancel(); return p.projectNavigation.onDuplicate!(row); })}
          email={p.email}
          loggingOut={p.loggingOut}
          onLogin={p.login}
          onLogout={p.logout}
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
              <LayoutTemplate size={16} />
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
              onPointerEnter={preloadScene}
              onFocus={preloadScene}
              disabled={sceneLoading}
            >
              {sceneLoading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Layers3 size={16} />
              )}
              3D<span className="view-switch-suffix">场景</span>
            </button>
          </EditorTooltip>
        </div>
        <span className="toolbar-divider danger-divider" />
        <div className="tool-group danger-actions">
          <ToolButton label="重置" onClick={resetDesign}>
            <RotateCcw size={16} />
          </ToolButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="tool-button" aria-label="清空" disabled={readOnly || clearActions.every(a => !a.count)}>
                <Trash2 size={16} />
                <span>清空</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {clearActions.map(a => [
                a.group && <DropdownMenuSeparator key={a.label + ":sep"} />,
                <DropdownMenuItem key={a.label} className="danger-item" disabled={!a.count} onSelect={a.run}>
                  <a.icon />
                  {a.label}
                  <span className="menu-item-count">{a.count}</span>
                </DropdownMenuItem>,
              ])}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
        <span className="toolbar-divider" />
        <div className="tool-group undo-actions">
          <ToolButton
            label="撤销"
            iconOnly
            shortcut="Ctrl Z"
            onClick={undo}
            disabled={!counts.undo}
          >
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton
            label="重做"
            iconOnly
            shortcut="Ctrl ⇧ Z"
            onClick={redo}
            disabled={!counts.redo}
          >
            <Redo2 size={16} />
          </ToolButton>
        </div>
        <div className="toolbar-right">
          <EditorTooltip label="家具库">
            <button
              type="button"
              className={"tool-button toolbar-chip" + (sidePanel === "library" ? " active" : "")}
              aria-label="家具库"
              aria-pressed={sidePanel === "library"}
              onClick={() => togglePanel("library")}
            >
              <Armchair size={16} />
              <span>家具</span>
            </button>
          </EditorTooltip>
          <CostChip design={d} active={sidePanel === "cost"} onClick={() => togglePanel("cost")} />
          <ExportMenu
            view={view}
            pending={exportAction.pending}
            onExport={exportFile}
            onReport={() => { sizeTransaction.flush(); setReportOpen(true); }}
            status={p.status}
            loggedIn={p.loggedIn}
            readOnly={readOnly}
            guestDirty={p.guestEdits > 0}
            saving={cloudSave.pending}
            onSave={() => { sizeTransaction.cancel(); void cloudSave.run(); }}
          />
          {/* 游客：右上角固定一个主按钮「登录」，保存降为副按钮；登录后不显示 */}
          {!p.loggedIn && (
            <Button size="sm" className="toolbar-login" onClick={p.login}>
              <UserRound />登录
            </Button>
          )}
        </div>
      </div>
      <main className="stage" ref={stage}>
        {view === "2d" ? (
          <PlanCanvas
            readOnly={readOnly}
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
            onAnchor={onAnchor}
            finishTool={()=>setTool('select')}
            startWallTool={structureTools ? () => setTool('wall') : undefined}
            onDimensionSelect={openDimension}
            selectedDimension={dimensionValid ? dimensionEdit.binding : undefined}
          />
        ) : Scene ? (
          <ErrorBoundary key={lifecycle.generation} fallback={null} onError={() => lifecycle.fail("crash")}>
          <Scene
            key={lifecycle.generation}
            readOnly={readOnly}
            ref={scene}
            design={d}
            selection={selection}
            select={select}
            options={sceneOptions}
            layers={layers}
            commit={commit}
            add={add}
            onError={lifecycle.fail}
            onReady={lifecycle.ready}
            onAnchor={onAnchor}
            exitWalk={() => setSceneOptions((o) => ({ ...o, mode: "orbit" }))}
          />
          </ErrorBoundary>
        ) : null}
        {view === "3d" && sceneLoading && (
          <div className="scene-loading">
            <Loader2 className="animate-spin" />
            正在加载 3D 场景…
          </div>
        )}
        {tool !== "select" && (
          <div className="mode-hint">
            {tip}
            {tool === "wall" ? (
              <EditorTooltip label="完成绘墙" shortcut="Enter">
                <button className="mode-hint-finish" onClick={() => setTool("select")}>完成绘墙</button>
              </EditorTooltip>
            ) : (
              <EditorTooltip label="退出当前工具" shortcut="Esc">
                <button onClick={() => setTool("select")} aria-label="退出当前工具">
                  <X size={13} />
                </button>
              </EditorTooltip>
            )}
          </div>
        )}
        {view === "3d" && (
          <div className="scene-light-control" role="group" aria-label="光照">
            <EditorTooltip label="白天" side="top">
              <button
                type="button"
                aria-label="白天"
                aria-pressed={!sceneOptions.night}
                className={sceneOptions.night ? "" : "active"}
                onClick={() => setSceneOptions((o) => ({ ...o, night: false }))}
              >
                <Sun size={16} />
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
                disabled={sceneOptions.night}
                onChange={(e) =>
                  setSceneOptions((o) => ({ ...o, hour: Number(e.target.value) }))
                }
              />
            </EditorTooltip>
            <span>
              {String(Math.floor(sceneOptions.hour)).padStart(2, "0")}:
              {String(Math.round((sceneOptions.hour % 1) * 60)).padStart(2, "0")}
            </span>
            <EditorTooltip label="夜晚" side="top">
              <button
                type="button"
                aria-label="夜晚"
                aria-pressed={sceneOptions.night}
                className={sceneOptions.night ? "active" : ""}
                onClick={() => setSceneOptions((o) => ({ ...o, night: true }))}
              >
                <Moon size={16} />
              </button>
            </EditorTooltip>
          </div>
        )}
        {view === "2d" && <CompassRose angle={northAngle(d)} />}
        <div className="canvas-zoom">
          <ViewMenu
            layers={layers}
            view={view}
            onToggleLayer={(key) => {
              if (key === "dims") change(d => ({ ...d, dimensionSettings: { ...d.dimensionSettings, visible: !(d.dimensionSettings?.visible ?? true) } }));
              else setLayers((l) => ({ ...l, [key]: !l[key] }));
            }}
            onRatio={(ratio) => canvas.current?.ratio(ratio)}
          />
          {!readOnly && <LayoutTidyButton design={d} onTidy={tidyFurniture} />}
          <i />
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
              <Scan size={15} />
            </button>
          </EditorTooltip>
        </div>
        {dimensionValid && <Suspense fallback={null}><DimensionEditDialog design={dimensionEdit.before} binding={dimensionEdit.binding}
          onClose={() => setDimensionEdit(null)} onApply={(millimeters, fixed) => {
            const current = model.current.current;
            if (current !== dimensionEdit.before) throw new Error('设计已变化，请重新选择标注');
            const edited = editDimensionWalls(current, dimensionEdit.binding, millimeters, fixed);
            setDimensionEdit(null);
            if (edited === current) return;
            // 位置变化的墙：贴墙家具沿法向跟随，并在新的交接点自动分割。
            const changed = edited.walls.filter(w => {
              const old = current.walls.find(o => o.id === w.id);
              return !old || old.a[0] !== w.a[0] || old.a[1] !== w.a[1] || old.b[0] !== w.b[0] || old.b[1] !== w.b[1];
            }).map(w => w.id);
            commit(splitAtJunctionsOf(followWallFurniture(current, edited), changed), current);
          }} /></Suspense>}
        {splitValid && <Suspense fallback={null}><WallSplitDialog design={wallSplit.before} wallId={wallSplit.wallId}
          onClose={() => setWallSplit(null)} onApply={(cuts, selectedSegment) => {
            const current = model.current.current;
            if (current !== wallSplit.before) throw new Error('设计已变化，请重新选择墙体');
            const result = splitWallModel(current, wallSplit.wallId, cuts, selectedSegment);
            commit(result.design, current);
            setWallSplit(null);
            setSelection({ kind: 'wall', id: result.selectedId });
          }} /></Suspense>}
        <SelectionEditor
          splitWall={view === '2d' ? openWallSplit : undefined}
          mergeWall={view === '2d' ? id => void cancelWallSplit(id) : undefined}
          removeWall={view === '2d' ? removeWall : undefined}
          removeRoom={view === '2d' && tool === 'select' && !readOnly ? id => void removeRoom(id) : undefined}
          key={selectionId}
          ref={editor}
          design={d}
          selection={selection}
          stage={stage}
          change={change}
          rotate={() => rotate()}
          duplicate={duplicate}
          toggleGroup={toggleGroup}
          remove={remove}
          select={select}
          close={() => setSelection(null)}
          transaction={sizeTransaction} showCosts
          accountFloors={accountFloors} accountWalls={accountWalls} accountOpenings={accountOpenings}
          accountRoofs={accountRoofs} accountCeilings={accountCeilings}
          roomAi={aiEnabled && selection?.kind === "room" ? { tone: roomAi.toneOf(selection.id), open: () => roomAi.open(selection.id) } : undefined}
          hidden={readOnly || tool !== 'select' || (!!sidePanel && isDrawerLayout()) || (view === "3d" && sceneOptions.mode === "walk")}
          costs={() => openPanel("cost")}
        />
        <CanvasRail
          sidePanel={sidePanel}
          stage={stage}
          onToggle={togglePanel}
          tools={view === "2d" ? (
            <PlanRailTools
              tool={tool}
              setTool={setTool}
              structureTools={structureTools}
              addItem={(item) => add(item)}
              onReset={resetDesign}
              clearActions={clearActions}
            />
          ) : (
            <SceneRailTools
              mode={sceneOptions.mode}
              onSelect={() => setSceneOptions((o) => ({ ...o, mode: "orbit" }))}
              onWalk={() => {
                setSelection(null);
                setSceneOptions((o) => ({ ...o, mode: "walk", cut: false }));
              }}
              view={{
                cut: sceneOptions.cut,
                night: sceneOptions.night,
                onIso: () => scene.current?.iso(),
                onTop: () => scene.current?.top(),
                onCut: (cut) => setSceneOptions((o) => ({ ...o, cut })),
                onNight: (night) => setSceneOptions((o) => ({ ...o, night })),
              }}
            />
          )}
          panels={view === "3d" && <SceneRailPanels sidePanel={sidePanel} onToggle={togglePanel} />}
        />
      </main>
      {sidePanel && (
        <SidePanel title={PANEL_TITLES[sidePanel]} readOnly={readOnly && sidePanel !== "library"} onClose={() => { sizeTransaction.flush(); setSidePanel(null); }}>
          {sidePanel === "library" ? (
            <Library
              add={(it) => add(it)}
              tool={tool}
              setTool={(t) => {
                setTool(t);
                if (isDrawerLayout()) setSidePanel(null);
              }}
              structureTools={structureTools}
              customItems={[...projectCatalog, ...accountFurniture]}
              builtinItems={builtinLibrary}
              onNew={p.loggedIn && !readOnly ? openCustom : undefined}
              readOnly={readOnly}
            />
          ) : sidePanel === "ai" ? (
            <Suspense fallback={null}><AiChatPanel loggedIn={p.loggedIn} login={p.login} /></Suspense>
          ) : sidePanel === "settings" ? (
            <HouseSettingsPanel design={d} change={change} />
          ) : sidePanel === "style" ? (
            <StylePanel design={d} change={change} mine={p.loggedIn ? accountLibrary.styles : []} onCreate={p.loggedIn && !readOnly ? createStyle : undefined} />
          ) : sidePanel === "layout" ? (
            <LayoutPanel
              design={d}
              lastTidy={lastTidy}
              selectedId={selection?.kind === "furniture" ? selection.id : null}
              onTidy={tidyFurniture}
              onSelect={(id) => setSelection({ kind: "furniture", id })}
            />
          ) : (
            <CostPanel
              design={d}
              selection={selection}
              change={change}
              select={select}
              back={() => select(null)}
            />
          )}
        </SidePanel>
      )}
      {sidePanel && (
        <button
          className="drawer-backdrop"
          aria-label="关闭侧栏"
          onClick={() => setSidePanel(null)}
        />
      )}
      {p.loggedIn && customMounted && <Suspense fallback={null}><CustomFurnitureDialog
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
      /></Suspense>}
      {aiEnabled && roomAi.room && <Suspense fallback={null}><AiRoomDialog ai={roomAi} furniture={aiCatalog.items} /></Suspense>}
      {reportOpen && <Suspense fallback={null}><ReportPreview design={d} name={p.project.name} exporting={exportAction.pending} onClose={() => setReportOpen(false)} onExport={exportReport} /></Suspense>}
      <SaveFileDialog file={pendingFile} onClose={() => setPendingFile(null)} />
    </div>
    </div>
  );
}
