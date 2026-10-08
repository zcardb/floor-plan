import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import { splitWall } from '../model/wallSplit';
const state = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => state.confirm }));
import { WallOptionsMenu } from './WallOptionsMenu';
import type { Design } from '../model/types';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
function text(tree: ReactNode): string { if (typeof tree === 'string') return tree; if (Array.isArray(tree)) return tree.map(text).join(''); return isValidElement<{children?: ReactNode}>(tree) ? text(tree.props.children) : ''; }
function fixture(design = blankDesign()) {
  const change = vi.fn(), splitWall = vi.fn(), mergeWall = vi.fn();
  const tree = nodes(WallOptionsMenu({ design, wall: design.walls[0], change, splitWall, mergeWall }));
  const item = (label: string) => tree.find(n => n.props.onSelect && text(n.props.children as ReactNode) === label)!;
  return { change, splitWall, mergeWall, item };
}
beforeEach(() => state.confirm.mockReset());
describe('独立分割和承重菜单', () => {
  it('分割后同时可分割与取消分割，回调独立且不自动标记', () => {
    const h = fixture(splitWall(blankDesign(), 'outer-0', [300]).design);
    expect(h.item('分割墙段').props.disabled).toBe(false); expect(h.item('取消分割').props.disabled).toBe(false);
    (h.item('取消分割').props.onSelect as () => void)(); expect(h.mergeWall).toHaveBeenCalledWith('outer-0'); expect(h.change).not.toHaveBeenCalled();
  });
  it('普通墙标记、用户标记取消确认，原始承重及已拆禁用', async () => {
    const d = blankDesign(), h = fixture(d); (h.item('标记承重').props.onSelect as () => void)();
    expect(h.change).toHaveBeenCalledOnce(); expect((h.change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(true);
    d.walls[0].loadBearing = true; const marked = fixture(d); state.confirm.mockResolvedValue(false);
    (marked.item('取消标记承重').props.onSelect as () => void)(); await Promise.resolve(); expect(marked.change).not.toHaveBeenCalled();
    state.confirm.mockResolvedValue(true); (marked.item('取消标记承重').props.onSelect as () => void)(); await Promise.resolve(); expect(marked.change).toHaveBeenCalledOnce();
    d.walls[0].kind = 'bearing'; expect(fixture(d).item('取消标记承重').props.disabled).toBe(true);
    d.demolished = ['outer-0']; expect(fixture(d).item('分割墙段').props.disabled).toBe(true); expect(fixture(d).item('取消分割').props.disabled).toBe(true);
  });
});
