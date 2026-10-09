import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { validPrice } from "../model/costs";
import { yuanPrecise } from "../model/money";
import { notify } from "@/lib/notify";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** 返回 false 表示未生效且调用方已自行提示（如云端保存失败）；抛错视为报错；其余视为成功。 */
export type PriceApplyResult = void | boolean | Promise<void | boolean>;
/** flush：输入有未应用的修改时按「应用」保存；无修改直接返回 true。 */
export type PriceInputHandle = { flush: () => Promise<boolean> };

const draftOf = (value: number | null) => (value === null ? "" : String(value));

/**
 * 价格需显式「应用」（可能同步到账号库、影响其他项目）。
 * 有未应用修改时高亮输入框与按钮；卸载时未应用的修改会提示已放弃，不会静默丢失。
 */
export function PriceInput({
  value,
  onApply,
  label = "单价",
  applyLabel = "应用",
  disabled = false,
  ref,
}: {
  disabled?: boolean;
  value: number | null;
  onApply: (v: number | null) => PriceApplyResult;
  label?: string;
  /** 按钮文案，如勾选同步时为「应用并同步」。 */
  applyLabel?: string;
  ref?: Ref<PriceInputHandle>;
}) {
  const [text, setText] = useState(draftOf(value)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<Promise<boolean> | null>(null);
  const dirty = text.trim() !== draftOf(value);
  const apply = (): Promise<boolean> => {
    if (pending.current) return pending.current;
    if (disabled) return Promise.resolve(false);
    const v = text.trim() === "" ? null : Number(text);
    if (v !== null && !validPrice(v)) {
      setError("请输入非负有效金额");
      notify.fail(`「${label}」请输入非负有效金额`);
      return Promise.resolve(false);
    }
    setError("");
    setBusy(true);
    const run = (async () => {
      try {
        const result = await onApply(v);
        if (result === false) return false;
        notify.success(v === null ? `「${label}」已设为未定价` : `「${label}」已更新为 ${yuanPrecise(v)}`);
        return true;
      } catch (cause) {
        notify.error(`「${label}」应用失败`, cause);
        return false;
      } finally {
        pending.current = null;
        setBusy(false);
      }
    })();
    pending.current = run;
    return run;
  };
  useImperativeHandle(ref, () => ({ flush: async () => (pending.current ? pending.current : dirty && !disabled ? apply() : true) }));
  // 卸载（关闭弹层、切换对象）时未应用的修改明确告知已放弃。
  const unapplied = useRef({ dirty, label });
  unapplied.current = { dirty: dirty && !busy, label };
  useEffect(() => () => {
    if (unapplied.current.dirty) notify.warning(`「${unapplied.current.label}」的修改未应用，已放弃`);
  }, []);
  return (
    <div className={"price-entry" + (dirty ? " is-dirty" : "")}>
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
        onChange={(e) => { setText(e.target.value); setError(""); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            if (dirty) void apply();
          }
          if (e.key === "Escape" && dirty) {
            e.preventDefault();
            setText(draftOf(value));
            setError("");
          }
        }}
      />
      <Button
        type="button"
        variant={dirty ? "default" : "secondary"}
        size="sm"
        className="editor-action"
        disabled={disabled || busy || !dirty}
        onClick={() => void apply()}
      >
        {busy ? '应用中…' : applyLabel}
      </Button>
      {error ? <small role="alert">{error}</small> : dirty && !busy && <small className="price-entry-hint">未应用 · 回车应用，Esc 还原</small>}
    </div>
  );
}
