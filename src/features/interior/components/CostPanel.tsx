import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Wallet } from "lucide-react";
import {
  calculateCosts,
  setPrice,
  validPrice,
  type CostRow,
} from "../model/costs";
import { uid, type Design } from "../model/types";
import { PriceInput } from "./PriceInput";
import { MaterialProcurementEditor } from "./MaterialProcurementEditor";
export function CostPanel({
  design,
  change,
  back,
}: {
  design: Design;
  change: (fn: (d: Design) => Design) => void;
  back: () => void;
}) {
  const c = useMemo(() => calculateCosts(design), [design]),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [error, setError] = useState("");
  const rows = (rs: CostRow[]) =>
    rs.map((r) => (
      <div className="cost-detail" key={r.group + r.key}>
        <div className="cost-detail-heading">
          <b>{r.name}</b>
          <span>
            ¥{r.subtotal.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
          </span>
        </div>
        <small>
          {r.quantity.toFixed(r.unit === "件" ? 0 : 2)} {r.unit} ·{" "}
          {r.reference ? "参考单价" : "项目单价"} · 元/{r.unit}
        </small>
        <PriceInput
          key={r.group + r.key + String(r.price)}
          value={r.price}
          label={r.name + "单价"}
          onApply={(v) => change((d) => setPrice(d, r.group, r.key, v))}
        />
        {r.group === "floorPrices" && (
          <MaterialProcurementEditor
            design={design}
            material={r.key}
            change={change}
          />
        )}
      </div>
    ));
  return (
    <>
      <div className="panel-heading">
        <span>
          <Wallet size={15} />
          成本管理
        </span>
        <button onClick={back} aria-label="返回属性">
          <ArrowLeft size={16} />
        </button>
      </div>
      <section>
        <div className="cost-summary">
          <small>整体成本 · 已录入费用</small>
          <strong>
            ¥{c.total.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
          </strong>
          <div>
            <span>软装 ¥{Math.round(c.softTotal).toLocaleString()}</span>
            <span>硬装 ¥{Math.round(c.hardTotal).toLocaleString()}</span>
          </div>
        </div>
        {c.unpriced > 0 && (
          <p className="cost-warning">
            {c.unpriced} 类项目未定价，当前总额不是完整报价。
          </p>
        )}
        <p className="footnote">
          单价修改仅影响当前项目所有同款家具／同材质空间。地面按设定损耗与采购取整计算；墙面扣除对应门窗面积。
        </p>
      </section>
      <section>
        <h3 className="section-title">
          软装<span>¥{Math.round(c.softTotal).toLocaleString()}</span>
        </h3>
        {rows(c.soft)}
        {!c.soft.length && <p className="muted-note">尚未放置家具。</p>}
      </section>
      <section>
        <h3 className="section-title">
          硬装<span>¥{Math.round(c.hardTotal).toLocaleString()}</span>
        </h3>
        {rows(c.hard)}
        <p className="footnote">
          门窗按 m²；墙体施工按长度 × 层高，参考现有墙不计新建费用。
        </p>
      </section>
      <section>
        <h3 className="section-title">
          人工费用 <small>独立总价条目</small>
        </h3>
        {c.labor.map((item) => (
          <div className="labor-item" key={item.id}>
            <div>
              <b>{item.name}</b>
              <button
                title="删除费用"
                onClick={() =>
                  change((d) => ({
                    ...d,
                    costSettings: {
                      ...d.costSettings,
                      labor: c.labor.filter((l) => l.id !== item.id),
                    },
                  }))
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
            <PriceInput
              key={item.id + item.amount}
              value={item.amount}
              label={item.name + "总费用"}
              onApply={(v) =>
                change((d) => ({
                  ...d,
                  costSettings: {
                    ...d.costSettings,
                    labor: c.labor.map((l) =>
                      l.id === item.id ? { ...l, amount: v ?? 0 } : l,
                    ),
                  },
                }))
              }
            />
          </div>
        ))}
        <form
          className="labor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(amount);
            if (!name.trim() || amount === "" || !validPrice(v)) {
              setError("请填写名称和非负费用");
              return;
            }
            change((d) => ({
              ...d,
              costSettings: {
                ...d.costSettings,
                labor: [
                  ...(d.costSettings?.labor || []),
                  { id: uid(), name: name.trim(), amount: v },
                ],
              },
            }));
            setName("");
            setAmount("");
            setError("");
          }}
        >
          <input
            aria-label="人工费用名称"
            placeholder="例如：铺贴人工费"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="人工总费用"
            placeholder="总费用 / 元"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button>
            <Plus size={14} />
            添加人工
          </button>
          {error && <small role="alert">{error}</small>}
        </form>
      </section>
    </>
  );
}
