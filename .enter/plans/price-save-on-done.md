# 家具详情：点「完成」保存所有修改

## 背景
账号家具库的家具详情弹窗（`AccountFurnitureDialog`）里，价格要点「应用」、几何/新图片要点「保存参考几何」才保存；直接点「完成」会丢掉修改。改为：**点「完成」时自动保存弹窗内所有未保存修改，再关闭**。原有按钮保持不变。

## 方案
1. `PriceInput.tsx`：`apply()` 返回成功与否；可选 `ref` 暴露 `flush()`（未改动直接成功）。
2. `FurnitureGeometryEditor.tsx`：可选 `ref` 暴露 `flush()`（未改动且无新图直接成功，否则调用现有 `apply`）。
3. `AccountFurnitureDialog.tsx`：「完成」依次 flush 价格、几何，全部成功才关闭；文案改为「点击完成即保存修改」。

## Implementation checklist
- [x] `PriceInput`：`apply()` 返回 boolean，`ref.flush()`，未改动时不调用 `onApply`
- [x] `FurnitureGeometryEditor`：`apply()` 返回 boolean，`ref.flush()`，未改动且无新图时不调用 `save`
- [x] `AccountFurnitureDialog`：「完成」flush 后才关闭
- [x] `AccountFurnitureDialog`：状态文案更新

## Verification checklist
- [ ] 改价格后点「完成」→ 保存并关闭
- [ ] 改几何/有新图后点「完成」→ 保存并关闭
- [ ] 无修改点「完成」→ 直接关闭，无请求
- [ ] 非法价格点「完成」→ 不关闭并提示
- [x] `pnpm run build` 通过；改动的 3 个文件 eslint 通过
- [ ] `pnpm test`：450 通过 / 6 失败，失败项在 guestStore / useProjects（模板功能提交 444549d 引入，非本次改动）
