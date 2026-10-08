import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { validPrice } from "../model/costs";
import { uid, type Design } from "../model/types";
import { PriceInput } from "./PriceInput";
import { notify } from "@/lib/notify";

type Labor = NonNullable<NonNullable<Design["costSettings"]>["labor"]>;

/** 人工费用：独立总价条目，属于全屋公共项。 */
export function LaborEditor({
  labor,
  change,
}: {
  labor: Labor;
  change: (fn: (d: Design) => Design) => void;
}) {
  const [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [error, setError] = useState("");
  const setLabor = (next: (l: Labor) => Labor) =>
    change((d) => ({
      ...d,
      costSettings: {
        ...d.costSettings,
        labor: next(d.costSettings?.labor || []),
      },
    }));
  return (
    <>
      {labor.map((item) => (
        <div className="labor-item" key={item.id}>
          <div>
            <b>{item.name}</b>
            <EditorTooltip label="删除费用" description={`移除人工费「${item.name}」`}>
              <button
                type="button"
                aria-label={`删除人工费 ${item.name}`}
                onClick={() => {
                  setLabor((l) => l.filter((x) => x.id !== item.id));
                  notify.success(`已删除人工费「${item.name}」`);
                }}
              >
                <Trash2 size={13} />
              </button>
            </EditorTooltip>
          </div>
          <PriceInput
            key={item.id + item.amount}
            value={item.amount}
            label={item.name + "总费用"}
            onApply={(v) =>
              setLabor((l) =>
                l.map((x) => (x.id === item.id ? { ...x, amount: v ?? 0 } : x)),
              )
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
            notify.fail("请填写人工费名称和非负费用");
            return;
          }
          setLabor((l) => [...l, { id: uid(), name: name.trim(), amount: v }]);
          notify.success(`已添加人工费「${name.trim()}」`);
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
        <EditorTooltip label="添加人工" description="按总价录入一项施工 / 人工费用，计入全屋公共项">
          <button>
            <Plus size={14} />
            添加人工
          </button>
        </EditorTooltip>
        {error && <small role="alert">{error}</small>}
      </form>
    </>
  );
}
