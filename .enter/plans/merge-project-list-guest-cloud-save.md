# 项目列表去分类 + 游客「保存到云端」注册后自动转存

## Context

两个问题：

1. 项目管理页把项目分成「云端项目 / 本机方案」两个 tab（见截图红框）。用户认为没必要分类：列表里就是「默认项目 + 自己新建的项目」，一个列表即可。
2. 游客模式（未登录）下用户改完设计想存到云端时，目前顶部只有「登录」按钮，注册成功后**当前这份修改不会被保存**——它只写在 localStorage 的 `interior-guest-default-v1`（DEMO_KEY）里，从来不在任何项目列表中。

期望结果：游客在顶部点「保存到云端」→ 去注册/登录 → 成功后当前的修改自动上传成一个云端项目，自动命名为「修改的第一个版本」；原始默认方案继续作为本机默认项目存在。于是项目管理列表里正好两条：本机「三室两厅两卫 · 原木之家」+ 云端「修改的第一个版本」。

## 现状要点（已核对）

- `useProjects` 有三份数据：`guests`（localStorage `interior-guest-projects-v2`，初始播种一个参考户型项目＝「原始默认方案」）、`cloud`（表 `interior_design_projects`）、以及游客正在编辑的 `active`（localStorage DEMO_KEY，**不在任何列表里**）。
- 登录状态变化时 `useProjects` 会 `defaultGuest()` 重读 DEMO_KEY 并设为 `active`，所以注册后那份游客修改仍然拿得到 → 可以上传。
- 表 `interior_design_projects(id, name, state, revision, schema_version, owner_id, updated_at)`，RLS 已就绪；插入写法参考现有 `create()`（`.insert({...}).`）。
- `ProjectDialog.tsx` 是无人引用的遗留组件（含旧 tab），本次不动。
- `AuthDialog` 已经有「注册后无 session（需邮箱验证）」的提示处理（`message` state，第 61 行），本次只需把文案改成与「保存到云端」意图匹配。
- Workbench 游客分支当前是 `<button className="header-plain guest-login" onClick={p.login}>登录</button>`（第 477 行）；CSS 在 `@media (max-width:600px)`（index.css 第 1763 行）用 `.main-header > .guest-login` 让它在手机端仍以 44px 高度可见，新按钮照此模式处理。
- `main.tsx` 未启用 StrictMode。

## 改动方案

### 1. 合并列表、去掉 tab — `src/features/interior/components/ProjectManager.tsx`

- 删除 `local` state、`.project-tabs` 那两行、以及 `.muted-note` 提示。
- 合并数据源，按更新时间倒序（两端都是 ISO 字符串）：
  ```ts
  const list = [
    ...projects.guests.map(g => ({ id:g.id, name:g.name, updatedAt:g.updatedAt, revision:g.revision, cloud:false })),
    ...projects.cloud,
  ].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  ```
- 卡片统一：主按钮「打开设计」→ `await projects.open(row)`，成功再 `opened()`（`open()` 已支持本机项目：有 session 时从 `guestsRef` 里取，本机项目编辑仍写回本机列表）。
- 右侧图标按钮：云端 → 重命名 / 复制 / 删除；本机 → 重命名 / 复制到云端（复用现有 `rename` / `duplicate` / `remove` / `create(row, true)` 与现有 aria-label 写法）。
- 本机卡片上加一个小标签「本机」，避免与云端默认项同名时混淆；底部「刷新项目 / 加载更多」保留（不再受 tab 限制）。

### 2. 新增游客转存 — `src/features/interior/cloud/useProjects.ts`

新增并导出 `saveGuestToCloud`（只上传修改版，不复制原始默认方案）：

```ts
const saveGuestToCloud = useCallback(async (): Promise<boolean> => {
  const s = sessionRef.current, p = activeRef.current;
  if (!s || !p || p.cloud) return false;
  const next: Project = { ...p, id: uid(), name: '修改的第一个版本',
    revision: 0, updatedAt: new Date().toISOString(), cloud: true };
  const { error } = await supabase.from('interior_design_projects')
    .insert({ id: next.id, name: next.name, state: next.state as unknown as Json, schema_version: 2 });
  if (error) { toast.error('保存到云端失败：' + error.message); return false; }
  setCloud(c => [{ id:next.id, name:next.name, revision:0, updatedAt:next.updatedAt, cloud:true }, ...c]);
  epoch.current++; dirty.current = false;
  activeRef.current = next; setActive(next); setStatus('云端已保存');
  toast.success('已保存到云端项目「修改的第一个版本」');
  return true;
}, []);
```

沿用现有模式：`uid()`、`Json`、`epoch/dirty/activeRef`、`toast`。`active` 变成云端项目后，后续编辑走现有自动保存（`update()` 的 cloud 分支）。

### 3. 意图串联 — `src/pages/Index.tsx`

- `const pendingCloud = useRef(false);`、`const saveRef = useRef(projects.saveGuestToCloud); saveRef.current = projects.saveGuestToCloud;`
- `cloudSave`：游客时记录意图并打开注册弹窗，登录用户保持原行为：
  ```ts
  const cloudSave = () => {
    if (!owner) { pendingCloud.current = true; setAuthIntent('cloud'); setAuthOpen(true); return; }
    if (!projects.active) return;
    void projects.create({ ...projects.active, name: projects.active.name + ' · 云端副本' }, true);
  };
  ```
- 注册/登录成功后自动转存（effect 只依赖 `owner`，靠 ref 保证只执行一次，避免 `projects` 对象身份变化导致重复插入）：
  ```ts
  useEffect(() => { if (owner && pendingCloud.current) { pendingCloud.current = false; void saveRef.current(); } }, [owner]);
  ```
