# 画布交互合并 · 家具组合 · 单色块取色 · 带图下拉 · 项目切换 · 内置家具素材可调

## Context
画布有「选择 / 框选」两个模式，拖空白处要么平移、要么框选，用户要先想好再切模式（希克定律）。框选出来的一组家具只是一次性选择，没法保持成组。工具条上的颜色一排铺开占地方。房间材质、门窗款式这些下拉只有文字，看不出材质长什么样。项目切换只有名字能点，Logo 点了没反应，「新建项目」那一行也不好看。内置家具的 2D / 3D 素材目前也改不了。
这次统一成一套交互，并沿用现有的设计系统：`index.css` 里的组件类、`FurniturePicker` 弹层、`visual-editor-popover` 弹层。

## 1. 选择与框选合并为一个「选择」模式（`PlanCanvas.tsx`、`Workbench.tsx`）
- 去掉「框选」按钮、`marquee` 状态、M 快捷键和对应提示；`PlanCanvas` 的 `marquee` 属性一并删除。
- 选择模式下：
  - 点击：和现在一样，选中房间、家具、墙、门窗或分隔线，点空白处取消选择。
  - 在房间或空白处按住拖动：画选框（原来的 `kind:'marquee'` 分支），不再平移。
  - 在家具、墙、门窗、分隔线上拖动：和现在一样移动对象。
  - 光标：画布空白处和房间上显示十字，家具上显示移动光标（复用现有 `.marquee-on` 的样式，改为选择模式默认生效）。
- 平移改到两指上：
  - 触控板双指滑动（`wheel` 事件，没按 ctrl）：只平移画布。
  - 触控板双指捏合（`wheel` 加 `ctrlKey`）：缩放。
  - 触屏双指：保留现有的捏合逻辑（平移加缩放）。
  - 普通鼠标滚轮：仍然缩放。新增纯函数 `model/wheelIntent.ts`，按 `deltaMode`、整数步长、有无 `deltaX` 判断一次滚动来自鼠标还是触控板，并在连续滚动中沿用第一次的判断，避免手势中途来回切换。
  - 鼠标用户另外可以按住中键拖动，或按住空格拖动来平移。
- 只读预览（内置模板）里拖动空白处不画选框，仍然平移。

## 2. 家具组合 / 解除组合（`types.ts`、`furnitureGroup.ts`、`validation.ts`、`SelectionEditor.tsx`、`Workbench.tsx`、`PlanCanvas.tsx`）
- `Furniture` 新增可选字段 `groupId?: string`。旧数据没有这个字段，所以不受影响。`validateDesign` 校验这个字段必须是字符串，`normalizeFurniture` 会保留它。
- `furnitureGroup.ts` 新增几个纯函数：
  - `groupFurniture(d, ids)`：给这些家具写入同一个新的 `groupId`（如果其中已有组，就合并成一个组）。
  - `ungroupFurniture(d, ids)`：清除这些家具的 `groupId`。
  - `expandToGroups(d, ids)`：框到组里任意一件，就补全整组。
  - `persistentGroupOf(d, id)`：找出某件家具所在组的全部成员。
- 画布：
  - 点中已组合的家具，会选中整组（`{kind:'group', ids}`）；拖动时整组移动（复用 `groupmove` 和 `dragUnit`）。
  - 框选结果先经过 `expandToGroups` 再转成选择。
- 工具条（`group` 选择时）：
  - 未组合的多选显示「组合」（`Group` 图标，快捷键 Ctrl G）。
  - 选中的正好是一个已有组时显示「解除组合」（`Ungroup` 图标，快捷键 Ctrl Shift G）。
  - 每次组合或解除都会弹出提示，并可以撤销。整组旋转和删除沿用现有逻辑。

