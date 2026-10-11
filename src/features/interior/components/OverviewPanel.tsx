import { ChevronRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { area } from "../model/geometry";
import { floorMaterialOf } from "../model/floorMaterials";
import { costBreakdown } from "../model/costBreakdown";
import { yuan } from "../model/money";
import type { Design, Selection } from "../model/types";
import { useCostDesign } from './CostDefaultsContext';
import { ShortcutList } from "./PanelHint";

/**
 * 侧栏「方案总览」：三张指标卡（套内净使用面积 / 空间数 / 家具数）+ 成本摘要行 +
 * 房间面积列表 + 免责声明。原属性面板的「方案总览」标签页内容，成本摘要取代了原来的面积大字。
 */
export function OverviewPanel({ design, change, select, onCosts }: {
  design: Design;
  change: (fn: (d: Design) => Design) => void;
  select: (s: Selection) => void;
  /** 打开成本侧栏；未登录时不传（成本只对登录用户开放）。 */
  onCosts?: () => void;
}) {
  const effective = useCostDesign(design);
  const total = useMemo(
    () => design.rooms.filter((r) => r.counted !== false).reduce((sum, r) => sum + area(r), 0),
    [design.rooms],
  );
  const cost = useMemo(() => (onCosts ? costBreakdown(effective).total : 0), [effective, onCosts]);
  const cards: [string, string, string][] = [
    ["套内净使用面积", total.toFixed(2), "m²"],
    ["空间数", String(design.rooms.length), "个"],
    ["家具数", String(design.furniture.length), "件"],
  ];
  return (
    <>
      <section>
        <dl className="overview-metrics" aria-label="方案概要">
          {cards.map(([label, value, unit]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}<small>{unit}</small></dd>
            </div>
          ))}
        </dl>
        {onCosts && (
          <EditorTooltip label="查看成本明细">
            <button type="button" className="room-cost-link overview-cost-link" onClick={onCosts}>
              <span>
                <CircleDollarSign size={14} />
                全屋成本
              </span>
              <b>{yuan(cost)}</b>
              <ChevronRight size={13} />
            </button>
          </EditorTooltip>
        )}
      </section>
      <section>
        <h3 className="section-title">
          房间面积 <small>点击编辑</small>
        </h3>
        <div className="room-table">
          {design.rooms.map((r) => (
            <button
              key={r.id}
              className="room-row"
              onClick={() => select({ kind: "room", id: r.id })}
            >
              <span>
                <i style={{ background: floorMaterialOf(design, r.mat).color }} />
                {r.name}
                {r.counted === false ? " *" : ""}
              </span>
              <span>
                {area(r).toFixed(2)}
                <small> m²</small>
                <ChevronRight size={13} />
              </span>
            </button>
          ))}
        </div>
        <p className="footnote">按墙内净尺寸计算；* 飘窗不计入使用面积。</p>
      </section>
      <section>
        <h3 className="section-title">快捷键</h3>
        <ShortcutList />
      </section>
      <div className="panel-note">
        <p>
          <ShieldCheck size={13} />
          设计示意 · 拆改须专业确认
        </p>
      </div>
    </>
  );
}
