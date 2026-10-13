# account-library · 计划

## 现状

家具管理页、风格详情的「我的家具」已改用统一分页列表（`interior_library_page`）。

## 后续

- 数据库执行 `docs/api/paged-lists.md` 中的迁移后列表才能读取。
- 编辑器家具库仍一次读取账号库视图（`useAccountLibrary`）；条目增多后可改为同一套分页接口。
