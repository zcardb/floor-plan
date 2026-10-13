import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DECOR_CATEGORIES,
  createCustomStyle,
  decorStyleById,
  isCustomStyleId,
  styleSwatches,
  type DecorCategory,
  type DecorStyle,
} from "@/lib/floor-plan/decor-styles";
import type { Design } from "@/lib/floor-plan/types";

/** 起点：基于一套现有风格，或（编辑器里）从当前方案提取配色。 */
type Source = "style" | "design";
const NO_CATEGORY = "none";

/**
 * 新建风格。流程参考酷家乐「保存为样板间」、三维家「复制风格方案」：起个名字，选一个起点——
 * 基于一套现有风格，或从当前方案提取每类家具的颜色——创建后再到风格详情里逐项细调。
 *
 * 弹窗只负责组装风格；保存到账号库、套用到方案或跳转详情由调用方完成。
 */
export function NewStyleDialog({ open, onOpenChange, styles, initialBase, design, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 可作为起点的风格：我的风格在前，其后是内置风格。 */
  styles: DecorStyle[];
  /** 默认起点（例如当前方案正在用的风格）。 */
  initialBase?: string;
  /** 传入时多一个「从当前方案提取」的起点。 */
  design?: Pick<Design, "furniture" | "walls">;
  onCreate: (style: DecorStyle) => Promise<void>;
}) {
  const ids = useId();
  const [baseId, setBaseId] = useState(() => styles.find((s) => s.id === initialBase)?.id ?? styles[0]?.id ?? "default");
  const base = styles.find((s) => s.id === baseId) ?? decorStyleById(baseId);
  const [name, setName] = useState(() => (initialBase ? `${base.name} · 我的` : ""));
  const [source, setSource] = useState<Source>("style");
  const [category, setCategory] = useState<string>(base.category ?? NO_CATEGORY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trimmed = name.trim();
  const invalid = !trimmed ? "请填写风格名称" : trimmed.length > 20 ? "名称最多 20 个字" : "";
  const pickBase = (id: string) => {
    setBaseId(id);
    const next = styles.find((s) => s.id === id);
    if (next?.category) setCategory(next.category);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalid || busy) { setError(invalid); return; }
    setBusy(true);
    setError("");
    try {
      await onCreate(createCustomStyle({
        base,
        name: trimmed,
        category: category === NO_CATEGORY ? undefined : (category as DecorCategory),
        design: source === "design" ? design : undefined,
      }));
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "新建风格失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const groups = [
    { label: "我的风格", items: styles.filter((s) => isCustomStyleId(s.id)) },
    { label: "内置风格", items: styles.filter((s) => !isCustomStyleId(s.id)) },
  ].filter((group) => group.items.length);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="style-create-dialog">
        <DialogHeader>
          <DialogTitle>新建风格</DialogTitle>
          <DialogDescription>选一个起点复制出自己的风格，创建后可在风格管理里逐项调整硬装与每类家具的颜色。</DialogDescription>
        </DialogHeader>
        <form className="style-create-form" onSubmit={(event) => void submit(event)}>
          <div className="style-create-field">
            <Label htmlFor={ids + "name"}>风格名称</Label>
            <Input id={ids + "name"} autoFocus maxLength={20} placeholder="例如：我家的奶油原木" value={name}
              aria-invalid={!!error && !!invalid} onChange={(e) => { setName(e.target.value); setError(""); }} />
          </div>
          {design && (
            <fieldset className="style-create-source">
              <legend>起点</legend>
              {([["style", "基于现有风格", "复制一套风格的全部配色"], ["design", "从当前方案提取", "每类家具沿用方案里的颜色，墙面取方案墙色"]] as const).map(([value, title, hint]) => (
                <label key={value} className={"style-create-option" + (source === value ? " active" : "")}>
                  <input type="radio" name={ids + "source"} value={value} checked={source === value} onChange={() => setSource(value)} />
                  <span><strong>{title}</strong><small>{hint}</small></span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="style-create-field">
            <Label htmlFor={ids + "base"}>{source === "design" ? "其余取值沿用" : "起点风格"}</Label>
            <Select value={baseId} onValueChange={pickBase}>
              <SelectTrigger id={ids + "base"} className="style-create-select"><SelectValue /></SelectTrigger>
              <SelectContent className="style-create-options">
                {groups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.items.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="style-create-swatches" aria-hidden="true">{styleSwatches(s).slice(0, 4).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="style-create-field">
            <Label htmlFor={ids + "category"}>风格大类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id={ids + "category"} className="style-create-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>不归类</SelectItem>
                {DECOR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="style-create-error" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}创建风格</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
