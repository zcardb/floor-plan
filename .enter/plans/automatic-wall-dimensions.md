## Context
用户希望在当前设计里画出墙后，自动出现参考图中的外围分段尺寸标注，不需要手工添加标注或填写数字；移动墙、拉动端点后标注同步变化。
当前 `PlanCanvas.tsx` 的 `Dimensions()` 用 SVG 绘制四边尺寸链，但参考户型使用固定数组，空白户型只显示 width/depth。`useWallDrawing.confirm()` 已提交真实墙体，墙体拖动已有 preview/commit，因此应从当前 Design 推导标注，而不是增加独立标注数据。

## 推荐实现
- 保持现有画墙权限与交互：在原本可画墙的设计中，墙段确认后自动生成外围尺寸链；未提交的画墙草稿继续使用现有临时 MeasureLine，不提前进入永久尺寸链。
- 新增纯几何函数，以未拆除墙的实际轮廓为来源，使用 `wallPoly()` 获取墙面坐标，以 `bbox()` 确定实际外围范围。水平链收集墙轮廓的 X 投影，竖直链收集 Y 投影，排序去重后，相邻坐标之差就是分段长度。这是整体投影尺寸链，不是每个房间的净尺寸或每面墙的斜向长度。
- 正交墙两侧的投影自然产生墙厚段，例如 240 mm 显示为 0.24 m；水平/垂直墙端点产生分段。斜墙仅以实际轮廓确定总范围，不把斜墙每个顶点加入正交分段，避免将投影长度误当成斜墙长度。
- 四边基线放在实际墙体范围外，沿用现有上下左右的标注间距与细线、刻度、米数风格。上/下使用同一 X 分段，左/右使用同一 Y 分段；本次不做各立面独立的建筑施工图尺寸链。
- 所有户型使用真实几何，移除参考户型写死的分段数组；参考户型数字可能与旧图不同，以实际墙坐标为准。不修改原始参考墙数据来凑旧数字。
- 同坐标使用毫米级容差合并，忽略退化墙及非有限坐标，禁止零/负长度分段；没有有效墙时不绘制尺寸链。短段保留刻度及真实长度，文字使用短段字号并错开标注行避免相邻数字相互覆盖。
- 复用默认开启的 `layers.dims`，关闭后不显示自动标注，不因画墙强制重新开启；不添加新工具、设置面板或可手动修改的数字。
- 自动尺寸只由 Design 派生，随预览、提交、删除/拆除、撤销/重做及重新加载更新；不新增数据库或持久化字段，也不产生额外撤销记录。
- SVG/PNG 导出使用相同尺寸层；画布 fit 与导出范围包含尺寸层，避免墙体偏离原点后标注被裁切。

## 关键文件与复用
- 新增 `src/features/interior/model/perimeterDimensions.ts`：分段与四边范围的纯函数，复用 geometry 的 `wallPoly`、`bbox`、`length` 和 Point/Design 类型。
- 新增 `src/features/interior/components/PerimeterDimensions.tsx`：从现有 Dimensions 提取 SVG 绘制，复用 `formatMeters()` 与 `.dimension` / `.dimension-text` 样式。
- 修改 `src/features/interior/components/PlanCanvas.tsx`：替换原 Dimensions、接入当前 design、调整 fit/exportImage 的边界计算；不重写画墙与拖动逻辑。
- 新增 `src/features/interior/model/perimeterDimensions.test.ts` 与 `src/features/interior/components/PerimeterDimensions.test.tsx`；按需扩展 `PlanCanvas.test.tsx` 的尺寸层接线和导出范围测试。
- 必要时修改 `src/index.css` 的尺寸线语义样式，避免嵌套 SVG 元素丢失 non-scaling-stroke。沿用现有颜色令牌。

