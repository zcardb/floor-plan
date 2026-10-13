import type { ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { CmsFilterBar, type Chip } from "./CmsFilterBar";

/**
 * 侧栏里的列表版式，家具库与装修风格共用：头部（搜索框 + 新建按钮 → 一行分类胶囊 → 小标题）固定，
 * 只有下面的列表区滚动；三行左右对齐、行距一致，由这一处统一决定。
 *
 * 分页由调用方用 `usePagedList` + `ListLoadMore` 完成，观察根就是这里的滚动区；
 * `listKey` 变化（切换分类或搜索）时列表区重新挂载，回到顶部。
 */
export function PanelList({ search, action, chips, title, count, hint, listKey, footer, children }: {
  /** 搜索框；`label` 是无障碍名称。 */
  search: { label: string; placeholder: string; value: string; onChange: (value: string) => void };
  /** 搜索框右侧的 32px 新建按钮；不传不显示（游客、只读预览）。 */
  action?: { label: string; onClick: () => void };
  chips: { label: string; items: Chip[]; value: string; onChange: (id: string) => void };
  /** 小标题与数量，如「全部家具 · 64 件」。 */
  title: string;
  count: string;
  /** 小标题右侧的一句操作提示。 */
  hint?: string;
  listKey: string;
  /** 固定在列表下方的内容（如可关闭的说明）。 */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="library-panel">
      <div className="library-head">
        <div className="library-toolbar">
          <div className="library-search">
            <Search size={15} />
            <input aria-label={search.label} placeholder={search.placeholder} value={search.value} onChange={(e) => search.onChange(e.target.value)} />
          </div>
          {action && (
            <EditorTooltip label={action.label}>
              <button type="button" className="library-new" aria-label={action.label} onClick={action.onClick}>
                <Plus size={16} />
              </button>
            </EditorTooltip>
          )}
        </div>
        <CmsFilterBar compact label={chips.label} chips={chips.items} value={chips.value} onChange={chips.onChange} />
        <div className="library-subheading">
          <span>
            {title}
            <small> · {count}</small>
          </span>
          {hint && <small>{hint}</small>}
        </div>
      </div>
      <div className="library-scroll" key={listKey}>{children}</div>
      {footer}
    </div>
  );
}
