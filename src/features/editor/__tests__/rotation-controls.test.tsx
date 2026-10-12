import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/floor-plan/templates';
import { createSizeTransaction } from '../model/size-transaction';
import { editSelection } from '../model/selection-edits';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0 }));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original, useEffect: vi.fn(), useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value; }];
  }, useRef: (initial: unknown) => {
    const index = hooks.refIndex++;
    return hooks.refs[index] ?? (hooks.refs[index] = { current: initial });
  } };
});
import { RotationControls } from '../components/rotation-controls';

type Node = ReactElement<{ children?: Node | Node[]; value?: string; onChange?: (event: { target: { value: string } }) => void; onClick?: () => void; onBlur?: () => void; onKeyDown?: (event: { key: string; preventDefault: () => void; stopPropagation: () => void }) => void; 'aria-label'?: string }>;
function nodes(node: Node): Node[] {
  const children = [node.props.children].flat().filter(value => value && typeof value === 'object') as Node[];
  return [node, ...children.flatMap(nodes)];
}
function harness(angle = 0) {
  let design = createProject('reference').state;
  const id = design.furniture[0].id;
  design = editSelection(design, { kind: 'furniture', id }, { rot: angle });
  const history: typeof design[] = [];
  const transaction = createSizeTransaction(() => design, next => { design = next; }, (next, before) => { history.push(before); design = next; });
  const render = () => {
    hooks.stateIndex = 0; hooks.refIndex = 0;
    const tree = RotationControls({ id, value: design.furniture[0].rot, transaction }) as Node;
    const all = nodes(tree);
    return { all, button: all.find(node => node.props['aria-label'] === '旋转 90°')!, input: all.find(node => node.props['aria-label'] === '旋转 / °')! };
  };
  const future: typeof design[] = [];
  const undo = () => { transaction.cancel(); const previous = history.pop(); if (previous) { future.push(design); design = previous; } };
  const redo = () => { transaction.cancel(); const next = future.pop(); if (next) { history.push(design); design = next; } };
  return { render, transaction, history, undo, redo, angle: () => design.furniture[0].rot, external: (angle: number) => { transaction.cancel(); design = editSelection(design, { kind: 'furniture', id }, { rot: angle }); } };
}
beforeEach(() => { hooks.states = []; hooks.refs = []; });
describe('共享 Visual 旋转控件', () => {
  it.each([0, 30, 270])('从 %s° 顺时针加 90°，按钮在输入左侧，打开不改模型', angle => {
    const h = harness(angle), ui = h.render();
    expect(h.angle()).toBe(angle);
    expect(ui.input.props.value).toBe(String(angle));
    expect(ui.all.indexOf(ui.button)).toBeLessThan(ui.all.indexOf(ui.input));
    ui.button.props.onClick!();
    expect(h.angle()).toBe((angle + 90) % 360);
    expect(h.render().input.props.value).toBe(String(h.angle()));
    expect(h.history).toHaveLength(1);
  });
  it('连续四次旋转回到初始角度，逐步撤销重做与输入同步', () => {
    const h = harness(30);
    for (const expected of [120, 210, 300, 30]) {
      h.render().button.props.onClick!();
      expect(h.angle()).toBe(expected);
      expect(h.render().input.props.value).toBe(String(expected));
    }
    for (const expected of [300, 210, 120, 30]) {
      h.undo();
      expect(h.render().input.props.value).toBe(String(expected));
    }
    for (const expected of [120, 210, 300, 30]) {
      h.redo();
      expect(h.render().input.props.value).toBe(String(expected));
    }
  });
  it('手填与按钮旋转分别撤销重做，已取消草稿失焦不覆盖模型', () => {
    const h = harness(0);
    h.render().input.props.onChange!({ target: { value: '45' } });
    h.render().button.props.onClick!();
    h.undo(); expect(h.render().input.props.value).toBe('45');
    h.undo(); expect(h.render().input.props.value).toBe('0');
    h.redo(); expect(h.render().input.props.value).toBe('45');
    h.redo(); expect(h.render().input.props.value).toBe('135');
    h.render().input.props.onChange!({ target: { value: '180' } });
    h.external(270);
    expect(h.render().input.props.value).toBe('270');
    h.render().input.props.onBlur!();
    expect(h.angle()).toBe(270);
  });
  it('即时输入绝对角度，失焦提交，外部修改更新显示', () => {
    const h = harness();
    h.render().input.props.onChange!({ target: { value: '45' } });
    expect(h.angle()).toBe(45); expect(h.history).toHaveLength(0);
    h.render().input.props.onBlur!();
    expect(h.history).toHaveLength(1);
    h.external(120);
    expect(h.render().input.props.value).toBe('120');
  });
  it('输入后点击按钮保留输入编辑，旋转另成一步，旧草稿不会覆盖', () => {
    const h = harness();
    h.render().input.props.onChange!({ target: { value: '45' } });
    h.render().button.props.onClick!();
    expect(h.angle()).toBe(135); expect(h.history).toHaveLength(2);
    expect(h.render().input.props.value).toBe('135');
    h.render().input.props.onBlur!(); expect(h.angle()).toBe(135);
  });
  it('非法草稿取消后从原角度旋转，Escape 恢复', () => {
    const h = harness(30);
    h.render().input.props.onChange!({ target: { value: '45' } });
    h.render().input.props.onChange!({ target: { value: '' } });
    h.render().button.props.onClick!();
    expect(h.angle()).toBe(120); expect(h.history).toHaveLength(1);
    h.render().input.props.onChange!({ target: { value: '180' } });
    h.render().input.props.onKeyDown!({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(h.angle()).toBe(120);
  });
  it.each([[-45, 315], [405, 45]])('手填 %s° 归一化到 %s°', (input, expected) => {
    const h = harness();
    h.render().input.props.onChange!({ target: { value: String(input) } });
    h.render().input.props.onBlur!();
    expect(h.angle()).toBe(expected);
    expect(h.render().input.props.value).toBe(String(expected));
  });
});