## 3. 颜色：默认只显示一个色块（新增 `ColorMenu.tsx`、`SelectionEditor.tsx`、`PropertyPanel.tsx`）
- 把 `ColorPickerField` 弹层里的内容（常用色网格加自定义取色）抽成共享的 `ColorPalette` 组件。
- 新增 `ColorMenu`：工具条上只有一个当前颜色的圆形色块按钮，点开后是 `visual-editor-popover`，里面放 `ColorPalette`。选常用色会立即生效并关闭弹层；自定义色在取色器确认时提交一次，只记一步撤销。
- 用 `ColorMenu` 替换工具条和属性面板里原来平铺的 `ColorSwatches`，然后删除 `ColorSwatches.tsx`。`ColorPickerField` 改为复用 `ColorPalette`，外观不变。

## 4. 带缩略图的下拉（新增 `VisualSelectField.tsx`、`materialThumbs.tsx`）
- 统一采用「新建家具」弹窗里「参考类型」那个下拉的样式（`FurniturePicker`：搜索框、分组、左侧图像、当前项打勾）。新增 `VisualSelectField`：标签 + 带缩略图的触发按钮（样式和 `editor-control` 一致）+ `FurniturePicker`（传入 `selectedId`）。
- 新增缩略图工具 `materialThumbs.tsx`：
  - 地面：`FloorSwatch` 铺贴纹理。
  - 墙面、屋面、吊顶：材料颜色的圆角色块。
  - 门窗：`openingIcon` 符号。
  - 「无屋面」「原顶」：Ban 图标。
  - 「账号库」改为角标显示，不再拼在名称里。
- 逐一替换的位置：
  - 工具条「房间材质」里的地面、墙面（`SelectionEditor`）。
  - 屋面、吊顶（`RoomSurfaceFields`）。
  - 门窗款式（`OpeningVariantSelect`）。
  - 属性面板里对应的入口（`PropertyPanel`、`RoomSurfacePanel`），如果其中已经是带图列表就保持原样。
  - 新建或编辑家具时的「外形」（参考原形、方形、圆形，配外形缩略图）。
- 不改的下拉：家具和参考类型本来就是带图的 `FurniturePicker`；「分类」「计价单位」「铰链侧」等不是素材，保持文字下拉。

## 5. 项目切换（`ProjectMenu.tsx`、`Workbench.tsx`、`CreateProjectMenuItems.tsx`、`index.css`）
- Logo 移进 `ProjectMenu` 的触发按钮，Logo、项目名和箭头是同一个点击区，悬停时整块高亮。
- 重新设计「新建项目」：
  - 它是下拉顶部的一张主色浅底卡片：左边是方形图标块（Plus），中间是「新建项目」和副标题「手动 · AI · 导入图纸」，右边是箭头。
  - 悬停时展开二级菜单，二级菜单每一项也改成「图标块 + 标题 + 一行说明」，样式和项目管理页的新建菜单一致。
  - 「返回项目管理」降为普通行，放在列表下面，和新建分开。

## 6. 内置家具的 2D / 3D 素材可调（`AccountFurnitureDialog.tsx`、`AccountFurnitureLibrary.tsx`、`accountCostEntries.ts`、`Workbench.tsx`、`furnitureSync.ts`）
- 内置家具在详情里也显示「AI 调整」。结果作为账号覆盖保存：在账号家具表里存一行同 `catalogId` 的记录，只覆盖 `imageUrl` / `model3d`，名称、尺寸等仍然只读。这个表已经支持这样存，不需要改表。
- 只有调整过的内置家具，在详情里显示「恢复默认素材」，作用是删除这条覆盖。卡片角标显示「已调整」。
- 素材库和画布：
  - 内置家具有覆盖时，左侧家具列表和 AI 目录都换成覆盖后的版本，不会出现两份。
  - 新放进画布的家具使用新素材。
  - 已经放进项目的同款家具，在 `syncAccountFurniture` 里扩展同步：只更新仍是默认值的 `imageUrl` / `model3d`，项目里单独改过的保留。
- 判断方式：`isBuiltinItem` 为真且账号库里有同 id 记录，就是「已调整的内置家具」，不再被误当成可删除的自定义家具。

