import { useState } from "react";
import { validPrice } from "../model/costs";
import { yuanPrecise } from "../model/money";
import { notify } from "@/lib/notify";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

/** 返回 false 表示未生效且调用方已自行提示（如云端保存失败）；抛错视为报错；其余视为成功。 */
export type PriceApplyResult = void | boolean | Promise<void | boolean>;

export function PriceInput({
  value,
  onApply,
  label = "单价",
  disabled = false,
}: {
  disabled?: boolean;
  value: number | null;
  onApply: (v: number | null) => PriceApplyResult;
  label?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const apply = async () => {
    if (disabled || busy) return;
    const v = text.trim() === "" ? null : Number(text);
    if (v !== null && !validPrice(v)) {
      setError("请输入非负有效金额");
      notify.fail(`「${label}」请输入非负有效金额`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await onApply(v);
      if (result !== false) notify.success(v === null ? `「${label}」已设为未定价` : `「${label}」已更新为 ${yuanPrecise(v)}`);
    } catch (cause) {
      notify.error(`「${label}」应用失败`, cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="price-entry">
      <Input
        className="editor-control price-control"
        aria-label={label}
        disabled={disabled}
        type="number"
        min={0}
        max={100000000}
        step="0.01"
        value={text}
        placeholder="未定价"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void apply();
          }
          if (e.key === "Escape") {
            setText(value === null ? "" : String(value));
            setError("");
          }
        }}
      />
      <EditorTooltip
        label="应用"
        disabled={disabled || busy}
      >
        <Button type="button" variant="secondary" size="sm" className="editor-action" disabled={disabled || busy} onClick={() => void apply()}>{busy ? '应用中…' : '应用'}</Button>
      </EditorTooltip>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
