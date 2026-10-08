# 2D 平面图方向指示（指北针）

## Context
项目详情需要显示东南西北，并标出北方。户型图的正北不一定在图纸正上方，所以每个项目都能单独设置北方角度，这个角度随项目一起保存。指北针只显示在 2D 平面图里。

现状：
- 项目方案数据是 `Design`（`model/types.ts`），会整份以 JSON 保存到项目里（云端和本机都是这样），所以新增一个可选字段就够了，不需要改数据库。
- 不选中任何对象时，右侧 `PropertyPanel.tsx` 显示项目级设置（户型尺寸、`<DimensionSettings>`、操作说明），这就是“项目详情”区域。
- 2D 画布的叠加控件（`.scale-bar`、`.canvas-zoom`）在 `Workbench.tsx` 的 `<main className="stage">` 里，样式在 `src/index.css`。2D 视图本身不能旋转，所以指北针只受项目角度影响。

## 方案
1. **数据字段**：在 `Design` 上加 `northAngle?: number`，表示北方相对图纸正上方的角度，顺时针 0–359°。旧项目没有这个字段，按 0 处理（上北）。
2. **模型工具** `model/northAngle.ts`（写法参考 `model/dimensionSettings.ts`）：
   - `northAngle(d)`：返回 `d.northAngle ?? 0`
   - `changeNorthAngle(d, deg)`：把角度归一化到 [0, 360)、取整，返回新的 Design；输入不是有限数时抛出中文错误
3. **校验**：`model/validation.ts` 中 `northAngle` 允许为 `undefined`，或 0–360 之间的有限数，其他值一律 `fail()`（参照 `structureUnlocked` 和 `dimensionSettings` 的校验写法）。
4. **指北针组件** `components/CompassRose.tsx`：纯 SVG 圆盘，标注 N / E / S / W（中文显示“北 东 南 西”）。整体按 `northAngle` 旋转，文字反向旋转以保持正向可读；北向指针和“北”字用 `--primary` 高亮，其余用 `--muted-foreground`；设置 `aria-label="指北针：北偏 X°"` 和 `pointer-events: none`。
5. **挂到画布**：在 `Workbench.tsx` 中 `view === "2d"` 时，把 `<CompassRose angle={northAngle(d)} />` 渲染在 stage 右上角（`stage-topline` 下方）。
6. **项目详情设置** `components/NorthSettings.tsx`：在 `PropertyPanel.tsx` 的 `<DimensionSettings>` 后面加一个“朝向”区块，包含：
   - 一个小号 `CompassRose` 预览
   - “北方角度 / °”数字输入框（0–359，失焦或回车时提交，写法同 DimensionSettings 的 onBlur 和 notify.fail）
   - 四个快捷按钮：上北 0° / 右北 90° / 下北 180° / 左北 270°

   所有修改都走 `change()`，因此支持撤销，也会随项目保存。
7. **样式**：在 `src/index.css` 新增 `.plan-compass`（absolute，右上角，`--card` 半透明背景、`--border`、`--shadow-float`，和 `.canvas-zoom` 风格一致），并在已有的移动端媒体查询（约 2102 行）里缩小尺寸、调整位置。只使用语义色 token。

不改动的部分：3D 视图、图纸导出（drawingDocument）、模板指纹逻辑（改了朝向算一次真实编辑）、数据库表结构。

## 关键文件
- `src/features/interior/model/types.ts`
- `src/features/interior/model/northAngle.ts`（新建）
- `src/features/interior/model/validation.ts`
- `src/features/interior/components/CompassRose.tsx`（新建）
- `src/features/interior/components/NorthSettings.tsx`（新建）
- `src/features/interior/components/PropertyPanel.tsx`
- `src/features/interior/components/Workbench.tsx`
- `src/index.css`

## Implementation checklist
- [ ] `Design` 增加 `northAngle?: number` 字段并写注释
- [ ] `model/northAngle.ts` 实现 `northAngle()`：缺省时返回 0
- [ ] `model/northAngle.ts` 实现 `changeNorthAngle()`：归一化到 0–359 并取整，非法输入抛错，且不修改原对象
- [ ] `validateDesign` 接受 undefined 或 0–360 有限数，拒绝字符串、NaN、负数和 >360 的值
- [ ] 新建 `CompassRose.tsx`：显示北东南西，北向高亮，按角度旋转，文字保持正向
- [ ] 在 `Workbench.tsx` 中只在 2D 视图渲染指北针，3D 视图不渲染
- [ ] 新建 `NorthSettings.tsx`：预览、数字输入、4 个快捷按钮，全部通过 `change()` 提交
- [ ] 在 `PropertyPanel.tsx` 的项目详情区插入 `<NorthSettings>`
- [ ] 在 `index.css` 添加 `.plan-compass` 的桌面端和移动端样式，只用语义 token

## Verification checklist
- [ ] 新增 `model/northAngle.test.ts`：缺省为 0；输入 370 得到 10；输入 -90 得到 270；输入 NaN 抛错；原对象不被修改
- [ ] validation 测试：`northAngle: 90` 通过；`'90'`、`-1`、`400`、`NaN` 均被拒绝；没有该字段的旧数据仍然通过
- [ ] 组件测试：`CompassRose` 渲染出“北 东 南 西”，aria-label 中包含角度
- [ ] 运行 `pnpm vitest run src/features/interior`，全部通过（包括已有的 validation、templateState、Workbench 测试）
- [ ] 运行 `pnpm run lint` 和 `pnpm run build`，均通过
- [ ] 截图：在 desktop_1280 和 mobile_390 下查看 2D 画布，指北针位于右上角，不遮挡缩放控件和比例尺
