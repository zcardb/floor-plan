# 接口修改方案：列表统一分页

> 状态：**已执行**（2026-10-13）。Enter 原样执行了迁移，回写为 `supabase/migrations/migration_20261013_052138000`，并按线上库重新生成了 `src/integrations/supabase/types.ts`（提交 `c99976f`）。四个管理页与项目切换菜单都已改用本文的接口。
>
> 上线前在本地 PGlite 替身库上验证过分页、counts、账号隔离与匿名无权限。

## 1. 背景与目标

四个管理页（项目、家具、风格、小助手）和编辑器的项目切换菜单原来在前端一次读全再切页，数据一多就卡。改为由数据库函数分页：

- 每次只取一页（默认 20 条）：第 1 页 1–20，第 2 页 21–40，第 3 页 41–60……
- 统一返回 `{ list, pagination: { page, pageSize, total }, counts }`，分类胶囊上的数字直接用 `counts`，不再为了计数读全量。
- 新增「我的风格」：账号自建的装修风格存进新表 `interior_style_catalog`，与家具、材料走同一个列表接口。

## 2. 变更清单

| # | 对象 | 类型 | 说明 |
| --- | --- | --- | --- |
| 1 | `public.interior_style_catalog` | 新表 | 账号自建风格：`style_key`（`my-` + 6–32 位小写字母数字，账号内唯一）、`name`（1–20 字）、`spec`（风格定义 JSON，≤ 20 KB）、`owner_id`（默认 `auth.uid()`）、时间戳；开启 RLS，策略「仅本人可读写」 |
| 2 | `public.interior_account_library` | 改视图 | 原有 6 列（`kind`、`item_key`、`name`、`category`、`created_at`、`data`）名称、顺序、类型不变；新增 `style` 行（来自新表，分类取 `spec.category`）；楼梯（`type = 'stairs'`）归到「楼梯」分类；末尾新增 `major`（硬装 / 软装 / 风格）、`search`（小写搜索文本）两列。仍为 `security_invoker`，权限不变（仅 authenticated 可读） |
| 3 | `public.interior_project_page(...)` | 新函数 | 我的项目分页 |
| 4 | `public.interior_library_page(...)` | 新函数 | 账号素材库（家具 / 地面 / 墙面 / 门窗 / 屋面 / 吊顶 / 风格）分页 |
| 5 | `public.interior_assistant_page(...)` | 新函数 | 我的小助手分页 |
| 6 | 权限 | 授权 | 三个函数 `revoke all ... from public, anon`，`grant execute ... to authenticated` |
| 7 | `notify pgrst, 'reload schema'` | 刷新 | 让 PostgREST 立即识别新函数 |

三个函数都是 `language plpgsql stable security invoker`、`set search_path = public`：以调用者身份执行，只能读到本人的行（依赖各表已有的「仅本人」RLS），不放宽任何权限。本迁移不改动任何已有表的数据。

## 3. 接口契约

### 3.1 统一返回

```json
{
  "list": [],
  "pagination": { "page": 1, "pageSize": 20, "total": 128 },
  "counts": { "床": 12, "地面": 5 }
}
```

- `page` 从 1 开始，小于 1 按 1；`pageSize` 默认 20，范围 0–100（传 0 只返回 `total` 与 `counts`）。
- `total`：符合当前筛选（分类、搜索）的条数。
- `counts`：各分类的条数，**不随当前所选分类与搜索词变化**（用于筛选胶囊上的数字）。

### 3.2 `interior_project_page`

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `p_page` | integer | 1 | 页码 |
| `p_page_size` | integer | 20 | 每页条数 |
| `p_query` | text | null | 按名称模糊匹配（不区分大小写） |
| `p_thumbnails` | boolean | true | 是否带缩略图（项目切换菜单传 false） |

排序 `updated_at desc, id`；`list` 每行 `{ id, name, updated_at, revision, thumbnail }`；`counts` 为 `{ "mine": 我的项目总数 }`。

### 3.3 `interior_library_page`

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `p_page` / `p_page_size` | integer | 1 / 20 | |
| `p_kinds` | text[] | null | 只看这些种类：`furniture`、`floor`、`wall`、`opening`、`roof`、`ceiling`、`style`；null 为全部 |
| `p_major` | text | null | 硬装 / 软装 / 风格 |
| `p_category` | text | null | 分类 |
| `p_query` | text | null | 搜索（名称；风格另含一句话简介与大类） |
| `p_exclude_keys` | text[] | null | 排除这些 `item_key`（内置家具的账号调价行不算自建条目） |

排序 `created_at desc, kind, item_key`（新建的在前）；`list` 每行 `{ kind, item_key, name, category, data }`，`data` 是源表整行（去掉 `owner_id`、`id`）；`counts` 按 `category` 统计 `p_kinds` 与 `p_exclude_keys` 范围内的全部条目。实现上先只取这一页的主键，再回表取这一页的 `data`，避免为排序搬动大字段。

