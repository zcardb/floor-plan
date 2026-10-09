# 复制出来的项目里，门窗可以移动和修改

## 背景
复制出来的项目（不管是复制自己的项目，还是用模板新建）都会写入 `structureUnlocked: true`，墙体尺寸因此可以修改。但门窗的锁定判断 `openingIsLocked` 只看所在墙是不是承重墙，**完全没有考虑这个解锁标记**。参考户型里很多门窗都开在承重墙上，所以复制以后这些门窗还是拖不动、改不了尺寸、换不了款式，也删不掉。

已确认的规则：在解锁的项目里，承重墙上的门窗也可以移动和修改，同时提示"承重墙改动仅用于方案示意"。

## 方案
只改一个地方：锁定判断函数。所有调用它的地方（画布拖动、拖动手柄、尺寸面板、款式选择、删除、可视工具条、`editSelection`）会自动跟着生效。

`src/features/interior/model/wallPolicy.ts`
```ts
export const openingIsLocked = (design: Design, wallId: string) =>
  !(design.structureUnlocked === true && design.template !== 'blank') &&
  design.walls.some(w => w.id === wallId && isBearingWall(w));
```
- 解锁判断和 `canResizeWall` 保持一致：模板或复制的项目（非空白户型）且已解锁 → 放开。
- 空白户型保持原有规则：用户自己标记为承重的墙，上面的门窗仍然锁定。
- 旧项目（没有解锁标记）保持锁定；复制一份后就能编辑（沿用现有文案）。

承重墙提醒（复用 `BEARING_WALL_WARNING`）：
- `SizeFields.tsx`：选中开在承重墙上的门窗、且门窗未锁定时，显示和墙体一样的 `muted-note` 提醒。
- `PlanCanvas.tsx`：拖动承重墙上的门窗（`openingmove`）提交后，和拖墙一样弹出 `notify.warning(BEARING_WALL_WARNING)`。

## 实施清单
- [ ] `wallPolicy.ts`：`openingIsLocked` 在 `structureUnlocked && template !== 'blank'` 时返回 false
- [ ] `SizeFields.tsx`：门窗在承重墙上且未锁定时显示 `BEARING_WALL_WARNING`
- [ ] `PlanCanvas.tsx`：承重墙上的门窗拖动提交后弹出 `BEARING_WALL_WARNING`
- [ ] `structureUnlock.test.tsx`：更新"门窗锁定"用例：解锁的参考项目中，承重墙上的门窗不再锁定并显示提醒；旧项目 / 空白户型中仍然锁定
- [ ] `wallPolicy.test.ts`：新增 `openingIsLocked` 用例，覆盖解锁参考项目 / 未解锁参考项目 / 空白户型三种情况

## 验证清单
- [ ] 正向：在 `createProject('reference')` 中，用 `editSelection` 修改承重墙上门窗的 offset / width 成功
- [ ] 默认：`referenceDesign()`（未解锁）修改同一个门窗时仍抛出"锁定"错误
- [ ] 边界：空白户型（即使 `structureUnlocked`）中被标记为承重的墙上，门窗仍然锁定
- [ ] 回归：现有的同墙重叠和超出墙段校验仍然生效
- [ ] `pnpm vitest run src/features/interior` 通过；`pnpm run build` 通过
