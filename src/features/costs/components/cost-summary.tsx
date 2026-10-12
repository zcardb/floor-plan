import { yuan } from "@/lib/floor-plan/money";

/**
 * 成本页顶部合计：只有一个焦点数字（主金额），下面是硬装 / 软装比例条和两项金额。
 * 不再放「全屋合计 · 硬装 + 软装」之类的口径文字，口径由侧栏标题 / 房间标题表达。
 */
export function CostSummary({
  amount,
  hard,
  soft,
  softUnpriced,
  share,
}: {
  amount: number;
  hard: number;
  soft: number;
  /** 软装未定价件数：>0 且软装金额为 0 时显示「未定价」而非 ¥0。 */
  softUnpriced: number;
  /** 房间口径：占全屋百分比，放在金额右侧。 */
  share?: number;
}) {
  const softPending = soft === 0 && softUnpriced > 0,
    hardRatio = hard + soft > 0 ? (hard / (hard + soft)) * 100 : 100;
  return (
    <div className="cost-summary">
      <div className="cost-summary-amount">
        <strong>{yuan(amount)}</strong>
        {share !== undefined && <span className="cost-share">占全屋 {share}%</span>}
      </div>
      <div className="cost-split" aria-hidden>
        <i style={{ width: hardRatio + "%" }} />
      </div>
      <dl className="cost-summary-parts">
        <div>
          <dt><i className="is-hard" />硬装</dt>
          <dd>{yuan(hard)}</dd>
        </div>
        <div>
          <dt><i className="is-soft" />软装</dt>
          <dd className={softPending ? "is-muted" : ""}>{softPending ? `未定价 ${softUnpriced} 项` : yuan(soft)}</dd>
        </div>
      </dl>
    </div>
  );
}
