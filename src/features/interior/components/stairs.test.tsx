import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { library } from '../data/catalog';
import { blankDesign } from '../data/templates';
import { validateDesign } from '../model/validation';
import { createSizeTransaction } from '../model/sizeTransaction';
import { FurnitureShape } from './FurnitureShape';
import { SizeFields } from './SizeFields';
import { sizeDraftToModel } from '../model/lengthUnits';
import type { Design } from '../model/types';

const stairs = library.find(item => item.name === '楼梯')!;
describe('普通楼梯家具', () => {
  it('内置楼梯使用普通长宽字段，轮廓与固定踏步随尺寸缩放', () => {
    expect(stairs).toMatchObject({type:'stairs',w:1000,d:3000});
    const markup = renderToStaticMarkup(<svg><FurnitureShape f={stairs}/></svg>);
    expect(markup).toContain('width="1000"');
    expect(markup).toContain('height="3000"');
    expect(markup.match(/<line /g)).toHaveLength(11);
    expect(renderToStaticMarkup(<svg><FurnitureShape f={{...stairs,w:1200,d:4000}}/></svg>)).toContain('height="4000"');
  });
  it('尺寸编辑显示长宽、米制输入，并通过普通事务提交和取消', () => {
    let current: Design = {...blankDesign(),furniture:[{...stairs,id:'stairs',cx:2000,cy:2000,rot:0}]};
    const original = current;
    let commits = 0;
    const transaction = createSizeTransaction(()=>current,next=>{current=next;},next=>{current=next;commits++;});
    const selection = {kind:'furniture' as const,id:'stairs'};
    const markup = renderToStaticMarkup(<SizeFields design={current} selection={selection} transaction={transaction}/>);
    expect(markup).toContain('长 / m');
    expect(markup).toContain('value="3"');
    let token = transaction.begin(selection);
    transaction.update(token,sizeDraftToModel({w:'1.2',d:'4'}));
    expect(current.furniture[0]).toMatchObject({w:1200,d:4000});
    transaction.cancel(token);
    expect(current).toBe(original);
    token = transaction.begin(selection);
    transaction.update(token,sizeDraftToModel({w:'1.2',d:'4'}));
    transaction.apply(token);
    expect(commits).toBe(1);
    expect(validateDesign(JSON.parse(JSON.stringify(current))).furniture[0]).toMatchObject({type:'stairs',w:1200,d:4000});
  });
  it('长宽边界沿用家具校验，拒绝空值和超范围输入', () => {
    let current: Design = {...blankDesign(),furniture:[{...stairs,id:'stairs',cx:2000,cy:2000,rot:0}]};
    const transaction = createSizeTransaction(()=>current,next=>{current=next;},()=>{});
    const token = transaction.begin({kind:'furniture',id:'stairs'});
    transaction.update(token,{w:'50',d:'20000'});
    expect(current.furniture[0]).toMatchObject({w:50,d:20000});
    for(const d of ['', '49','20001','NaN']) expect(()=>transaction.update(token,{d})).toThrow();
  });
});
