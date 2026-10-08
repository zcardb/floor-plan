import { useCallback, useEffect, useRef, useState } from "react";
import {
  Armchair,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Cloud,
  CircleDollarSign,
  Copy,
  DoorOpen,
  Download,
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useDesign } from "../model/useDesign";
import { center, norm, pushOut, rebuildRooms } from "../model/geometry";
import {
  uid,
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
import { SelectionEditor, type SelectionEditorHandle } from "./SelectionEditor";
import { furnitureKey } from "../model/costs";
import type { ScreenRect } from "../model/selectionAnchor";
import { PlanCanvas, type CanvasHandle } from "./PlanCanvas";
import type { Scene3D, SceneHandle, SceneOptions } from "../scene/Scene3D";
type SceneComponent = typeof Scene3D;
interface Props {
  project: Project;
  update: (d: Design) => void;
  status: string;
  loggedIn: boolean;
  email?: string;
  projects: () => void;
  login: () => void;
  logout: () => void;
  save: () => void;
  cloudSave: () => void;
  importProject: (d: Design, name: string) => void;
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
  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? " · " + shortcut : ""}
      </TooltipContent>
    </Tooltip>
  );
}
export function Workbench(p: Props) {
  const model = useDesign(p.project.state, p.update),
    { design: d, change, commit, preview, undo, redo, counts } = model;
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
  const coordLabel = useRef<HTMLSpanElement>(null);
  const onCoord = useCallback((p: Point) => {
    if (coordLabel.current)
      coordLabel.current.textContent = `X ${Math.round(p[0])}  /  Y ${Math.round(p[1])} mm`;
  }, []);
  const [layers, setLayers] = useState<Layers>({
      grid: false,
      dims: true,
      labels: true,
      furn: true,
      bearing: false,
      snap: true,
    }),
    [sceneOptions, setSceneOptions] = useState<SceneOptions>({
      cut: false,
      night: false,
      hour: 10,
      mode: "orbit",
    });
  const [costOpen, setCostOpen] = useState(false);
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
      setSelection(s);
      if (s?.kind === "room") scene.current?.room(s.id);
    }, []),
    closePanels = useCallback(() => setDrawer(null), []);
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
        toast.error("3D 引擎加载失败，请重试；2D 仍可编辑");
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
      toast.success("已添加 " + it.name);
    },
    [d, selection, view, change],
  );
  const rotate = useCallback(
    (angle = 90) => {
      if (selection?.kind === "furniture")
        change((d) => ({
          ...d,
          furniture: d.furniture.map((f) =>
            f.id === selection.id ? { ...f, rot: norm(f.rot + angle) } : f,
          ),
        }));
    },
    [selection, change],
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
  }, [d, selection, change]);
  const remove = useCallback(() => {
    if (!selection) return;
    const s = selection;
    if (s.kind === "furniture")
      change((d) => ({
        ...d,
        furniture: d.furniture.filter((f) => f.id !== s.id),
      }));
    else if (s.kind === "opening")
      change((d) => ({
        ...d,
        openings: d.openings.filter((o) => o.id !== s.id),
      }));
    else if (s.kind === "wall") {
      const w = d.walls.find((w) => w.id === s.id);
      if (d.template !== "blank" || w?.kind !== "partition")
        return toast.error("此墙体不可删除");
      change((d) =>
        rebuildRooms({
          ...d,
          walls: d.walls.filter((w) => w.id !== s.id),
          openings: d.openings.filter((o) => o.wallId !== s.id),
        }),
      );
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
  const exportImage = () =>
    view === "2d" ? canvas.current?.exportImage() : scene.current?.shot();
  const exportJson = () => {
    const blob = new Blob(
        [JSON.stringify({ name: p.project.name, ...d }, null, 2)],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = p.project.name + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clear = () => {
    if (
      d.furniture.length &&
      window.confirm("清空所有家具？墙体、材质和测量会保留，可撤销恢复。")
    ) {
      change((d) => ({ ...d, furniture: [] }));
      setSelection(null);
    }
  };
  const tip =
    tool === "wall"
      ? "拖动绘制隔墙 · 水平 / 垂直吸附 · 闭合空间自动生成房间"
      : tool === "measure"
        ? "点击两点或拖动测量 · Shift 锁定方向"
        : tool === "demolish"
          ? "点击非承重墙标记拆除，再次点击恢复"
          : tool === "door" || tool === "window"
            ? "点击墙体放置开口，再在属性中调整位置和宽度"
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
      <header className="main-header">
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
        <button className="project-title" onClick={p.projects}>
          <span>{p.project.name}</span>
          <ChevronDown size={14} />
        </button>
        <span className="save-indicator">
          <span
            className={
              p.status.includes("失败") || p.status.includes("冲突")
                ? "error-dot"
                : "status-dot"
            }
          />
          {p.status}
        </span>
        <div className="header-spacer" />
        <button className="header-plain" onClick={p.projects}>
          <FolderOpen size={16} />
          <span>我的项目</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="header-plain">
              <UserRound size={16} />
              <span>{p.loggedIn ? "我的账号" : "游客模式"}</span>
              <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              {p.email || "无需登录即可编辑与下载"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {p.loggedIn ? (
              <DropdownMenuItem onClick={p.logout}>退出登录</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={p.login}>登录 / 注册</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={p.cloudSave}>
              将当前项目另存到云端
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" className="download-button" onClick={exportImage}>
          <Download />
          <span>下载{view === "2d" ? "设计图" : "当前视角"}</span>
        </Button>
      </header>
      <div className="main-toolbar">
        <div className="view-switch">
          <button
            className={view === "2d" ? "active" : ""}
            onClick={() => void toggleView("2d")}
          >
            <LayoutTemplate size={15} />
            2D 平面
          </button>
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
            <ToolButton
              label="测量"
              shortcut="M"
              active={tool === "measure"}
              onClick={() => setTool("measure")}
            >
              <Ruler size={16} />
            </ToolButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="tool-button">
                  <Settings2 size={16} />
                  <span>结构</span>
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {d.template === "blank" && (
                  <>
                    <DropdownMenuItem onClick={() => setTool("door")}>
                      <DoorOpen />
                      添加门
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTool("window")}>
                      <ScanLine />
                      添加窗
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => setTool("demolish")}>
                  <Trash2 />
                  拆改非承重墙
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
          <ToolButton label="重做" onClick={redo} disabled={!counts.redo}>
            <Redo2 size={16} />
          </ToolButton>
        </div>
        <div className="header-spacer" />
        <div className="toolbar-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="tool-button">
                <Layers3 size={16} />
                <span>图层</span>
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
                    setLayers((l) => ({ ...l, [key]: !l[key] }));
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
            <DropdownMenuTrigger asChild>
              <button className="tool-button">
                <FolderOpen size={16} />
                <span>文件</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportImage}>
                <Download />
                {view === "2d" ? "下载 2D 图片" : "下载当前 3D 视角"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={p.save}>
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
              <DropdownMenuItem onClick={() => file.current?.click()}>
                <FolderOpen />
                导入 JSON 为新项目
              </DropdownMenuItem>
              <DropdownMenuItem onClick={p.cloudSave}>
                <Cloud />
                另存云端项目
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clear}>
                <Trash2 />
                清空家具布置
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (
                    window.confirm("重置当前项目为其初始模板？可撤销恢复。")
                  ) {
                    change(() =>
                      d.template === "blank"
                        ? blankDesign()
                        : referenceDesign(),
                    );
                    setSelection(null);
                  }
                }}
              >
                <RotateCcw />
                重置当前方案
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => change((d) => ({ ...d, measures: [] }))}
              >
                <Ruler />
                清除测量线
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="toolbar-icon"
            title="操作帮助"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={17} />
          </button>
          <button
            className="toolbar-icon"
            title="全屏"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                document.documentElement
                  .requestFullscreen?.()
                  .catch(() => toast.info("当前浏览器不支持全屏"));
            }}
          >
            <Expand size={17} />
          </button>
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
            <button onClick={() => togglePane("lib")} title="家具库">
              {hideLib ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
            <button onClick={() => togglePane("panel")} title="属性面板">
              {hidePanel ? (
                <PanelRightOpen size={16} />
              ) : (
                <PanelRightClose size={16} />
              )}
            </button>
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
              toast.error("设备无法启动 3D，请继续使用 2D 编辑");
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
        {tool !== "select" && (
          <div className="mode-hint">
            {tip}
            <button onClick={() => setTool("select")}>
              <X size={13} />
            </button>
          </div>
        )}
        {view === "3d" && (
          <div className="scene-light-control">
            <button
              onClick={() =>
                setSceneOptions((o) => ({ ...o, night: !o.night }))
              }
            >
              {sceneOptions.night ? <Moon size={16} /> : <Sun size={16} />}
            </button>
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
          <span>
            {view === "2d" ? "1:" + Math.round(96 / 25.4 / scale) : "3D"}
          </span>
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
          <i />
          <button
            aria-label="适应窗口"
            onClick={() =>
              view === "2d" ? canvas.current?.fit() : scene.current?.iso()
            }
          >
            <Maximize2 size={15} />
          </button>
        </div>
        <SelectionEditor
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
          hidden={!!drawer || (view === "3d" && sceneOptions.mode === "walk")}
          details={() => {
            setCostOpen(false);
            if (matchMedia("(max-width:1100px)").matches) setDrawer("panel");
            else setHidePanel(false);
          }}
          costs={() => {
            setCostOpen(true);
            if (matchMedia("(max-width:1100px)").matches) setDrawer("panel");
            else setHidePanel(false);
          }}
        />
        <button className="mobile-library" onClick={() => togglePane("lib")}>
          <Armchair size={19} />
          家具库
        </button>
      </main>
      <aside
        className={
          "property-panel " + (drawer === "panel" ? "drawer-open" : "")
        }
      >
        {costOpen ? (
          <CostPanel
            design={d}
            change={change}
            back={() => setCostOpen(false)}
          />
        ) : (
          <>
            <button
              className="open-cost-manager"
              onClick={() => setCostOpen(true)}
            >
              <CircleDollarSign size={16} />
              软装 / 硬装成本
            </button>
            <PropertyPanel
              design={d}
              selection={selection}
              select={select}
              change={change}
              duplicate={duplicate}
              remove={remove}
              rotate={() => rotate()}
            />
          </>
        )}
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
          X 0 / Y 0 mm
        </span>
        <span className="status-tip">{tip}</span>
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
          if (!f) return;
          if (f.size > 5000000) {
            toast.error("文件不得超过 5 MB");
            return;
          }
          try {
            const raw = JSON.parse(await f.text()),
              d = validateDesign(raw.state || raw);
            p.importProject(d, raw.name || f.name.replace(/\.json$/, ""));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "文件格式不正确");
          }
        }}
      />
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
                  点击或拖入家具，选中后调整尺寸与材质。点击 3D
                  预览，走进你的设计。
                </p>
              </div>
            </li>
            <li>
              <b>03</b>
              <div>
                <strong>保存你的创作</strong>
                <p>
                  直接下载 2D 图与当前 3D 视角，导出 JSON
                  备份；登录可另存多个云端项目。
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
