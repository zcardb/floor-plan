import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ setOpen: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [initial === false ? true : initial, state.setOpen],
}));
import { ColorPicker } from './ColorPicker';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { PopoverContent } from '@/components/ui/popover';
import { FURNITURE_COLORS } from '../data/palette';

type Node = ReactElement<Record<string, unknown>>;
const nodes = (tree: ReactNode): Node[] => {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
};
const render = (props: Partial<Parameters<typeof ColorPicker>[0]> = {}) => {
  const onChange = vi.fn();
  const tree = nodes(ColorPicker({ label: '模型颜色', value: '#efe6d8', onChange, ...props }));
  return { tree, onChange };
};
const panelOf = (tree: Node[]) => nodes(tree.find(n => n.type === PopoverContent)!.props.children as ReactNode);

describe('统一颜色选择 ColorPicker', () => {
  it('点常用色只提交一次并收起弹层', () => {
    state.setOpen.mockClear();
    const { tree, onChange } = render();
    const swatches = panelOf(tree).filter(n => n.type === 'button');
    expect(swatches).toHaveLength(FURNITURE_COLORS.length);
    expect(swatches.find(n => n.props['aria-pressed'])!.props.className).toBe('selected');
    (swatches[2]!.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(FURNITURE_COLORS[2]);
    expect(state.setOpen).toHaveBeenCalledWith(false);
  });
  it('两种触发器（工具条色块 / 表单字段）打开同一个弹层', () => {
    const field = render(), swatch = render({ variant: 'swatch' });
    const panel = (tree: Node[]) => panelOf(tree).map(n => (typeof n.type === 'string' ? n.type : (n.type as { name?: string }).name));
    expect(panel(swatch.tree)).toEqual(panel(field.tree));
    expect(swatch.tree.some(n => n.props.className === 'color-picker-swatch')).toBe(true);
    expect(swatch.tree.some(n => n.type === EditorTooltip)).toBe(true);
    expect(field.tree.some(n => n.props.className === 'color-picker-field')).toBe(true);
    expect(field.tree.some(n => n.props.className === 'color-picker-swatch')).toBe(false);
  });
  it('弹层底部是自定义取色，按当前色初始化', () => {
    const { tree } = render({ value: '#123456' });
    const custom = panelOf(tree).find(n => typeof n.type === 'function' && n.props.label === '模型颜色')!;
    expect(custom.props.value).toBe('#123456');
  });
});
