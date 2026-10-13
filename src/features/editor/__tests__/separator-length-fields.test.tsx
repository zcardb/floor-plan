import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '@/lib/floor-plan/templates';
import { createSizeTransaction } from '../model/size-transaction';
import type { Design } from '@/lib/floor-plan/types';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0 }));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original, useEffect: vi.fn(), useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value; }];
  }, useRef: (initial: unknown) => {
    const index = hooks.refIndex++;
    return hooks.refs[index] ?? (hooks.refs[index] = { current: initial });
  } };
});
import { SeparatorLengthFields } from '../components/separator-length-fields';

type Node = ReactElement<{ children?: Node | Node[]; value?: string; onChange?: (event: { target: { value: string } }) => void; onClick?: () => void; onBlur?: () => void; 'aria-label'?: string; 'aria-pressed'?: boolean }>;
const nodes = (node: Node): Node[] => [node, ...([node.props.children].flat().filter(v => v && typeof v === 'object') as Node[]).flatMap(nodes)];

function harness() {
  // 横向分隔线：左端贴着左外墙，右端悬空。
  let design: Design = { ...blankDesign(), separators: [{ id: 's', a: [0, 3000], b: [3000, 3000] }] };
  const history: Design[] = [];
  const transaction = createSizeTransaction(() => design, next => { design = next; }, (next, before) => { history.push(before); design = next; });
  const render = () => {
    hooks.stateIndex = 0; hooks.refIndex = 0;
    const all = nodes(SeparatorLengthFields({ design, separator: design.separators![0]!, transaction }) as Node);
    return {
      input: all.find(n => n.props['aria-label'] === '分隔线长度 / m')!,
      ends: all.filter(n => n.props['aria-pressed'] !== undefined),
    };
  };
  return { render, history, line: () => design.separators![0]! };
}

beforeEach(() => { hooks.states = []; hooks.refs = []; });
describe('分隔线长度面板', () => {
  it('默认固定贴墙的左端；输入即预览，失焦合并成一步撤销', () => {
    const h = harness();
    const view = h.render();
    expect(view.ends.map(n => [n.props.children, n.props['aria-pressed']])).toEqual([['左端', true], ['右端', false]]);
    view.input.props.onChange!({ target: { value: '2.5' } });
    expect(h.line().a).toEqual([0, 3000]);
    expect(h.line().b).toEqual([2500, 3000]);
    expect(h.history).toHaveLength(0);
    h.render().input.props.onBlur!();
    expect(h.history).toHaveLength(1);
  });

  it('切到固定右端后，左端伸缩', () => {
    const h = harness();
    h.render().ends[1]!.props.onClick!();
    h.render().input.props.onChange!({ target: { value: '1' } });
    expect(h.line().a).toEqual([2000, 3000]);
    expect(h.line().b).toEqual([3000, 3000]);
  });

  it('太短的输入报错，失焦后回滚且不入撤销栈', () => {
    const h = harness();
    h.render().input.props.onChange!({ target: { value: '0' } });
    expect(hooks.states).toContain('分隔线太短');
    h.render().input.props.onBlur!();
    expect(h.line().b).toEqual([3000, 3000]);
    expect(h.history).toHaveLength(0);
  });
});
