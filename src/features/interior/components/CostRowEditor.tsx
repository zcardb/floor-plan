import { type CostRow } from "../model/costs";
import { yuanPrecise } from "../model/money";
import type { Design } from "../model/types";
import { MaterialProcurementEditor } from "./MaterialProcurementEditor";
import { PriceField } from "./PriceField";

/** 全屋口径下一条价格条目：金额与统一改价入口（来源、恢复、同步账号库）。design 为项目原始数据。 */
export function CostRowEditor({
  design,
  row,
  change,
}: {
  design: Design;
  row: CostRow;
  change: (fn: (d: Design) => Design) => void;
}) {
  return (
    <div className={"cost-detail" + (row.price === null ? " is-unpriced" : "")}>
      <div className="cost-detail-heading">
        <b>{row.name}</b>
        {row.price === null ? (
          <span className="cost-unpriced-tag">未定价</span>
        ) : (
          <span>{yuanPrecise(row.subtotal)}</span>
        )}
      </div>
      <small>
        {row.quantity.toFixed(row.unit === "件" ? 0 : 2)} {row.unit}
      </small>
      <PriceField design={design} group={row.group} priceKey={row.key} name={row.name} unit={row.unit} change={change} />
      {row.group === "floorPrices" && (
        <MaterialProcurementEditor
          design={design}
          material={row.key}
          change={change}
        />
      )}
    </div>
  );
}
