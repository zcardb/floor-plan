import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { usePagedList } from "@/hooks/usePagedList";
import { notify } from "@/lib/notify";
import type { PageRequest, PageResult } from "@/lib/paging";
import { removeAccountStyle, saveAccountStyle } from "../cloud/accountWrites";
import { accountItemPage } from "../cloud/libraryPages";
import { library as catalog } from "../data/catalog";
import { costCounts } from "../model/accountCostEntries";
import {
  DECOR_CATEGORIES,
  DECOR_ROLES,
  METAL_FINISH,
  METAL_LABEL,
  furnitureMain,
  furnitureRole,
  roleColor,
  styleSwatches,
  type DecorCategory,
  type DecorRole,
  type DecorStyle,
  type MetalFinish,
} from "../model/decorStyles";
import type { LibraryItem } from "../model/types";
import { CmsFilterBar } from "./CmsFilterBar";
import { FurnitureShape } from "./FurnitureShape";
import { ListLoadMore } from "./ListLoadMore";
import { LoadError } from "./LoadError";

const ROLE_LABEL = Object.fromEntries(DECOR_ROLES.map((r) => [r.id, r.label])) as Record<DecorRole, string>;
/** 硬装与收边的颜色字段：详情页逐行展示，自定义风格可改。 */
const HARD_FIELDS: { key: "wall" | "door" | "wood" | "legs" | "accent"; label: string; hint: string }[] = [
  { key: "wall", label: "墙面漆", hint: "没有单独设墙色的墙" },
  { key: "door", label: "门扇", hint: "入户门自动加深" },
  { key: "wood", label: "木作", hint: "家具框架、桌腿、床架" },
  { key: "legs", label: "深色收边", hint: "踢脚、桌底、深色腿" },
  { key: "accent", label: "软装点缀", hint: "抱枕、搭毯、小件跳色" },
];
const ALL = "全部";
const MINE = "我的家具";
/** 家具清单里的内置家具（楼梯是构件，不随风格着色）与它们的分类。 */
const BUILTIN = catalog.filter((item) => item.type !== "stairs");
const GROUPS = [ALL, ...new Set(BUILTIN.map((item) => item.category))];

/** 家具清单的接口部分：我的家具（不含楼梯）；分类数量只需要知道我的家具一共几件。 */
const myFurniture = (group: string) => async (request: PageRequest): Promise<PageResult<LibraryItem>> => {
  const page = await accountItemPage(request, { kinds: ["furniture"], major: "软装", category: group === ALL || group === MINE ? undefined : group });
  return {
    list: page.list.flatMap((entry) => (entry.kind === "furniture" ? [entry.item] : [])),
    pagination: page.pagination,
    counts: { [MINE]: costCounts(page.counts, { custom: false })["软装"] ?? 0 },
  };
};

/** 一行颜色：色块 + 色号；可编辑时右侧是取色器。 */
function ColorRow({ label, hint, value, editable, onChange, extra }: {
  label: string; hint?: string; value: string; editable: boolean; onChange?: (color: string) => void; extra?: React.ReactNode;
}) {
  return (
    <div className="style-color-row">
      <span className="style-color-label"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className="style-color-value">
        <i style={{ background: value }} aria-hidden="true" />
        <code>{value}</code>
        {editable && <input type="color" aria-label={`修改${label}颜色`} value={value} onChange={(e) => onChange?.(e.target.value)} />}
        {extra}
      </span>
    </div>
  );
}

/** 家具清单里的一件：2D 俯视符号按这套风格着色，标明颜色来自角色配色、单独定色还是保持原色。 */
function FurnitureRow({ item, style, editable, onColor, onReset }: {
  item: LibraryItem; style: DecorStyle; editable: boolean; onColor: (type: string, color: string) => void; onReset: (type: string) => void;
}) {
  const main = furnitureMain(style, item), role = furnitureRole(item.type), own = style.items?.[item.type];
  const source = own ? "单独定色" : style.keep ? "保持家具原色" : role ? `跟随「${ROLE_LABEL[role]}」配色` : "家电洁具保持原色";
  return (
    <li className="style-furniture">
      <span className="style-furniture-visual" aria-hidden="true">
        {item.imageUrl && !own && style.keep ? <img src={item.imageUrl} alt="" /> : (
          <svg viewBox={`${-item.w / 2 - 80} ${-item.d / 2 - 80} ${item.w + 160} ${item.d + 160}`}>
            <FurnitureShape f={{ ...item, color: main }} />
          </svg>
        )}
      </span>
      <span className="style-furniture-text">
        <b>{item.name}</b>
        <small className={own ? "is-own" : undefined}>{source}</small>
      </span>
      <span className="style-color-value">
        <i style={{ background: main }} aria-hidden="true" />
        {editable && <input type="color" aria-label={`给${item.name}单独定色`} value={main} onChange={(e) => onColor(item.type, e.target.value)} />}
        {editable && own && (
          <button type="button" className="style-reset" aria-label={`${item.name}恢复跟随风格`} onClick={() => onReset(item.type)}>
            <RotateCcw size={13} />
          </button>
        )}
      </span>
    </li>
  );
}

