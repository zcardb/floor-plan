# account-library · 账号家具与材料库

## 职责

账号级的家具与材料：家具管理页（`/furniture`，家具、地面、墙面、门窗、屋面、吊顶，分大类 / 分类筛选、搜索、滚动加载）、自定义家具与材料的新建 / 编辑 / 删除、内置家具的账号调价（覆盖行）、账号默认单价；编辑器家具库读取的账号条目。

## 公开入口

- `useAccountLibrary()`：编辑器用的账号库全部条目（一次读视图 `interior_account_library`），类型 `AccountLibraryData`
- `accountFurniturePage(request, filters)`：「我的家具」分页（风格详情用）
- `AccountFurnitureLibrary`：家具管理页（lazy）
- `CustomFurnitureDialog`：新建 / 导入自定义家具与材料的弹窗（lazy，编辑器使用）

## 目录

`api/`（`library-pages.ts` 分页列表、`account-rows.ts` 行映射、`account-writes.ts` 写入）、`hooks/`（`use-account-library.ts`、`use-account-cost-commit.ts`）、`components/`（管理页、家具 / 材料详情弹窗与表单）、`model/`（成本条目、新建分类、家具草稿与尺寸保存）。

## 规则

- 家具管理页列表用 `interior_library_page`，以 `p_exclude_keys = BUILTIN_IDS` 排除内置家具的覆盖行，覆盖行另外按 `catalog_id` 读取；排序为自建在前、内置在后。
- 家具详情左侧视觉区：软装有 2D / 3D 切换（硬装只有 2D）。3D 是 `scene-3d` 的 `FurnitureModelPreview` 实时模型，可拖动旋转，跟随表单里的尺寸与颜色实时预览。
- 「AI 调整」跟随当前视角：2D 更换俯视图（写 `imageUrl`），3D 生成简易 3D 模型（写 `model3d`，项目 3D 场景同样使用）；3D 没有可参考的图片时，用实时模型截图当默认参考图。经 `ai-design` 的公开入口（`FurnitureAiDialog`、`useFurnitureImage`）。
- 材料采购编辑复用 `costs` 的 `MaterialProcurementEditor`。
