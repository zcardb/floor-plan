# 门开向设置 + Visual Editor 浮条拖动

## Context

已完成 shadcn 编辑控件和米制显示（长度两位小数），本轮保留这些行为。当前门模型没有左右铰链/开向字段，2D 门扇与弧线、3D 转轴均为固定方向；Visual Editor 仅随选中对象自动定位，没有手动拖动。

用户已确认门需要「左右铰链 + 向墙体两侧开门」四种组合，同时浮条可自由拖动。

## 推荐实现

### 门开向
- `src/features/interior/model/types.ts` 的 `Opening` 增加可选 `hinge: 'start'|'end'` 和 `swingSide: -1|1`。分别对应墙局部坐标的起点/终点侧铰链与法线两侧，不称房间内外以免跨房间产生歧义。缺失字段默认为现有起点侧铰链、负法线开门。
- 新增 `model/doorOrientation.ts`，集中提供默认值、镜像符号、门扇局部几何及开向更新。复用原墙方向坐标，不改变墙体端点、门位置、宽度、费用或 `open` 状态含义。
- 新增 `components/DoorOrientationControls.tsx`，用 shadcn 控件显示「铰链侧：左/右（沿墙起点→终点）」与「开启侧：墙体一侧/另一侧」。复用同一组件放到 Visual Editor 门开向 Popover 和门属性面板；窗户不显示。
- `SelectionEditor.tsx` 和 `PropertyPanel.tsx` 的修改复用现有 `change`，只更新当前门开向，进入现有撤销/重做和自动保存路径。
- `PlanCanvas.tsx` 对门扇和弧线按两个镜像符号变换；开口墙洞与窗户保持原样。导出使用同一 SVG 表现。
- `model/selectionAnchor.ts` 的门扇选择范围同步使用开向几何；避免改向后浮条或高亮仍锚定旧弧线。
- `scene/Scene3D.tsx` 同步铰链转轴、门扇局部偏移、闭合角与开门旋转符号，让四种方向与 2D 一致，保留点击开关门交互。
- `model/validation.ts` 对可选开向字段校验，兼容无字段旧项目，非法枚举拒绝。仍使用现有项目 JSON，不改数据库结构或版本。

### Visual Editor 浮条拖动
- 在 `SelectionEditor.tsx` 浮条前加入 lucide `GripVertical` 手柄，只有手柄启动拖动；按钮、输入框和下拉继续正常操作。
- 新增 `components/useEditorDrag.ts` 管理 pointer capture、pointermove/up/cancel/lostcapture。直接通过 ref/transform 更新位置，不在每次移动时更新整页 React state，不触发设计提交或撤销。
- 默认仍复用 `placeEditor` 自动跟随对象；用户拖过后，在当前选中对象期间保留手动位置，自动锚点刷新不将其拉回。切换对象由现有 `${kind}:${id}` key 重挂载，恢复自动定位。
- 拖动限制在画布容器内部；ResizeObserver 触发时重新钳制，对象取消选中、离屏或浮条隐藏时仍遵循原可见性规则。手动模式不新增持久化或后端请求。
- 拖动开始关闭已展开的子浮层，结束后可重新打开，避免 portal 弹层跟随错位。阻止拖动传播到画布，不移动门/家具、不触发测量。
- 手柄支持触屏 `touch-action:none`、grab/grabbing 状态及键盘方向键移动；只在手柄有焦点时生效。使用语义令牌和既有紧凑布局。

## 关键文件和复用
- 模型：`src/features/interior/model/{types,validation,selectionAnchor}.ts`，新增 `doorOrientation.ts` 和测试。
- 交互：`src/features/interior/components/{SelectionEditor,PropertyPanel,PlanCanvas}.tsx`，新增 `DoorOrientationControls.tsx`、`useEditorDrag.ts` 与定位测试。
- 3D：`src/features/interior/scene/Scene3D.tsx`。
- 样式：`src/index.css`。
- 复用：`placeEditor`、现有 `change`/撤销/自动保存、shadcn Select/Button/Popover、原门窗拖动及宽度验证。

## 实施结果

门开向字段、默认/导入校验、共享控件、2D/3D 几何及选择范围已实现；浮条拖动手柄、触摸/键盘移动、位置钳制和当前对象手动定位已实现。lint、应用类型检查、135 项测试及构建通过。实际浏览器拖动、四种 3D 开门视觉与浮层交互尚未验证，不能以首页截图替代。

## Implementation checklist
- [ ] Opening 可选开向字段及默认解析工具完成，旧项目保持原门方向。
- [ ] 导入校验接受缺失/合法字段，拒绝非法铰链及开向值。
- [ ] 门开向共享控件在 Visual Editor 与门属性面板可修改两项，窗户不出现。
- [ ] 每次开向修改仅更新目标门，复用撤销与自动保存，不改墙洞/费用/尺寸。
- [ ] 2D 门扇/弧线和选择锚点支持四种组合，图像导出同步。
- [ ] 3D 转轴/门扇/动画开向对应四种组合，点击开关门继续生效。
- [ ] 浮条独立手柄支持鼠标/触摸拖动，capture 与取消释放完整，按钮和表单不启动拖动。
- [ ] 手动位置在当前对象期间不被自动定位覆盖，切换对象恢复自动定位。
- [ ] 拖动位置钳制到画布边界，窗口缩放后重新钳制，隐藏状态沿用原逻辑。
- [ ] 拖动关闭子浮层，阻断画布事件，手柄焦点下支持方向键移动。
- [ ] 新增门开向几何/默认值/校验及拖动边界测试，保持米制两位小数。

## Verification checklist
- [ ] 正向：四种开向的门扇、弧线、锚点与 3D 转轴一致，翻转两次恢复原值。
- [ ] 默认/负向：旧 JSON 无字段时方向不变；非法枚举被拒绝；窗户、其他门、宽度/位置和金额不变。
- [ ] 保存后重开保留开向；一次修改可撤销/重做；原门窗沿墙拖动和调整尺寸仍正常。
- [ ] 鼠标/触摸拖浮条时只移动浮条；手柄之外的按钮/输入/Select 继续正常响应。
- [ ] 当前对象移动/画布缩放不重置手动位置；切换对象恢复自动位置；靠四边及容器缩小时手柄仍可见。
- [ ] pointercancel、lostcapture、卸载无残留拖动监听，浮条拖动不增加设计撤销项。
- [ ] 执行 `pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm test`、`pnpm run build`。
- [ ] 在根路由桌面 1280/手机 390 验证浮条与开向菜单（用户未指定宽度）。缺少可用点击工具时明确交互/视觉未验证，不以首页截图代替。
