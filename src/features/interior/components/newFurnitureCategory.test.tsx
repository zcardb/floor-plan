import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../model/types';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, category: '全部', generate: vi.fn(), save: vi.fn(), loadFloors: vi.fn(), loadWalls: vi.fn(), loadOpenings: vi.fn(), loadRoofs: vi.fn(), loadCeilings: vi.fn(), loadCatalog: vi.fn() }));
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
  useCallback(callback: unknown) { return callback; },
}));
vi.mock('./useAccountCostCommit', () => ({ useAccountCostCommit: () => ({ settings: {}, busy: false, pending: null, error: '', saved: false }) }));
vi.mock('../cloud/useFurnitureImage', () => ({ useFurnitureImage: () => ({ cancel: () => {}, generate: harness.generate, busy: false }) }));
vi.mock('../cloud/useFloorCatalog', () => ({ useFloorCatalog: () => ({ items: [], loading: false, error: '', load: harness.loadFloors, save: vi.fn() }) }));
vi.mock('../cloud/useWallCatalog', () => ({ useWallCatalog: () => ({ items: [], loading: false, error: '', load: harness.loadWalls, save: vi.fn() }) }));
vi.mock('../cloud/useOpeningCatalog', () => ({ useOpeningCatalog: () => ({ items: [], loading: false, error: '', load: harness.loadOpenings, save: vi.fn() }) }));
vi.mock('../cloud/useSurfaceCatalogs', () => ({ useRoofCatalog: () => ({ items: [], loading: false, error: '', load: harness.loadRoofs, save: vi.fn() }), useCeilingCatalog: () => ({ items: [], loading: false, error: '', load: harness.loadCeilings, save: vi.fn() }) }));
vi.mock('../cloud/useFurnitureCatalog', () => ({ useFurnitureCatalog: () => ({ items: [], count: 0, counts: {}, reset: () => {}, load: harness.loadCatalog, save: harness.save }) }));
import { newFurnitureCategory } from '../model/newFurnitureCategory';
import { AccountFurnitureLibrary } from './AccountFurnitureLibrary';
import { CustomColorMaterialForm } from './CustomColorMaterialForm';
import { CustomOpeningForm } from './CustomOpeningForm';
import { CustomFurnitureDialog } from './CustomFurnitureDialog';
import { CustomFloorForm } from './CustomFloorForm';
import { FurnitureFormFields } from './FurnitureFormFields';
import { AccountCMS } from './AccountCMS';
import type { useFurnitureCatalog } from '../cloud/useFurnitureCatalog';
import type { useProjects } from '../cloud/useProjects';
import type { useAccountCosts } from '../cloud/useAccountCosts';

