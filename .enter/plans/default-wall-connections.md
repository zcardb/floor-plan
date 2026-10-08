## Context
用户希望墙只要接到另一面墙，就默认自动对齐，不用反复手调；已确认同时需要「画墙/拖端点时自动吸附」和「连接后的转角无缺口、无突出」。

现状：`Workbench.tsx` 已默认开启 `layers.snap`；`resolveWallPoint` 已支持端点和 T 形交点，但先锁定起点轴向，并拒绝与该轴稍有偏差的目标端点，容易接不到。二维墙独立用 `wallPoly` 矩形绘制，三维独立用长方体绘制，没有统一的转角收口。

## 推荐方案
- 沿用默认开启的吸附，不新增设置。接近真实墙端点时优先采用端点精确坐标，允许小幅方向修正；没有端点候选时继续使用现有水平/垂直约束和 T 形交点吸附。保留现有屏幕距离阈值、关闭吸附、自身排除、已拆墙排除。
- 预览与最终落点使用同一 `resolveWallPoint`，绘制和端点拖动都接入，悬停测距仍独立投影，不冻结读数。
- 新增纯几何模块 `model/wallConnections.ts`，根据实际相接的中心线计算连接后的墙轮廓：L 形使用墙面交点收口，T 形支墙接到宿主墙面，直线续接保持连续；不同墙厚按各自墙面处理，未连接端点保持原有平口。近乎平行时限制交点延伸，避免尖刺；不采用所有墙统一延长的办法。
- 二维正式墙、草稿和选中/悬停轮廓复用连接几何；三维墙体使用同一平面轮廓生成墙实体，保留现有门窗分段和高度，不填住开口。连接几何保留墙 ID，选中和拾取仍对应原墙。
- 房间重建复用连接后的隔墙轮廓，避免视觉已闭合而房间仍漏通；相关绘图边界使用同一轮廓，避免收口被裁切。墙中心线、长度标注语义、门窗 offset、存储结构不变。
- 不移动邻墙、不新增连接关系表、不批量修正历史坐标；既有精确连接可自动显示正确收口，未相接的旧墙不被强行连接。不改数据库、项目保存、家具行为或编辑器布局。

## 关键文件与复用
- `src/features/interior/model/wallDrawing.ts`、`wallDrawing.test.ts`：复用 `resolveWallPoint`、`resolveWallHover`、`validateWallSegment`。
- `src/features/interior/model/wallConnections.ts`、`wallConnections.test.ts`（新增）：复用 `length`、`nearestOnWall`、`wallPoly` 和既有 `polygon-clipping`。
- `src/features/interior/components/useWallDrawing.ts`、`PlanCanvas.tsx`、`PlanCanvas.test.tsx`：统一绘制、拖端点、预览和提交链。
- `src/features/interior/scene/Scene3D.tsx`：替换墙体分段的矩形截面，保留门窗实体与墙拾取。
- `src/features/interior/model/geometry.ts`、`geometry.test.ts`、`perimeterDimensions.ts`、`selectionAnchor.ts`、`components/WallHoverOverlay.tsx`：同步房间切割、边界和高亮轮廓；仅修改连接几何调用处。

## Implementation checklist
- [ ] `resolveWallPoint` 在阈值内优先返回真实端点，轴向轻微偏差不再阻止连接；无端点候选仍沿用轴向/T 形吸附。
- [ ] 关闭吸附、自身和已拆墙排除、悬停独立投影行为保持不变。
- [ ] 新几何模块输出 L/T/直线连接的确定性轮廓，保留未连接平口并限制近乎平行尖刺。
- [ ] 二维墙、画墙草稿和墙高亮接入统一轮廓，保留每面墙的颜色、ID 和交互命中。
- [ ] 三维墙分段使用同一连接轮廓；门窗区域与门窗上/下墙体高度保持正确。
- [ ] 房间重建与绘图边界接入统一轮廓，中心线尺寸和门窗 offset 不被改写。
- [ ] 绘制与端点拖动保留合法性校验、释放一次提交、取消恢复和撤销原始快照。

## Verification checklist
- [ ] 单测覆盖轻微错位端点自动对齐、T 形落点、连续画墙闭合、不同缩放的阈值边界。
- [ ] 单测覆盖关闭吸附、阈值外不吸附、自身/已拆墙排除、悬停读数保持投影。
- [ ] 几何单测覆盖等厚/不同厚 L 形、T 形、直线续接、端点反向、未连接平口和近乎平行无异常尖刺；轮廓坐标均有限。
- [ ] 事件链测试覆盖端点拖动预览与最终坐标一致、只提交一次、取消恢复；重叠墙、短墙、穿门窗连接仍被拒绝。
- [ ] 回归房间闭合划分、门窗开口未被填住、墙 ID 拾取、已有尺寸标注及保存/加载后的连接显示。
- [ ] 执行 `pnpm test`（全部 `src/features/interior` 测试）、`pnpm check`、`pnpm run build`。
- [ ] 对编辑器实际路由做一次代表性二维连接视觉检查，检查 L/T 接缝；三维检查相同方案的收口和门窗，无法取得交互证据的部分明确标记未验证。本次不调整响应式布局。
