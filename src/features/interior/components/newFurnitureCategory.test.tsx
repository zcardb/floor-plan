import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../model/types';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, alls: 0, category: '全部', generate: vi.fn(), save: vi.fn(), loadLibrary: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const index = harness.cursor++;
    // 家具库有两个默认「全部」的状态：先是大类（全部 / 硬装 / 软装），再是细分分类；只把细分分类替换成用例指定值。
    const seed = initial === '全部' ? (harness.alls++ === 0 ? '全部' : harness.category) : typeof initial === 'function' ? initial() : initial;
    if (!(index in harness.slots)) harness.slots[index] = seed;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next; }];
  },
  useRef(initial: unknown) { const index = harness.cursor++; if (!(index in harness.slots)) harness.slots[index] = { current: initial }; return harness.slots[index]; },
  useEffect() {},
  useMemo(calculate: () => unknown) { return calculate(); },
  useCallback(callback: unknown) { return callback; },
}));
// 列表接口在直接调用组件时不会返回：由用例直接指定接口已返回的数据（见 usePagedList.testing）。
vi.mock('@/hooks/usePagedList', () => import('@/hooks/usePagedList.testing'));
vi.mock('./useAccountCostCommit', () => ({ useAccountCostCommit: () => ({ settings: {}, busy: false, pending: null, error: '', saved: false }) }));
vi.mock('../cloud/useFurnitureImage', () => ({ useFurnitureImage: () => ({ cancel: () => {}, generate: harness.generate, busy: false }) }));
vi.mock('../cloud/useAccountLibrary', () => ({ useAccountLibrary: () => ({ furniture: [], overrides: [], floors: [], walls: [], openings: [], roofs: [], ceilings: [], loading: false, error: '', load: harness.loadLibrary, reset: () => {} }) }));
vi.mock('../cloud/accountWrites', () => ({ saveAccountFurniture: harness.save, removeAccountFurniture: vi.fn(), accountMaterialSaves: { floor: vi.fn(), opening: vi.fn(), wall: vi.fn(), roof: vi.fn(), ceiling: vi.fn() } }));
import { newFurnitureCategory } from '../model/newFurnitureCategory';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { CustomColorMaterialForm } from './CustomColorMaterialForm';
import { CustomOpeningForm } from './CustomOpeningForm';
import { CustomFurnitureDialog } from './CustomFurnitureDialog';
import { CustomFloorForm } from './CustomFloorForm';
import { FurnitureFormFields } from './FurnitureFormFields';
import { AccountCMS } from './AccountCMS';
import { CmsSidebar } from './CmsLayout';
import type { useProjects } from '../cloud/useProjects';
import type { useAccountCosts } from '../cloud/useAccountCosts';
import { accountItemEntry } from '../model/accountCostEntries';
import { pagedListFake } from '@/hooks/usePagedList.testing';