### 3.4 `interior_assistant_page`

参数 `p_page` / `p_page_size`（默认 1 / 20）；排序 `created_at desc, id`；`list` 每行 `{ id, name, avatar, model, prompt, updated_at }`；`counts` 为 `{}`。

## 4. 前端调用点

| 接口 | 前端封装 | 使用位置 | 参数 |
| --- | --- | --- | --- |
| `interior_project_page` | `features/projects/api/project-pages.ts`：`projectPage` | 项目管理页（带缩略图）、编辑器项目切换菜单（不带缩略图） | `p_query`、`p_thumbnails` |
| `interior_library_page` | `features/account-library/api/library-pages.ts`：`accountItemPage` | 家具管理页 | 六类素材、`p_exclude_keys = BUILTIN_IDS`、`p_major` / `p_category` / `p_query` |
| 〃 | 同上：`accountFurniturePage` | 风格详情的「我的家具」 | `p_kinds = ['furniture']`、`p_major = '软装'`（不含楼梯）、`p_exclude_keys = BUILTIN_IDS`、`p_category` |
| 〃 | `features/decor-styles/api/account-styles.ts`：`accountStylePage` | 风格管理页；新建风格时读全部我的风格作起点 | `p_kinds = ['style']`、`p_category` / `p_query` |
| `interior_assistant_page` | `features/ai-design/api/assistants.ts`：`assistantPage` | 小助手管理页 | — |
| 表 `interior_style_catalog` | `account-styles.ts`：`readAccountStyle` / `saveAccountStyle` / `removeAccountStyle` | 风格详情；新建 / 复制 / 编辑 / 删除我的风格 | 直接读写，RLS 限本人 |
| 视图 `interior_account_library` | `features/account-library/hooks/use-account-library.ts` | 编辑器家具库与风格面板（一次读 `kind, data`） | 新增的 `style` 行与新列不影响已有读取 |

所有列表都经 `@/lib/backend` 的 `readPage(fn, args, { page, pageSize })` 调用，返回形状不对时按读取失败处理；页面状态统一由 `@/hooks/use-paged-list` 管理（见 `docs/architecture.md` §5）。

## 5. 执行前确认（Enter 已核对）

1. **`interior_ai_assistants` 的建表迁移不在仓库里**：线上库已有这张表（生成的类型与 Edge Function `interior-ai-design` 都在用），`interior_assistant_page` 依赖它。执行前已确认它开启了 RLS，增删改查四条策略均为 `owner_id = auth.uid()`——函数按调用者身份执行，没有这条策略就会读到别人的小助手。
2. 其余被读取的表（`interior_design_projects` 与六张素材表）在仓库迁移里都已开启 RLS 并有「仅本人」策略。

## 6. 执行记录

1. 2026-10-13，Enter 原样执行迁移 SQL，没有改前端代码。
2. Enter 在 `enter` 分支把迁移文件回写为 `migration_20261013_052138000`，并重新生成 `types.ts`（列表函数的 `p_*` 参数改为可选、不含 `null`）。
3. 合并到本分支时以 Enter 回写的迁移文件与 `types.ts` 为准，本地同一份 SQL（`migration_20261012_133000000`）已删除，避免执行两次。

## 7. 验收

用一个登录用户（不是 service role）验证：

```sql
-- 三个函数都能调用，返回统一形状
select public.interior_project_page(1, 20, null, false);
select public.interior_library_page(1, 20, array['furniture','floor','wall','opening','roof','ceiling'], null, null, null, null);
select public.interior_library_page(1, 20, array['style'], null, null, null, null);
select public.interior_assistant_page(1, 20);

-- 第 2 页与第 1 页不重叠；pageSize = 0 只返回数量
select public.interior_project_page(2, 20);
select public.interior_library_page(1, 0, null, null, null, null, null);
```

另用未登录身份（anon）调用任一函数，应返回无权限。

前端：项目管理、家具管理、风格管理（含风格详情与新建 / 复制 / 删除我的风格）、小助手四个页面首屏各显示 20 条，滚动到底加载下一页，分类数字与筛选结果一致；编辑器项目切换菜单可滚动加载。

## 8. 回滚

先把前端回到不依赖本接口的提交（`4d4002c`，即 PR #1 的第一个提交），再执行：

```sql
drop function if exists public.interior_project_page(integer, integer, text, boolean);
drop function if exists public.interior_library_page(integer, integer, text[], text, text, text, text[]);
drop function if exists public.interior_assistant_page(integer, integer);
-- create or replace view 不能删列：先 drop view public.interior_account_library，
-- 再重新执行 migration_20261012_080659000 里的视图定义与授权（6 列、不含风格行）。
-- 我的风格数据如需保留就不要删表；确认不再需要时再 drop table public.interior_style_catalog。
notify pgrst, 'reload schema';
```
