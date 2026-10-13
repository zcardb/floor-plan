# 执行统一分页列表迁移，并构建 69f90a8

## Context

`main` 已经合并 `feat/paged-list-api`（HEAD = `69f90a8`，工作区无未提交改动），四个管理页与编辑器项目切换菜单都已改成调用数据库分页接口。但数据库里还没有这次改动依赖的对象：

- 没有表 `interior_style_catalog`；
- 没有函数 `interior_project_page` / `interior_library_page` / `interior_assistant_page`；
- 视图 `interior_account_library` 还是旧的 6 列，没有 `style` 行、没有 `major` / `search`。

不执行迁移，新版本的四个管理页与项目切换菜单会直接读取失败。所以本次工作是：**原样执行仓库里那份迁移 SQL，然后按项目的检查链构建 69f90a8 这个版本**。这次不写任何产品代码。

关于「拉最新代码」：代码同步由平台管理，我不能自己执行 `git pull`；工作区已经在 `69f90a8`（`Merge pull request #1 from zcardb/feat/paged-list-api`，2026-10-13 12:44），就按这个提交构建。

## 已知的前置条件（已核对，无需再动）

| 检查项 | 结果 |
| --- | --- |
| `interior_ai_assistants` 的 RLS | 已开启，select / insert / update / delete 四条策略均为 `owner_id = auth.uid()` |
| 六张素材表的 RLS | 均已开启，策略 `auth.uid() = owner_id` |
| `interior_design_projects` 的列 | `id`、`name`、`revision`、`updated_at`、`thumbnail` 都在（函数要用） |
| 视图现有列 | `kind`、`item_key`、`name`、`category`、`created_at`、`data`，与迁移里 `create or replace view` 的前 6 列名称与顺序一致，可直接替换并追加两列 |
| 六张素材表的主键列 | `catalog_id` / `floor_key` / `wall_key` / `opening_key` / `roof_key` / `ceiling_key` 都在；`interior_furniture_catalog` 有 `category` 与 `type` |
| 是否已有同名对象 | 无，迁移是纯新增（一张表、三个函数、视图加行加列），不改已有表的数据 |

## 与粘贴文档的差异（按当前分支调整）

粘贴的《接口修改方案》是给 `chore/fsd-restructure` 分支写的，前端的封装路径与当前 `main` 不同（那份文档写 `features/projects/api/project-pages.ts`、`@/lib/backend` 的 `readPage`，当前分支是 `src/features/interior/cloud/projectPages.ts`、`pageRpc.ts`）。因此：

- **做**：执行 `supabase/migrations/migration_20261012_133000000` 的 SQL；执行第 7 节的验收查询；跑构建。
- **不做**：文档第 6 节的第 2、3、4 步（Enter 回写迁移文件、删除本地同名迁移避免重复、`merge --ff-only` 换分支）——这些是当时那套分支流程的收尾，当前工作区不适用。迁移文件保留在 `supabase/migrations/` 作为记录。
- **不做**：任何前端改动。已合并的前端与这份 SQL 契约一致（`src/lib/paging.ts`、`usePagedList`、`cloud/pageRpc.ts` 的 `readPage` 参数名 `p_page` / `p_page_size` 与函数签名匹配）。

## 执行步骤

1. **执行迁移** — 用 `supabase_migration` 原样提交 `supabase/migrations/migration_20261012_133000000` 的内容（185 行）。首次调用若返回 `risk_review_required`，按上文风险说明重试并带 `bypass_risk_check: true`：纯新增对象、不改已有表数据、视图只追加两列并保留原 6 列的兼容。
2. **确认落库** — 只读查询确认：表 `interior_style_catalog` 存在且 `relrowsecurity = true`、有「仅本人」策略；三个函数存在且参数签名与授权正确；视图 8 列。
3. **跑项目检查链**（`AGENTS.md` §3 定的顺序）：
   - `pnpm exec tsc -p tsconfig.app.json --noEmit`
   - `pnpm exec vitest run src`
   - `pnpm run lint`
   - `pnpm run build`（平台构建用的就是这个脚本）
