import { pagedView, type PageCounts, type PageResult } from "@/lib/paging";
import type { PagedList, PagedListOptions } from "./usePagedList";

/**
 * 组件测试用的 `usePagedList` 替身（只在测试里 `vi.mock("@/hooks/usePagedList", ...)` 时使用）。
 *
 * 组件测试是服务端渲染或直接调用组件函数，effect 不会执行，接口数据永远回不来；
 * 所以由用例直接指定「接口已经返回的数据」，本地数据与分类数量照常与它合并（和真实 Hook 用同一个 `pagedView`）。
 * 组件最近一次传入的参数记在 `pagedListFake.options`，用例可以调用其中的 `remote` 检查筛选条件。
 */
export const pagedListFake = {
  /** 接口这一侧：已取回的条目（第一页）、符合筛选的总数（默认等于条数）、分类数量。 */
  remote: { list: [] as unknown[], total: undefined as number | undefined, counts: {} as PageCounts },
  /** 第一页还没回来：有 `remote.list` 时表示切换筛选、仍显示上一份内容。 */
  loading: false,
  error: "",
  options: null as PagedListOptions<unknown> | null,
  reset() {
    this.remote = { list: [], total: undefined, counts: {} };
    this.loading = false;
    this.error = "";
    this.options = null;
  },
};

export function usePagedList<T, K extends string = string>(options: PagedListOptions<T, K>): PagedList<T, K> {
  pagedListFake.options = options as unknown as PagedListOptions<unknown>;
  const { local = [], localCounts = {} } = options;
  const { list, total = list.length, counts } = pagedListFake.remote;
  const loaded = { items: list as T[], total: options.remote ? total : 0, counts: (options.remote ? counts : {}) as PageCounts<K> };
  const view: PageResult<T, K> = pagedView(loaded, pagedListFake.loading && !list.length ? [] : local, localCounts, 1);
  const noop = () => {};
  return {
    ...view,
    loading: !!options.remote && pagedListFake.loading,
    loadingMore: false,
    error: options.remote ? pagedListFake.error : "",
    hasMore: view.list.length < view.pagination.total,
    loadMore: noop,
    reload: noop,
    refresh: async () => {},
  };
}
