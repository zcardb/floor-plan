/**
 * 统一分页格式。项目里凡是列表（四个管理页、编辑器侧栏的家具库与装修风格、项目切换菜单……）
 * 都用这一套：一页 20 条，返回 `list` + `pagination` + `counts` 三部分。
 *
 * - 列表接口（数据库函数 `interior_*_page`）原样返回这个形状；
 * - 内存里的数据（内置模板、内置家具、内置风格）排在接口数据之后，由 `usePagedList` 合并。
 */

/** 每页条数：第 1 页是第 0–20 条，第 2 页 20–40，以此类推。 */
export const PAGE_SIZE = 20;

export interface PageRequest {
  /** 页码，从 1 开始。 */
  page: number;
  pageSize: number;
}

export interface Pagination extends PageRequest {
  /** 符合当前筛选条件的总条数。 */
  total: number;
}

/** 分类数量：分类 id → 条数，用于筛选胶囊上的角标；不随当前选中的分类与搜索词变化。 */
export type PageCounts<K extends string = string> = Partial<Record<K, number>>;

export interface PageResult<T, K extends string = string> {
  list: T[];
  pagination: Pagination;
  counts: PageCounts<K>;
}

/** 取一页接口数据的函数：筛选条件由调用方用闭包带入。 */
export type PageSource<T, K extends string = string> = (request: PageRequest) => Promise<PageResult<T, K>>;

/** 已经取回的接口数据：`total` 是接口这一侧符合筛选条件的总数。 */
export interface LoadedPages<T, K extends string = string> {
  items: T[];
  total: number;
  counts: PageCounts<K>;
}

export const EMPTY_PAGES: LoadedPages<never, never> = { items: [], total: 0, counts: {} };

/** 两份分类数量按分类相加。 */
export function addCounts<K extends string>(a: PageCounts<K>, b: PageCounts<K>): PageCounts<K> {
  const sum: PageCounts<K> = { ...a };
  for (const key of Object.keys(b) as K[]) sum[key] = (sum[key] ?? 0) + (b[key] ?? 0);
  return sum;
}

/**
 * 当前应该显示的内容：接口数据在前、本地数据在后，取前 `page` 页。
 * 接口数据还没取完时不露出本地数据，避免后到的接口数据插到它们前面造成跳动。
 */
export function pagedView<T, K extends string = string>(
  loaded: LoadedPages<T, K>,
  local: readonly T[],
  localCounts: PageCounts<K>,
  page: number,
  pageSize: number = PAGE_SIZE,
): PageResult<T, K> {
  const limit = page * pageSize;
  const head = loaded.items.slice(0, limit);
  const tail = loaded.items.length >= loaded.total ? local.slice(0, Math.max(0, limit - loaded.total)) : [];
  return {
    list: [...head, ...tail],
    pagination: { page, pageSize, total: loaded.total + local.length },
    counts: addCounts(loaded.counts, localCounts),
  };
}
