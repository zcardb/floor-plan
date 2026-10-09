# 墙体操作简化：分割 / 取消分割 / 承重切换 / 删除

## 背景
现在的「墙选项」规则太多：原始承重墙不能取消标记，参考户型的墙不能删，还多了一个「标记拆除」，所以截图里大部分选项都是灰的。
已确认的新规则（**所有墙体一视同仁**）：
1. **分割墙段**：所有墙都能分割；**取消分割**：左右两端还有能合并的墙段时才可用（保持现在的逻辑）。
2. **标记承重 / 取消承重**：所有墙都能切换。参考户型里原本就是承重的墙（红色）默认仍算承重，但可以取消。
3. **删除当前墙**：所有墙都能删，只有当前是承重的墙不能删（先取消承重再删）。
4. **去掉「标记拆除 / 撤销拆除」**。老项目里已标记拆除的墙，**打开项目时直接删掉**（连同墙上的门窗）。

墙体尺寸能否拖动调整（`canResizeWall`）不在这次范围内，保持不变。

## 方案

### 1. 规则层 `model/wallPolicy.ts`
- `isBearingWall = wall => wall.loadBearing ?? wall.kind === 'bearing'`：手动标记优先，原始承重墙默认承重，可以设成 `loadBearing: false` 来取消。
- `setWallBearing`：去掉「原始承重墙已锁定」和「请先撤销拆除」两条限制，只保留「墙体不存在」。
- 新增 `canDeleteWall = wall => !isBearingWall(wall)`。
- 删除 `canDemolishWall`。`canEditWall` / `canResizeWall` 保留不变，只给尺寸调整使用。

### 2. 删除 `model/wallRemoval.ts`
- `removeWall`：改用 `canDeleteWall`，承重墙报错「承重墙不可删除，请先取消承重标记」；如果是最后一面墙就拒绝删除（方案校验要求至少有一面墙）。其余照旧：同时删掉墙上的门窗，然后执行 `rebuildRooms`（空白户型会重新划分房间；参考户型的房间是预设的，保持不变）。
- 删除 `toggleWallDemolition`。
- 新增 `purgeDemolished(design)`：把 `demolished` 里列出的墙和墙上的门窗删掉，并把 `demolished` 清空。

### 3. 老项目迁移 `model/validation.ts`
- v2 分支在数组检查之后：如果 `demolished` 不为空，就执行 `return validateDesign(purgeDemolished(v))`（先删除，再完整校验一遍）。
- 去掉第 190–193 行「已拆墙必须是非承重的隔墙/矮墙」这条校验（迁移以后 `demolished` 一定是空的），并去掉不再使用的 `isBearingWall` 导入。
- `demolished` 字段保留在数据结构里（一直是空数组），这样已存方案的格式不变；画布、造价、3D 里读取它的代码不用改。

### 4. 外围墙删除后的「户型设置」 `model/geometry.ts`
- `resizeBlank`：如果 `outer-0..3` 里有墙被删掉，并且长、宽或墙厚发生变化，就报错「已删除外围墙，当前不支持整体重设外围尺寸」。处理方式和现在「已分割外围墙」那条一样，避免重设尺寸时把删掉的墙又生成回来。

### 5. 墙选项菜单 `components/WallOptionsMenu.tsx`
去掉 `original`、`demolished` 两个状态以及拆除相关的选项（`Hammer`/`Undo2` 图标、`toggleWallDemolition`）。菜单只剩三组、四个选项：
| 分组 | 选项 | 不可用条件 | 说明文字 |
| --- | --- | --- | --- |
| 墙段编辑 | 分割墙段 | 没有 `splitWall` | 按距离划分为独立墙段 / 请在 2D 选择模式操作 |
| | 取消分割 | 没有 `mergeWall`，或可合并的墙段少于 2 段 | 合并 N 段连续墙 / 当前没有可合并的相邻墙段 |
| 承重属性（右侧显示「已标记 / 未标记」） | 标记承重 ↔ 取消标记承重 | 一直可用 | 标记后不可删除 / 取消后可删除，可撤销 |
| 墙体删除（右侧显示「受保护 / 可删除」） | 删除当前墙 | 是承重墙，或没有 `removeWall` | 承重墙不可删除，请先取消承重标记 / 删除这面墙及墙上门窗，可撤销 / 请在 2D 选择模式操作 |

