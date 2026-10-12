import { describe, expect, it } from 'vitest';
import { formatMeters, meterDraft, parseMeterDraft, resolveMeterDraft, sizeDraftToModel, toMeters, toMillimeters } from '../length-units';
import { createSizeTransaction } from '@/features/editor/model/size-transaction';
import { createProject } from '../templates';

describe('米制 UI / 毫米模型边界', () => {
  it('统一显示，保留输入精度', () => {
    expect(formatMeters(1800)).toBe('1.80');
    expect(formatMeters(240)).toBe('0.24');
    expect(formatMeters(1)).toBe('0.00');
    expect(formatMeters(1251)).toBe('1.25');
    expect(formatMeters(1256)).toBe('1.26');
    expect(meterDraft(1234.567)).toBe('1.23');
    expect(meterDraft(2594.82568359375)).toBe('2.59');
    expect(meterDraft(50)).toBe('0.05');
    expect(toMeters(50)).toBe(0.05);
    expect(toMillimeters(2.4)).toBe(2400);
    expect(parseMeterDraft('1.235')).toBe(1240);
    expect(parseMeterDraft('1.234')).toBe(1230);
    expect(parseMeterDraft('-0.01')).toBe(-10);
    expect(parseMeterDraft('-0.004')).toBe(0);
    expect(parseMeterDraft('')).toBeNaN();
    expect(parseMeterDraft('bad')).toBeNaN();
  });
  it('未改动的两位草稿保留模型原值', () => {
    expect(resolveMeterDraft('2.59', 2594.8)).toBe(2594.8);
    expect(resolveMeterDraft('2.60', 2594.8)).toBe(2600);
  });
  it('往返编辑不重复换算，不换算旋转', () => {
    const values=sizeDraftToModel({w:'1.8',d:'0.8',cx:'-0.5',rot:'90'});
    expect(values).toEqual({w:'1800',d:'800',cx:'-500',rot:'90'});
    expect(parseMeterDraft(meterDraft(Number(values.w)))).toBe(1800);
    expect(sizeDraftToModel({w:''})).toEqual({w:''});
  });
  it('米制尺寸进入原事务，预览后取消仍恢复毫米旧值', () => {
    let design=createProject('reference').state;
    const furniture=design.furniture[0];
    const before=design;
    let commits=0;
    const transaction=createSizeTransaction(()=>design,next=>{design=next;},next=>{design=next;commits++;});
    const token=transaction.begin({kind:'furniture',id:furniture.id});
    transaction.update(token,sizeDraftToModel({w:'2.4',rot:'90'}));
    expect(design.furniture[0].w).toBe(2400);
    expect(design.furniture[0].rot).toBe(90);
    transaction.cancel(token);
    expect(design).toBe(before);
    const next=transaction.begin({kind:'furniture',id:furniture.id});
    transaction.update(next,sizeDraftToModel({w:'0.05'}));
    expect(transaction.apply(next)).toBe(true);
    expect(design.furniture[0].w).toBe(50);
    expect(commits).toBe(1);
  });
});
