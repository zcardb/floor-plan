import { useMemo } from "react";
import { area } from "@/lib/floor-plan/geometry";
import type { Design } from "@/lib/floor-plan/types";

/**
 * 成本侧栏顶部的「方案」三张指标卡：套内净使用面积 / 空间数 / 家具数。
 * 第一张是主指标（主色），与下方成本合计一起回答「这是一个多大、多少钱的家」。
 */
export function PlanMetrics({ design }: { design: Design }) {
  const total = useMemo(
    () => design.rooms.filter((r) => r.counted !== false).reduce((sum, r) => sum + area(r), 0),
    [design.rooms],
  );
  const cards: [string, string, string][] = [
    ["套内净使用面积", total.toFixed(2), "m²"],
    ["空间数", String(design.rooms.length), "个"],
    ["家具数", String(design.furniture.length), "件"],
  ];
  return (
    <dl className="overview-metrics" aria-label="方案概要">
      {cards.map(([label, value, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}<small>{unit}</small></dd>
        </div>
      ))}
    </dl>
  );
}
