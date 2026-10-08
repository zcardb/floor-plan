import { Children, isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingExportItems } from './DrawingExportItems';

describe('工程下载格式入口',()=>{
  it('两个格式分别调用DXF与SVG，不改变PNG行为',()=>{
    const onExport=vi.fn(),tree=DrawingExportItems({onExport});
    const items=Children.toArray(tree.props.children).filter(isValidElement) as ReactElement<{onClick:()=>void;disabled?:boolean}>[];
    expect(items).toHaveLength(2);items[0].props.onClick();items[1].props.onClick();
    expect(onExport.mock.calls).toEqual([['dxf'],['svg']]);
  });
  it('3D视图的格式入口禁用',()=>{
    const tree=DrawingExportItems({disabled:true,onExport:vi.fn()});
    const items=Children.toArray(tree.props.children).filter(isValidElement) as ReactElement<{disabled:boolean}>[];
    expect(items.every(item=>item.props.disabled)).toBe(true);
  });
});
