# 门窗始终可以移动和修改（承重墙只提醒，不锁定）

## 背景
现在的 `openingIsLocked` 只要门窗开在承重墙上就锁定，导致不管是复制自己的项目还是用模板新建，这些门窗都不能拖动、改尺寸、换款式或删除。
已确认：**承重墙的判断保留，但只用来提醒；门窗在任何项目里都可以移动和修改。**（内置模板的只读预览是另一套机制，不受影响。）

## 方案
1. **取消门窗锁定**：删除 `wallPolicy.ts` 里的 `openingIsLocked`，并去掉所有调用点的锁定分支：
   - `model/selectionEdits.ts`：删掉 `throw '承重墙上的门窗洞口已锁定'`
   - `components/PlanCanvas.tsx`：拖动门窗本体和拖动手柄时不再 `return`
   - `components/SizeFields.tsx`：删掉"门窗洞口已锁定"的早退分支
   - `components/PropertyPanel.tsx`：款式选择和删除按钮不再 `disabled`，删除按钮的提示恢复为普通文案
   - `components/SelectionEditor.tsx`：可视工具条对门窗始终显示
   - `components/Workbench.tsx`：删除门窗时不再拦截
2. **保留承重墙提醒**（新增 `isOnBearingWall(design, opening)`，复用 `isBearingWall` 和 `BEARING_WALL_WARNING`）：
   - `SizeFields.tsx`：选中开在承重墙上的门窗时，显示和墙体一样的 `muted-note` 提醒
   - `PlanCanvas.tsx`：承重墙上的门窗拖动提交后，弹出 `notify.warning(BEARING_WALL_WARNING)`
3. 现有校验全部保留：门窗不能超出墙段、不能和同墙其他门窗重叠、高度限制。

## 实施清单
- [ ] `wallPolicy.ts`：删除 `openingIsLocked`，新增 `isOnBearingWall`
- [ ] `selectionEdits.ts`：门窗编辑不再因承重墙抛错
- [ ] `PlanCanvas.tsx`：门窗拖动 / 手柄不再被承重墙拦截；拖动后弹出承重提醒
- [ ] `SizeFields.tsx`：去掉锁定文案，承重墙上的门窗显示提醒
- [ ] `PropertyPanel.tsx`、`SelectionEditor.tsx`、`Workbench.tsx`：移除门窗锁定相关的 disabled 和拦截
- [ ] 更新测试：`structureUnlock.test.tsx`、`wallPolicy.test.ts`、`wallSplit.test.ts` 中断言"门窗锁定"的用例改为断言"可编辑 + 显示提醒"

## 验证清单
- [ ] 正向：`referenceDesign()`（旧项目、未解锁）和 `createProject('reference')` 中，承重墙上门窗的 offset / width 都能通过 `editSelection` 修改
- [ ] 正向：空白户型中被手动标记为承重的墙上，门窗也能修改
- [ ] 提醒：选中承重墙上的门窗时，`SizeFields` 输出包含 `BEARING_WALL_WARNING`；非承重墙上的门窗不显示
- [ ] 回归：超出墙段、同墙重叠仍然报错；墙体本身的锁定规则（`canResizeWall` / `canDemolishWall`）保持不变
- [ ] 代码中 `grep openingIsLocked` 无结果
- [ ] `pnpm vitest run src/features/interior` 通过；`pnpm run build` 通过
