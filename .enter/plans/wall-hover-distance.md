## Context
用户反馈在自定义户型绘墙过程中没有看到实时近端距离，并明确要求：绘墙、测量时双击或右键即可完成。完成语义已确认：**保留已确认内容，丢弃尚未确认的预览，退出到选择模式**。不扩大到参考户型或普通选择模式，不修改后端或用户已有数据。

## 已有实现与本次问题
- 已有 `WallHoverOverlay.tsx` 可显示「距近端 X 米」，使用 `nearestOnWall().offset`、`length()` 与 `formatMeters()`，不拦截指针、不进入导出。
- 当前提示直接依赖绘墙连接 `candidate`。`resolveWallPoint()` 在起笔后施加轴向约束；关闭吸附时没有 target，所以该提示不能独立反映鼠标在墙体上的实时位置。本次分离悬停测距与实际绘墙连接候选，不修改连接规则。
- `PlanCanvas.tsx` 尚无双击或右键结束处理；测量第二点在 pointerdown 提交，绘墙在 pointerup 提交，必须防止双击第二次点击创建新起点或多余墙段。
- 之前专项 9 项、全量 71 项测试与构建通过；桌面/移动截图为选择模式，不能证明绘墙交互通过。现已发现全局 Playwright，但现有 Chromium 启动 SIGTRAP、Firefox 启动失败，尚未取得实际鼠标交互证据。

## 推荐实现
1. **独立实时悬停测距**：在 `useWallDrawing.move(raw)` 中分别更新原有连接 candidate 与无起点轴向约束的墙体悬停候选。复用 `resolveWallPoint(raw, design, scale, true)` 找到附近有效墙体，再用 `nearestOnWall(raw, wall)` 投影到墙中心线作为测距点；近端值为 `min(offset, length-offset)`。即使绘墙吸附关闭，也能悬停测距，但实际点击仍遵守原吸附开关。鼠标离墙/画布、切换模式或完成时清空提示，不清除离开画布前的草稿。
2. **保留连接语义**：`WallHoverOverlay` 接收独立悬停点和实际连接候选，只在两者对应同一墙体及同一连接点时展示「点击连接」，避免提示可连接但实际轴向约束不同。距离实时更新且不依赖草稿是否已起笔。
3. **统一完成入口**：在画布增加完成绘墙/测量的清理函数，清空绘墙链、候选、测量起点、预览与相关指针拖动状态，再调用回调退出到选择模式。复用绘墙 `clear()`；将目前 `finishWall` 回调重命名为通用的 `finishTool`，同步修改 `Workbench` 调用处。完成不调用草稿提交或清空已确认内容。
4. **双击和右键**：仅在绘墙/测量模式处理 `onDoubleClick`、`onContextMenu`，右键阻止浏览器菜单并完成。识别双击第二次 pointerdown/up 并跳过其普通绘制/测量处理，再由双击事件清理退出。第一下按现有单击语义确认有效段，第二下不重复提交，不产生零长度墙、重复测量线或新草稿；事件计数来源需在实际浏览器确认，必要时复用原生鼠标点击计数而非假定 PointerEvent.detail 可用。
5. **提示与现有功能**：更新底部绘墙/测量说明，注明双击/右键结束；绘墙「完成绘墙」按钮和既有 Enter/Esc 仍保留。避免恢复遮挡墙面的浮条，不增加新依赖或网络请求。

## 关键文件与复用
- `src/features/interior/components/PlanCanvas.tsx`：通用完成回调、测量预览清理、双击/右键处理与重复事件保护。
- `src/features/interior/components/useWallDrawing.ts`：独立 hover 候选与统一清理。
- `src/features/interior/components/WallHoverOverlay.tsx`：实时近端提示与连接文案条件。
- `src/features/interior/components/Workbench.tsx`：通用完成回调和底部操作说明。
- `src/features/interior/components/WallHoverOverlay.test.tsx`、`src/features/interior/model/wallDrawing.test.ts`：既有测距/吸附测试；新增针对事件完成与悬停状态的聚焦测试。
- 复用 `model/geometry.ts` 的 `nearestOnWall`、`length`、`wallPoly`，`model/lengthUnits.ts` 的 `formatMeters`，`model/wallDrawing.ts` 的 `resolveWallPoint`、`validateWallSegment`，保留既有门窗/重叠墙校验。

## Implementation checklist
- [ ] `useWallDrawing.move` 使用原始鼠标点更新独立悬停目标，实际连接 candidate 仍使用原轴向与吸附参数。
- [ ] 提示从原始鼠标的墙上投影点计算近端距离，起笔前后均更新，关闭吸附不禁用测距。
- [ ] 「点击连接」仅在悬停点与实际连接候选一致时显示；离墙、完成、切换工具后无残留提示。
- [ ] `PlanCanvas` 与 `Workbench` 一致改用 `finishTool`，结束测量清除 measureStart/draft/drag，结束绘墙复用 clear，不提交未确认草稿。
- [ ] 画布双击第二次按下/抬起不触发额外提交或起笔，双击后退出选择模式。
- [ ] 绘墙/测量右键仅清理退出并阻止菜单，其他工具右键行为保持不变。
- [ ] 底部说明包含双击/右键结束；保留现有绘墙完成按钮与键盘操作。

## Verification checklist
- [ ] 正向：6 米墙在 1 米、3 米、4 米位置分别显示近端 1、3、2 米，连续移动实时变化；起笔前后及关闭吸附时均能测距。
- [ ] 边界：端点 0 米、中点半墙长、反向/水平/竖直/斜墙正确；已拆除墙不显示，远离墙体后不显示。
- [ ] 正向：绘墙、测量双击或右键后回到选择模式，已确认段保留，未确认草稿消失。
- [ ] 负向：双击不生成重复或零长度墙段/测量线、不留下新起点；右键不提交当前跟随鼠标的预览。
- [ ] 默认：选择/结构工具不触发新结束逻辑；连接点与点击文案一致，门窗、重叠墙及最短墙段校验不变。
- [ ] 生命周期：离画布只清空 hover，回来仍可继续草稿；结束后重新进入绘墙/测量无旧起点或指针状态。
- [ ] 执行聚焦 Vitest 测试、`pnpm test`、`pnpm check`、`pnpm run build`、`pnpm run build:prod`。
- [ ] 在独立临时浏览器自定义户型执行真实移动/双击/右键，不修改用户实际项目；若启动限制未解决，记录为未验证，不以测试或选择模式截图替代交互证据。
- [ ] 布局验证只覆盖受影响绘墙入口；未指定设备时使用 desktop_1280/mobile_390，触屏不承诺 hover。浏览器性能、构建审计及部署 HTTP 单独标记状态；既有审计缺少 parse5 的环境阻塞不扩展为业务依赖改造。
