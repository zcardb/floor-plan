## Context
用户反馈门窗选中后不能沿墙拖动，且选中后的 Visual editor 不显示。本次修复限定在 2D 平面门窗交互，不修改数据库、家具编辑或 3D 门开关行为。

已确认：
- `src/features/interior/components/PlanCanvas.tsx` 的门窗点击分支仅调用 `select` 后返回，没有初始化拖动；移动及提交分支也没有门窗处理。
- 新增门窗后没有调用已有 `finishTool`；`Workbench.tsx` 在 `tool !== 'select'` 时隐藏 `SelectionEditor`，因此添加模式下即使选中门窗也看不到工具条。
- 现有 `SelectionEditor` 已有门窗尺寸、位置、详细属性和删除控件，不需要新建 Visual editor。

## 推荐方案
恢复门窗的完整 pointer down → move → up/cancel 链路，仅修改门窗在所属墙上的 `offset`。用墙方向投影计算相对拖动位移，保留按下位置相对于门窗中心的偏差，避免点击门扇或窗边时位置跳动。不允许跨墙；墙端限制门窗完整落在墙段内，与其他门窗重叠的候选位置不更新。

复用 `nearestOnWall`、`length`、`editSelection` 的位置校验，以及现有 `preview` / `commit(next, before)`、5px 拖动阈值和取消恢复机制。一次拖动只形成一条撤销记录，无实际位置变化时不提交。

新增门窗成功后调用已有 `finishTool` 回到选择模式；添加模式下点击已有门窗也切回选择模式并进入门窗交互。保留绘墙、测量、拆除工具的优先级与原有工具条隐藏规则。继续通过 `selectionPoints` → `onAnchor` → `SelectionEditor.update` 跟随选中门窗位置，不更换定位系统。

## 关键文件
- 修改 `src/features/interior/components/PlanCanvas.tsx`：门窗拖动生命周期、添加后返回选择模式。
- 修改 `src/features/interior/components/Workbench.tsx`：门窗添加提示改为与实际拖动和可视编辑行为一致。
- 新增 `src/features/interior/model/openingDrag.ts` 与 `openingDrag.test.ts`：聚焦沿墙位置计算，复用现有几何与校验，不复制规则。
- 新增 `src/features/interior/components/PlanCanvas.test.tsx`：回归事件链路与模式完成回调；沿用现有 Vitest 体系，优先不增加依赖。
- 扩展 `src/features/interior/model/selectionAnchor.test.ts`：门窗移动后的锚点及边缘定位。

## Implementation checklist
- [x] 门和窗 pointer down 记录自身 ID、拖动前方案与沿墙抓取偏差，不再仅选中后返回。
- [x] pointer move 仅更新所属墙上的 offset，水平、垂直、斜墙使用同一投影算法。
- [x] 墙端夹取合法位置，重叠候选保持最后一个合法预览，宽度及 wallId 不变。
- [x] pointer up 有实际变化时只提交一次，单击不提交，pointer cancel 恢复拖动前方案。
- [x] 新增成功及添加模式下选中已有门窗调用 finishTool，Visual editor 按选择模式显示。
- [x] 保留 selectionPoints 和现有工具条定位链路，门窗移动后的锚点随 offset 更新。
- [x] 门窗操作提示与修复后的实际行为一致，其他工具行为保持不变。

## Verification checklist
- [x] 正向：分别拖动门和窗，验证 offset 改变、wallId/宽度不变；垂直和斜墙同样有效（模型及事件测试）。
- [x] 默认/负向：单击及低于 5px 的移动不产生撤销记录；取消恢复原方案；非所属 pointer 不更新门窗（事件测试）。
- [x] 边界：拖至墙两端仍完整位于墙内；与同墙门窗不重叠；门窗恰好相接允许；拖动抓取点不在中心时不跳动（模型及事件测试）。
- [ ] 编辑器：新建门窗后回到选择模式；选中门、窗显示工具条，尺寸与位置、详细属性、删除继续可用；移动后的锚点更新。
- [ ] 回归：家具拖动、画布平移、绘墙、测量、拆除和原始墙结构限制不改变；撤销/重做恢复门窗位置。
- [x] 执行 `pnpm test`、`pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm run build`、`pnpm run build:prod`（129 个测试通过，两种构建及 lint/类型检查通过）。
- [ ] 对 app 路由 `/` 执行生产构建审计：`node /workspace/.agents/skills/enter_frontend_performance@1/scripts/audit-vite-build.mjs --profile app --dist dist --config performance-audit.config.json --strict`；保留现有首屏依赖，不为本修复改动性能预算或平台集成，已有告警单独记录。
- [ ] 在可用浏览器交互环境验证选中、拖动、工具条及撤销；未提供交互工具时明确标记相关行为尚未浏览器验证。针对用户反馈的工具条不可见症状检查 `/`，设备未指定，采用 desktop_1280 与 mobile_390 截图；截图不能替代真实拖动验证。
- [x] 分别记录构建审计、浏览器性能、功能回归、部署 HTTP 的通过/失败/未验证；计划阶段不运行会生成产物的构建，缺少测量能力时不声称性能或部署验证通过。

## 执行验证记录
- 代码修复及模型/事件回归：通过，继续验证后 139 个测试、lint、应用类型检查、development 与 production 构建通过。新增 `SelectionEditor.test.tsx` 覆盖门/窗有效锚点显示、位置更新、非选择模式隐藏、空锚点/离屏隐藏及恢复；使用确定性 hook/元素桩验证真实定位函数，不冒充浏览器实测。
- 构建审计：未验证。前后两次执行均被审计器缺少 `parse5` 阻塞；业务生产构建本身通过，仍有项目原有大 chunk 与依赖指令警告，未调整预算或依赖。
- 浏览器功能及性能：未验证。`/` 在 desktop_1280 与 mobile_390 默认未选择状态正常渲染；截图未执行选中与拖动，不能证明工具条交互或性能。没有可用浏览器交互/性能测量工具，完整浏览器回归项保持未勾选。
- 部署 HTTP：未验证，没有本次生产发布 URL 及部署响应证据。
- 模板代码已完成；平台待支持项为审计器依赖与浏览器交互/性能测量能力，未扩展本次修复范围。
