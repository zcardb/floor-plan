import type { Json } from '@/lib/backend';
import type { PageRequest, PageResult } from '@/lib/paging';
import { styleFromRow, validDecorStyle, type DecorStyle } from '@/lib/floor-plan/decor-styles';
import { backend, requireUserId } from '@/lib/backend';
import { readPage } from '@/lib/backend';

/** 列表接口 interior_library_page 的一行：data 是 interior_style_catalog 的整行。 */
type Row = { data: Record<string, unknown> | null };

/** 我的装修风格的一页（新建的在前）；counts 按风格大类统计，未归类的计在空串下。 */
export async function accountStylePage(request: PageRequest, { category, query }: { category?: string; query?: string } = {}): Promise<PageResult<DecorStyle>> {
  const page = await readPage<Row>('interior_library_page', { p_kinds: ['style'], p_major: null, p_category: category || null, p_query: query?.trim() || null }, request);
  return { ...page, list: page.list.flatMap(row => styleFromRow(row.data ?? {}) ?? []) };
}

/** 按 id 读一套我的风格（直接打开 /styles/:id 时用）；不存在时返回 null。 */
export async function readAccountStyle(id: string): Promise<DecorStyle | null> {
  const { data, error } = await (await backend()).from('interior_style_catalog').select('style_key,name,spec').eq('style_key', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? styleFromRow(data) : null;
}

/** 保存自定义风格：名称单独成列，其余定义存进 spec；同 id 再存即覆盖（仅本人可写，由 RLS 保证）。 */
export async function saveAccountStyle(style: DecorStyle) {
  if (!validDecorStyle(style)) throw new Error('风格数据无效');
  const { id, name, ...spec } = style;
  const { error } = await (await backend()).from('interior_style_catalog').upsert({
    owner_id: await requireUserId(), style_key: id, name, spec: spec as unknown as Json, updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,style_key' });
  if (error) throw new Error(error.message);
}

export async function removeAccountStyle(id: string) {
  const { error } = await (await backend()).from('interior_style_catalog').delete().eq('owner_id', await requireUserId()).eq('style_key', id);
  if (error) throw new Error(error.message);
}
