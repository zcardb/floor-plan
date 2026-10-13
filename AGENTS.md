# AGENTS.md

给参与本项目开发的 AI / 开发者看的工作约定。动代码之前先读 `docs/architecture.md`（目录分层、公开入口、按需加载、统一分页），写新 UI 之前再读 `docs/ui-guidelines.md`（字号、间距、菜单刻度）和 `CodeGuideline.md`（平台目录与路由规则）。

## 1. 先复用通用组件，再考虑新写

**新增界面前，先在下表里找能用的组件。** 能用就直接用，不够用就给它加参数，不要另写一份长得差不多的。新写的通用组件也要补进这张表。

### 1.1 选择与输入

路径都相对 `src/`；`components/` 下的是共享组件，`features/<名>/` 下的只在该 Feature 内用（别的 Feature 经它的 `index.ts` 取）。

| 场景 | 组件 | 说明 |
|---|---|---|
| 任何「从一组带图的选项里选一个」：家具、参考类型、地面 / 墙面 / 屋面 / 吊顶材料、门窗款式、房间内家具 | `components/picker`：`FurniturePicker` + `picker-items.ts`（`PickerItem`）、`furniture-picker-items.tsx` | 弹层里是搜索框和列表，左侧 32px 缩略图块，右侧是名称和一行说明，当前项打勾。工具条入口可以加 `tooltip`（悬浮提示）、`heading`（标题 + 数量），只列名称的用 `compact`（240px 窄弹层） |
| 表单里的带图下拉（标签 + 触发按钮） | `components/picker`：`VisualSelectField` | 内部就是 `FurniturePicker`，传 `options` 即可 |
| 列表左侧的 2D 缩略图 | `components/material-swatch/material-thumbs.tsx` | `furnitureThumb`（家具俯视图或参考符号）、`floorThumb`、`colorThumb`、`openingThumb`、`outlineThumb`、`noneThumb` |
| 颜色 | `components/color-picker`：`ColorPicker` | `variant="swatch"` 用于工具条和面板（32px 按钮里放 18px 纯色圆点）；`variant="field"` 用于表单（色块 + HEX） |
| 单价 | `features/costs`：`PriceField`（公开） / `PriceInput` | 金额、单位、同步账号库 |
| 尺寸 | `features/editor`：`SizeFields`、`RoomSidesEditor`、`SeparatorLengthFields` | 输入时实时生效，失焦后合并成一步撤销（`SizeTransaction`） |
| 工具条里直接改名 | `features/editor`：`EditorNameInput` | 回车或失焦提交，Esc 放弃，空名称恢复原名 |

### 1.2 菜单与操作

| 场景 | 组件 | 说明 |
|---|---|---|
| 家具图层顺序 | `LayerMenu` | 置顶、上移、下移、置底；工具条和面板共用 |
| 墙体操作 | `WallOptionsMenu` | 两行菜单项的标准写法（图标 + 标题 + 说明），新的两行菜单照它的刻度做 |
| 房间删除 | `RoomDeleteMenu` | |
| 新建项目方式 | `features/projects`：`CreateProjectMenuItems`（`CreateOption`） | |
| 暂未开放的入口 | `components/software-soon-item`：`SoftwareSoonItem` | 禁用，悬停提示 Coming soon |
| 悬浮提示 | `components/ui/editor-tooltip`（`EditorTooltip`） | 编辑器里所有图标按钮都要有，支持显示快捷键 |
| 确认弹窗 | `components/ui/confirm-dialog` | 不用 `window.confirm` |
| 提示消息 | `lib/notify`（`notify`；网站更新后旧页面拿不到按需模块时自动提示刷新） | |

### 1.3 展示

| 场景 | 组件 |
|---|---|
| AI 入口图标 | `components/ai-icon`：`AiIcon`（不要用 lucide 的 `Sparkles`） |
| 房间指标（净使用面积、周长、开间、进深） | `features/editor`：`RoomMetrics`（指标卡）；数值来自 `lib/floor-plan/room-metrics.ts` |
| 弹层头部、分组小标题 | `.visual-popover-head`、`.visual-popover-section`（见 `docs/ui-guidelines.md` §5.4） |
| 房间轮廓预览 | `features/editor`：`RoomSidesDiagram` |
| 地面纹理 | `components/material-swatch`：`FloorSwatch` |
| 家具 2D 符号 | `components/furniture-shape`：`FurnitureShape` |
| 面板底部操作提示（可关闭） | `components/panel`：`PanelHint` |

### 1.4 编辑器外壳

