import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
const state = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => state.confirm }));
import { WallBearingControls } from './WallBearingControls';
import { setWallBearing } from '../model/wallPolicy';
import type { Design } from '../model/types';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
function button(design: Design, change: (fn: (d: Design) => Design) => void, id = 'outer-0') { return nodes(WallBearingControls({ design, wall: design.walls.find(w => w.id === id)!, change })).find(n => n.props.onClick); }
beforeEach(() => state.confirm.mockReset());
describe('墙体承重属性共用控件', () => {
  it('普通墙立即标记，无取消确认，原始墙没有操作按钮', () => {
    const d = blankDesign(), change = vi.fn();
    (button(d, change)!.props.onClick as () => void)();
    expect(change).toHaveBeenCalledOnce();
    expect((change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(true);
    expect(state.confirm).not.toHaveBeenCalled();
    const demo = referenceDesign(); expect(button(demo, change, demo.walls.find(w => w.kind === 'bearing')!.id)).toBeUndefined();
  });
  it('取消确认拒绝不提交，同意后取消标记', async () => {
    const d = setWallBearing(blankDesign(), 'outer-0', true), change = vi.fn();
    state.confirm.mockResolvedValue(false); (button(d, change)!.props.onClick as () => void)(); await Promise.resolve(); expect(change).not.toHaveBeenCalled();
    state.confirm.mockResolvedValue(true); (button(d, change)!.props.onClick as () => void)(); await Promise.resolve();
    expect(change).toHaveBeenCalledOnce(); expect((change.mock.calls[0][0] as (d: Design) => Design)(d).walls[0].loadBearing).toBe(false);
  });
  it('已拆墙按钮禁用', () => {
    const d = blankDesign(); d.walls.push({ id: 'p', kind: 'partition', a: [1000, 0], b: [1000, 6000], thickness: 240 }); d.demolished = ['p'];
    expect(button(d, vi.fn(), 'p')!.props.disabled).toBe(true);
  });
});
