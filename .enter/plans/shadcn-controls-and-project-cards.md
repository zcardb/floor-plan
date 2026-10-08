# Visual Editor 接入 shadcn，长度默认统一为米

## Context

前一轮家具/项目弹窗的 shadcn 接入和项目卡片精简已完成，本轮不重新改动卡片业务。用户追加两项要求：继续替换 Visual Editor 等编辑控件，尤其截图中的地面/墙面下拉；家具、墙体、户型等所有长度尺寸输入与测量默认使用米。

采用「界面米、内部毫米」：例如已有 1800 mm 家具显示为 1.8 m，输入 2.4 m 后仍保存为 2400 mm。这样无需迁移数据库，也不破坏旧项目、导入文件、几何运算、3D 和 AI 请求。没有额外单位切换器。

## 推荐实现

### 1. 统一单位边界
- 新增 `src/features/interior/model/lengthUnits.ts`：毫米→米、米→毫米、显示格式、输入草稿转换。长度显示最多三位小数并去掉无意义尾零（240 mm → 0.24 m）；输入初始化保留已有精度，不因打开表单而舍入旧尺寸。
- 米制长度输入默认 `step=0.001`；把原有 min/max 换算成米。旋转角度仍为度，面积仍为 m²，金额、百分比、张数/箱数不换算。
- 空字符串、负坐标与非法数值显式处理，不能把空输入当作 0，不能用默认尺寸掩盖无效输入。

### 2. Visual Editor 和关联编辑表单接入 shadcn
- `SelectionEditor.tsx`：地面/墙面原生 select 换为现有 `Select/SelectTrigger/SelectValue/SelectContent/SelectItem`，复用 `materials`、`wallMaterials` 和 `p.change`；仍只改变当前房间的 `mat` 或 `wallMat`，未设置墙面时默认 `paint`。尺寸入口文字统一显示米。
- `SizeFields.tsx`：换 `Input/Label`，米制输入草稿仅在调用 `transaction.update` 前转回毫米，`rot` 不转换。继续复用 `createSizeTransaction` 的即时预览、失焦合并一步撤销、Escape 取消和卸载处理；事务模型本身保持毫米。
- `PriceInput.tsx`：换 `Input/Button`，保留 disabled、留空表示未定价、Enter 应用、Escape 恢复及非负金额验证。
- `MaterialProcurementEditor.tsx`：计价单位换 `Select`，数值换 `Input`，展开/应用按钮换 `Button`。单张长宽输入为米，保存采购规格时转回毫米；损耗、每箱张数、价格不转换，切换计价单位仍清空单价。
- `PropertyPanel.tsx`：此次需要改动的名称/数值表单同步换 `Input`。数值帮助函数显式区分长度和角度，避免按中文标签猜单位；保持 `editSelection`、`resizeBlank`、异步缩小户型确认/拒绝回滚逻辑。
- 不扩展到全站搜索框、日照滑块、原生文件上传或自定义取色器；它们不属于此次长度编辑/材质选择链路。隐藏文件输入继续保持原生。

### 3. 其余长度入口全部统一米
- `CustomFurnitureDialog.tsx`：宽/深/高/直径默认值从 1800/800 等变为 1.8/0.8 等；预览、验证、生成与保存边界统一转回毫米。保留形状联动、AI 请求去重和失败重试。
- `FurnitureGeometryEditor.tsx`：现成 shadcn 控件保留，直径/宽深输入与错误范围换为米；`appearanceDimensions` 和保存回调收到毫米值。空/零/非法输入必须报错，不用原尺寸静默替代。
- `PropertyPanel.tsx`：家具宽深/坐标、房间开间/进深、户型净宽净深、墙厚、层高改为米；既有面积和周长已经是米制，不重复转换。
- `Library.tsx`、`AccountFurnitureLibrary.tsx`、`AccountFurnitureDialog.tsx`、`AccountCostManager.tsx`：家具尺寸摘要全部用米，包括详情中的高度。
- `PlanCanvas.tsx`：`MeasureLine` 的已保存测量、正在测量、绘墙临时测量都显示米；`Dimensions` 水平/垂直尺寸链由裸毫米数字改为米制标注。SVG 几何坐标和线段布局仍保持毫米；导出复用这些文本，自然同步为米。
- `Workbench.tsx`：底栏实时 X/Y 坐标及默认文案用米；现有「1 m」比例尺不动。
- 新增的 `WallHoverOverlay.tsx` 已使用米显示「距起点」，保留既有行为，改用统一长度格式工具避免重复转换逻辑；保留 `WallHoverOverlay.test.tsx` 中吸附位置、距离和导出隐藏的回归检查。
- `model/wallDrawing.ts`：最短墙段错误提示改成 0.1 m，校验阈值仍为 100 mm。

