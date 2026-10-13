/**
 * 3D 场景里所有事件的唯一登记处（DOM 节点、window、document、three.js 控件都可以）。
 * 每个回调都包一层 try/catch：处理器里抛出的异常不会逃成未捕获错误，
 * 只会走 onFatal 统一处理（切回 2D）。disposeAll() 之后事件全部失效。
 */
export type FatalHandler = (reason: "crash") => void;

/** 同时兼容 DOM EventTarget 与 three.js EventDispatcher（后者的重载更具体）。 */
interface Listenable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(type: any, listener: any, options?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener(type: any, listener: any, options?: any): void;
}

export function createListenerRegistry(onFatal: FatalHandler) {
  const entries: { target: Listenable; type: string; listener: (event: never) => void; options?: AddEventListenerOptions | boolean }[] = [];
  let disposed = false;

  /** 包住任意回调：出错时停止所有事件并上报一次。渲染循环也走这里。 */
  const guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    if (disposed) return;
    try {
      fn(...args);
    } catch (error) {
      console.error("3D 场景运行出错", error);
      disposed = true;
      onFatal("crash");
    }
  };

  const on = <E = Event>(target: Listenable, type: string, handler: (event: E) => void, options?: AddEventListenerOptions | boolean) => {
    if (disposed) return;
    const listener = guard(handler) as (event: never) => void;
    target.addEventListener(type, listener, options);
    entries.push({ target, type, listener, options });
  };

  const disposeAll = () => {
    disposed = true;
    for (const { target, type, listener, options } of entries) target.removeEventListener(type, listener, options);
    entries.length = 0;
  };

  return { on, guard, disposeAll, get disposed() { return disposed; } };
}