/**
 * 风格详情（管理端 /styles/:id）。上半部分是这套风格的硬装、五金与 7 个家具角色配色，
 * 下半部分是家具清单：每件家具都按这套风格着色，看得到它在这个风格里的样子。
 *
 * 内置风格只读，可「复制为我的风格」；自定义风格的每一项都能改，包括逐类家具单独定色
 * （按家具类型生效，同类型的家具一起变）。改完点「保存」写回账号库；已经套用过它的方案不受影响。
 */
export function StyleDetail({ style, custom, onBack, onDuplicate, duplicating = false, onSaved, onDeleted, onDirty }: {
  style: DecorStyle;
  custom: boolean;
  onBack: () => void;
  onDuplicate: () => void;
  /** 「复制为我的风格」正在准备新建弹窗。 */
  duplicating?: boolean;
  /** 保存成功：传回保存后的风格。 */
  onSaved: (style: DecorStyle) => void;
  onDeleted: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(style);
  const [saving, setSaving] = useState(false);
  const [group, setGroup] = useState(ALL);
  const dirty = custom && JSON.stringify(draft) !== JSON.stringify(style);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const edit = (patch: Partial<DecorStyle>) => setDraft((d) => ({ ...d, ...patch }));
  const setRole = (role: DecorRole, color: string) => setDraft((d) => ({ ...d, tone: { ...d.tone, [role]: color } }));
  const setItem = (type: string, color: string) => setDraft((d) => ({ ...d, items: { ...d.items, [type]: color } }));
  const resetItem = (type: string) => setDraft((d) => {
    const items = { ...d.items };
    delete items[type];
    return { ...d, items };
  });
  const save = async () => {
    if (!draft.name.trim()) { notify.fail("风格名称不能为空"); return; }
    const saved = { ...draft, name: draft.name.trim() };
    setSaving(true);
    try {
      await saveAccountStyle(saved);
      setDraft(saved);
      onSaved(saved);
      notify.success(`已保存「${saved.name}」`);
    } catch (cause) {
      notify.error("风格保存失败", cause);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    const ok = await confirm({ title: `删除「${style.name}」？`, description: "已经套用这个风格的方案不受影响（方案里存有风格定义）。", confirmText: "删除", tone: "destructive" });
    if (!ok) return;
    try {
      await removeAccountStyle(style.id);
      notify.success(`已删除「${style.name}」`);
      onDeleted();
    } catch (cause) {
      notify.error("删除失败", cause);
    }
  };
  // 家具清单统一分页（一页 20 件）：我的家具由列表接口按页读取、排在前面，内置家具接在后面。
  const furniture = usePagedList<LibraryItem>({
    remote: myFurniture(group),
    local: group === MINE ? [] : group === ALL ? BUILTIN : BUILTIN.filter((item) => item.category === group),
    key: group,
  });
  const chips = [...GROUPS, ...(furniture.counts[MINE] ? [MINE] : [])].map((id) => ({ id, label: id }));
  return (
    <div className="style-detail">
      <button type="button" className="style-detail-back" onClick={onBack}><ArrowLeft size={15} />风格管理</button>
      <header className="style-detail-head">
        <div className="style-detail-title">
          {custom ? (
            <Input aria-label="风格名称" className="style-detail-name" maxLength={20} value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
          ) : <h1>{style.name}</h1>}
          <div className="style-detail-meta">
            {custom ? (
              <select aria-label="风格大类" value={draft.category ?? ""} onChange={(e) => edit({ category: (e.target.value || undefined) as DecorCategory | undefined })}>
                <option value="">不归类</option>
                {DECOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : style.category && <span className="style-tag">{style.category}</span>}
            <span className="style-tag is-muted">{custom ? "我的风格" : "内置风格"}</span>
          </div>
          {custom ? (
            <Input aria-label="一句话说明" className="style-detail-summary" maxLength={60} value={draft.summary} onChange={(e) => edit({ summary: e.target.value })} />
          ) : <p>{style.summary}</p>}
        </div>
        <div className="style-detail-actions">
          {custom ? <>
            <Button variant="outline" onClick={() => void remove()} disabled={saving}><Trash2 />删除</Button>
            <Button onClick={() => void save()} disabled={!dirty || saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}保存</Button>
          </> : <Button onClick={onDuplicate} disabled={duplicating} aria-busy={duplicating}>{duplicating ? <Loader2 className="animate-spin" /> : <Copy />}复制为我的风格</Button>}
        </div>
      </header>
      <div className="style-detail-palette" aria-label="主色板">
        {styleSwatches(draft).map((color, i) => <i key={i} style={{ background: color }} />)}
      </div>
      <div className="style-detail-grid">
        <section className="style-detail-card" aria-labelledby="style-hard">
          <h2 id="style-hard">硬装与五金</h2>
          {HARD_FIELDS.map((f) => (
            <ColorRow key={f.key} label={f.label} hint={f.hint} value={draft[f.key]} editable={custom} onChange={(color) => edit({ [f.key]: color })} />
          ))}
          <div className="style-color-row">
            <span className="style-color-label"><b>五金</b><small>拉手、灯杆、龙头</small></span>
            <span className="style-color-value">
              <i style={{ background: METAL_FINISH[draft.metal].color }} aria-hidden="true" />
              {custom ? (
                <select aria-label="五金材质" value={draft.metal} onChange={(e) => edit({ metal: e.target.value as MetalFinish })}>
                  {(Object.keys(METAL_LABEL) as MetalFinish[]).map((m) => <option key={m} value={m}>{METAL_LABEL[m]}</option>)}
                </select>
              ) : <code>{METAL_LABEL[draft.metal]}</code>}
            </span>
          </div>
          <div className="style-color-row">
            <span className="style-color-label"><b>家具腿</b><small>现代、工业常用细金属腿</small></span>
            <span className="style-color-value">
              {custom ? (
                <select aria-label="家具腿" value={draft.legsKind} onChange={(e) => edit({ legsKind: e.target.value as DecorStyle["legsKind"] })}>
                  <option value="wood">木质收分腿</option>
                  <option value="metal">细金属腿</option>
                </select>
              ) : <code>{draft.legsKind === "metal" ? "细金属腿" : "木质收分腿"}</code>}
            </span>
          </div>
          <div className="style-color-row">
            <span className="style-color-label"><b>圆角</b><small>奶油、侘寂更软，极简更利落</small></span>
            <span className="style-color-value">
              {custom && <input type="range" aria-label="圆角" min={0.8} max={1.3} step={0.05} value={draft.softness} onChange={(e) => edit({ softness: Number(e.target.value) })} />}
              <code>{draft.softness.toFixed(2)}</code>
            </span>
          </div>
          {custom && (
            <label className="style-keep">
              <input type="checkbox" checked={!!draft.keep} onChange={(e) => edit({ keep: e.target.checked || undefined })} />
              家具保留自己的颜色（只换墙面、木作和五金）
            </label>
          )}
        </section>
        <section className="style-detail-card" aria-labelledby="style-roles">
          <h2 id="style-roles">家具角色配色</h2>
          <p className="style-detail-hint">同一角色的家具共用一种主色，例如沙发、单人椅都是「软包」。</p>
          {DECOR_ROLES.map((r) => (
            <ColorRow key={r.id} label={r.label} value={roleColor(draft, r.id)} editable={custom && !draft.keep} onChange={(color) => setRole(r.id, color)} />
          ))}
        </section>
      </div>
      <section className="style-detail-furniture" aria-labelledby="style-furniture">
        <div className="style-detail-furniture-head">
          <h2 id="style-furniture">家具清单 <small>{furniture.loading ? "…" : `${furniture.pagination.total} 件`}</small></h2>
          <p className="style-detail-hint">{custom ? "点色块可以给某类家具单独定色，同类型的家具（如两种尺寸的双人床）一起变。" : "每件家具都按这套风格着色；复制为我的风格后可以逐类调整。"}</p>
        </div>
        <CmsFilterBar label="家具分类" chips={chips} value={group} onChange={setGroup} />
        {furniture.error && <LoadError title="我的家具读取失败" message={furniture.error} retrying={furniture.loading} onRetry={furniture.reload} />}
        <ul className="style-furniture-grid">
          {furniture.list.map((item) => (
            <FurnitureRow key={item.catalogId ?? item.type + item.name} item={item} style={draft} editable={custom} onColor={setItem} onReset={resetItem} />
          ))}
        </ul>
        <ListLoadMore list={furniture} />
      </section>
    </div>
  );
}