type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  // 共用的家具表单项是无状态组件，展开后才能找到其中的字段
  if (tree.type === FurnitureFormFields) return [tree, ...nodes(FurnitureFormFields(tree.props as Parameters<typeof FurnitureFormFields>[0]))];
  // 页头的主操作通过 actions 插槽传入，也要遍历到
  return [tree, ...nodes(tree.props.children as ReactNode), ...nodes(tree.props.actions as ReactNode)];
}
function render<T>(callback: () => T): T { harness.cursor = 0; return callback(); }
function fresh() { harness.slots = []; harness.cursor = 0; }
beforeEach(() => { fresh(); harness.category = '全部'; harness.generate.mockReset().mockResolvedValue('https://example.com/furniture.png'); harness.save.mockReset().mockResolvedValue(true); });
const catalog = { items: [], count: 0, counts: {}, loading: false, hasMore: false } as unknown as ReturnType<typeof useFurnitureCatalog>;
describe('新建家具默认分类', () => {
  it.each(['卧室', '客厅', '餐厨', '卫浴', '家电', '书房'])('有效分类 %s 原样保留', category => { expect(newFurnitureCategory(category)).toBe(category); });
  it.each(['地面', '墙面', '门窗', '屋面', '吊顶'])('硬装分类 %s 原样保留', category => { expect(newFurnitureCategory(category)).toBe(category); });
  it.each([undefined, '', '全部', '自定义'])('非分类 %s 默认客厅', category => { expect(newFurnitureCategory(category)).toBe('客厅'); });
  it.each(['卧室', '餐厨', '全部', '地面', '墙面'])('家具管理点击新建传入当前筛选 %s', category => {
    harness.category = category;
    const onNew = vi.fn();
    const furniture = render(() => AccountFurnitureLibrary({ catalog, defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew }));
    const click = nodes(furniture).find(node => Array.isArray(node.props.children) && node.props.children.includes('新建家具') && typeof node.props.onClick === 'function');
    expect(click).toBeDefined(); (click!.props.onClick as () => void)(); expect(onNew).toHaveBeenLastCalledWith(category);
  });
  it.each(['卧室', '全部', '墙面'])('账号父组件将 %s 归一化后传给新建弹窗', category => {
    const projects = { session: { user: { id: 'owner', email: 'test@example.com' } } } as ReturnType<typeof useProjects>;
    const costs = { settings: {}, saving: false } as ReturnType<typeof useAccountCosts>;
    let tab = 'projects';
    const page = () => render(() => AccountCMS({ projects, costs, opened: () => {}, tab, onTab: next => { tab = next; } }));
    const menu = nodes(page()).find(node => node.type === 'button' && node.props['aria-label'] === '家具管理');
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
  it('账号页新建家具或地面后自动刷新对应列表', () => {
    harness.loadFloors.mockReset(); harness.loadCatalog.mockReset(); harness.loadWalls.mockReset(); harness.loadOpenings.mockReset();
    const projects = { session: { user: { id: 'owner', email: 'test@example.com' } } } as ReturnType<typeof useProjects>;
    const costs = { settings: {}, saving: false } as ReturnType<typeof useAccountCosts>;
    let tab = 'projects';
    const page = () => render(() => AccountCMS({ projects, costs, opened: () => {}, tab, onTab: next => { tab = next; } }));
    const menu = nodes(page()).find(node => node.type === 'button' && node.props['aria-label'] === '家具管理');
    (menu!.props.onClick as () => void)();
    const library = nodes(page()).find(node => node.type === AccountFurnitureLibrary)!;
    expect(library.props.floors).toEqual([]);
    (library.props.onNew as (value: string) => void)('地面');
    const dialog = nodes(page()).find(node => node.type === CustomFurnitureDialog)!;
    (dialog.props.onCreateFloor as () => void)();
    expect(harness.loadFloors).toHaveBeenCalledTimes(1);
    (dialog.props.onCreate as () => void)();
    expect(harness.loadCatalog).toHaveBeenCalledTimes(1);
    (dialog.props.onCreateWall as () => void)();
    expect(harness.loadWalls).toHaveBeenCalledTimes(1);
    (dialog.props.onCreateOpening as () => void)();
    expect(harness.loadOpenings).toHaveBeenCalledTimes(1);
  });
  it('家具管理在“墙面”“门窗”筛选下展示自定义墙面与内置门窗', () => {
    harness.category = '墙面';
    const wall = { key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 };
    const walls = nodes(render(() => AccountFurnitureLibrary({ catalog, walls: [wall], defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew: () => {} })));
    expect(walls.some(node => node.type === 'b' && node.props.children === '艺术涂料')).toBe(true);
    fresh(); harness.category = '门窗';
    const doors = nodes(render(() => AccountFurnitureLibrary({ catalog, defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew: () => {} })));
    expect(doors.some(node => node.type === 'b' && node.props.children === '门')).toBe(true);
    expect(doors.some(node => node.type === 'b' && node.props.children === '乳胶漆')).toBe(false);
  });
  it('家具管理展示账号地面，并计入“地面”筛选', () => {
    harness.category = '地面';
    const floor = { key: 'custom-11111111-1111-4111-8111-111111111111', name: '混凝土浇筑', pattern: 'seamless' as const, color: '#b8b8b0', price: null };
    const tree = nodes(render(() => AccountFurnitureLibrary({ catalog, floors: [floor], defaults: {}, saveDefaults: async () => true, onDirty: () => {}, onNew: () => {} })));
    expect(tree.some(node => node.type === 'b' && node.props.children === '混凝土浇筑')).toBe(true);
  });
});
