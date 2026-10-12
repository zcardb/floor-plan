import { useState } from "react";
import { Check } from "lucide-react";
import { usePagedList } from "@/hooks/usePagedList";
import { DECOR_STYLES, applyStyle, designStyle, isCustomStyleId, styleSwatches, type DecorStyle } from "../model/decorStyles";
import type { Design } from "../model/types";
import { ListLoadMore } from "./ListLoadMore";
import { NewStyleDialog } from "./NewStyleDialog";
import { PanelHint } from "./PanelHint";
import { PanelList } from "./PanelList";
import { STYLE_ALL, filterStyles, styleChips } from "./styleFilters";

/**
 * 侧栏「风格」：给 3D 场景换一套装修风格。版式与家具库相同（`PanelList`：头部固定，只有风格列表滚动），
 * 风格都在内存里（内置 + 账号自建），按统一分页一页 20 套滚动显示。
 *
 * 只改渲染观感——墙面颜色、家具主色、木作 / 五金 / 软装点缀；2D 平面图、家具数据与造价都不受影响。
 * 点一下就是一次可撤销的方案改动（风格存在方案里，跟方案一起保存与同步）。
 * 登录后可以「新建风格」：基于当前风格或从当前方案提取配色，存进账号风格库并立即套用；游客不显示新建。
 */
export function StylePanel({ design, change, mine, onCreate }: {
  design: Design;
  change: (fn: (d: Design) => Design) => void;
  /** 账号自建的风格；游客为空数组。 */
  mine: DecorStyle[];
  /** 保存一套新风格到账号库；不传（游客）时不显示新建入口。 */
  onCreate?: (style: DecorStyle) => Promise<void>;
}) {
  const current = designStyle(design);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(STYLE_ALL);
  const [creating, setCreating] = useState(false);
  // 方案里存着的自定义风格可能已从风格库删除：仍放在「我的」最前面，方便来回切换。
  const own = isCustomStyleId(current.id) && !mine.some((s) => s.id === current.id) ? [current, ...mine] : mine;
  const searching = query.trim() !== "";
  const shown = filterStyles(DECOR_STYLES, own, { query, category });
  const listKey = searching ? "q:" + query.trim() : category;
  const paged = usePagedList({ remote: null, local: shown, key: listKey });
  const pick = (style: DecorStyle) => change((d) => applyStyle(d, style));
  const create = async (style: DecorStyle) => {
    await onCreate!(style);
    pick(style);
  };
  return (
    <>
      <PanelList
        search={{ label: "搜索风格", placeholder: "搜索风格、材质…", value: query, onChange: setQuery }}
        action={onCreate && { label: "新建风格", onClick: () => setCreating(true) }}
        chips={{ label: "风格大类", items: styleChips(DECOR_STYLES, own), value: searching ? "" : category, onChange: (id) => { setCategory(id); setQuery(""); } }}
        title={searching ? "搜索结果" : category === STYLE_ALL ? "全部风格" : category}
        count={`${shown.length} 套`}
        listKey={listKey}
        footer={
          <PanelHint id="style-scope">
            风格只作用于 3D 场景：墙面颜色与家具材质会跟着换，2D 平面图、家具清单和造价都不变。
            默认配色保留每件家具自己选的颜色。
          </PanelHint>
        }
      >
        <div className="style-grid">
          {paged.list.map((style) => <StyleCard key={style.id} style={style} active={style.id === current.id} onPick={() => pick(style)} />)}
        </div>
        <ListLoadMore list={paged} />
        {!shown.length && <div className="empty-small">没有匹配的风格，换个关键词试试。</div>}
      </PanelList>
      {creating && onCreate && (
        <NewStyleDialog open onOpenChange={setCreating} styles={[...mine, ...DECOR_STYLES]} initialBase={current.id} design={design} onCreate={create} />
      )}
    </>
  );
}

/** 一张风格卡：配色条 + 名称（带「默认」「我的」或大类标签）+ 当前项勾选。 */
function StyleCard({ style, active, onPick }: { style: DecorStyle; active: boolean; onPick: () => void }) {
  const tag = isCustomStyleId(style.id) ? "我的" : style.recommended ? "默认" : undefined;
  return (
    <button
      type="button"
      className={"style-card" + (active ? " active" : "")}
      aria-pressed={active}
      aria-label={style.name}
      title={style.summary}
      onClick={onPick}
    >
      <span className="style-card-swatches" aria-hidden>
        {styleSwatches(style).map((color, i) => (
          <i key={i} style={{ background: color }} />
        ))}
      </span>
      <span className="style-card-name">
        {style.name}
        {tag && <small className={tag === "我的" ? "is-mine" : undefined}>{tag}</small>}
      </span>
      {active && <Check className="style-card-check" size={14} aria-hidden />}
    </button>
  );
}
