## Context

### 本次执行结果
- 已实现共享取点/结束状态机、测量墙端双距离、门窗净距覆盖层和完成测量按钮。
- 功能回归：通过，37 个文件、206 项测试；包含相同取点、连续段、闭合、Enter/Esc、最小长度、拖动阈值、门窗方向/贴端/碰撞与选中覆盖层接线。
- check、开发及生产构建：通过；保留既有 PlanCanvas `fit` effect 依赖警告。
- 构建审计：已运行 strict app 审计，保留现有预算/动态分类/外部字体告警，未宣称性能验收通过。
- 浏览器性能、实际拖动标注的 390/1280 布局及部署 HTTP：未验证。没有浏览器交互工具，未用无选中截图替代所需证据；这些验收项保持未勾选。
新增需求：门、窗沿所属墙移动时，在画布上实时展示开口两侧到该墙两端的距离。下方「门窗两侧距离」为本次待实施内容；工具栏功能已实现，保留原验证记录。

## 测量与绘墙一致：推荐方案
- 将 `components/useWallDrawing.ts` 的连续取点状态机抽为共享的 `useSegmentDrawing.ts`，保留 `useWallDrawing` 包装入口以兼容现有调用与测试；测量也使用同一状态机，差别仅是提交测量线而非墙体、以及草稿 UI。
- 共享 `resolveWallPoint`、`resolveWallHover`：相同的起点/端点优先吸附、墙面投影、容差、吸附开关和连续起点方向锁定。不再保留测量独立的两点点击状态及 Shift 专属方向规则。
- 相同手势：首点点击开启草稿；后续点击逐段提交并以前段终点继续；首段拖动超过现有 5 px 阈值可提交；回到首点闭合后自动结束。双击、右键、Enter 结束，Esc 取消未提交草稿并退出；已提交段保留。切工具、指针取消和双指缩放按绘墙规则清理。
- 共享状态机允许工具专用段校验：绘墙继续使用 `validateWallSegment`、`rebuildRooms`；测量沿用绘墙 100 mm 最小段长，但不应用墙体重叠或门窗穿越校验，因为测量墙长、穿过开口不应改变或受到结构编辑限制。测量只追加 `design.measures`，不增删墙或重建房间。
- 测量工具在墙面悬停/沿墙移动时显示当前投影点到该墙起端、末端的两项距离（`offset` 与 `length(wall)-offset`）；不再只显示距近端。展示点与实际取点分别使用共享 hover/candidate，保持与绘墙相同的吸附和方向锁定语义。
- 复用/扩展 `WallHoverOverlay` 支持测量 UI：墙高亮、当前点及两端数值，不显示「点击连接」；保持绘墙现有 UI 不变。测量草稿只显示 `MeasureLine`，不显示墙体多边形。
- `Workbench.tsx` 同步测量模式提示和帮助；测量时提供「完成测量」按钮，走与「完成绘墙」一致的结束/清理路径，不产生末尾多余段。

### 测量关键文件
- `src/features/interior/components/useSegmentDrawing.ts`（新增）：共享连续取点、手势、完成/取消状态机。
- `src/features/interior/components/useWallDrawing.ts`：保留包装入口，将墙体校验与提交传给共享状态机。
- `src/features/interior/components/PlanCanvas.tsx`：测量接入共享状态机，移除 `measureStart` 及旧测量 drag/draft 分支，保持其他对象拖动不变。
- `src/features/interior/components/WallHoverOverlay.tsx`：测量变体展示点到两端距离。
- `src/features/interior/components/Workbench.tsx`：测量提示、帮助和完成按钮。
- `src/features/interior/components/useSegmentDrawing.test.ts`（新增）、`PlanCanvas.test.tsx`、`WallHoverOverlay.test.tsx`、`Workbench.test.tsx`：状态机、入口及数值回归。