## Implementation checklist
- [ ] `Workbench.tsx`：删除 `marquee` 状态、「框选」按钮、M 快捷键和框选提示；V 仍然切换到选择
- [ ] `PlanCanvas.tsx`：选择模式下在空白处或房间上拖动改为 `marquee`；在家具、墙、门窗、分隔线上拖动的行为不变；只读时仍然平移
- [ ] `PlanCanvas.tsx`：wheel 事件按 `wheelIntent` 区分，触控板双指平移、ctrl 加 wheel 缩放、鼠标滚轮缩放；中键拖动或空格加拖动平移
- [ ] `model/wheelIntent.ts`：纯函数加连续滚动粘滞判断
- [ ] `index.css`：选择模式下空白处显示十字光标，家具上显示移动光标
- [ ] `types.ts` 新增 `Furniture.groupId`；`validation.ts` 和 `costs.normalizeFurniture` 校验并保留这个字段
- [ ] `furnitureGroup.ts`：新增 `groupFurniture` / `ungroupFurniture` / `expandToGroups` / `persistentGroupOf`
- [ ] `PlanCanvas.tsx`：点击或拖动已组合的家具时选中并移动整组；框选结果补全为整组
- [ ] `SelectionEditor.tsx` 和 `Workbench.tsx`：「组合 / 解除组合」按钮、Ctrl G / Ctrl Shift G、提示和撤销
- [ ] 抽出 `ColorPalette`，新增 `ColorMenu`；工具条和属性面板改用 `ColorMenu`；删除 `ColorSwatches.tsx`
- [ ] 新增 `VisualSelectField.tsx` 和 `materialThumbs.tsx`
- [ ] 地面、墙面、屋面、吊顶、门窗款式、外形改用带图下拉（`SelectionEditor`、`RoomSurfaceFields`、`OpeningVariantSelect`、`PropertyPanel`、`RoomSurfacePanel`、`FurnitureFormFields`）
- [ ] `ProjectMenu.tsx`：Logo 并入触发按钮；`Workbench.tsx` 去掉单独的 Logo
- [ ] 「新建项目」卡片和二级菜单改版（`ProjectMenu`、`CreateProjectMenuItems`、`index.css`）
- [ ] `AccountFurnitureDialog`：内置家具开放「AI 调整」，只保存 `imageUrl` / `model3d`，并提供「恢复默认素材」
- [ ] `accountCostEntries` 和 `AccountFurnitureLibrary`：区分已调整的内置家具和自定义家具，角标显示「已调整」
- [ ] `Workbench.tsx`：素材库里有覆盖的内置家具用覆盖版本替换；`furnitureSync.ts` 同步已放置的内置家具素材

## Verification checklist
- [ ] 单元测试 `wheelIntent`：鼠标滚轮判为缩放，触控板小增量或带 `deltaX` 判为平移，ctrl 判为缩放，连续滚动不会中途切换
- [ ] 单元测试 `furnitureGroup`：组合会合并旧组；解除组合会清除；框到组内一件会补全整组；没有 `groupId` 的旧数据结果不变
- [ ] `validation`：`groupId` 不是字符串时报错；合法时保存后再读取不丢失
- [ ] 单元测试 `furnitureSync`：已调整的内置家具，只同步未在项目里改过的 `imageUrl` / `model3d`
- [ ] 更新 `Workbench.test.tsx`：工具按钮只剩「选择」「门」「窗」
- [ ] 更新 `SelectionEditor.test.tsx`：工具条只有一个色块；多选显示「组合」，选中已有组显示「解除组合」
- [ ] 截图检查（desktop_1280）：工具条色块、带图下拉、项目切换弹层
- [ ] 运行 `pnpm exec tsc -p tsconfig.app.json --noEmit`（`wallFaces.ts` 原有的那个错误除外）、`pnpm exec vitest run src`、`pnpm run lint` 和 `pnpm run build`
