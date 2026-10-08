import { useContext } from "react";
import { setPrice, type CostRow } from "../model/costs";
import { priceSource, restorePrice } from "../model/costDefaults";
import { yuanPrecise } from "../model/money";
import type { Design } from "../model/types";
import { CostDefaultsContext } from "./CostDefaultsContext";
import { MaterialProcurementEditor } from "./MaterialProcurementEditor";
import { PriceInput } from "./PriceInput";

/** 全屋口径下一条价格条目：金额、来源与改价入口。 */
export function CostRowEditor({
  design,
  row,
  change,
}: {
  design: Design;
  row: CostRow;
  change: (fn: (d: Design) => Design) => void;
}) {
  const defaults = useContext(CostDefaultsContext),
    source = priceSource(design, defaults, row.group, row.key);
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
        {row.quantity.toFixed(row.unit === "件" ? 0 : 2)} {row.unit} · {source}{" "}
        · 元/{row.unit}
      </small>
      <PriceInput
        key={row.group + row.key + String(row.price)}
        value={row.price}
        label={row.name + "单价"}
        onApply={(v) =>
          change((d) => setPrice(d, row.group, row.key, v, defaults))
        }
      />
      {source === "项目覆盖" && (
        <button
          className="back-link"
          onClick={() => change((d) => restorePrice(d, row.group, row.key))}
        >
          恢复账号默认
        </button>
      )}
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
