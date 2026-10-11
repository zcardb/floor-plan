import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { createSizeTransaction } from '../model/sizeTransaction';
import type { Design, Wall } from '../model/types';
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => [initial, vi.fn()], useRef: (initial: unknown) => ({ current: initial }), useContext: () => ({}), useEffect: vi.fn(), useImperativeHandle: vi.fn() }));
vi.mock('./CostDefaultsContext', async original => ({ ...await original<typeof import('./CostDefaultsContext')>(), useCostDesign: (d: unknown) => d }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }));
import { SelectionEditor } from './SelectionEditor';
import { WallOptionsMenu } from './WallOptionsMenu';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
function text(tree: ReactNode): string { if (typeof tree === 'string' || typeof tree === 'number') return String(tree); if (Array.isArray(tree)) return tree.map(text).join(''); return isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : ''; }

const drawn: Wall = { id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 200 };
const visual = SelectionEditor as unknown as { render: (p: React.ComponentProps<typeof SelectionEditor>, ref: null) => ReactElement };
/** 渲染浮动工具条里的墙选项菜单，返回菜单内容与本次 change/spy。 */
function wallMenu(design: Design, wallId: string, removeWall?: (id: string) => void) {
  const noop = vi.fn();
  const tree = visual.render({
    design, selection: { kind: 'wall', id: wallId }, change: noop, rotate: noop, duplicate: noop, remove: noop,
    showCosts: false, transaction: createSizeTransaction(() => design, noop, noop),
    splitWall: noop, mergeWall: noop, removeWall, stage: { current: null }, hidden: false, close: noop, costs: noop,
  }, null);
  const menu = nodes(tree).find(n => n.type === WallOptionsMenu)!;
  const content = WallOptionsMenu(menu.props as React.ComponentProps<typeof WallOptionsMenu>);
  const entry = (label: string) => nodes(content).find(n => n.props['aria-label'] === label);
  return { entry, noop };
}

describe('浮动工具条分割按钮', () => {
  it('允许原始承重墙分割', () => {
    const d = blankDesign(); d.walls[0].kind = 'bearing';
    const splitWall = vi.fn(), noop = vi.fn();
    const props = { design: d, selection: { kind: 'wall' as const, id: 'outer-0' }, change: noop, rotate: noop, duplicate: noop, remove: noop, showCosts: false, transaction: createSizeTransaction(() => d, noop, noop), splitWall };
    const trees = [visual.render({ ...props, stage: { current: null }, hidden: false, close: noop, costs: noop }, null)];
    for (const tree of trees) {
      const menu = nodes(tree).find(n => n.type === WallOptionsMenu)!;
      expect(menu).toBeDefined();
      const content = WallOptionsMenu(menu.props as React.ComponentProps<typeof WallOptionsMenu>);
      const button = nodes(content).find(n => n.props.onSelect && n.props['aria-label'] === '分割墙段')!;
      expect(button.props.disabled).toBe(false);
      (button.props.onSelect as () => void)();
    }
    expect(splitWall).toHaveBeenCalledTimes(1);
    expect(splitWall).toHaveBeenCalledWith('outer-0');
  });
});

describe('墙选项菜单的删除入口', () => {
  const withDrawn = () => ({ ...blankDesign(), walls: [...blankDesign().walls, drawn] });
  it('自绘隔墙可删除整面墙，并调用外部删除实现', () => {
    const d = withDrawn(), removeWall = vi.fn();
    const { entry } = wallMenu(d, drawn.id, removeWall);
    const remove = entry('删除当前墙')!;
    expect(remove.props.disabled).toBe(false);
    expect(text(remove.props.children as ReactNode)).toContain('删除这面墙及墙上门窗');
    (remove.props.onSelect as () => void)();
    expect(removeWall).toHaveBeenCalledWith(drawn.id);
  });
  it('参考户型的隔墙、外墙与空白户型外围墙都可删除，没有拆除入口', () => {
    const reference = referenceDesign();
    const cases: [Design, string][] = [[reference, reference.walls.find(w => w.kind === 'partition')!.id], [reference, reference.walls.find(w => w.kind === 'exterior')!.id], [withDrawn(), 'outer-0']];
    for (const [design, id] of cases) {
      const { entry } = wallMenu(design, id, vi.fn());
      expect(entry('删除当前墙')!.props.disabled).toBe(false);
      expect(entry('标记拆除当前墙')).toBeUndefined();
    }
  });
  it('承重墙删除禁用并提示先取消承重，取消入口可用', () => {
    const d = blankDesign(); d.walls[0].kind = 'bearing';
    const { entry } = wallMenu(d, d.walls[0].id, vi.fn());
    const remove = entry('删除当前墙')!;
    expect(remove.props.disabled).toBe(true);
    expect(text(remove.props.children as ReactNode)).toContain('请先取消承重标记');
    expect(entry('取消标记承重')!.props.disabled).toBeFalsy();
  });
});