### 4. 样式与兼容
- `src/index.css`：清理/收窄 `.visual-editor-popover input/select`、`.price-entry input/button`、`.procurement-fields input/select`、相关属性输入样式，避免未分层 CSS 覆盖 shadcn 的边框、焦点及禁用状态；保留紧凑布局与移动端可读字号。必要尺寸通过共享编辑控件变体/类集中定义，颜色使用现有语义令牌。
- 验证 Select 嵌套 Popover 的 portal、焦点恢复、Escape、滚动与浮层层级，不让菜单点击透传为画布选择/删除快捷键。
- 不修改数据库、生成客户端、项目 JSON 格式、模型数据单位、碰撞/吸附阈值、面积成本计算或 3D 转换。

## 关键文件与复用

核心：`SelectionEditor.tsx`、`SizeFields.tsx`、`PropertyPanel.tsx`、`MaterialProcurementEditor.tsx`、`PriceInput.tsx`（均在 `src/features/interior/components/`）。
长度边界：同目录 `CustomFurnitureDialog.tsx`、`FurnitureGeometryEditor.tsx`、`PlanCanvas.tsx`、`Workbench.tsx` 与各家具摘要组件；新增 `src/features/interior/model/lengthUnits.ts` 及测试。

复用：现有 shadcn Select/Input/Label/Button；`createSizeTransaction`、`editSelection`、`resizeBlank`、`appearanceDimensions`、`validateProcurement`、`validPrice`，不复制业务计算。

## Implementation checklist
- [x] 新增长度转换/显示/草稿工具，明确旋转与非长度字段不转换。
- [x] Visual Editor 地面/墙面 Select 绑定原材质 key，保留 `paint` 默认值及单房间更新。
- [x] SizeFields 使用 shadcn Input，米制草稿转换后进入毫米事务，保留即时预览/取消/一步撤销。
- [x] PriceInput 使用 shadcn Input/Button，保留空值、金额验证与禁用/键盘行为。
- [x] 采购规格使用 shadcn Select/Input/Button；仅长宽换算，单位切换仍清空价格。
- [x] PropertyPanel 长度输入和名称采用 Input，长度范围/异步拒绝回滚均用正确单位，角度不转换。
- [x] 新建家具与参考几何编辑的默认值、形状联动、预览、限制提示及提交完成米↔毫米转换。
- [x] 所有素材库/账号家具/成本条目尺寸摘要及房间开间进深显示米。
- [x] PlanCanvas 测量线、绘墙临时距离、尺寸链和导出标注显示米，不修改 SVG 几何。
- [x] Workbench 实时坐标/默认坐标和墙段长度错误提示显示米。
- [x] 收窄旧编辑控件 CSS，集中定义紧凑样式与焦点/禁用态，保持主题令牌。
- [x] 添加单位工具与表单绑定回归测试，旧毫米数据不迁移、不重复换算。

### 已执行验证记录
- lint、应用 TypeScript、开发/生产构建通过；18 个测试文件共 107 项测试通过。
- 桌面 1280、手机 390 根路由截图可见米制尺寸链与素材卡片，未发现布局截断。没有可用浏览器点击工具，弹出的材质菜单与交互视觉仍未验证。
- app 类型，入口 `/`，沿用 CSR/静态路由、账号恢复和 2D 工作台；3D 仍仅在用户切换后加载。无新增依赖、网络请求或高频状态更新。
- 生产审计完成但 strict 有告警：入口 JS 约 1030311 B raw / 265891 B Brotli 超默认预算；已有初始 ponyfill 动态依赖与平台注入字体未验证。没有修改预算或移除平台能力，不能宣称性能验收通过。
- 浏览器性能与部署 HTTP 未验证；缺少可用交互自动化/性能追踪及发布 URL。只读技能目录无法安装审计依赖，使用 `/tmp/enter-performance-audit` 可写副本完成审计，不修改应用依赖。
- 并行改动带来的 PromiseLike.catch 类型错误已通过 Promise.resolve 包装修正，保持账号数据读取行为。

## Verification checklist
- [ ] 正向单位测试：1800→1.8，240→0.24，输入 2.4→2400；重复编辑不产生 1000 倍偏差。
- [ ] 默认/负向测试：空输入不变 0；非法数值报错；未配置墙材质保持 paint；单价空值仍为 null。
- [ ] 边界测试：0.05 m 家具、0.1 m 最短墙、负坐标、0.001 m 精度；旋转 90°、面积/采购数量不转换。
- [ ] 输入旧项目尺寸后 preview/commit 得到毫米值；Escape 恢复旧值，失焦只增加一步撤销；拒绝缩小户型时显示恢复为米。
- [ ] 房间两个材质下拉键盘/鼠标选择后仅更新目标房间，嵌套菜单不会关闭错误浮层或触发画布快捷键。
- [ ] 家具圆形直径联动、宽深高预览、保存/重开一致；采购长宽修改后面积/箱数/成本结果不因换单位改变。
- [ ] 现有渲染测试中涉及 mm 的断言按界面米制更新，保留内部毫米测试断言。
- [ ] 执行 `pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm test`、`pnpm run build`。
- [ ] 在同一受影响根路由验证桌面 1280 与手机 390（未指定设备，采用这两个宽度），检查米制标注与编辑浮层无截断；若无法打开浮层，明确标记该交互视觉未验证，不用首页截图替代。
