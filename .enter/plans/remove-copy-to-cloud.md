## Context
用户要求删除项目管理卡片上的“复制到云端”操作（截图中的云朵按钮）。只移除这一入口及其专用前端逻辑，不删除任何项目或改变现有保存方式。

## 推荐方案
修改 `src/features/interior/components/ProjectManager.tsx`：移除本地项目的云朵按钮、`copyToCloud` 函数及未使用的 `Cloud` 图标导入。将原条件分支改为仅在 `row.cloud` 为真时显示普通“复制”按钮。本地项目保留重命名和删除，云端项目保留重命名、普通复制和删除。
复用现有 `Button`、`iconAction`、`projects.duplicate` 及其余操作处理函数，不改样式、数据库、项目读取、新建或保存逻辑。

## Implementation checklist
- [x] 在 `src/features/interior/components/ProjectManager.tsx` 移除“复制到云端”按钮及其标题和无障碍标签。
- [x] 在同一文件移除 `copyToCloud` 专用函数和 `Cloud` 导入，保留云端普通复制分支及其 `projects.duplicate(row)` 调用。
- [x] 在 `src/features/interior/components/managementUi.test.tsx` 复用 `renderToStaticMarkup` 和现有项目测试结构，增加本地、云端及混合项目列表的按钮回归断言。

## Verification checklist
- [x] 本地项目卡片仍有打开、重命名和删除入口，没有“复制到云端”或普通复制入口。
- [x] 云端项目卡片仍有普通复制、打开、重命名和删除入口，没有“复制到云端”入口。
- [x] 混合列表正确保留两类项目，空列表和加载分支原有测试通过。
- [x] 执行 `pnpm exec vitest run src/features/interior/components/managementUi.test.tsx`。
- [x] 执行 `pnpm test`、`pnpm check` 和 `pnpm run build`。
