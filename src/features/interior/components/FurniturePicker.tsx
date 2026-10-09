import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterPickerItems, groupPickerItems, type PickerItem } from "./pickerItems";

/**
 * 统一的可搜索家具选择器：弹层 = 搜索框 + 分组列表。
 * 选中即回传并关闭；已经选过的条目不做标记、仍可再次选择（重复选择即表示多件）。
 */
export function FurniturePicker({ items, onPick, children, label, placeholder = "搜索家具名称、分类…", disabled = false }: {
  items: PickerItem[];
  onPick: (item: PickerItem) => void;
  /** 触发按钮（会作为 PopoverTrigger 的 asChild）。 */
  children: ReactNode;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const shown = groupPickerItems(filterPickerItems(items, query));
  // modal：弹层在弹窗里时接管滚动锁，否则鼠标滚轮会被外层弹窗挡住、列表滚不动。
  return <Popover modal open={open && !disabled} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
    <PopoverTrigger asChild disabled={disabled}>{children}</PopoverTrigger>
    <PopoverContent className="furniture-picker" align="start" collisionPadding={12} aria-label={label}>
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} aria-label={placeholder} />
        <CommandList>
          <CommandEmpty>没有找到匹配项，试试其他关键词</CommandEmpty>
          {shown.map(([group, list]) => <CommandGroup key={group} heading={group}>
            {list.map((item) => <CommandItem key={item.id} value={item.id} onSelect={() => { onPick(item); setOpen(false); setQuery(""); }}>
              {item.visual && <span className="furniture-picker-visual">{item.visual}</span>}
              <span className="furniture-picker-label">{item.label}{item.badge && <small>{item.badge}</small>}</span>
              {item.hint && <span className="furniture-picker-hint">{item.hint}</span>}
            </CommandItem>)}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
