import { useState } from "react";
import {
  defaultProcurement,
  projectProcurement,
  validateProcurement,
} from "../model/materialProcurement";
import { materials } from "../data/catalog";
import { priceOf, validPrice } from "../model/costs";
import type { Design, MaterialProcurement } from "../model/types";
import { useCostDesign } from './CostDefaultsContext';
export function MaterialProcurementEditor({
  design,
  material,
  change,
}: {
  design: Design;
  material: string;
  change: (fn: (d: Design) => Design) => void;
}) {
  const effective = useCostDesign(design);
  const saved = effective.costSettings?.procurement?.[material],
    [expanded, setExpanded] = useState(false),
    [draft, setDraft] = useState<MaterialProcurement>(
      saved || defaultProcurement(material),
    ),
    [price, setPrice] = useState(
      String(priceOf(effective, "floorPrices", material) ?? ""),
    ),
    [error, setError] = useState("");
  const p = projectProcurement(effective, material);
  const field = (
    key: "length" | "width" | "waste" | "perBox",
    label: string,
  ) => (
    <label key={key}>
      {label}
      <input
        aria-label={materials[material].name + label}
        type="number"
        value={draft[key] ?? ""}
        onChange={(e) =>
          setDraft((d) => ({
            ...d,
            [key]: e.target.value === "" ? undefined : Number(e.target.value),
          }))
        }
      />
    </label>
  );
  return (
    <div className="procurement-editor">
      <div className="procurement-result">
        <span>净面积 {p.netArea.toFixed(2)} m²</span>
        <span>含损耗 {p.targetArea.toFixed(2)} m²</span>
        {p.needed !== null ? (
          <>
            <span>
              需求 {p.needed} 张{p.boxes !== null ? ` / ${p.boxes} 箱` : ""}
            </span>
            <span>
              实购 {p.sheets} 张 · {p.purchasedArea.toFixed(2)} m²
            </span>
            <span>含损耗与取整余量 {p.remainingArea.toFixed(2)} m²</span>
          </>
        ) : (
          <small>未填写规格，暂按面积计价</small>
        )}
      </div>
      <button
        className="procurement-toggle"
        onClick={() => {
          setExpanded(!expanded);
          setDraft(saved || defaultProcurement(material));
          setPrice(String(priceOf(effective, "floorPrices", material) ?? ""));
        }}
      >
        规格 / 损耗 / 计价单位{expanded ? " −" : " ＋"}
      </button>
      {expanded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              validateProcurement(draft);
              const v = price.trim() === "" ? null : Number(price);
              if (v !== null && !validPrice(v))
                throw new Error("请输入非负有效单价");
              change((d) => ({
                ...d,
                costSettings: {
                  ...d.costSettings,
                  procurement: {
                    ...d.costSettings?.procurement,
                    [material]: draft,
                  },
                  floorPrices: {
                    ...d.costSettings?.floorPrices,
                    [material]: v,
                  },
                },
              }));
              setError("");
              setExpanded(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "规格无效");
            }
          }}
        >
          <div className="procurement-fields">
            {field("length", "单张长 / mm")}
            {field("width", "单张宽 / mm")}
            {field("waste", "损耗 / %")}
            {field("perBox", "每箱张数")}
            <label>
              计价单位
              <select
                value={draft.unit}
                onChange={(e) => {
                  setDraft((d) => ({
                    ...d,
                    unit: e.target.value as MaterialProcurement["unit"],
                  }));
                  setPrice("");
                }}
              >
                <option>m²</option>
                <option>张</option>
                <option>箱</option>
              </select>
            </label>
            <label>
              单价 / 元每{draft.unit}
              <input
                aria-label="新单位单价"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </div>
          <p className="footnote">
            单位切换后请重新填写对应单价。数量为面积法采购估算，不含具体铺排裁切优化。
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="procurement-apply">应用采购规格</button>
        </form>
      )}
    </div>
  );
}
