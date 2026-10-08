import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import { createSizeTransaction } from '../model/sizeTransaction';
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => [initial, vi.fn()], useRef: (initial: unknown) => ({ current: initial }), useContext: () => ({}), useEffect: vi.fn(), useImperativeHandle: vi.fn() }));
vi.mock('./CostDefaultsContext', async original => ({ ...await original<typeof import('./CostDefaultsContext')>(), useCostDesign: (d: unknown) => d }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }));
import { SelectionEditor } from './SelectionEditor';
import { PropertyPanel } from './PropertyPanel';
import { WallOptionsMenu } from './WallOptionsMenu';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
function text(tree: ReactNode): string { if (typeof tree === 'string' || typeof tree === 'number') return String(tree); if (Array.isArray(tree)) return tree.map(text).join(''); return isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : ''; }
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
        const button = nodes(content).find(n => n.props.onSelect && text(n.props.children as ReactNode) === '分割墙段')!;
        expect(button.props.disabled).toBe(demolished);
        if (!demolished) (button.props.onSelect as () => void)();
      }
      expect(splitWall).toHaveBeenCalledTimes(demolished ? 0 : 2);
      if (!demolished) expect(splitWall).toHaveBeenCalledWith('outer-0');
    }
  });
});
