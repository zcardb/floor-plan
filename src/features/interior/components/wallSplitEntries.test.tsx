import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { createSizeTransaction } from '../model/sizeTransaction';
import type { Design, Wall } from '../model/types';
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => [initial, vi.fn()], useRef: (initial: unknown) => ({ current: initial }), useContext: () => ({}), useEffect: vi.fn(), useImperativeHandle: vi.fn() }));
vi.mock('./CostDefaultsContext', async original => ({ ...await original<typeof import('./CostDefaultsContext')>(), useCostDesign: (d: unknown) => d }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }));
import { SelectionEditor } from './SelectionEditor';
import { PropertyPanel } from './PropertyPanel';
import { WallOptionsMenu } from './WallOptionsMenu';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
function text(tree: ReactNode): string { if (typeof tree === 'string' || typeof tree === 'number') return String(tree); if (Array.isArray(tree)) return tree.map(text).join(''); return isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : ''; }

const drawn: Wall = { id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 200 };
/** 渲染属性面板里的墙选项菜单，返回菜单内容与本次 change/spy。 */
function wallMenu(design: Design, wallId: string, removeWall?: (id: string) => void) {
  const noop = vi.fn();
  const tree = PropertyPanel({
    design, selection: { kind: 'wall', id: wallId }, change: noop, rotate: noop, duplicate: noop, remove: noop,
    select: noop, openCosts: noop, showCosts: false, transaction: createSizeTransaction(() => design, noop, noop),
    splitWall: noop, mergeWall: noop, removeWall,
  });
  const menu = nodes(tree).find(n => n.type === WallOptionsMenu)!;
  const content = WallOptionsMenu(menu.props as React.ComponentProps<typeof WallOptionsMenu>);
  const entry = (label: string) => nodes(content).find(n => n.props['aria-label'] === label);
  return { entry, noop };
}

describe('墙属性和浮动工具条分割按钮', () => {
  it('两处都允许原始承重墙分割，但已拆墙禁用', () => {
    for (const demolished of [false, true]) {
      const d = blankDesign(); d.walls[0].kind = 'bearing'; if (demolished) d.demolished = ['outer-0'];
      const splitWall = vi.fn(), noop = vi.fn();
      const props = { design: d, selection: { kind: 'wall' as const, id: 'outer-0' }, change: noop, rotate: noop, duplicate: noop, remove: noop, showCosts: false, transaction: createSizeTransaction(() => d, noop, noop), splitWall };
      const visual = SelectionEditor as unknown as { render: (p: React.ComponentProps<typeof SelectionEditor>, ref: null) => ReactElement };
      const trees = [PropertyPanel({ ...props, select: noop, openCosts: noop }), visual.render({ ...props, stage: { current: null }, hidden: false, close: noop, details: noop, costs: noop }, null)];
      for (const tree of trees) {
        const menu = nodes(tree).find(n => n.type === WallOptionsMenu)!;
        expect(menu).toBeDefined();
        const content = WallOptionsMenu(menu.props as React.ComponentProps<typeof WallOptionsMenu>);
        const button = nodes(content).find(n => n.props.onSelect && n.props['aria-label'] === '分割墙段')!;
        expect(button.props.disabled).toBe(demolished);
        if (!demolished) (button.props.onSelect as () => void)();
      }
      expect(splitWall).toHaveBeenCalledTimes(demolished ? 0 : 2);
      if (!demolished) expect(splitWall).toHaveBeenCalledWith('outer-0');
    }
  });
});

describe('墙选项菜单的删除入口', () => {
  const withDrawn = () => ({ ...blankDesign(), walls: [...blankDesign().walls, drawn] });
  it('自绘隔墙可删除整面墙，并调用外部删除实现', () => {
    const d = withDrawn(), removeWall = vi.fn();
    const { entry } = wallMenu(d, drawn.id, removeWall);
    const remove = entry('删除当前墙')!;
    expect(remove.props.disabled).toBe(false);
    expect(text(remove.props.children as ReactNode)).toContain('删除这面隔墙及墙上门窗');
    (remove.props.onSelect as () => void)();
    expect(removeWall).toHaveBeenCalledWith(drawn.id);
  });
  it('非承重墙可在菜单里标记拆除与撤销拆除', () => {
    const { entry, noop } = wallMenu(withDrawn(), drawn.id);
    const mark = entry('标记拆除当前墙')!;
    expect(mark.props.disabled).toBe(false);
    (mark.props.onSelect as () => void)();
    expect(noop.mock.calls[0][0](withDrawn()).demolished).toEqual([drawn.id]);
    const undone = wallMenu({ ...withDrawn(), demolished: [drawn.id] }, drawn.id).entry('撤销拆除当前墙')!;
    expect(undone.props.disabled).toBe(false);
  });
  it('承重墙两个入口都禁用并说明原因', () => {
    const d = blankDesign(); d.walls[0].kind = 'bearing';
    const { entry } = wallMenu(d, d.walls[0].id);
    const remove = entry('删除当前墙')!, mark = entry('标记拆除当前墙')!;
    expect(remove.props.disabled).toBe(true); expect(mark.props.disabled).toBe(true);
    expect(text(remove.props.children as ReactNode)).toContain('承重墙不可删除');
    expect(text(mark.props.children as ReactNode)).toContain('承重墙与建筑外墙不可拆除');
  });
  it('参考户型的原始墙体只能标记拆除，已拆墙需先撤销再删除', () => {
    const reference = referenceDesign(), partition = reference.walls.find(w => w.kind === 'partition')!;
    const referenceMenu = wallMenu(reference, partition.id, vi.fn());
    expect(referenceMenu.entry('删除当前墙')!.props.disabled).toBe(true);
    expect(text(referenceMenu.entry('删除当前墙')!.props.children as ReactNode)).toContain('参考户型原始墙体不可删除');
    expect(referenceMenu.entry('标记拆除当前墙')!.props.disabled).toBe(false);
    const demolishedMenu = wallMenu({ ...withDrawn(), demolished: [drawn.id] }, drawn.id, vi.fn());
    expect(demolishedMenu.entry('删除当前墙')!.props.disabled).toBe(true);
    expect(text(demolishedMenu.entry('删除当前墙')!.props.children as ReactNode)).toContain('请先撤销拆除');
    expect(demolishedMenu.entry('标记拆除当前墙')).toBeUndefined();
  });
});