| 场景 | 组件 | 说明 |
|---|---|---|
| 右侧侧栏（家具库 / 方案与成本 / 户型 / 风格 / AI / 布局整理共用） | `features/editor`：`SidePanel`（`PanelKind`） | 轻量标题行（13px 常规灰字 + 关闭，无分割线）+ 滚动区，宽 340px；≤1100px 变抽屉。内容按 `docs/ui-guidelines.md` §10 的刻度写 |
| 侧栏列表外壳（搜索 + 分类胶囊 + 标题 + 滚动区） | `components/panel`：`PanelList` | 家具库、风格面板共用 |
| 画布竖条 | `features/editor`：`CanvasRail` + `rail-tools.tsx`（`PlanRailTools` / `SceneRailTools`） | 画布左上，内容随 2D / 3D 切换：2D 选择 / 墙 / 门 / 窗 / 更多 / 家具，3D 鸟瞰 / 漫游 / 斜视 / 俯视 / 剖切 / 风格；底部固定「户型设置」+ 收起；游客与登录一致；整条可拖动 |
| 竖条里的一行 | `features/editor`：`RailButton` | 图标 + 文字，当前项主色底 |
| 顶栏造价 | `features/costs`：`CostChip` | 直接显示全屋造价，点击打开「方案与成本」侧栏 |
| 方案报告 | `features/report`：`ReportDialog` | 入口在顶栏「保存与导出」→「生成方案报告」：弹窗立即打开并显示加载态，报告正文按需加载；预览里下载 PDF（`loadReportExport()` 按需加载 pdf-lib）。规范见 `src/features/report/README.md` |
| 布局整理 | `features/editor`：`LayoutPanel` / `LayoutTidyButton` | 一键整理挡门、压窗、背后没墙、出了房间的家具（一步撤销），侧栏列出仍需手动处理的问题；规则在 `lib/floor-plan/layout-rules.ts` |
| 方案指标卡 | `features/costs`：`PlanMetrics` | 套内净面积 / 空间数 / 家具数，放在成本侧栏顶部 |
| 装修风格 | `features/decor-styles`：`StylePanel`（编辑器侧栏）、`StyleManager`（管理端「风格管理」，lazy） | 100 套内置风格 + 我的风格，只影响 3D 渲染；规范见 `src/features/decor-styles/README.md` |
| 顶栏视图设置 | `features/editor`：`ViewMenu`（`LAYER_ITEMS`） | 「视图」文字按钮 + 下拉箭头；图层开关 + 显示比例 |
| 成本合计 / 定价 | `features/costs`：`CostSummary` / `CostPricing` | 全屋与房间口径共用 |
| 顶栏保存与导出 | `features/editor`：`ExportMenu`（`saveState`） | 登录后主按钮；游客为副按钮，右侧另有主按钮「登录」 |
| AI 对话侧栏 | `features/ai-design`：`AiChatPanel`（lazy） | 复用 `AiComposer`；竖条入口暂时隐藏 |
| 侧栏里的 2–4 个互斥选项 | `features/editor`：`PanelSegmented` | 与「2D 平面 / 3D 场景」同一外观 |
| 单行分类胶囊（溢出渐隐、滚轮横滑） | `components/cms`：`CmsFilterBar` | 管理页与侧栏共用；侧栏传 `compact` 变紧凑 |
| 管理页页头 / 搜索 / 骨架屏 / 读取失败 | `components/cms`：`CmsPageHeader`、`CmsSearchField`、`CmsFilterGroup`、`ManagementLoading`、`LoadError` | 四个管理页共用 |
| 列表分页与滚动加载（每页 20 条） | `hooks/use-paged-list` + `components/list-load-more`：`ListLoadMore` | 所有列表统一用它们，接口契约见 `docs/architecture.md` §5 |

基础控件（Button、Popover、DropdownMenu、Command、Dialog、Input……）统一用 `src/components/ui/` 里的 shadcn 组件。共享组件的完整清单见 `src/components/components.md`，各 Feature 的职责与公开入口见 `src/features/features.md`。

## 2. 方向：对象编辑在 Visual Editor 工具条，全局内容在右侧侧栏

右侧属性面板已删除：选中对象的编辑都在浮动工具条（`SelectionEditor`）里完成；方案与成本、户型、风格、家具库、AI 这类全局内容放在 `SidePanel`，入口在 `CanvasRail` 竖条（方案与成本另有顶栏 `CostChip` 入口）。所以：

- 对象编辑能力只加在工具条里，不要再往侧栏塞对象属性。
- 信息展示类的内容（例如房间指标）用小字放进对应的工具条弹层。

## 3. 代码组织（详见 `docs/architecture.md`）

- 新代码先判断归属：只服务一个业务用例的放进对应 `features/<名>/`；多个 Feature 共用的规则与数据放 `lib/floor-plan`，界面放 `components/`；全局 Provider 能力放 `contexts/`。
- 跨 Feature 只从 `@/features/<名>`（`index.ts`）导入；Feature 内部用相对路径。较重或操作后才出现的界面以 lazy 组件导出，大模块以 `load*()` 函数导出，别把它们静态带进首屏包。
- 访问后端只经 `@/lib/backend`（`backend()`、`requireUserId()`、`readPage()`），不直接导入 `@/integrations/supabase/*`；`three` 只在 `features/scene-3d` 里用。
- 列表一律用统一分页接口 `{ list, pagination, counts }` + `usePagedList` + `ListLoadMore`，每页 20 条。
- 文件名 kebab-case；测试放所属模块的 `__tests__/`，统一用 Vitest。

## 4. 改完要跑的检查

`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm test`、`pnpm run lint`、`pnpm check:architecture`、`pnpm check:test-layout`、`pnpm run build`（对比首屏 `index-*.js` 体积）。
