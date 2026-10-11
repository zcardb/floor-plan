# AGENTS.md

给参与本项目开发的 AI / 开发者看的工作约定。写新 UI 之前先读这份文件，再读 `src/features/interior/UI_GUIDELINES.md`（字号、间距、菜单刻度）和 `CodeGuideline.md`（目录与路由规则）。

## 1. 先复用通用组件，再考虑新写

**新增界面前，先在下表里找能用的组件。** 能用就直接用，不够用就给它加参数，不要另写一份长得差不多的。新写的通用组件也要补进这张表。

### 1.1 选择与输入（`src/features/interior/components/`）

| 场景 | 组件 | 说明 |
|---|---|---|
| 任何「从一组带图的选项里选一个」：家具、参考类型、地面 / 墙面 / 屋面 / 吊顶材料、门窗款式、房间内家具 | `FurniturePicker` + `pickerItems.tsx`（`PickerItem`） | 弹层里是搜索框和列表，左侧 32px 缩略图块，右侧是名称和一行说明，当前项打勾。工具条入口可以加 `tooltip`（悬浮提示）、`heading`（标题 + 数量），只列名称的用 `compact`（240px 窄弹层） |
| 表单里的带图下拉（标签 + 触发按钮） | `VisualSelectField` | 内部就是 `FurniturePicker`，传 `options` 即可 |
| 列表左侧的 2D 缩略图 | `materialThumbs.tsx` | `furnitureThumb`（家具俯视图或参考符号）、`floorThumb`、`colorThumb`、`openingThumb`、`outlineThumb`、`noneThumb` |
| 颜色 | `ColorPicker` | `variant="swatch"` 用于工具条和面板（32px 按钮里放 18px 纯色圆点）；`variant="field"` 用于表单（色块 + HEX） |
| 单价 | `PriceField` / `PriceInput` | 金额、单位、同步账号库 |
| 尺寸 | `SizeFields`、`RoomSidesEditor`、`SeparatorLengthFields` | 输入时实时生效，失焦后合并成一步撤销（`SizeTransaction`） |
| 工具条里直接改名 | `EditorNameInput` | 回车或失焦提交，Esc 放弃，空名称恢复原名 |

### 1.2 菜单与操作

| 场景 | 组件 | 说明 |
|---|---|---|
| 家具图层顺序 | `LayerMenu` | 置顶、上移、下移、置底；工具条和面板共用 |
| 墙体操作 | `WallOptionsMenu` | 两行菜单项的标准写法（图标 + 标题 + 说明），新的两行菜单照它的刻度做 |
| 房间删除 | `RoomDeleteMenu` | |
| 新建项目方式 | `CreateProjectMenuItems`（`CreateOption`） | |
| 暂未开放的入口 | `SoftwareSoonItem` | 禁用，悬停提示 Coming soon |
| 悬浮提示 | `@/components/ui/editor-tooltip`（`EditorTooltip`） | 编辑器里所有图标按钮都要有，支持显示快捷键 |
| 确认弹窗 | `@/components/ui/confirm-dialog` | 不用 `window.confirm` |
| 提示消息 | `@/lib/notify`（`notify`） | |

### 1.3 展示

| 场景 | 组件 |
|---|---|
| AI 入口图标 | `AiIcon`（不要用 lucide 的 `Sparkles`） |
| 房间指标（净使用面积、周长、开间、进深） | `RoomMetrics`（指标卡）；数值来自 `model/roomMetrics.ts` |
| 弹层头部、分组小标题 | `.visual-popover-head`、`.visual-popover-section`（见 UI_GUIDELINES §5.4） |
| 房间轮廓预览 | `RoomSidesDiagram` |
| 地面纹理 | `FloorSwatch` |
| 家具 2D 符号 | `FurnitureShape` |
| 面板底部操作提示（可关闭） | `PanelHint` |

基础控件（Button、Popover、DropdownMenu、Command、Dialog、Input……）统一用 `src/components/ui/` 里的 shadcn 组件。

## 2. 方向：用 Visual Editor 工具条替代右侧属性面板

最终目标是去掉右侧属性面板，所有编辑都在选中对象的浮动工具条（`SelectionEditor`）里完成。所以：

- 面板里新增或调整一项能力时，工具条里也要有对应入口，并且两边用同一个组件，不要各写一份。
- 信息展示类的内容（例如房间指标）用小字放进对应的工具条弹层，不再单独加面板区块。

## 3. 改完要跑的检查

`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm exec vitest run src`、`pnpm run lint`、`pnpm run build`。