## Implementation checklist
- [x] 抽出共享连续绘制状态机，绘墙包装保留原有取点、校验、提交及闭合行为。
- [x] 测量 pointer down/move/up 使用共享状态机，替换旧两点取点路径且提交仅修改 measures。
- [x] 双击、右键、Enter、Esc、切工具、指针取消与双指缩放走共同清理路径，不提交未确认末段。
- [x] 测量沿墙 hover 展示投影点到两端的距离，草稿保持测量线 UI 而非墙体 UI。
- [x] 添加完成测量按钮并更新提示，复用绘墙结束规则。
- [x] 新增共享状态机与测量回归测试，证明绘墙原路径未退化。

## Verification checklist
- [ ] 正向：相同 pointer 输入在测量和绘墙中得到相同起点、方向锁定、吸附端点及连续段端点；测量不修改 walls、rooms、openings。
- [ ] 正向：6000 mm 墙上投影 offset=2000 时显示 2.00 m/4.00 m，移动到 3000 时显示 3.00 m/3.00 m；适用于水平、垂直、斜墙与反向墙。
- [ ] 默认/负向：没有墙命中时不显示墙端距离；吸附关闭时取点规则仍与绘墙一致；测量沿墙及穿过门窗不会触发结构重叠限制。
- [ ] 边界：100 mm 最小段长、5 px 首段拖动阈值、贴端零距离、回首点闭合、每种结束手势及重复结束均无末尾多余段。
- [ ] 已提交测量段在结束后保留；Esc 只取消草稿；清除测量、撤销重做、切工具和 3D 工具不退化。
- [ ] 执行 `pnpm exec vitest run src/features/interior/components/useSegmentDrawing.test.ts src/features/interior/components/PlanCanvas.test.tsx src/features/interior/components/WallHoverOverlay.test.tsx src/features/interior/components/Workbench.test.tsx src/features/interior/model/wallDrawing.test.ts`，随后 `pnpm test`、`pnpm run check`、`pnpm run build`、`pnpm run build:prod`。
- [ ] 同一路由 mobile_390、desktop_1280 验证测量 hover、连续取点和结束 UI；若无法交互，记录相关布局/浏览器行为未验证。

## 门窗两侧距离：推荐方案
- 在 2D 中选中门或窗即显示两侧距离，拖动时随既有 `preview(next)` 的设计状态实时更新，松开后保留，取消选中后隐藏。
- 距离按门窗**洞口边缘**到所属墙段两端计算，不按中心计算：起端距离 = `offset - width / 2`，末端距离 = `length(wall) - offset - width / 2`。沿墙方向计量，水平、垂直、斜墙及反向墙使用同一规则。这里不计算到其他门窗的距离，也不改变墙端几何规则。
- 在墙旁绘制两段辅助尺寸线及可读数值；使用现有 `formatMeters` 和 `--plan-selection` / `--plan-porcelain` 颜色，字号与偏移按画布缩放补偿。短距离和贴端为零时仍显示数值，避免两侧文字重叠。
- 辅助标注属于选中编辑提示，不受外围尺寸图层开关影响；设 `pointerEvents="none"`、`data-export-hide="true"`，不挡拖动，不进入导出图片。
- 保持拖动限制、碰撞拒绝、撤销重做、数据结构及 3D 行为不变。拒绝的移动继续显示最后有效位置的距离，不显示无效草稿值。

### 关键文件
- `src/features/interior/components/OpeningDistances.tsx`（新增）：专用的门窗两侧尺寸标注组件，内部只处理当前选中开口及所属墙。
- `src/features/interior/components/PlanCanvas.tsx`：在现有 opening 选中覆盖层旁挂载标注；复用实时 design 和 `view.s`，不新增指针事件或高频全页状态。
- `src/features/interior/components/OpeningDistances.test.tsx`（新增）：数值、方向、零距离与导出/命中隔离测试。
- `src/features/interior/components/PlanCanvas.test.tsx`：选中入口与预览状态更新的集成回归。
- 复用 `model/geometry.ts` 的 `length`、`model/lengthUnits.ts` 的 `formatMeters`；参考 `WallHoverOverlay.tsx` 的缩放补偿与 `openingDrag.test.ts` 的拖动夹取/碰撞测试。

