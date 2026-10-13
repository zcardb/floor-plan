import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/notify";
import { EMPTY_PAGES, PAGE_SIZE, fetchedAll, pagedView, type LoadedPages, type PageCounts, type PageResult, type PageSource } from "@/lib/paging";

export interface PagedListOptions<T, K extends string = string> {
  /** 接口部分：按页读取。没有接口数据的列表（游客、数据已在内存里的列表）传 null。 */
  remote: PageSource<T, K> | null;
  /** 本地部分（内置数据或已在内存里的数据），排在接口数据之后；每次渲染传最新的即可。 */
  local?: readonly T[];
  /** 本地部分的分类数量。 */
  localCounts?: PageCounts<K>;
  /** 筛选条件的标识：变化时回到第一页。 */
  key: string;
}

export interface PagedList<T, K extends string = string> extends PageResult<T, K> {
  /** 第一页还没回来：首次进入、切换筛选或点了刷新。切换筛选时 `list` 暂时保留上一份内容。 */
  loading: boolean;
  /** 正在读取下一页，或正在静默刷新。 */
  loadingMore: boolean;
  /** 最近一次读取失败的原因；空串表示正常。失败后不再自动向接口翻页，由「重试」调用 `reload`。 */
  error: string;
  hasMore: boolean;
  /** 滚到底部时调用：显示下一页。 */
  loadMore: () => void;
  /** 回到第一页重新读取，已显示的内容先清空（配合骨架屏）。 */
  reload: () => void;
  /** 保持已加载的页数重新读取，内容不闪；改名、删除、保存之后调用。 */
  refresh: () => Promise<void>;
}

interface State<T, K extends string> {
  /** 这批数据对应的筛选标识。 */
  key: string;
  loaded: LoadedPages<T, K>;
  /** 已显示到第几页。 */
  page: number;
  status: "loading" | "ready" | "more";
  error: string;
}

const initial = <T, K extends string>(key: string, hasRemote: boolean): State<T, K> =>
  ({ key, loaded: EMPTY_PAGES, page: 1, status: hasRemote ? "loading" : "ready", error: "" });

const READ_FAILED = "读取失败，请重试";

/**
 * 接口这一侧新取回一页，见 `fetchedAll`。取完后总数以实际条数为准，
 * 避免别处增删、或有数据不完整的行被丢弃时「总数对不上、一直还有更多」。
 */
function accept<T, K extends string>(items: T[], result: PageResult<T, K>): LoadedPages<T, K> {
  const all = [...items, ...result.list];
  const done = fetchedAll(all, result.list, result.pagination.total);
  return { items: all, total: done ? all.length : result.pagination.total, counts: result.counts };
}

/**
 * 全站统一的分页列表状态：每页 20 条，滚到底部显示下一页。
 *
 * 一个列表由两部分拼成——接口数据（账号里的项目、家具、风格……按页向接口要）在前，
 * 本地数据（内置模板、内置家具、内置风格）在后。接口数据取完之后的翻页只是多显示一页本地数据，不发请求；
 * 完全没有接口部分的列表（编辑器侧栏）就是纯本地翻页。返回值与列表接口同一个形状：list + pagination + counts。
 */
