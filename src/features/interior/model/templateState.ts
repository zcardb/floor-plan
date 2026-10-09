import { blankDesign, designForTemplate, isAiDesign } from "../data/templates";
import type { Design, Furniture, Room } from "./types";

/** 家具 id 由 uid() 生成，同一个模版每次实例化都不同，比较前先剔除。 */
const withoutId = (f: Furniture) => {
  const copy: Record<string, unknown> = { ...f };
  delete copy.id;
  return copy;
};

/** 房间 id 同理（空白户型的房间 id 也是 uid()），比较时按名称/边界/材质对齐。 */
const roomWithoutId = (r: Room) => {
  const copy: Record<string, unknown> = { ...r };
  delete copy.id;
  return copy;
};

/**
 * 模版指纹：只看「方案内容」（墙体、门窗、房间、材质、家具与位置、拆改标记）。
 * 与内容无关的编辑器状态不参与比较：
 * - structureUnlocked：复制/新建时写入的解锁标记，不改变内容；
 * - dimensionSettings：尺寸标注是否显示，属于视图偏好。
 */
const fingerprint = (design: Design): string =>
  JSON.stringify({
    ...design,
    structureUnlocked: undefined,
    dimensionSettings: undefined,
    rooms: design.rooms.map(roomWithoutId),
    furniture: design.furniture
      .map(withoutId)
      .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
  });

const pristine = new Map<string, string>();
const templateFingerprint = (template: string) => {
  const cached = pristine.get(template);
  if (cached !== undefined) return cached;
  const value = fingerprint(
    template === "blank" ? blankDesign() : designForTemplate(template),
  );
  pristine.set(template, value);
  return value;
};

/** 当前方案是否仍等于系统给的初始模版（重置方案、一路撤销回到起点都算）。 */
export const isPristineDesign = (design: Design): boolean =>
  // AI 户型没有可重建的初始模板，不做「回到初始」判定。
  !isAiDesign(design) && fingerprint(design) === templateFingerprint(design.templateId ?? design.template);

/**
 * 游客提示条的版本号：回到初始模版就归零（提示条随之消失），
 * 否则每次改动 +1（关掉过的提示条会重新出现）。
 */
export const nextGuestEditCount = (current: number, design: Design): number =>
  isPristineDesign(design) ? 0 : current + 1;
