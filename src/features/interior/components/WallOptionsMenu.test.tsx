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
  const item = (label: string) => tree.find(n => n.props.onSelect && n.props['aria-label'] === label)!;
  return { change, splitWall, mergeWall, item };
}
beforeEach(() => state.confirm.mockReset());
describe('独立分割和承重菜单', () => {
  it('分割后同时可分割与取消分割，回调独立且不自动标记', () => {
    const h = fixture(splitWall(blankDesign(), 'outer-0', [300]).design);
    expect(h.item('分割墙段').props.disabled).toBe(false); expect(h.item('取消分割').props.disabled).toBe(false);
    (h.item('取消分割').props.onSelect as () => void)(); expect(h.mergeWall).toHaveBeenCalledWith('outer-0'); expect(h.change).not.toHaveBeenCalled();
  });
  it('标记和取消标记都一键生效且无确认弹窗，原始承重墙也可取消；单段墙不可取消分割', () => {
    const d = blankDesign(), h = fixture(d); (h.item('标记承重').props.onSelect as () => void)();
    expect(h.change).toHaveBeenCalledOnce(); expect((h.change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(true);
    d.walls[0].loadBearing = true; const marked = fixture(d);
    (marked.item('取消标记承重').props.onSelect as () => void)();
    expect(marked.change).toHaveBeenCalledOnce(); expect((marked.change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(false);
    expect(state.confirm).not.toHaveBeenCalled();
    delete d.walls[0].loadBearing; d.walls[0].kind = 'bearing'; expect(fixture(d).item('取消标记承重').props.disabled).toBeFalsy();
    expect(fixture(blankDesign()).item('取消分割').props.disabled).toBe(true);
  });
  it('菜单只保留分割、取消分割、承重切换和删除四个操作', () => {
    const d = blankDesign();
    const labels = nodes(WallOptionsMenu({ design: d, wall: d.walls[0], change: vi.fn(), splitWall: vi.fn(), mergeWall: vi.fn(), removeWall: vi.fn() }))
      .filter(n => n.props.onSelect).map(n => n.props['aria-label']);
    expect(labels).toEqual(['分割墙段', '取消分割', '标记承重', '删除当前墙']);
    expect(text(nodes(WallOptionsMenu({ design: d, wall: d.walls[0], change: vi.fn() })))).not.toContain('拆除');
  });
});
