import { yuan } from "../model/money";

/** 成本页顶部：主金额、硬装/软装拆分、定价完成度。 */
export function CostHero({
  eyebrow,
  amount,
  hard,
  soft,
  softUnpriced,
  share,
  priced,
  total,
  onlyUnpriced,
  onToggleUnpriced,
}: {
  eyebrow: string;
  amount: number;
  hard: number;
  soft: number;
  /** 软装未定价件数：>0 且软装金额为 0 时显示「未定价」而非 ¥0。 */
  softUnpriced: number;
  share?: number;
  priced?: number;
  total?: number;
  onlyUnpriced?: boolean;
  onToggleUnpriced?: () => void;
}) {
  const softLabel =
    soft === 0 && softUnpriced > 0 ? `未定价 ${softUnpriced} 项` : yuan(soft),
    hardRatio = hard + soft > 0 ? (hard / (hard + soft)) * 100 : 100,
    progress = total ? Math.round(((priced ?? 0) / total) * 100) : 100;
  return (
    <div className="cost-hero">
      <div className="cost-hero-top">
        <small>{eyebrow}</small>
        {share !== undefined && <span className="cost-share">占全屋 {share}%</span>}
      </div>
      <strong>{yuan(amount)}</strong>
      <div className="cost-split" aria-hidden>
        <i style={{ width: hardRatio + "%" }} />
      </div>
      <div className="cost-split-legend">
        <span>
          <i className="is-hard" />
          硬装 <b>{yuan(hard)}</b>
        </span>
        <span>
          <i className="is-soft" />
          软装 <b className={softLabel.startsWith("未") ? "is-muted" : ""}>{softLabel}</b>
        </span>
      </div>
      {total !== undefined && total > 0 && (
        <div className="cost-progress">
          <div className="cost-progress-head">
            <span>
              已定价 <b>{priced}</b> / {total} 项
            </span>
            {priced! < total && onToggleUnpriced && (
              <button
                className={onlyUnpriced ? "active" : ""}
                aria-pressed={onlyUnpriced}
                onClick={onToggleUnpriced}
              >
                {onlyUnpriced ? "显示全部" : "只看未定价"}
              </button>
            )}
          </div>
          <div
            className="cost-progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="定价完成度"
          >
            <i style={{ width: progress + "%" }} />
          </div>
        </div>
      )}
    </div>
  );
}
