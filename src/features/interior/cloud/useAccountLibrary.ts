import { useCallback, useRef, useState } from 'react';
import { BUILTIN_IDS } from '../model/builtinAssets';
import type { CustomFloor, CustomOpening, CustomWall, LibraryItem } from '../model/types';
import type { DecorStyle } from '../model/decorStyles';
import { styleFromRow } from '../model/decorStyles';
import { accountItemFromRow } from './accountRows';
import { backend } from './backend';

/** 账号库全部条目：数据库视图 interior_account_library 把 家具 / 地面 / 墙面 / 门窗 / 屋面 / 吊顶 / 风格 合成一张表。 */
export interface AccountLibraryData {
  /** 账号自建家具（不含内置家具的覆盖行）。 */
  furniture: LibraryItem[];
  /** 内置家具的素材覆盖（与内置家具同 catalogId 的行）。 */
  overrides: LibraryItem[];
  floors: CustomFloor[]; walls: CustomWall[]; openings: CustomOpening[]; roofs: CustomWall[]; ceilings: CustomWall[];
  /** 自建的装修风格（新建在前）。 */
  styles: DecorStyle[];
}
const EMPTY: AccountLibraryData = { furniture: [], overrides: [], floors: [], walls: [], openings: [], roofs: [], ceilings: [], styles: [] };
const builtin = new Set(BUILTIN_IDS);

type ViewRow = { kind: string | null; data: unknown };

/** 视图的行按 kind 分到各个列表（无效行丢弃）。 */
export function splitAccountLibrary(rows: ViewRow[]): AccountLibraryData {
  const data: AccountLibraryData = { furniture: [], overrides: [], floors: [], walls: [], openings: [], roofs: [], ceilings: [], styles: [] };
  for (const row of rows) {
    const value = (row.data ?? {}) as Record<string, unknown>;
    if (row.kind === 'style') {
      const style = styleFromRow(value);
      if (style) data.styles.push(style);
      continue;
    }
    const entry = accountItemFromRow(row.kind, value);
    switch (entry?.kind) {
      case 'furniture': (builtin.has(entry.item.catalogId!) ? data.overrides : data.furniture).push(entry.item); break;
      case 'floor': data.floors.push(entry.item); break;
      case 'opening': data.openings.push(entry.item); break;
      case 'wall': data.walls.push(entry.item); break;
      case 'roof': data.roofs.push(entry.item); break;
      case 'ceiling': data.ceilings.push(entry.item); break;
    }
  }
  return data;
}

/**
 * 账号库：一次请求读完本人的全部自建家具与材料（仅本人可读，由各表 RLS 保证）。
 * 编辑器、家具管理、风格管理、新建弹窗共用；写入仍走各自的 save。
 */
export function useAccountLibrary() {
  const [data, setData] = useState<AccountLibraryData>(EMPTY), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0);
  const reset = useCallback(() => { epoch.current++; setData(EMPTY); setLoading(false); setError(''); }, []);
  const load = useCallback(async () => {
    const run = ++epoch.current;
    setLoading(true); setError('');
    try {
      const { data: rows, error: readError } = await (await backend()).from('interior_account_library').select('kind,data').order('created_at', { ascending: false });
      if (run !== epoch.current) return;
      if (readError) { setError(readError.message); return; }
      setData(splitAccountLibrary(rows ?? []));
    } catch (cause) {
      if (run === epoch.current) setError(cause instanceof Error ? cause.message : '账号家具与材料读取失败，请重试');
    } finally {
      if (run === epoch.current) setLoading(false);
    }
  }, []);
  return { ...data, loading, error, load, reset };
}
export type AccountLibrary = ReturnType<typeof useAccountLibrary>;
