import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { filterPickerItems, groupPickerItems, type PickerItem } from "./picker-items";

/**
 * 统一的可搜索带图选择器：弹层 = （可选标题）+ 搜索框 + 分组列表。
 * 每行与右侧面板的材料卡同一语言：左侧 32px 浅底缩略图块，右侧名称 + 一行辅助信息（尺寸 / 单价）。
 * 选中即回传并关闭；已经选过的条目不做标记、仍可再次选择（重复选择即表示多件）。
 */
export function FurniturePicker({ items, onPick, children, label, placeholder = "搜索家具名称、分类…", disabled = false, align = "start", selectedId, grouped = true, footer, tooltip, heading, compact = false }: {
  items: PickerItem[];
  onPick: (item: PickerItem) => void;
  /** 触发按钮（会作为 PopoverTrigger 的 asChild）。 */
  children: ReactNode;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  align?: "start" | "end";
  /** 单选场景：当前选中项右侧显示对勾。 */
  selectedId?: string;
  /** 条目之间的差异不影响选择时关掉，只留搜索框和一条平铺列表。 */
  grouped?: boolean;
  /** 列表下方的说明或操作；传函数可拿到关闭弹层的方法。 */
  footer?: ReactNode | ((close: () => void) => ReactNode);
  /** 触发按钮的悬浮提示（工具条入口用）；提示挂在触发器上，不另加包裹层。 */
  tooltip?: string;
  /** 弹层顶部标题与右侧补充（例如「房间内家具 · 10 件」）；表单内的下拉不需要。 */
  heading?: { title: string; meta?: string };
  /** 窄弹层（240px）：只列名称 + 尺寸、没有分组与徽标的场景用，例如房间内家具。 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const shown = groupPickerItems(filterPickerItems(items, query));
  const renderItem = (item: PickerItem) => <CommandItem key={item.id} value={item.id} onSelect={() => { onPick(item); setOpen(false); setQuery(""); }}>
    {item.visual && <span className="furniture-picker-visual">{item.visual}</span>}
    <span className="furniture-picker-text">
      <span className="furniture-picker-label">{item.label}{item.badge && <small>{item.badge}</small>}</span>
      {item.hint && <span className="furniture-picker-hint">{item.hint}</span>}
    </span>
    {selectedId === item.id && <Check size={14} className="furniture-picker-check" aria-label="当前选择" />}
  </CommandItem>;
  const trigger = <PopoverTrigger asChild disabled={disabled}>{children}</PopoverTrigger>;
  // modal：弹层在弹窗里时接管滚动锁，否则鼠标滚轮会被外层弹窗挡住、列表滚不动。
  return <Popover modal open={open && !disabled} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
    {tooltip ? <EditorTooltip label={tooltip}>{trigger}</EditorTooltip> : trigger}
    <PopoverContent className={compact ? "furniture-picker is-compact" : "furniture-picker"} align={align} collisionPadding={12} aria-label={label}>
      {heading && <header className="furniture-picker-head"><b>{heading.title}</b>{heading.meta && <span>{heading.meta}</span>}</header>}
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} aria-label={placeholder} />
        <CommandList>
          <CommandEmpty>没有找到匹配项，试试其他关键词</CommandEmpty>
          {grouped
            ? shown.map(([group, list]) => <CommandGroup key={group} heading={group}>{list.map(renderItem)}</CommandGroup>)
            : <CommandGroup>{shown.flatMap(([, list]) => list).map(renderItem)}</CommandGroup>}
        </CommandList>
      </Command>
      {footer && <div className="furniture-picker-footer">{typeof footer === "function" ? footer(() => setOpen(false)) : footer}</div>}
    </PopoverContent>
  </Popover>;
}
