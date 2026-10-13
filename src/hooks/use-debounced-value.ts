import { useEffect, useState } from "react";

/**
 * 值稳定 delay 毫秒后才更新：搜索框边输入边筛选时，用它得到真正发给接口的关键词，
 * 避免每敲一个字就请求一次。首次渲染直接返回当前值。
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
