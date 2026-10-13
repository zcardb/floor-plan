import { useState } from "react";
import {
  defaultProcurement,
  projectProcurement,
  validateProcurement,
} from "@/lib/floor-plan/material-procurement";
import { floorMaterialOf } from "@/lib/floor-plan/floor-materials";
import type { Design, MaterialProcurement } from "@/lib/floor-plan/types";
import { useCostDesign } from '@/contexts/account-costs/cost-defaults-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { notify } from '@/lib/notify';
import { EditorSelect } from '@/components/editor-select/editor-select';
import { meterDraft, parseMeterDraft } from '@/lib/floor-plan/length-units';
export function MaterialProcurementEditor({
  design,
  material,
  change,
}: {
  design: Design;
  material: string;
  change: (fn: (d: Design) => Design) => void | Promise<boolean>;
}) {
  const effective = useCostDesign(design);
  const saved = effective.costSettings?.procurement?.[material],
    [expanded, setExpanded] = useState(false),
    [draft, setDraft] = useState<MaterialProcurement>(
      saved || defaultProcurement(material, design),
    ),
    [error, setError] = useState("");
  const sizeDrafts = (value: MaterialProcurement) => ({
    length: value.length === undefined ? "" : meterDraft(value.length),
    width: value.width === undefined ? "" : meterDraft(value.width),
  });
  // 长宽以文本草稿编辑，避免两位格式化打断输入；未改动的字段保留原值。
  const [sizes, setSizes] = useState(() => sizeDrafts(draft));
  const p = projectProcurement(effective, material);
  const field = (
    key: "length" | "width" | "waste" | "perBox",
    label: string,
  ) => {
    const isSize = key === "length" || key === "width";
    return (
    <label key={key}>
      {label}
      <Input
        className="editor-control"
        aria-label={floorMaterialOf(design, material).name + label}
        type="number"
        step={isSize ? 0.01 : 'any'}
        value={isSize ? sizes[key] : draft[key] ?? ''}
        onChange={(e) => {
          const text = e.target.value;
          if (isSize) setSizes((s) => ({ ...s, [key]: text }));
          setDraft((d) => ({
            ...d,
            [key]: text === "" ? undefined : isSize ? parseMeterDraft(text) : Number(text),
          }));
        }}
      />
    </label>
    );
  };
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
      <EditorTooltip label="采购规格">
        <Button type="button" variant="link" size="sm"
          className="editor-procurement-toggle"
          onClick={() => {
            setExpanded(!expanded);
            setDraft(saved || defaultProcurement(material, design));
            setSizes(sizeDrafts(saved || defaultProcurement(material, design)));
          }}
        >
          规格 / 损耗 / 计价单位{expanded ? " −" : " ＋"}
        </Button>
      </EditorTooltip>
      {expanded && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const label = floorMaterialOf(design, material).name;
            const unitChanged = (saved?.unit || "m²") !== draft.unit;
            try {
              validateProcurement(draft);
              const result = change((d) => ({
                ...d,
                costSettings: {
                  ...d.costSettings,
                  procurement: {
                    ...d.costSettings?.procurement,
                    [material]: draft,
                  },
                },
              }));
              setError("");
              setExpanded(false);
              if ((await result) === false) return;
              if (unitChanged) notify.warning(`「${label}」计价单位已改为「${draft.unit}」`, "请在上方单价重新填写对应单位的价格");
              else notify.success(`「${label}」采购规格已应用`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "规格无效");
              notify.fail(`采购规格未应用：${err instanceof Error ? err.message : "规格无效"}`);
            }
          }}
        >
          <div className="procurement-fields">
            {field("length", "单张长 / m")}
            {field("width", "单张宽 / m")}
            {field("waste", "损耗 / %")}
            {field("perBox", "每箱张数")}
            <EditorSelect label="计价单位" value={draft.unit}
              options={['m²','张','箱'].map(value=>({value,label:value}))}
              onChange={value=>setDraft(d=>({...d,unit:value as MaterialProcurement['unit']}))} />
          </div>
          <p className="footnote">
            单价在上方填写；切换计价单位后请同步修改单价。数量为面积法采购估算，不含具体铺排裁切优化。
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="sm" className="editor-action">应用采购规格</Button>
        </form>
      )}
    </div>
  );
}