- `AuthDialog` 传 `intent={authIntent}`，关闭时 `setAuthIntent(null)`。

### 4. 游客顶部按钮 — `src/features/interior/components/Workbench.tsx`

游客分支（第 477 行 `<button className="header-plain guest-login" onClick={p.login}>登录</button>`）改为：保留「登录」，并在其前/后加一个显著的 primary 按钮：

```tsx
<Button size="sm" variant="default" className="cloud-save-button" onClick={p.cloudSave}>
  <Cloud size={15}/><span>保存到云端</span>
</Button>
```

`Cloud` 图标已在文件顶部 import。已登录分支、文件菜单里的「另存云端项目」保持不变。

### 5. 弹窗文案与邮箱验证 — `src/features/interior/components/AuthDialog.tsx`

- 新增可选 prop `intent?: 'cloud' | null`；为 `'cloud'` 时标题/描述改为「注册后，当前的修改会保存成你的云端项目」，提交按钮文案「注册并保存到云端」。
- 第 61 行已有的「无 session（需邮箱验证）」分支保留逻辑，只把 `setMessage` 文案改为「注册成功，请查收验证邮件。完成验证后回来登录，当前的修改会自动保存到云端」，并且在这种情况下意图仍保留在内存里，用户完成验证后登录时会照常转存。
- 「暂不登录，继续游客设计」保持可用（不写入云端）。

### 6. 样式 — `src/index.css`

- 在 `.cms-card`（第 115 行附近）后新增本机标签样式（用语义 token，例如 `.cms-card-tag { display:inline-block; padding:2px 8px; border-radius:6px; background:hsl(var(--secondary)); color:hsl(var(--muted-foreground)); font-size:11px; }`）。
- 在 `@media (max-width:600px)` 块内、`.main-header > .guest-login`（第 1763 行）旁边加 `.main-header > .cloud-save-button { min-height:44px; padding:0 10px; font-size:12px; }`，保证手机端仍可见、可点。

## 不做

- 不改数据库表结构 / RLS / 不做数据迁移。
- 不清理游客的 DEMO_KEY（登出后仍保留本机草稿）。
- 不删除、不重写 `ProjectDialog.tsx`（无引用遗留组件）。
- 不为去重而做「是否真的修改过」的内容比对（用户已确认只要两条的简单结果）。

## Implementation checklist

- [ ] `ProjectManager.tsx` 中不再存在 `local` state 与 `.project-tabs` 渲染；列表由 `guests` + `cloud` 合并并按 `updatedAt` 倒序。
- [ ] 合并列表的卡片对云端/本机都渲染「打开设计」，点击后 `projects.open(row)` 成功即 `opened()`。
- [ ] 本机卡片渲染「本机」标签与「复制到云端」按钮；云端卡片渲染 重命名/复制/删除。
- [ ] 底部「刷新项目」始终渲染，`hasMore` 时「加载更多」仍可用。
- [ ] `useProjects.ts` 导出 `saveGuestToCloud`，无 session 或 `active.cloud` 为真时直接返回 `false` 不插入。
- [ ] `saveGuestToCloud` 成功时：新行插入 `interior_design_projects`、`cloud` 列表头部插入摘要、`active` 切为该云端项目、`status` 为「云端已保存」。
- [ ] `Index.tsx` 中游客调用 `cloudSave` 只记录意图并打开弹窗，不插入任何数据。
- [ ] `Index.tsx` 中 `owner` 出现且意图为真时只触发一次 `saveGuestToCloud`（ref 置位早于 await）。
- [ ] `Workbench.tsx` 游客分支渲染「保存到云端」按钮并调用 `p.cloudSave`；已登录分支渲染不变。
- [ ] `AuthDialog.tsx` 接受 `intent` 并在 `'cloud'` 时展示对应标题/描述/按钮文案；注册返回空 session 时沿用 `message` 提示并改成“完成验证后登录会自动保存到云端”。
- [ ] `index.css` 新增 `.cms-card-tag`，并在 ≤600px 的 `.main-header > .cloud-save-button` 规则下保持 44px 可点高度。
- [ ] `pnpm run build` 与 lint 通过。

## Verification checklist

- 正向（游客转存）：退出登录 → 游客模式改一处设计 → 点顶部「保存到云端」→ 注册新账号 → 自动进入项目管理列表，出现两条：本机「三室两厅两卫 · 原木之家」+ 云端「修改的第一个版本」；打开云端那条，内容与刚才的修改一致。
- 数据校验：`select id,name,owner_id,updated_at from interior_design_projects order by updated_at desc limit 5` —— 只新增一行「修改的第一个版本」，无重复行。
- 反复触发校验：刷新页面后再次进入，不会因为 effect 重跑而新增第二条「修改的第一个版本」。
- 默认/反向：AuthDialog 点「暂不登录，继续游客设计」→ 列表无变化、云端无新行；已登录用户点工具栏「另存云端项目」→ 仍生成「· 云端副本」。
- 列表规则：项目管理页无 tab；混合数据按 `updatedAt` 倒序；本机条目「复制到云端」后云端出现同内容项目且本机记录仍在。
- 响应式：`website_screenshot` 在 `desktop_1280` 与 `mobile_390` 分别检查游客工作台顶部（600px 以下「保存到云端」仍可见可点）与项目管理列表（单列卡片不溢出）。
- 构建范围：`pnpm run build`（含 tsc）与 lint 全绿。