export function usePagedList<T, K extends string = string>({ remote, local = [], localCounts = {}, key }: PagedListOptions<T, K>): PagedList<T, K> {
  const [stored, setState] = useState<State<T, K>>(() => initial(key, !!remote));
  const [version, setVersion] = useState(0);
  // 筛选变了：在渲染阶段直接换成新筛选的初始状态，不多渲染一帧旧页码。
  let state = stored;
  if (state.key !== key) {
    state = initial(key, !!remote);
    setState(state);
  }
  const remoteRef = useRef(remote), stateRef = useRef(state), keyRef = useRef(key);
  remoteRef.current = remote;
  stateRef.current = state;
  keyRef.current = key;
  /** 每次重新读取第一页就加一，用来作废还在路上的旧请求。 */
  const epoch = useRef(0);
  /** 卸载后不再发请求、不再写状态（异步操作收尾时可能还会调用 refresh）。 */
  const alive = useRef(true);
  useEffect(() => {
    // 卸载后又重新挂载（如开发环境 StrictMode 的二次挂载）时恢复。
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  /** 上一次读完时显示的内容：切换筛选、等待第一页期间继续显示它，避免整片闪动。 */
  const settled = useRef<PageResult<T, K> | null>(null);
  /** 状态同时记到 ref：同一轮事件里连续调用（如哨兵连续触发）也能读到刚写入的值。 */
  const commit = useCallback((next: State<T, K>) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const enabled = !!remote;
  useEffect(() => {
    const source = remoteRef.current, counter = epoch;
    if (!source) return;
    const run = ++counter.current;
    source({ page: 1, pageSize: PAGE_SIZE }).then(
      (result) => { if (run === counter.current) commit({ key, loaded: accept([], result), page: 1, status: "ready", error: "" }); },
      (cause) => { if (run === counter.current) commit({ key, loaded: EMPTY_PAGES, page: 1, status: "ready", error: errorMessage(cause, READ_FAILED) }); },
    );
    // 作废这一次还在路上的请求（筛选又变了、点了刷新或卸载）。
    return () => { counter.current++; };
  }, [key, version, enabled, commit]);

  const loadMore = useCallback(() => {
    const current = stateRef.current, source = remoteRef.current;
    if (!alive.current || current.status !== "ready") return;
    const page = current.page + 1;
    // 接口数据已经取完（或本来就没有接口部分）：多显示一页本地数据即可。
    if (!source || current.loaded.items.length >= current.loaded.total) {
      commit({ ...current, page });
      return;
    }
    if (current.error) return;
    const run = epoch.current;
    commit({ ...current, status: "more" });
    source({ page, pageSize: PAGE_SIZE }).then(
      (result) => { if (run === epoch.current) commit({ ...current, loaded: accept(current.loaded.items, result), page }); },
      (cause) => { if (run === epoch.current) commit({ ...current, error: errorMessage(cause, READ_FAILED) }); },
    );
  }, [commit]);

  const reload = useCallback(() => {
    if (!alive.current) return;
    settled.current = null;
    commit(initial(keyRef.current, !!remoteRef.current));
    setVersion((n) => n + 1);
  }, [commit]);

  const refresh = useCallback(async () => {
    const current = stateRef.current, source = remoteRef.current;
    if (!alive.current || !source || current.status === "loading") return;
    const run = ++epoch.current;
    commit({ ...current, status: "more" });
    try {
      // 已经读过几页就重读几页；接口这一侧提前取完就停。
      const pages = Math.max(1, Math.ceil(current.loaded.items.length / PAGE_SIZE));
      let loaded: LoadedPages<T, K> = EMPTY_PAGES;
      for (let page = 1; page <= pages; page++) {
        const result = await source({ page, pageSize: PAGE_SIZE });
        if (run !== epoch.current) return;
        loaded = accept(loaded.items, result);
        if (loaded.items.length >= loaded.total) break;
      }
      commit({ ...current, loaded, status: "ready", error: "" });
    } catch (cause) {
      if (run === epoch.current) commit({ ...current, status: "ready", error: errorMessage(cause, READ_FAILED) });
    }
  }, [commit]);

  const loading = state.status === "loading";
  const view: PageResult<T, K> = loading
    ? settled.current ?? pagedView<T, K>(EMPTY_PAGES, [], {}, 1)
    : pagedView(state.loaded, local, localCounts, state.page);
  if (!loading) settled.current = view;
  return {
    ...view,
    loading,
    loadingMore: state.status === "more",
    error: state.error,
    hasMore: view.list.length < view.pagination.total,
    loadMore,
    reload,
    refresh,
  };
}
