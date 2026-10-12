import {
  BrickWall,
  Box,
  DoorOpen,
  Eye,
  Footprints,
  LayoutGrid,
  Moon,
  MousePointer2,
  Palette,
  RotateCcw,
  ScanLine,
  Scissors,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { stairLibrary } from "@/lib/floor-plan/stairs";
import type { LibraryItem, Tool } from "@/lib/floor-plan/types";
import { RailButton } from "./canvas-rail";
import type { PanelKind } from "./side-panel";
import { wallTools } from "../model/wall-tools";

/** 墙下拉里只放一个楼梯入口（直跑）；其它梯形在选中后的工具条里切换，不把 5 种梯形都摊在菜单里。 */
const STAIRS = stairLibrary[0]!;

/** 破坏性操作：窄屏顶栏放不下时收进「墙体」下拉（宽屏在顶栏常驻，这里隐藏）。 */
export interface ClearAction { label: string; icon: LucideIcon; count: number; run: () => void }

/**
 * 「墙体」按钮：图标显示当前选用的墙体工具，点开是墙 / 垭口 / 房间分隔线、楼梯，
 * 以及窄屏才出现的重置 / 清空（宽屏这两项在顶栏常驻）。
 */
export function RailWallMenu({ tool, setTool, addItem, onReset, clearActions }: {
  tool: Tool;
  setTool: (tool: Tool) => void;
  addItem: (item: LibraryItem) => void;
  onReset: () => void;
  clearActions: ClearAction[];
}) {
  const current = wallTools.find((t) => t.tool === tool);
  const Icon = current?.icon ?? BrickWall;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RailButton icon={<Icon />} label="墙体" active={!!current} menu />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="wall-tool-menu">
        {wallTools.map((t) => (
          <DropdownMenuItem key={t.tool} onSelect={() => setTool(t.tool)} data-active={t.tool === tool || undefined}>
            <t.icon size={16} aria-hidden="true" />
            <span className="wall-tool-item">
              <strong>{t.label}</strong>
              <small>{t.hint}</small>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => addItem(STAIRS)}>
          <LayoutGrid size={16} aria-hidden="true" />
          <span className="wall-tool-item">
            <strong>楼梯</strong>
            <small>放到当前房间中央，选中后可换 L 型、U 型等</small>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="compact-only" />
        <DropdownMenuItem className="danger-item compact-only" onSelect={onReset}>
          <RotateCcw />
          重置方案
        </DropdownMenuItem>
        {clearActions.map((a) => (
          <DropdownMenuItem key={a.label} className="danger-item compact-only" disabled={!a.count} onSelect={a.run}>
            <a.icon />
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 2D 竖条：选择 → 墙体 ▾ → 门 → 窗。家具库入口在顶栏右侧。
 * 结构工具（墙体 / 门 / 窗，以及墙体下拉里的垭口、分隔线、楼梯）只在可改结构时出现，与原顶栏规则一致。
 */
export function PlanRailTools({ tool, setTool, structureTools, addItem, onReset, clearActions }: {
  tool: Tool;
  setTool: (tool: Tool) => void;
  structureTools: boolean;
  /** 放置一件目录项（楼梯）。 */
  addItem: (item: LibraryItem) => void;
  onReset: () => void;
  clearActions: ClearAction[];
}) {
  return (
    <>
      <RailButton icon={<MousePointer2 />} label="选择" active={tool === "select"} onClick={() => setTool("select")} />
      {structureTools && <>
        <RailWallMenu tool={tool} setTool={setTool} addItem={addItem} onReset={onReset} clearActions={clearActions} />
        <RailButton icon={<DoorOpen />} label="门" active={tool === "door"} onClick={() => setTool("door")} />
        <RailButton icon={<ScanLine />} label="窗" active={tool === "window"} onClick={() => setTool("window")} />
      </>}
    </>
  );
}

/**
 * 3D「视图」按钮：斜视 / 俯视两个机位与剖切 / 夜景两个开关平铺在同一个菜单里，不再分组。
 * 开关项点了不关菜单，可以连着切；有开关开着时按钮右上角亮一个小点，提示画面不是默认状态。
 */
export function SceneViewMenu({ cut, night, onIso, onTop, onCut, onNight }: {
  cut: boolean;
  night: boolean;
  onIso: () => void;
  onTop: () => void;
  onCut: (on: boolean) => void;
  onNight: (on: boolean) => void;
}) {
  const toggles = [
    { label: "剖切", icon: Scissors, on: cut, set: onCut },
    { label: "夜景", icon: Moon, on: night, set: onNight },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RailButton icon={<Eye />} label="视图" menu badge={cut || night} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={10} className="toolbar-menu scene-view-menu">
        <DropdownMenuItem onSelect={onIso}>
          <Box aria-hidden="true" />
          斜视
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTop}>
          <LayoutGrid aria-hidden="true" />
          俯视
        </DropdownMenuItem>
        {toggles.map(({ label, icon: Icon, on, set }) => (
          <DropdownMenuCheckboxItem key={label} checked={on} onCheckedChange={(next) => set(next === true)} onSelect={(e) => e.preventDefault()}>
            <Icon aria-hidden="true" />
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 3D 竖条的工具段：选择 → 漫游 → 视图 ▾。打开侧栏的「风格」放在下面一组（见 SceneRailPanels）。
 * 「选择」就是原来的鸟瞰：旋转 / 平移视角，并能点选、拖动家具；与 2D 一样放在最上面、默认选中。
 */
export function SceneRailTools({ mode, onSelect, onWalk, view }: {
  mode: "orbit" | "walk";
  onSelect: () => void;
  onWalk: () => void;
  /** 「视图」菜单的状态与动作。 */
  view: React.ComponentProps<typeof SceneViewMenu>;
}) {
  return (
    <>
      <RailButton icon={<MousePointer2 />} label="选择" active={mode === "orbit"} onClick={onSelect} />
      <RailButton icon={<Footprints />} label="漫游" active={mode === "walk"} onClick={onWalk} />
      <SceneViewMenu {...view} />
    </>
  );
}

/** 3D 竖条的侧栏段：风格排在「户型」前面。 */
export function SceneRailPanels({ sidePanel, onToggle }: { sidePanel: PanelKind | null; onToggle: (kind: PanelKind) => void }) {
  return <RailButton icon={<Palette />} label="风格" title="装修风格" open={sidePanel === "style"} onClick={() => onToggle("style")} />;
}
