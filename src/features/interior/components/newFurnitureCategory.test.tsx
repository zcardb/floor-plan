import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../model/types';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, category: '全部', generate: vi.fn(), save: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial === '全部' ? harness.category : typeof initial === 'function' ? initial() : initial;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next; }];
  },
  useRef(initial: unknown) { const index = harness.cursor++; if (!(index in harness.slots)) harness.slots[index] = { current: initial }; return harness.slots[index]; },
  useEffect() {},
  useMemo(calculate: () => unknown) { return calculate(); },
}));
vi.mock('./useAccountCostCommit', () => ({ useAccountCostCommit: () => ({ settings: {}, busy: false, pending: null, error: '', saved: false }) }));
vi.mock('../cloud/useFurnitureImage', () => ({ useFurnitureImage: () => ({ cancel: () => {}, generate: harness.generate, busy: false }) }));
vi.mock('../cloud/useFloorCatalog', () => ({ useFloorCatalog: () => ({ items: [], loading: false, error: '', load: vi.fn(), save: vi.fn() }) }));
vi.mock('../cloud/useFurnitureCatalog', () => ({ useFurnitureCatalog: () => ({ items: [], count: 0, counts: {}, reset: () => {}, save: harness.save }) }));
import { newFurnitureCategory } from '../model/newFurnitureCategory';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { AccountCostManager } from './AccountCostManager';
import { CustomFurnitureDialog } from './CustomFurnitureDialog';
import { AccountCMS } from './AccountCMS';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import type { useProjects } from '../cloud/useProjects';
import type { useAccountCosts } from '../cloud/useAccountCosts';

type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function render<T>(callback: () => T): T { harness.cursor = 0; return callback(); }
function fresh() { harness.slots = []; harness.cursor = 0; }
beforeEach(() => { fresh(); harness.category = '全部'; harness.generate.mockReset().mockResolvedValue('https://example.com/furniture.png'); harness.save.mockReset().mockResolvedValue(true); });
const catalog = { items: [], count: 0, counts: {}, loading: false, hasMore: false } as unknown as ReturnType<typeof useFurnitureCatalog>;
describe('新建家具默认分类', () => {
  it.each(['卧室', '客厅', '餐厨', '卫浴', '家电', '书房'])('有效分类 %s 原样保留', category => { expect(newFurnitureCategory(category)).toBe(category); });
  it.each([undefined, '', '全部', '自定义', '地面', '墙面', '门窗'])('非家具分类 %s 默认客厅', category => { expect(newFurnitureCategory(category)).toBe('客厅'); });
  it.each(['卧室', '餐厨', '全部', '自定义', '地面'])('两个管理页点击新建均传入当前筛选 %s', category => {
    harness.category = category;
    const onNew = vi.fn();
    const furniture = render(() => AccountFurnitureLibrary({ catalog, defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew }));
    const click = nodes(furniture).find(node => Array.isArray(node.props.children) && node.props.children.includes('新建家具') && typeof node.props.onClick === 'function');
    expect(click).toBeDefined(); (click!.props.onClick as () => void)(); expect(onNew).toHaveBeenLastCalledWith(category);
    fresh();
    const costs = render(() => AccountCostManager({ settings: {}, save: async () => true, saving: false, error: '', items: [], onDirty: () => {}, onNew, hasMore: false, loading: false, catalogError: '', loadMore: () => {} }));
    const button = nodes(costs).find(node => node.props.className === 'cost-new');
    (button!.props.onClick as () => void)(); expect(onNew).toHaveBeenLastCalledWith(category);
  });
  it.each(['卧室', '全部', '墙面'])('账号父组件将 %s 归一化后传给新建弹窗', category => {
    const projects = { session: { user: { id: 'owner', email: 'test@example.com' } } } as ReturnType<typeof useProjects>;
    const costs = { settings: {}, saving: false } as ReturnType<typeof useAccountCosts>;
    const page = () => render(() => AccountCMS({ projects, costs, opened: () => {} }));
    const menu = nodes(page()).find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('家具管理'));
    (menu!.props.onClick as () => void)();
    const library = nodes(page()).find(node => node.type === AccountFurnitureLibrary)!;
    (library.props.onNew as (value: string) => void)(category);
    expect(nodes(page()).find(node => node.type === CustomFurnitureDialog)?.props.initialCategory).toBe(newFurnitureCategory(category));
  });
  it('弹窗默认客厅，手动改分类后提交使用手动值，不被初始值覆盖', async () => {
    const onCreate = vi.fn();
    const props = { open: true, onOpenChange: vi.fn(), loggedIn: true, login: vi.fn(), onCreate, onImport: vi.fn(), ownerKey: 'owner', accountOnly: true };
    const dialog = () => render(() => CustomFurnitureDialog(props));
    let tree = nodes(dialog());
    const category = tree.find(node => node.props.value === '客厅' && typeof node.props.onValueChange === 'function')!;
    expect(category).toBeDefined(); (category.props.onValueChange as (value: string) => void)('书房');
    const name = tree.find(node => node.props.id === 'furniture-name')!;
    (name.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '书桌' } });
    tree = nodes(dialog());
    expect(tree.some(node => node.props.value === '书房')).toBe(true);
    (tree.find(node => node.type === 'form')!.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({ category: '书房' } satisfies Partial<LibraryItem>));
  });
  it('重新挂载的弹窗使用本次初始分类', () => {
    const props = { open: true, onOpenChange: vi.fn(), loggedIn: true, login: vi.fn(), onCreate: vi.fn(), onImport: vi.fn(), ownerKey: 'owner' };
    expect(nodes(render(() => CustomFurnitureDialog({ ...props, initialCategory: '卧室' }))).some(node => node.props.value === '卧室')).toBe(true);
    fresh();
    expect(nodes(render(() => CustomFurnitureDialog({ ...props, initialCategory: '餐厨' }))).some(node => node.props.value === '餐厨')).toBe(true);
  });
});
