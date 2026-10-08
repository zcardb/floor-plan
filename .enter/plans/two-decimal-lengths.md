# 所有距离统一保留两位小数

## Context

「编辑墙间净距」的输入框显示 `2.59482568359375`，而旁边的提示是 `2.59 m`。
原因：只读文字走 `formatMeters`（两位小数），但所有输入框的初始值走 `meterDraft`，它是 `String(毫米 / 1000)`，把模型里的原始浮点数原样吐出来。

走查结果：

| 位置 | 现状 |
| --- | --- |
| 画布标注、悬停距离、坐标、家具尺寸文字、导出图纸 | 已是两位（`formatMeters`），无需改 |
| 面积 m² | 两位或一位，无需改 |
| 金额 | 最多两位，无需改 |
| **墙间净距弹窗** `DimensionEditDialog.tsx` | 多位小数（截图处） |
| **选中对象尺寸浮层** `SizeFields.tsx`（宽/深/中心 X、Y/墙长/墙厚/门窗宽、位置、高度、窗台高） | 多位小数 |
| **右侧属性面板** `PropertyPanel.tsx`（家具宽深与中心、净宽、净深、外围墙厚、层高） | 多位小数 |
| **外围标注距离** `DimensionSettings.tsx` | 多位小数 |
| **家具参考几何** `FurnitureGeometryEditor.tsx`（宽/深） | 多位小数 |
| **材料规格** `MaterialProcurementEditor.tsx`（单张长/宽） | 多位小数 |
| **旋转角度** `RotationControls.tsx` | 自由旋转后可能出现多位小数 |

这些全部来自同一个函数，所以从源头改一处，再处理由此带来的副作用。

## 方案

### 1. 源头：`src/features/interior/model/lengthUnits.ts`

- `meterDraft(mm)` 改为返回 `formatMeters(mm)`，即固定两位（`2.59`、`1.80`），输入框与旁边的只读文字完全一致。
- `parseMeterDraft(text)` 把输入四舍五入到两位小数（1 cm），这样输入 `1.235` 会存成 `1.24`，不会再出现"存的是三位、显示的是两位"。空串和非数字仍返回 `NaN`。

### 2. 不能让"只是显示取整"悄悄改动真实数据

模型里的值本身可能不是整厘米（如 2594.8 mm）。显示成 `2.59` 之后，如果用户没改就失焦或点应用，不能把 2594.8 写回成 2590。逐处处理：

- `SizeFields.tsx`：现在改任何一个字段都会把全部字段一起提交。改为只提交用户实际改过的字段（用一个 ref 记录已编辑的 key，结算/取消时清空）。`transaction.update` 本身支持只传部分字段（`RotationControls` 已这样用）。
- `PropertyPanel.tsx` 的 `input()`：失焦时若文本与初始值相同，直接返回，不调用 `update`。
- `DimensionSettings.tsx`：同上，未改动则不写入。
- `DimensionEditDialog.tsx`：若数值未改动，点「应用距离」等同关闭，不移动墙体。
- `FurnitureGeometryEditor.tsx`：宽/深未改动时保存沿用 `item.w` / `item.d` 原值。

### 3. `MaterialProcurementEditor.tsx`

长/宽输入框目前是"数字状态 → `meterDraft` → 受控值"。改成固定两位后会无法正常删改（`1.20` 删一位又变回 `1.20`）。改为长/宽各用一个字符串草稿，提交时再 `parseMeterDraft`；展开/重置时用 `meterDraft` 重新初始化。

### 4. 旋转角度 `RotationControls.tsx`

未编辑时的显示值由 `String(value)` 改为最多两位小数（`Number(value.toFixed(2))`，整数角度仍显示 `90` 而不是 `90.00`）。「旋转 90°」继续基于真实角度计算。

### 5. 步进

所有长度输入框的 `step` 由 `0.001` 改为 `0.01`（`SizeFields`、`PropertyPanel`、`DimensionSettings`、`FurnitureGeometryEditor`、`CustomFurnitureDialog`、`MaterialProcurementEditor`），与两位小数一致。

## 需要你知道的一点

材料规格的单张长/宽也会变成 1 cm 精度。如果以后要录入 `0.122 m` 这类窄条地板，会被取成 `0.12`。目前内置规格都是 0.3 / 0.6 / 0.8，不受影响。如果你希望材料规格保留三位，告诉我，我把它单独排除。

## Implementation checklist

- [ ] `lengthUnits.ts`：`meterDraft` 返回两位小数字符串
- [ ] `lengthUnits.ts`：`parseMeterDraft` 把输入取整到两位小数，空串与非数字仍为 `NaN`
- [ ] `SizeFields.tsx`：只向事务提交用户改过的字段，结算与取消时清空记录
- [ ] `PropertyPanel.tsx`：`input()` 失焦时文本未变则不调用 `update`
- [ ] `DimensionSettings.tsx`：失焦时文本未变则不写入
- [ ] `DimensionEditDialog.tsx`：数值未变时「应用距离」只关闭弹窗
- [ ] `FurnitureGeometryEditor.tsx`：宽/深未改时保存沿用原始毫米值
- [ ] `MaterialProcurementEditor.tsx`：长/宽改用字符串草稿，可正常输入和删除
- [ ] `RotationControls.tsx`：静态显示角度最多两位小数
- [ ] 六个文件的长度输入框 `step` 改为 `0.01`
- [ ] `lengthUnits.test.ts`：把 `meterDraft(1234.567)` 的期望改为 `'1.23'`，`parseMeterDraft('-0.001')` 的期望按取整规则更新，并补充 `parseMeterDraft('1.235')` 的用例
- [ ] 更新因 `meterDraft` / `step` 变化而失败的其它组件测试

## Verification checklist

- [ ] 正向：净距为 2594.83 mm 时，弹窗输入框显示 `2.59`
- [ ] 正向：`SizeFields`、属性面板、外围标注距离、家具参考几何、材料规格各输入框初始值均为两位小数
- [ ] 正向：输入 `1.235` 后模型值为整厘米，重新打开显示两位
- [ ] 默认：非整厘米的值（如 `cx = 1234.567`）在只改另一个字段后保持原值不变
- [ ] 默认：属性面板输入框聚焦后不改动直接失焦，模型值不变，撤销栈不新增记录
- [ ] 默认：净距弹窗不改数值点「应用距离」，墙体位置不变
- [ ] 边界：`1800` 显示 `1.80`，`50` 显示 `0.05`，空输入仍提示尺寸无效
- [ ] 边界：材料规格长/宽可以逐字删除并重新输入
- [ ] 边界：角度 `37.48291` 显示 `37.48`，`90` 显示 `90`
- [ ] `pnpm run lint`
- [ ] `pnpm exec vitest run`（全量，重点 `lengthUnits`、`DimensionEditDialog`、`Workbench`、`RotationControls`、`stairs`）
- [ ] `pnpm run build`
