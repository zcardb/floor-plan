import type { PageRequest, PageResult } from '@/lib/paging';
import { backend } from '@/lib/backend';
import { furnitureFromRow } from '@/lib/floor-plan/furniture-row';
import type { AccountItem } from '../model/account-cost-entries';
import { BUILTIN_IDS } from '@/lib/floor-plan/builtin-assets';
import { STAIR_CATEGORY } from '@/lib/floor-plan/stairs';
import type { LibraryItem } from '@/lib/floor-plan/types';
import { accountItemFromRow } from './account-rows';
import { readPage } from '@/lib/backend';

/** 列表接口 interior_library_page 的一行：视图 interior_account_library 的种类、主键、名称、分类，data 是整行数据。 */
type Row = { kind: string; item_key: string; name: string; category: string; data: Record<string, unknown> | null };
/** 账号库里除风格以外的种类（家具与五类硬装材料）。 */
export type ItemKind = AccountItem['kind'];
const ITEM_KINDS: ItemKind[] = ['furniture', 'floor', 'wall', 'opening', 'roof', 'ceiling'];

export interface LibraryFilter {
  /** 硬装 / 软装；不传为全部。 */
  major?: string;
  category?: string;
  /** 名称搜索（风格还搜一句话说明与大类）。 */
  query?: string;
}
const filterArgs = ({ major, category, query }: LibraryFilter) => ({ p_major: major || null, p_category: category || null, p_query: query?.trim() || null });

/**
 * 账号里自建的家具与硬装材料的一页（新建的在前），筛选与翻页都在数据库里做。
 * 内置家具的覆盖行（与内置家具同 catalogId）不算自建条目，按 id 排除；
 * 内置条目由调用方作为本地数据接在后面。数据不完整、读不懂的行不显示。
 */
export async function accountItemPage(request: PageRequest, { kinds = ITEM_KINDS, ...filter }: LibraryFilter & { kinds?: ItemKind[] } = {}): Promise<PageResult<AccountItem>> {
  const page = await readPage<Row>('interior_library_page', { p_kinds: kinds, p_exclude_keys: BUILTIN_IDS, ...filterArgs(filter) }, request);
  return { ...page, list: page.list.flatMap(row => accountItemFromRow(row.kind, row.data ?? {}) ?? []) };
}

/**
 * 我的家具的一页（不含楼梯这类硬装构件）；category 只看某个家具分类。
 * counts.mine 是我的家具总数，不随 category 变化。
 */
export async function accountFurniturePage(request: PageRequest, { category }: { category?: string } = {}): Promise<PageResult<LibraryItem, 'mine'>> {
  const page = await accountItemPage(request, { kinds: ['furniture'], major: '软装', category });
  const mine = Object.entries(page.counts).reduce((sum, [name, count = 0]) => (name === STAIR_CATEGORY ? sum : sum + count), 0);
  return {
    list: page.list.flatMap(entry => (entry.kind === 'furniture' ? [entry.item] : [])),
    pagination: page.pagination,
    counts: { mine },
  };
}

/** 内置家具在账号里的覆盖行（调整过的名称、尺寸、颜色与素材），条数不超过内置家具的件数，一次读完。 */
export async function readBuiltinOverrides(): Promise<LibraryItem[]> {
  const supabase = await backend();
  const { data, error } = await supabase.from('interior_furniture_catalog').select('*').in('catalog_id', BUILTIN_IDS);
  if (error) throw new Error(error.message);
  return (data ?? []).map(furnitureFromRow);
}
