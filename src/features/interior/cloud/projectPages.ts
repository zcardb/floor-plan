import type { Json } from '@/integrations/supabase/types';
import type { PageRequest, PageResult } from '@/lib/paging';
import { backend } from './backend';
import { compactThumbnail, readThumbnail } from '../model/planThumbnail';
import type { Design } from '../model/types';
import { readPage } from './pageRpc';
import type { ProjectSummary } from './useProjects';

type Row = { id: string; name: string; updated_at: string | null; revision: number; thumbnail: unknown };

/**
 * 我的云端项目的一页（按修改时间倒序）；query 按名称搜索。
 * counts.mine 是云端项目总数，不随搜索词变化。thumbnails = false 时不带缩略图（项目切换菜单用）；
 * pageSize 传 0 只取数量。
 */
export async function projectPage(request: PageRequest, { query = '', thumbnails = true }: { query?: string; thumbnails?: boolean } = {}): Promise<PageResult<ProjectSummary, 'mine'>> {
  const page = await readPage<Row, 'mine'>('interior_project_page', { p_query: query, p_thumbnails: thumbnails }, request);
  return {
    ...page,
    list: page.list.map(r => ({ id: r.id, name: r.name, updatedAt: r.updated_at || '', revision: r.revision, thumbnail: readThumbnail(r.thumbnail), cloud: true })),
  };
}

/**
 * 缺缩略图的云端项目（旧版本客户端写入的）：用已保存的方案补算一份。
 * 只补空值（用户此刻可能正好保存了更新的缩略图）、不改修改时间；一次最多补 6 个。返回补上的数量。
 */
export async function backfillThumbnails(rows: readonly ProjectSummary[]): Promise<number> {
  const supabase = await backend();
  let done = 0;
  for (const row of rows.slice(0, 6)) {
    try {
      const { data } = await supabase.from('interior_design_projects').select('state').eq('id', row.id).maybeSingle();
      if (!data) continue;
      const thumbnail = compactThumbnail(data.state as unknown as Design);
      const { error } = await supabase.from('interior_design_projects').update({ thumbnail: thumbnail as unknown as Json }).eq('id', row.id).is('thumbnail', null);
      if (!error) done++;
    } catch { /* 方案数据不完整或网络异常：这一个保持占位，不影响其余项目 */ }
  }
  return done;
}
