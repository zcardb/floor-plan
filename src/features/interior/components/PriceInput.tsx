import { useState } from "react";
import { validPrice } from "../model/costs";
export function PriceInput({
  value,
  onApply,
  label = "单价",
  disabled = false,
}: {
  disabled?: boolean;
  value: number | null;
  onApply: (v: number | null) => void;
  label?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value)),
    [error, setError] = useState("");
  const apply = () => {
    if (disabled) return;
    const v = text.trim() === "" ? null : Number(text);
    if (v !== null && !validPrice(v)) {
      setError("请输入非负有效金额");
      return;
    }
    setError("");
    onApply(v);
  };
  return (
    <div className="price-entry">
      <input
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
            apply();
          }
          if (e.key === "Escape") {
            setText(value === null ? "" : String(value));
            setError("");
          }
        }}
      />
      <button disabled={disabled} onClick={apply}>应用</button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
