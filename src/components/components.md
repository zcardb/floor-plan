# Components

跨 Feature 复用的界面，一个目录一类组件，按文件导入（例如 `@/components/cms/cms-page-header`）。只被一个 Feature 用到的组件放回那个 Feature 的 `components/`；这里的组件不得依赖 `features/` 与 `app/`，可以依赖 `lib/`。按场景挑组件见根目录 `AGENTS.md` §1。

| 目录 | 组件 | 用途 |
| --- | --- | --- |
| `ui/` | shadcn 基础控件（Button、Dialog、DropdownMenu、Popover、Command……）+ `editor-tooltip`、`confirm-dialog` | 平台脚手架，所有界面的基础控件 |
| `cms/` | `CmsPageHeader`、`CmsSearchField`、`CmsFilterBar`（`compact` 用于侧栏）、`CmsFilterGroup`、`ManagementLoading`、`LoadError` | 管理页的页头、搜索、分类胶囊、骨架屏与读取失败 |
| `list-load-more/` | `ListLoadMore` | 统一分页列表底部的滚动加载哨兵与「已加载全部」 |
| `panel/` | `PanelList`、`PanelHint` | 侧栏列表外壳（搜索 + 胶囊 + 标题 + 滚动区）、可关闭的底部提示 |
| `picker/` | `FurniturePicker`、`VisualSelectField`、`picker-items`（`PickerItem` 与筛选 / 分组）、`furniture-picker-items`（家具与参考类型选项） | 带图选项的搜索选择器 |
| `material-swatch/` | `FloorSwatch`、`materials`、`material-thumbs`（`furnitureThumb`、`floorThumb`、`colorThumb`、`openingThumb`…）、`opening-icon` | 地面纹理、材质缩略图 |
| `furniture-shape/` | `FurnitureShape`、`StairPlan` | 家具与楼梯的 2D 符号（画布、缩略图、导出共用一份） |
| `color-picker/` | `ColorPicker`、`palette` | 颜色选择（`swatch` / `field` 两种外观） |
| `editor-select/` | `EditorSelect` | 编辑器刻度的下拉选择 |
| `account-avatar/` | `AccountAvatar`、`account-identity` | 按邮箱生成的账号头像 |
| `plan-thumbnail/` | `PlanThumbnail` | 户型缩略图（项目卡片、AI 新建） |
| `ai-icon/` | `AiIcon` | AI 入口图标 |
| `software-soon-item/` | `SoftwareSoonItem` | 暂未开放的菜单项 |
| `logo/` | `Logo` | 品牌标识 |
| `error-boundary/` | `ErrorBoundary` | 界面崩溃兜底 |
