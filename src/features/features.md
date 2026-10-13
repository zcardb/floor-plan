# Features

每个 Feature 是一个业务用例：界面、状态、数据读写与测试放在一起，别的模块只能从它的 `index.ts` 取东西。目录约定、依赖规则与按需加载要求见 `docs/architecture.md` §2–§3；新建 Feature 时同时写 `README.md` 与 `plan.md`，并补进下表。

| Feature | 职责 | 公开入口（`index.ts`） | 依赖的其他 Feature |
| --- | --- | --- | --- |
| [editor](./editor/README.md) | 工作台：2D 画布编辑、浮动工具条、右侧侧栏、画布竖条、撤销与尺寸、保存与导出菜单；装配其余 Feature | `Workbench` | projects、account-library、ai-design、costs、decor-styles、dxf-import、report、scene-3d |
| [projects](./projects/README.md) | 登录会话与项目保存（云端项目、游客草稿、自动保存）、项目管理页、项目菜单、新建项目 | `useProjects`、`projectPage`、`ProjectMenu`、`ProjectManager`（lazy）及类型 | ai-design、dxf-import |
| [account](./account/README.md) | 登录 / 注册弹窗 | `AuthDialog`（lazy） | — |
| [account-library](./account-library/README.md) | 账号家具与材料库：家具管理页、自定义家具与材料、账号默认单价、编辑器家具库数据 | `useAccountLibrary`、`accountFurniturePage`、`AccountFurnitureLibrary`（lazy）、`CustomFurnitureDialog`（lazy） | ai-design、costs |
| [costs](./costs/README.md) | 方案与成本侧栏、顶栏造价、单价与材料采购编辑 | `CostPanel`、`CostChip`、`PriceField`、`MaterialProcurementEditor` | — |
| [decor-styles](./decor-styles/README.md) | 装修风格：编辑器风格面板、风格管理与详情、我的风格 | `StylePanel`、`saveAccountStyle`、`StyleManager`（lazy） | account-library |
| [ai-design](./ai-design/README.md) | AI 布局、AI 对话、AI 新建项目、家具图片生成、小助手管理 | `useRoomAi`、`useAiCatalog`、`useFurnitureImage`；`AiRoomDialog`、`AiChatPanel`、`AiCreateProjectDialog`、`FurnitureAiDialog`、`AssistantManager`（均 lazy）及类型 | projects（仅类型） |
| [report](./report/README.md) | 方案报告：预览与多页 A4 PDF | `ReportPreview`（lazy）、`loadReportExport()` | — |
| [scene-3d](./scene-3d/README.md) | 3D 场景（three.js）：家具精修模型、材质与灯光、漫游 | `loadScene3D()` 及类型 | — |
| [dxf-import](./dxf-import/README.md) | 导入 DXF 户型图与 JSON 方案文件 | `DxfImportDialog`、`parseDesignFile`、`IMPORT_ACCEPT`、`DXF_TEMPLATE_ID`、`DxfSource` | — |

Feature 之间只允许上表的单向依赖，不得成环（`pnpm check:architecture` 检查运行时循环；仅类型导入不算）。多个 Feature 都要用的规则与数据下沉到 `lib/floor-plan`，界面下沉到 `components/`。
