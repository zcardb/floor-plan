## 后续调整（已实现）
用户将测量基准改为较近墙端：取 `Math.min(offset, length(wall) - offset)`，文案为「距近端 X 米」。两端均显示 0 米，中点为半墙长，反向墙定义不改变结果。截图中遮挡墙体的绘墙说明浮条已移除，说明沿用底部 `status-tip`，「完成绘墙」按钮迁到底部状态栏，其他工具提示不变。修改文件包括 `WallHoverOverlay.tsx`、其测试、`Workbench.tsx` 和 `index.css`。

验证：71 项测试、lint、类型检查和构建通过。桌面 1280 与移动 390 截图显示平面画布正常；截图是在选择模式，绘墙提示及完成按钮的真实交互仍未验证。截图发现同时修改中的 `PlanCanvas.tsx` 使用 `formatMeters` 未导入，已补齐该导入并重新构建及截图确认不再崩溃。浏览器性能、构建审计和部署 HTTP 仍未验证。

## Context
绘墙模式目前在已有墙体上悬停时，只显示连接圆点和「点击连接」。用户确认需要显示**墙体起点到悬停点的距离**，例如「距起点 3 米」，不是整面墙总长，也不是新绘墙段长度。本次仅调整平面画布悬停提示，不修改数据库、墙体数据或其他工具。

## 推荐实现
- 复用 `useWallDrawing.move()` → `resolveWallPoint()` 得到的 `candidate.point` 和 `target.wallId`，提示位置与实际点击连接位置一致；保留已有端点优先、轴向约束、吸附开关和缩放容差规则。
- 起点使用目标墙体的 `wall.a`；复用 `geometry.ts` 的 `nearestOnWall(candidate.point, wall).offset` 得到沿墙距离（毫米）。除以 1000 转换为米，最多三位小数并去掉末尾零，例如「距起点 3 米」「距起点 1.25 米」。
- 提取小型 `WallHoverOverlay` 组件，保留原墙体高亮、连接圆点和「点击连接」，在圆点附近增加距离文本。复用 `--plan-selection`、`--plan-porcelain` 等现有语义颜色；文字、偏移和描边按 `1 / view.s` 保持屏幕尺寸稳定。提示不截获指针事件，也不进入导出图片。
- 无目标墙体时不显示提示；移出画布时仅清除悬停候选，不清除绘墙链或草稿。退出绘墙模式、Enter、Esc 和指针取消继续沿用已有清理逻辑。
- 直接从候选和墙体派生距离，不引入额外距离 state、effect、网络请求、依赖或高频全局更新。现有新墙段 `MeasureLine` 的毫米显示保持不变。

## 关键文件与复用点
- `src/features/interior/components/PlanCanvas.tsx`：替换现有连接提示渲染，接入画布离开事件。
- `src/features/interior/components/WallHoverOverlay.tsx`（新增）：集中渲染目标墙高亮、圆点、连接文案和米制距离。
- `src/features/interior/components/useWallDrawing.ts`：提供只清除候选、不取消草稿的悬停清理入口。
- `src/features/interior/components/WallHoverOverlay.test.tsx`（新增）：按现有 Vitest/服务端渲染测试方式覆盖提示。
- 复用且不改变：`model/geometry.ts` 的 `nearestOnWall()`、`wallPoly()`；`model/wallDrawing.ts` 的 `resolveWallPoint()`；`model/wallDrawing.test.ts` 的吸附回归。

## Implementation checklist
- [x] 新增悬停组件，以目标墙 `a` 到当前连接候选的沿墙距离生成米制文案，保留连接提示。
- [x] 在 `PlanCanvas.tsx` 使用悬停组件；目标不存在时安全地不渲染。
- [x] 提示使用现有语义颜色、缩放补偿、`pointerEvents="none"` 和 `data-export-hide="true"`。
- [x] `useWallDrawing.ts` 增加仅清空候选的入口，画布离开事件调用它，保留草稿和连续绘墙状态。
- [x] 新增提示测试；不修改现有墙体、吸附规则、新墙段测量单位或后端数据。

## Verification checklist
- [ ] 正向：6000 mm 墙体中点显示「距起点 3 米」；沿墙移动提示实时变化，小数去除尾零。
- [x] 边界：起点显示 0 米，终点显示完整沿墙长度；水平、竖直、斜墙及反向定义墙均从 `wall.a` 测量。
- [ ] 默认/负向：无候选、目标墙不存在、非绘墙工具和关闭吸附时不新增提示；拆除墙不成为目标，沿用原规则。
- [ ] 生命周期：离开墙体或画布后提示消失，返回后恢复；离开画布不取消草稿；Enter、Esc、切换工具后不残留提示。
- [ ] 回归：端点吸附、T 形连接、点击/拖动绘墙、连续绘墙、缩放和平移保持原行为；提示不阻挡点击、不进入图片导出。
- [x] 执行 `pnpm exec vitest run src/features/interior/components/WallHoverOverlay.test.tsx src/features/interior/model/wallDrawing.test.ts`，然后执行 `pnpm test`、`pnpm check`、`pnpm run build`。

验证记录：专项 9 项、全量 71 项测试通过；lint、类型检查、预览及生产构建通过。生产构建保留修改前已有的依赖指令、Browserslist 与大包告警。构建审计因技能运行环境缺少 `parse5` 无法执行（修改前后均如此），未修改业务依赖或审计配置。浏览器交互/性能、移动布局及部署 HTTP 未验证：环境无 Playwright/Puppeteer，未取得受控交互或部署证据；不宣称响应式或性能验收通过。距离、缺失目标、关闭吸附、拆除墙和缩放补偿已由组件测试覆盖，生命周期与真实导出仍待浏览器回归。
- [ ] 性能验证：本项目按强交互 `app` 分类；批准后读取既有入口与 `performance-audit.config.json`，复用既有配置运行 `pnpm run build:prod` 与性能技能的 `audit-vite-build.mjs --profile app --dist dist --config performance-audit.config.json --strict`，记录原有告警，不扩展为全站优化。
- [ ] 在实际绘墙入口检查悬停提示可读性和跟随行为；无指定设备时按 desktop_1280 与 mobile_390 检查该受影响画布（移动端只验证布局及原有触控绘墙行为，不承诺触屏 hover）。浏览器性能、部署 HTTP 或交互证据不可取得时明确标记未验证，不由构建通过推断。