## Implementation checklist
- [x] 新增 OpeningDistances，只从选中开口的 offset、width 与所属墙端点计算两侧净距。
- [x] 两侧标注支持任意墙方向，并对短距离、零距离安排错行文字位置（实际视觉效果未验证）。
- [x] PlanCanvas 在选中门窗时挂载标注，使用预览 design 实时更新，取消选中后隐藏。
- [x] 标注不拦截指针、不进入图片导出、不受外围尺寸开关控制，且不修改设计数据或拖动规则。
- [x] 添加距离组件与画布选中/预览集成回归测试。

## Verification checklist
- [ ] 正向：6000 mm 墙、1000 mm 开口、offset=2000 时两侧显示 1.50 m 和 3.50 m；移动到 offset=3000 时更新为 2.50 m 和 2.50 m，门窗均适用。
- [ ] 默认/负向：未选中、选择其他对象、开口或墙缺失时不显示；标注不进入导出且没有指针命中。
- [ ] 边界：水平、垂直、斜墙及反向墙显示正确；贴墙端显示 0.00 m；重叠移动被拒绝后显示最后有效距离。
- [ ] 外围尺寸关闭时选中门窗距离仍显示，拖动松开与撤销后距离对应实际位置。
- [ ] 执行 `pnpm exec vitest run src/features/interior/components/OpeningDistances.test.tsx src/features/interior/components/PlanCanvas.test.tsx src/features/interior/model/openingDrag.test.ts`、`pnpm test`、`pnpm run check`、`pnpm run build` 和 `pnpm run build:prod`。
- [ ] 有浏览器交互能力时在同一工作台以 mobile_390 和 desktop_1280 验证选中及拖动标注；若仍无交互工具，明确记录布局未验证，不把参考户型未选中截图当作通过证据。

### 工具栏继续验证记录
已增加快捷键回归：V、M、X、Esc、输入框屏蔽以及 3D 测量/拆改限制均通过，新工具栏测试共 5 项；check、开发及生产构建通过。找到既有 `/tmp/enter-performance-audit` 审计环境，严格 app 审计运行完成但未通过：既存入口 raw/Brotli 超预算、两个动态模块未分类、外部字体无法静态验证。未进行与此次需求无关的性能改造。浏览器性能、展开菜单响应式布局及部署 HTTP 仍未验证。

## 已实现工具栏：原始上下文
当前 2D 工具栏把门、窗藏在「结构」菜单中，而测量占据独立入口。按用户确认，将常用的「选择、绘墙、门、窗」直接展示，把低频操作集中到「更多」下拉菜单；不新增「选择外墙」工具。

## 推荐方案
- 自定义户型的 2D 工具顺序：**选择 → 绘墙 → 门 → 窗 → 更多**。门、窗复用现有 `ToolButton`，点击直接调用 `setTool('door'/'window')`，当前工具显示选中态。
- 将原「结构」入口改为「更多」，合并原测量菜单。菜单包含「测量距离」「清除测量线」「拆改非承重墙」，使用分隔线区分测量和拆改。
- 复用现有 `DropdownMenu`、`clearMeasures`、图标、选中标记和快捷键提示；测量/拆改生效时「更多」入口高亮。清除测量线保留数量提示，无测量线时禁用。
- 测量操作提示与帮助文本中的「测量菜单」同步改为「更多菜单」。
- 保留参考户型不开放绘墙和添加门窗的现有限制；不调整墙体绘制、门窗放置、拆改规则、快捷键及撤销重做逻辑。不改左侧硬装分类、3D 工具栏、其他工具和数据库。
- 沿用现有语义色和工具栏样式，仅在新增入口造成窄屏拥挤时调整工具栏布局，不另做视觉改版。