### 6. 其它调用点
- `Workbench.tsx` 的 `removeWall`：`canEditWall` 改为 `canDeleteWall`，提示文字改为承重墙的那条。
- `SelectionEditor.tsx` 浮动工具条：删除按钮显示条件 `editableWall` 改为 `canDeleteWall(w)`。
- `PropertyPanel.tsx` 墙体属性：去掉「已标记拆除」的状态和提示。不能编辑的墙，提示改为「此墙体尺寸已锁定；分割、承重标记与删除可在「墙选项」中操作。」
- `WallSplitDialog.tsx`：去掉「原始承重墙：分割后所有子段保持锁定」，统一用 `isBearingWall` 判断，提示两种文字之一。

## Implementation checklist
- [ ] `isBearingWall` 改为 `loadBearing ?? kind === 'bearing'`
- [ ] `setWallBearing` 允许原始承重墙取消标记，不再检查拆除状态
- [ ] 新增 `canDeleteWall`，删除 `canDemolishWall`
- [ ] `removeWall` 改用 `canDeleteWall`，并拒绝删除最后一面墙
- [ ] 删除 `toggleWallDemolition`，新增 `purgeDemolished`
- [ ] `validateDesign` 加载时删掉已拆除的墙和墙上门窗，去掉旧的拆除校验
- [ ] `resizeBlank` 在外围墙被删除后拒绝重设尺寸
- [ ] `WallOptionsMenu` 只保留四个选项，按上表处理不可用条件和说明文字
- [ ] `Workbench` / `SelectionEditor` / `PropertyPanel` / `WallSplitDialog` 按第 6 节修改
- [ ] 代码中搜不到 `toggleWallDemolition`、`canDemolishWall`、`标记拆除`

## Verification checklist
- [ ] 正向：参考户型的原始承重墙可以「取消标记承重」，之后 `isBearingWall` 为 false，可以删除；再次标记后又不能删除
- [ ] 正向：参考户型的隔墙、外墙，以及空白户型的外围墙都可以删除，墙上的门窗一并删掉；删除后再保存、加载（JSON 往返）能通过校验
- [ ] 负向：手动标记承重的墙、原始承重墙，删除选项都不可用，提示「请先取消承重标记」；`removeWall` 会报错；Workbench 中选中这类墙按删除键不会提交修改
- [ ] 边界：只剩一面墙时 `removeWall` 拒绝删除
- [ ] 迁移：`validateDesign({ ...design, demolished: [墙id] })` 返回的方案里没有这面墙和它上面的门窗，`demolished` 为空；`demolished` 里有不存在的 id 时直接忽略
- [ ] 菜单：只有「分割墙段 / 取消分割 / 标记(取消)承重 / 删除当前墙」四个选项，没有拆除相关选项；分割后取消分割可用，单段墙时不可用
- [ ] 外围墙：删掉 `outer-0` 以后，`resizeBlank` 改尺寸会报错，尺寸不变时不报错
- [ ] 更新相关测试：`wallPolicy.test.ts`、`wallRemoval.test.ts`、`validation.test.ts`、`geometry.test.ts`（`demolished: ['outer-0']` 由报错改为迁移）、`wallSplit.test.ts`、`wallMerge.test.ts`、`WallOptionsMenu.test.tsx`、`wallSplitEntries.test.tsx`、`Workbench.test.tsx`
- [ ] `pnpm test`（src/features/interior）、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build` 全部通过