4. **记录构建结果** — 把构建产物大小与是否有 warning 报给用户；若检查链里有失败，逐个修到通过（只修诊断出的问题，不做无关改动）。

## Implementation checklist

- [ ] 迁移 SQL 已原样执行并成功返回（`interior_style_catalog`、三个分页函数、视图两列）
- [ ] `interior_style_catalog` 的 RLS 已开启，策略为 `auth.uid() = owner_id`（`FOR ALL`）
- [ ] `interior_project_page(integer, integer, text, boolean)` 存在且 `authenticated` 有 execute、`anon` 无
- [ ] `interior_library_page(integer, integer, text[], text, text, text, text[])` 存在且授权同上
- [ ] `interior_assistant_page(integer, integer)` 存在且授权同上
- [ ] 视图 `interior_account_library` 为 8 列，前 6 列名称与顺序不变
- [ ] `pnpm exec tsc -p tsconfig.app.json --noEmit` 通过
- [ ] `pnpm exec vitest run src` 通过
- [ ] `pnpm run lint` 通过
- [ ] `pnpm run build` 通过

## Verification checklist

正向：

- [ ] `select public.interior_project_page(1, 20, null, false)` 返回 `{list, pagination:{page:1,pageSize:20,total,…}, counts:{mine:…}}`
- [ ] `select public.interior_library_page(1, 20, array['furniture','floor','wall','opening','roof','ceiling'], null, null, null, null)` 形状一致，`counts` 按分类给出数字
- [ ] `select public.interior_library_page(1, 20, array['style'], null, null, null, null)` 能调用（新表为空时 `list` 为 `[]`、`total` 为 0）
- [ ] `select public.interior_assistant_page(1, 20)` 返回 `counts = {}`

边界与默认值：

- [ ] `p_page_size = 0` 只返回 `total` 与 `counts`（`list` 为空）——`select public.interior_library_page(1, 0, null, null, null, null, null)`
- [ ] 第 2 页与第 1 页不重叠（有数据时按 `created_at desc` 顺延）；`p_page = 0` / 负数按第 1 页处理
- [ ] `p_page_size` 超过 100 被截到 100

负向：

- [ ] 三个函数对 `anon` / `public` 均无 execute 权限（`has_function_privilege` 检查或 `\df+` 等价的 catalog 查询）
- [ ] 函数为 `security invoker`：不会读到其他账号的行（策略依赖各表 RLS，已核对）

构建与运行时：

- [ ] `pnpm run build` 成功，产物生成到 `dist/`
- [ ] `pnpm run build` 的输出中没有新的构建错误（warning 记录并说明）
- [ ] 首屏可加载，控制台无新增错误——用 `get_console_logs` 检查构建后的预览

未验证项（会在汇报中说明）：四个管理页的分页滚动、分类数字、风格详情「我的家具」、项目切换菜单滚动加载，这些需要真实登录账号的真实数据，我只用只读查询核对接口形状；数据库迁移与构建之外的端到端行为不声称已验证。

## 回滚

若迁移导致问题，前端回退到不依赖新接口的提交后执行（见粘贴文档第 8 节）：

```sql
drop function if exists public.interior_project_page(integer, integer, text, boolean);
drop function if exists public.interior_library_page(integer, integer, text[], text, text, text, text[]);
drop function if exists public.interior_assistant_page(integer, integer);
-- create or replace view 不能删列：drop view 后重新执行 migration_20261012_080659000 的视图定义与授权
notify pgrst, 'reload schema';
```

`interior_style_catalog` 里若有用户自建风格，回滚时不要删表。

## 相关文件

- `supabase/migrations/migration_20261012_133000000` — 要执行的 SQL（本次执行，不改内容）
- `src/lib/paging.ts`、`src/hooks/usePagedList.ts` — 前端分页契约（已合并，不动）
- `src/features/interior/cloud/pageRpc.ts`、`projectPages.ts`、`libraryPages.ts`、`assistants.ts` — 三个接口的调用封装（已合并，不动）
- `package.json` — 构建与检查脚本
- `AGENTS.md` §3 — 检查链顺序
