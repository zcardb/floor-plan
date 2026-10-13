import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '@/lib/floor-plan/templates';
import { splitWall } from '@/lib/floor-plan/wall-split';
const state = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => state.confirm }));
import { WallOptionsMenu } from '../components/wall-options-menu';
import type { Design } from '@/lib/floor-plan/types';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
function text(tree: ReactNode): string { if (typeof tree === 'string') return tree; if (Array.isArray(tree)) return tree.map(text).join(''); return isValidElement<{children?: ReactNode}>(tree) ? text(tree.props.children) : ''; }
function fixture(design = blankDesign()) {
  const change = vi.fn(), splitWall = vi.fn(), mergeWall = vi.fn();
  const tree = nodes(WallOptionsMenu({ design, target: { kind: 'wall', id: design.walls[0].id }, change, splitWall, mergeWall }));
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
  it('承重开关一键生效、菜单不关闭且无确认弹窗，原始承重墙也可取消；单段墙不可取消分割', () => {
    const d = blankDesign(), h = fixture(d);
    const keepOpen = { preventDefault: vi.fn() };
    (h.item('标记承重').props.onSelect as (e: unknown) => void)(keepOpen);
    expect(keepOpen.preventDefault).toHaveBeenCalled();
    expect(h.change).toHaveBeenCalledOnce(); expect((h.change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(true);
    d.walls[0].loadBearing = true; const marked = fixture(d);
    expect(marked.item('取消标记承重').props['aria-checked']).toBe(true);
    (marked.item('取消标记承重').props.onSelect as (e: unknown) => void)(keepOpen);
    expect(marked.change).toHaveBeenCalledOnce(); expect((marked.change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(false);
    expect(state.confirm).not.toHaveBeenCalled();
    delete d.walls[0].loadBearing; d.walls[0].kind = 'bearing'; expect(fixture(d).item('取消标记承重').props.disabled).toBeFalsy();
    expect(fixture(blankDesign()).item('取消分割').props.disabled).toBe(true);
  });
  it('替换为 墙 / 垭口 / 分隔线 三选一，当前为「墙」；其余为分割、取消分割、承重开关和删除', () => {
    const d = blankDesign();
    const tree = nodes(WallOptionsMenu({ design: d, target: { kind: 'wall', id: d.walls[0].id }, change: vi.fn(), splitWall: vi.fn(), mergeWall: vi.fn(), removeWall: vi.fn() }));
    expect(tree.filter(n => n.props.onSelect).map(n => n.props['aria-label']))
      .toEqual(['替换为墙', '替换为垭口', '替换为分隔线', '分割墙段', '取消分割', '标记承重', '删除当前墙']);
    expect(tree.find(n => n.props['aria-label'] === '替换为墙')!.props['aria-current']).toBe(true);
  });
  it('承重墙锁定替换（当前项除外）并说明原因', () => {
    const d = blankDesign(); d.walls[0].loadBearing = true;
    const tree = nodes(WallOptionsMenu({ design: d, target: { kind: 'wall', id: d.walls[0].id }, change: vi.fn() }));
    const card = (label: string) => tree.find(n => n.props['aria-label'] === label)!;
    expect(card('替换为垭口').props.disabled).toBe(true);
    expect(card('替换为分隔线').props.disabled).toBe(true);
    expect(card('替换为墙').props.disabled).toBe(false);
    expect(text(tree.find(n => n.props.className === 'wall-options-note')!.props.children as ReactNode)).toContain('请先取消承重标记');
  });
  it('选「垭口」：整面开洞并选中新垭口；选当前项不改动', () => {
    const d = blankDesign(), change = vi.fn(), select = vi.fn();
    const tree = nodes(WallOptionsMenu({ design: d, target: { kind: 'wall', id: d.walls[0].id }, change, select }));
    const card = (label: string) => tree.find(n => n.props['aria-label'] === label)!;
    (card('替换为墙').props.onSelect as () => void)();
    expect(change).not.toHaveBeenCalled();
    (card('替换为垭口').props.onSelect as () => void)();
    const next = (change.mock.calls[0][0] as (d: Design) => Design)(d);
    const passage = next.openings.find(o => o.wallId === d.walls[0].id)!;
    expect(passage.kind).toBe('passage');
    expect(select).toHaveBeenCalledWith({ kind: 'opening', id: passage.id });
  });
  it('房间分隔线也有墙选项：当前为分隔线，只有替换卡片，替换为墙后选中新墙', () => {
    const d = blankDesign();
    d.separators = [{ id: 'sep', a: [d.width / 2, 0], b: [d.width / 2, d.depth] }];
    const change = vi.fn(), select = vi.fn();
    const tree = nodes(WallOptionsMenu({ design: d, target: { kind: 'separator', id: 'sep' }, change, select }));
    expect(tree.filter(n => n.props.onSelect).map(n => n.props['aria-label'])).toEqual(['替换为墙', '替换为垭口', '替换为分隔线']);
    expect(tree.find(n => n.props['aria-label'] === '替换为分隔线')!.props['aria-current']).toBe(true);
    (tree.find(n => n.props['aria-label'] === '替换为墙')!.props.onSelect as () => void)();
    const next = (change.mock.calls[0][0] as (d: Design) => Design)(d);
    expect(next.separators!.some(x => x.id === 'sep')).toBe(false);
    expect(select).toHaveBeenCalledWith({ kind: 'wall', id: expect.any(String) });
  });
  it('门窗（非垭口）没有墙选项', () => {
    const d = blankDesign();
    d.openings = [{ id: 'door', wallId: d.walls[0].id, kind: 'door', offset: 1000, width: 800 }];
    expect(WallOptionsMenu({ design: d, target: { kind: 'opening', id: 'door' }, change: vi.fn() })).toBeNull();
  });
});