## 关键文件与复用点
- `src/features/interior/components/Workbench.tsx`：2D 工具栏、`ToolButton`、`clearMeasures`、模式提示与帮助文本。
- `src/features/interior/components/Workbench.test.tsx`（新增）：针对工具入口、菜单内容及回调的回归测试，参考现有 `Library.test.tsx` 的 Vitest 测试习惯。
- `src/index.css`（按需）：现有 `.main-toolbar`、`.tool-button` 与窄屏规则。

## Implementation checklist
- [x] 在自定义户型的 2D 工具栏中直接渲染选择、绘墙、门、窗，并连接既有工具状态与回调。
- [x] 删除独立测量入口，把结构入口更名为更多；合并测量距离、清除测量线和拆改非承重墙。
- [x] 更多入口与菜单项反映测量/拆改选中态；清除测量线保留数量与空列表禁用逻辑。
- [x] 模式提示与帮助文本指向更多菜单，不再引导用户寻找顶部测量菜单。
- [x] 保留参考户型工具限制、3D 工具栏及左侧硬装入口。
- [x] 添加针对入口顺序、菜单回调和默认/禁用状态的工具栏回归测试。

## Verification checklist
- [x] 正向：自定义户型默认显示选择、绘墙、门、窗、更多；点击前三种编辑工具分别传递 wall、door、window 给画布并显示对应选中态。
- [x] 正向：更多中的测量与拆改分别进入 measure、demolish；已有测量线可清除，清除后数量归零。
- [ ] 默认/负向：更多关闭时不展示菜单项；没有独立测量或结构按钮；无测量线时清除项禁用。后两项已通过单元测试；关闭菜单状态已检查参考户型截图，实际开关交互未测。
- [ ] 边界：参考户型仍不开放绘墙和添加门窗；切换 3D 后保持原有工具；M、X、V 和 Esc 行为不变。前两项单元测试通过；快捷键代码未修改，浏览器快捷键交互未验证。

## 验证记录
- 项目类别：app；涉及 `/` 工作台，不改变入口依赖、认证、数据请求或媒体加载。
- 功能回归：通过，32 个测试文件、173 项测试；新增工具栏 4 项测试。`pnpm run check` 通过，有既存 PlanCanvas effect 依赖警告。
- 构建：开发与生产构建通过。生产入口从 1,035.76 kB 变为 1,035.65 kB，gzip 从 322.05 kB 变为 322.04 kB；这是本地压缩估算，非实际传输。
- 构建审计：未验证，严格 app 审计被审计工具缺少 parse5 依赖阻塞；不为本次工具栏改动安装额外业务依赖。保留原有大块、Browserslist 与第三方 use-client 指令告警，不作性能达标声明。
- 浏览器性能：未验证，缺少受控生产浏览器交互与性能采样能力。已查看 390 和 1280 宽的参考户型截图，但不能代表自定义户型全部新增入口与展开菜单已通过响应式验证。
- 部署 HTTP：未验证，未提供发布 URL。平台待支持项：生产浏览器交互/性能验收及部署 HTTP 证据；严格审计环境需预装 parse5。
- 控制台存在改动前的 ResizeObserver 通知警告（11:11:11，工具栏热更新为 11:11:33），本次未改其关联逻辑。
- [ ] 浏览器检查：在同一工作台路由以 desktop_1280 和 mobile_390 检查新增入口及打开的更多菜单，无重叠、裁切或不可访问入口；以这两个视口作为未指定设备时的验证假设。已截图检查参考户型的关闭菜单状态；没有浏览器交互工具，尚未验证自定义户型新增按钮及展开菜单的实际布局。
- [x] 执行 `pnpm exec vitest run src/features/interior/components/Workbench.test.tsx`、`pnpm test`、`pnpm run check` 和 `pnpm run build`，记录实际结果。
