import type { PageCounts, PageRequest, PageResult } from '@/lib/paging';
import { backend } from './connection';

/** 数据库里的列表函数（supabase/migrations）：返回值都是统一分页格式 { list, pagination, counts }。 */
export type PageFunction = 'interior_project_page' | 'interior_library_page' | 'interior_assistant_page';

/**
 * 调一个列表函数，取回一页。筛选条件放在 args 里（p_ 开头，与函数参数同名），页码与每页条数由 request 带入。
 * 返回的形状不对时按读取失败处理，不把坏数据交给页面。
 */
export async function readPage<Row, K extends string = string>(fn: PageFunction, args: Record<string, unknown>, request: PageRequest): Promise<PageResult<Row, K>> {
  const supabase = await backend();
  const { data, error } = await supabase.rpc(fn, { ...args, p_page: request.page, p_page_size: request.pageSize });
  if (error) throw new Error(error.message);
  const result = data as { list?: unknown; pagination?: { total?: unknown }; counts?: unknown } | null;
  const total = result?.pagination?.total;
  if (!result || !Array.isArray(result.list) || typeof total !== 'number') throw new Error('列表接口返回的数据格式不对');
  const counts = result.counts && typeof result.counts === 'object' ? result.counts as PageCounts<K> : {};
  return { list: result.list as Row[], pagination: { page: request.page, pageSize: request.pageSize, total }, counts };
}
