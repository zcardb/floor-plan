/**
 * 成本页「定价」分组：已定价进度 + 未定价提示 +「只看未定价」筛选。
 * 进度条表达"还差几项"，提醒补齐而不是制造焦虑；全部定价后只剩进度，不再提示。
 */
export function CostPricing({
  priced,
  total,
  unpricedGroups,
  onlyUnpriced,
  onToggleUnpriced,
}: {
  priced: number;
  total: number;
  /** 未定价的类别数，>0 时提示合计不完整。 */
  unpricedGroups: number;
  onlyUnpriced: boolean;
  onToggleUnpriced: () => void;
}) {
  const progress = total ? Math.round((priced / total) * 100) : 100,
    done = priced >= total;
  return (
    <div className="cost-pricing">
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
      {done ? (
        <p className="muted-note">全部项目已定价，合计即完整报价。</p>
      ) : (
        <div className="cost-pricing-row">
          <p>{unpricedGroups > 0 ? `${unpricedGroups} 类项目未定价，合计暂不完整` : `还有 ${total - priced} 项未定价`}</p>
          <button
            type="button"
            className={onlyUnpriced ? "active" : ""}
            aria-pressed={onlyUnpriced}
            onClick={onToggleUnpriced}
          >
            {onlyUnpriced ? "显示全部" : "只看未定价"}
          </button>
        </div>
      )}
    </div>
  );
}
