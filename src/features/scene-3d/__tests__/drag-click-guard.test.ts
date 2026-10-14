import { describe, expect, it } from "vitest";
import { guardDragClick } from "../model/drag-click-guard";

/** Node 自带 EventTarget，无需 DOM 环境：用它模拟预览容器上的指针事件。 */
const at = (type: string, x = 0, y = 0) => Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y });

function setup() {
  const el = new EventTarget();
  const unguard = guardDragClick(el as unknown as HTMLElement);
  /** 按下 → 移动 dx → 抬起后的 click；返回 click 是否被吞掉（阻止冒泡到外层候选按钮）。 */
  const gesture = (dx: number) => {
    el.dispatchEvent(at("pointerdown", 10, 10));
    el.dispatchEvent(at("pointermove", 10 + dx, 10));
    const click = at("click");
    let stopped = false;
    click.stopPropagation = () => { stopped = true; };
    el.dispatchEvent(click);
    return { stopped, prevented: click.defaultPrevented };
  };
  return { unguard, gesture };
}

describe("3D 小卡片：拖动旋转与单击选中", () => {
  it("单击（几乎没移动）照常传到外层", () => {
    expect(setup().gesture(2)).toEqual({ stopped: false, prevented: false });
  });
  it("拖动之后的 click 被吞掉，不触发外层选中；下一次单击恢复", () => {
    const { gesture } = setup();
    expect(gesture(30)).toEqual({ stopped: true, prevented: true });
    expect(gesture(0)).toEqual({ stopped: false, prevented: false });
  });
  it("解绑后不再拦截", () => {
    const { unguard, gesture } = setup();
    unguard();
    expect(gesture(30)).toEqual({ stopped: false, prevented: false });
  });
});
