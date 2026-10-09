# 复刻 / AI 生成户型后自动「清空分割」

## 背景
内置模板和 AI 户型生成时，每扇门窗都单独占一段「长度刚好等于洞口宽度」的墙段（`opening-wall-*`），门窗两侧没有余量，所以拖不动（截图里两侧距离都是 0.00 m）。手动点一次「清空分割」（`mergeAllSplits`）把同一直线上的墙段合并成整面墙后，门窗就能沿墙拖动。按你的要求，改成复刻模板项目、AI 生成户型时默认执行一次清空分割，不需要再手动点。

## 方案
直接复用现有的 `mergeAllSplits`（`src/features/interior/model/wallBulk.ts`），不新写合并逻辑。

1. **模板（复刻 / 新建 / 重置 / 内置预览都一致）**：在 `src/features/interior/data/templates.ts` 里把 `TEMPLATE_PRESETS` 每一项的 `build` 包一层 `() => mergeAllSplits(build()).design`。
   - 这样「用模板新建 / 复制模板」（`createProject` → `designForTemplate`）、「重置方案」、游客默认项目、内置模板预览、缩略图拿到的都是合并后的户型。
   - 「是否仍是初始模板」的判断（`templateState.isPristineDesign`）本来就用 `designForTemplate`，会自动保持一致，刚复刻出来的项目仍算初始状态。
2. **AI 生成户型**：在 `src/features/interior/ai/apply.ts` 的 `planToDesign` 里，`buildPlan` 之后、`validateDesign` 之前执行 `mergeAllSplits`。AI 对话框里的预览和最终创建出来的项目保持一致。
3. **防止墙体类型被改错**（`wallBulk.ts` 的 `chainBase`）：内置「原木之家」模板里，室内门所在的那一小段墙被标成了「外围墙」。如果直接合并，整条室内隔墙会因为「外围 > 承重 > 隔墙」的优先级被升级成外围墙。处理办法：判断合并后的墙体类型时，跳过「只承载一个、且洞口宽度等于墙段长度」的门窗墙段；如果整条线全是这类墙段，再退回原来的规则。手动点「清空分割」也会用同一套更合理的规则。

不改动：拖动逻辑（`openingDrag.ts`）、AI 后端函数、用户已经保存的项目（打开已有项目不会自动合并，需要时仍可手动点「清空分割」）。

## Implementation checklist
- [ ] `wallBulk.ts` `chainBase`：计算类型优先级时排除「门窗满宽墙段」（`openings` 中 `wallId` 指向该墙且 `|width - length(wall)| < tolerance`）；整条线都是这类墙段时退回全部墙段
- [ ] `templates.ts`：`TEMPLATE_PRESETS` 每一项的 `build` 改为返回 `mergeAllSplits(原 build()).design`
- [ ] `ai/apply.ts` `planToDesign`：`buildPlan` 后先执行 `mergeAllSplits(...).design`，再加 AI 标记并走 `validateDesign`
- [ ] 新增测试：`createProject('reference')` 和每个 `NEW_TEMPLATE_PRESETS` 的 `splitPointCount` 为 0 或只剩因门窗冲突跳过的墙段；门窗满宽墙段消失，门窗两侧距离大于 0
- [ ] 新增测试：「原木之家」里室内门所在的那条隔墙合并后仍是 `partition`/`bearing`，不会变成 `exterior`
- [ ] 新增测试：`planToDesign` 输出的门窗所在墙长度大于门窗宽度，`dragOpening` 可以改变门窗的 `offset`

## Verification checklist
- [ ] 正常情况：复刻「原木之家」和任一新模板后，选中一扇门，可以沿墙拖动，两侧距离标注不再是 0.00 m
- [ ] 正常情况：AI 生成的户型创建后，门窗可以沿墙拖动
- [ ] 回归：`templatePresets.test.ts` 里的 `isPristineDesign(createProject(id).state)` 仍为 true；「重置方案」后的户型和刚复刻出来的一致
- [ ] 负面情况：空白户型（`blankDesign`）不受影响（四个角的墙不共线，合并结果为空）
- [ ] 边界情况：合并会导致门窗重叠或越界的直线保持原样（沿用 `mergeAllSplits` 的跳过逻辑），不报错
- [ ] 执行 `pnpm vitest run src/features/interior`、`pnpm run lint`、`pnpm run build`