## Implementation checklist
- [x] 纯函数从未拆除的有效墙轮廓生成 X/Y 有序断点、正长度分段和四边标注边界，不读取固定参考数组。
- [x] 正交墙厚参与分段；重复投影在 1 mm 容差内合并；斜墙只扩展整体范围，不生成伪斜向长度。
- [x] SVG 组件绘制四边尺寸线、端点刻度与两位小数米数；短段文字错行，尺寸层不截获鼠标事件。
- [x] PlanCanvas 在 layers.dims 开启时以当前 design 渲染尺寸层，画墙确认和墙体预览变化直接触发更新。
- [x] 删除/拆除、取消拖动、撤销/重做后，尺寸只反映对应的当前墙体，不写入 measures 或额外历史记录。
- [x] 移除参考分段数组，未新增墙的旧项目也依据现有墙数据生成标注；无有效墙时不绘制。
- [x] fit 和 SVG/PNG 导出边界包含实际墙轮廓及四边标注，复用同一范围计算，不裁切负坐标或非原点墙体的尺寸线。

## Verification checklist
- [x] 正向：矩形设计新增一条竖直隔墙后，水平链出现两侧距离与真实墙厚段；新增水平隔墙后，竖直链同步分段（纯几何单元测试）。
- [ ] 正向：移动墙与拖动端点的 preview 数值变化，提交保持变化，取消恢复原尺寸；删除/拆除和撤销/重做同步恢复对应分段。
- [ ] 默认/负向：dims 默认开启可显示，关闭后新增墙仍隐藏；画墙草稿仍只有临时测量，不进入永久尺寸链；不影响门窗拖动、家具或手工测量。
- [x] 边界：重复/反向/共线墙、相交墙、不同墙厚、短段、负坐标、非原点及无有效墙输入不会生成重复零段、负数或 NaN；分段之和等于实际投影范围，单斜墙不标成斜向真实长度（单元测试）。
- [x] 参考户型的标签来源于实际几何而非旧数组；旧设计重新加载后无需迁移就能显示尺寸，原始墙体数据未改动（参考设计与 JSON 往返单元测试）。
- [ ] fit 和导出范围单元测试包含尺寸层；验证 PNG/SVG 包含与画布一致的米数和刻度。
- [x] 执行 `pnpm exec vitest run src/features/interior/model/perimeterDimensions.test.ts src/features/interior/components/PerimeterDimensions.test.tsx src/features/interior/components/PlanCanvas.test.tsx`（18 项通过），再执行 `pnpm test`（全部 interior 151 项通过）、`pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm run build`。

## 验证记录与限制
- 功能回归：单元/组件测试通过，含当前墙数组变化、删除/拆除、JSON 往返、尺寸开关、四边 SVG 及边界；浏览器中的画墙/端点/撤销完整事件链未实际操作，相关验收项暂不勾选。
- fit/导出范围：共享函数测试通过；SVG 静态输出包含真实数字、刻度且无导出隐藏标记。PNG 解码及下载没有浏览器实测。
- 构建：开发及生产构建通过；既有大包、第三方 use-client 指令和 Browserslist 告警未因本功能扩大范围处理。生产入口 gzip 从 319.05 kB 变为 319.72 kB（本地估算，不代表实际传输）。
- 构建审计：未验证。`node /workspace/.agents/skills/enter_frontend_performance@1/scripts/audit-vite-build.mjs --profile app --dist dist --strict` 因 parse5 缺失失败；尝试在审计器自己的 scripts 安装依赖，被只读挂载路径阻止，未更改业务依赖。需要平台预装审计器依赖。
- 项目分类：app，主入口 `/` 是可游客使用的设计工具，已有云端项目/素材查询；不修改路由、登录、analytics、i18n 或三维延迟加载。
- 浏览器性能、视觉/响应式与部署 HTTP：未验证。运行日志没有用户代码运行时异常，但存在既有项目/素材请求 status 0 的网络失败，不能据此宣称云端加载/保存通过。

- [ ] 若出现短段文字重叠或边缘裁切的具体视觉问题，检查受影响工作台路由；未取得相应浏览器证据时，不宣称视觉或响应式验证已完成。
