import { it, expect } from "vitest";
import { placeEditor, selectionPoints, localWallPoint } from "./selectionAnchor";
import { blankDesign } from "../data/templates";
import { editSelection } from "./selectionEdits";
it('同墙门窗使用自身范围，门含开启弧',()=>{const d=blankDesign();d.walls=[{id:'w',a:[0,0],b:[10000,0],thickness:200,kind:'partition'}];d.openings=[{id:'a',wallId:'w',kind:'door',width:900,offset:2000},{id:'b',wallId:'w',kind:'window',width:1200,offset:7000}];const a=selectionPoints(d,{kind:'opening',id:'a'}),b=selectionPoints(d,{kind:'opening',id:'b'});expect(Math.min(...a.map(p=>p[0]))).toBe(1550);expect(Math.min(...a.map(p=>p[1]))).toBe(-900);expect(Math.max(...b.map(p=>p[0]))).toBe(7600);expect(localWallPoint(d,'w',0.2)).toEqual([2000,0]);});
it('门窗移动后自身锚点随沿墙位置更新',()=>{const d=blankDesign();d.walls=[{id:'w',a:[0,0],b:[10000,0],thickness:200,kind:'partition'}];for(const kind of ['door','window'] as const){d.openings=[{id:'o',wallId:'w',kind,width:900,offset:2000}];const selection={kind:'opening' as const,id:'o'};const before=selectionPoints(d,selection);const after=selectionPoints(editSelection(d,selection,{offset:3000}),selection);after.forEach((point,index)=>{expect(point[0]-before[index][0]).toBeCloseTo(1000);expect(point[1]).toBe(before[index][1]);});}});
it('局部锚点靠近点击位置而非长墙底端',()=>{const p=placeEditor({left:0,top:0,right:800,bottom:600,local:{x:100,y:100}},{width:800,height:600},{width:200,height:40})!;expect(p.y).toBeLessThan(200);});
it("跟随A/B的位置而非固定坐标", () => {
  const a = placeEditor(
      { left: 10, top: 80, right: 60, bottom: 120 },
      { width: 800, height: 600 },
      { width: 300, height: 50 },
    )!,
    b = placeEditor(
      { left: 350, top: 180, right: 400, bottom: 220 },
      { width: 800, height: 600 },
      { width: 300, height: 50 },
    )!;
  expect(a.x).not.toBe(b.x);
  expect(a.y).not.toBe(b.y);
});
it("靠近边界翻转且保持在画布内，离屏隐藏", () => {
  const p = placeEditor(
    { left: 340, top: 700, right: 385, bottom: 760 },
    { width: 390, height: 844 },
    { width: 370, height: 80 },
  )!;
  expect(p.x).toBeGreaterThanOrEqual(10);
  expect(p.x + 370).toBeLessThanOrEqual(380);
  expect(p.y + 80).toBeLessThanOrEqual(834);
  expect(
    placeEditor(
      { left: 500, top: 10, right: 600, bottom: 100 },
      { width: 390, height: 844 },
      { width: 300, height: 50 },
    ),
  ).toBeNull();
});
it("旋转家具角点更新，参考墙禁止几何调整", () => {
  const d = blankDesign();
  d.furniture.push({
    id: "f",
    type: "table",
    name: "桌",
    w: 1000,
    d: 500,
    cx: 1000,
    cy: 1000,
    rot: 90,
    color: "#ffffff",
  });
  const points = selectionPoints(d, { kind: "furniture", id: "f" });
  expect(
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])),
  ).toBeCloseTo(500);
  expect(() =>
    editSelection(d, { kind: "wall", id: "outer-0" }, { length: 1000 }),
  ).toThrow();
  expect(() =>
    editSelection(d, { kind: "furniture", id: "f" }, { w: -2 }),
  ).toThrow();
});