type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  // 共用的家具表单项、管理端侧栏都是无状态组件，展开后才能找到其中的按钮
  if (tree.type === FurnitureFormFields) return [tree, ...nodes(FurnitureFormFields(tree.props as Parameters<typeof FurnitureFormFields>[0]))];
  if (tree.type === CmsSidebar) return [tree, ...nodes(CmsSidebar(tree.props as Parameters<typeof CmsSidebar>[0]))];
  // 页头的主操作、搜索与侧栏都通过插槽传入，也要遍历到
  return [tree, ...nodes(tree.props.children as ReactNode), ...nodes(tree.props.actions as ReactNode), ...nodes(tree.props.search as ReactNode), ...nodes(tree.props.sidebar as ReactNode), ...nodes(tree.props.after as ReactNode)];
}
function render<T>(callback: () => T): T { harness.cursor = 0; harness.alls = 0; return callback(); }
function fresh() { harness.slots = []; harness.cursor = 0; }
beforeEach(() => { fresh(); pagedListFake.reset(); harness.category = '全部'; harness.generate.mockReset().mockResolvedValue('https://example.com/furniture.png'); harness.save.mockReset().mockResolvedValue(true); });
/** 家具管理页：列表接口已返回的自建条目由 pagedListFake.remote 指定。 */
const furniturePage = () => AccountFurnitureLibrary({ ownerKey: 'owner', defaults: {}, saveDefaults: async () => true, onDirty: () => {} });
describe('新建家具默认分类', () => {
  it.each(['卧室', '客厅', '餐厨', '卫浴', '家电', '书房'])('有效分类 %s 原样保留', category => { expect(newFurnitureCategory(category)).toBe(category); });
  it.each(['地面', '墙面', '门窗', '屋面', '吊顶'])('硬装分类 %s 原样保留', category => { expect(newFurnitureCategory(category)).toBe(category); });
  it.each([undefined, '', '全部', '自定义'])('非分类 %s 默认客厅', category => { expect(newFurnitureCategory(category)).toBe('客厅'); });
  it.each(['卧室', '餐厨', '全部', '地面', '墙面'])('家具管理点击新建：弹窗的默认分类跟随当前筛选 %s', category => {
    harness.category = category;
    expect(nodes(render(furniturePage)).some(node => node.type === CustomFurnitureDialog)).toBe(false);
    const click = nodes(render(furniturePage)).find(node => Array.isArray(node.props.children) && node.props.children.includes('新建家具') && typeof node.props.onClick === 'function');
    expect(click).toBeDefined(); (click!.props.onClick as () => void)();
    const dialog = nodes(render(furniturePage)).find(node => node.type === CustomFurnitureDialog)!;
    expect(dialog.props).toMatchObject({ initialCategory: category, accountOnly: true, ownerKey: 'owner' });
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
  it('选择“地面”分类时切换为地面表单，整体浇筑不显示尺寸', () => {
    const props = { open: true, onOpenChange: vi.fn(), loggedIn: true, login: vi.fn(), onCreate: vi.fn(), onImport: vi.fn(), onCreateFloor: vi.fn(), ownerKey: 'owner' };
    const tree = nodes(render(() => CustomFurnitureDialog(props)));
    (tree.find(node => node.props.value === '客厅' && typeof node.props.onValueChange === 'function')!.props.onValueChange as (value: string) => void)('地面');
    expect(nodes(render(() => CustomFurnitureDialog(props))).some(node => node.type === CustomFloorForm)).toBe(true);
    fresh();
    const formProps = { categoryField: null, accountOnly: false, onCancel: vi.fn(), onSave: vi.fn() };
    let form = nodes(render(() => CustomFloorForm(formProps)));
    expect(form.some(node => node.props.id === 'floor-length')).toBe(true);
    (form.find(node => node.props.value === 'tile' && typeof node.props.onValueChange === 'function')!.props.onValueChange as (value: string) => void)('seamless');
    form = nodes(render(() => CustomFloorForm(formProps)));
    expect(form.some(node => node.props.id === 'floor-length')).toBe(false);
  });
  it('选择“墙面”“门窗”“屋面”“吊顶”分类时切换为对应表单', () => {
    const props = { open: true, onOpenChange: vi.fn(), loggedIn: true, login: vi.fn(), onCreate: vi.fn(), onImport: vi.fn(), ownerKey: 'owner', accountOnly: true };
    const pick = (value: string) => { const tree = nodes(render(() => CustomFurnitureDialog(props))); (tree.find(node => node.props.id === undefined && typeof node.props.onValueChange === 'function' && node.props.value !== undefined)!.props.onValueChange as (v: string) => void)(value); return nodes(render(() => CustomFurnitureDialog(props))); };
    expect(pick('墙面').find(node => node.type === CustomColorMaterialForm)?.props.kind).toBe('wall');
    fresh();
    expect(pick('门窗').some(node => node.type === CustomOpeningForm)).toBe(true);
    fresh();
    expect(pick('屋面').find(node => node.type === CustomColorMaterialForm)?.props.kind).toBe('roof');
    fresh();
    expect(pick('吊顶').find(node => node.type === CustomColorMaterialForm)?.props.kind).toBe('ceiling');
  });
  it('账号页导航只保留项目管理与家具管理', () => {
    const projects = { session: { user: { id: 'owner', email: 'test@example.com' } } } as ReturnType<typeof useProjects>;
    const costs = { settings: {}, saving: false } as ReturnType<typeof useAccountCosts>;
    const labels = nodes(render(() => AccountCMS({ projects, costs, opened: () => {}, tab: 'projects', onTab: () => {} }))).filter(node => node.type === 'button' && typeof node.props['aria-label'] === 'string').map(node => node.props['aria-label'] as string);
    expect(labels).toContain('项目管理'); expect(labels).toContain('家具管理'); expect(labels).not.toContain('成本管理');
  });
  it('新建家具或任意材料后，家具管理的列表回到第一页重新读取', () => {
    const listKey = () => { render(furniturePage); return pagedListFake.options!.key; };
    const before = listKey();
    (nodes(render(furniturePage)).find(node => Array.isArray(node.props.children) && node.props.children.includes('新建家具') && typeof node.props.onClick === 'function')!.props.onClick as () => void)();
    const dialog = nodes(render(furniturePage)).find(node => node.type === CustomFurnitureDialog)!;
    for (const key of ['onCreateFloor', 'onCreate', 'onCreateWall', 'onCreateOpening', 'onCreateRoof', 'onCreateCeiling']) {
      const previous = listKey();
      (dialog.props[key] as () => void)();
      expect(listKey()).not.toBe(previous);
    }
    expect(listKey()).not.toBe(before);
  });
  it('家具管理在“墙面”“门窗”筛选下展示自定义墙面与内置门窗', () => {
    harness.category = '墙面';
    const wall = { key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 };
    pagedListFake.remote = { list: [accountItemEntry({ kind: 'wall', item: wall })], total: 1, counts: { 墙面: 1 } };
    const walls = nodes(render(() => furniturePage()));
    expect(walls.some(node => node.type === 'b' && node.props.children === '艺术涂料')).toBe(true);
    fresh(); pagedListFake.reset(); harness.category = '门窗';
    const doors = nodes(render(() => furniturePage()));
    expect(doors.some(node => node.type === 'b' && node.props.children === '门')).toBe(true);
    expect(doors.some(node => node.type === 'b' && node.props.children === '乳胶漆')).toBe(false);
  });
  it('家具管理展示账号地面，并计入“地面”筛选', () => {
    harness.category = '地面';
    const floor = { key: 'custom-11111111-1111-4111-8111-111111111111', name: '混凝土浇筑', pattern: 'seamless' as const, color: '#b8b8b0', price: null };
    pagedListFake.remote = { list: [accountItemEntry({ kind: 'floor', item: floor })], total: 1, counts: { 地面: 1 } };
    const tree = nodes(render(() => furniturePage()));
    expect(tree.some(node => node.type === 'b' && node.props.children === '混凝土浇筑')).toBe(true);
  });
});
