import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 包装一个异步操作：
 * - 进行中再次调用直接忽略（防重复提交），返回 undefined
 * - 无论成功或抛错，结束后都会复位 pending
 * - pendingKey 记录本次调用的标识，用于「哪一行正在处理」
 * 抛出的错误会继续向上抛，由调用方决定如何提示。
 */
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
  keyOf?: (...args: Args) => string,
) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const latest = useRef(action);
  const latestKey = useRef(keyOf);
  latest.current = action;
  latestKey.current = keyOf;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args): Promise<Result | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    setPendingKey(latestKey.current?.(...args) ?? "");
    try {
      return await latest.current(...args);
    } finally {
      locked.current = false;
      if (mounted.current) setPendingKey(null);
    }
  }, []);

  return { run, pending: pendingKey !== null, pendingKey };
}
