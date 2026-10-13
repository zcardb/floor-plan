import { useDeferredValue, useState } from "react";
import { CheckCircle2, ChevronRight, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { layoutIssues, type LayoutIssue, type LayoutReport } from "../model/layoutRules";
import { mergePresence } from "../model/listPresence";
import type { Design } from "../model/types";
import { PanelHint } from "./PanelHint";

/** 同一份方案只体检一次：左下角按钮的角标与侧栏列表共用结果。 */
const checked = new WeakMap<Design, ReturnType<typeof layoutIssues>>();
function issuesOf(design: Design) {
  let result = checked.get(design);
  if (!result) checked.set(design, (result = layoutIssues(design)));
  return result;
}

/**
 * 画布左下角的「布局整理」按钮：有不合理布局时右上角显示红色角标（问题数）。
 * 体检用延迟值计算，拖动家具时不拖慢画布。
 */
export function LayoutTidyButton({ design, onTidy }: { design: Design; onTidy: () => void }) {
  const count = issuesOf(useDeferredValue(design)).issues.length;
  const label = count ? `布局整理（${count} 处待调整）` : "布局整理";
  return (
    <EditorTooltip label={label} side="top">
      <button aria-label={label} className="layout-tidy-trigger" onClick={onTidy}>
        <WandSparkles size={15} />
        {count > 0 && <span className="layout-tidy-badge" aria-hidden="true">{count > 9 ? "9+" : count}</span>}
      </button>
    </EditorTooltip>
  );
}

const issueKey = (issue: LayoutIssue) => `${issue.furnitureId}:${issue.kind}`;

/**
 * 「布局整理」侧栏：点左下角「布局整理」先自动整理一遍，这里列出整理后仍需手动处理的问题。
 *
 * 列表直接由当前方案算出（延迟值，拖动家具时不卡帧），手动挪好一件，对应的问题就带离场动画消失，
 * 不需要手动刷新。点一条问题选中那件家具，方便在画布上直接调整。
 */
export function LayoutPanel({ design, lastTidy, selectedId, onTidy, onSelect }: {
  design: Design;
  /** 最近一次自动整理的结果；还没整理过为 null。 */
  lastTidy: LayoutReport | null;
  selectedId: string | null;
  onTidy: () => void;
  onSelect: (furnitureId: string) => void;
}) {
  const { issues, checked: total } = issuesOf(useDeferredValue(design));
  const [shown, setShown] = useState(() => mergePresence<LayoutIssue>([], issues, issueKey));
  const [seen, setSeen] = useState(issues);
  if (seen !== issues) {
    setSeen(issues);
    setShown(mergePresence(shown, issues, issueKey));
  }
  const drop = (key: string) => setShown((list) => list.filter((p) => p.key !== key || !p.leaving));
  const adjusted = lastTidy?.adjusted ?? [];
  return (
    <>
      {adjusted.length > 0 && (
        <section aria-live="polite">
          <div className="layout-tidy-summary">
            <p><CheckCircle2 aria-hidden="true" />已自动整理 {adjusted.length} 件家具</p>
            <ul>
              {adjusted.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
              {adjusted.length > 3 && <li>等 {adjusted.length} 件</li>}
            </ul>
          </div>
        </section>
      )}
      <section className="layout-panel">
        <header className="layout-panel-head">
          <h3 className="section-title">
            待手动调整 <small>{issues.length ? `${issues.length} 处` : `已检查 ${total} 件家具`}</small>
          </h3>
          <Button type="button" size="sm" variant="secondary" disabled={!issues.length} onClick={onTidy}>
            <WandSparkles />一键整理
          </Button>
        </header>
        {shown.length ? (
          <ul className="layout-issues" aria-label="待手动调整的家具">
            {shown.map(({ key, item, leaving }) => (
              <li
                key={key}
                className={"layout-issue" + (leaving ? " is-leaving" : "")}
                onAnimationEnd={leaving ? () => drop(key) : undefined}
              >
                <button
                  type="button"
                  disabled={leaving}
                  aria-pressed={selectedId === item.furnitureId}
                  onClick={() => onSelect(item.furnitureId)}
                >
                  <span className="layout-issue-text">
                    <strong>{item.furniture}<small>{item.room}</small></strong>
                    <span>{item.problem}</span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="layout-panel-empty">
            <CheckCircle2 aria-hidden="true" />
            <strong>布局都合规了</strong>
            <span>没有挡门、压窗、背后没墙或出了房间的家具。</span>
          </div>
        )}
      </section>
      <PanelHint id="layout-tidy">点一条问题会选中那件家具，在画布上挪到合适的位置后，这里会自动更新。</PanelHint>
    </>
  );
}
