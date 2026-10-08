# 项目来源三类规则 + 游客改模版后的顶部 banner

## Context

用户指出项目管理页的操作规则不对，并按「来源」给出应有的规则（截图 104 红框即本机自带默认方案那张卡）：

1. **用户新建的项目**（云端）：重命名 / 复制 / 删除三个操作都可以 —— 现状已符合。
2. **系统默认的项目**＝第一次打开应用自动生成、存在本机的「三室两厅两卫 · 原木之家」（列表里带 `cloud:false` 的那条）：**不支持重命名、不支持删除，但可以复制**。现状正相反：本机条目可以重命名和删除，反而是最不该禁用的复制被隐藏了。
3. **游客改完点「保存到云端」再登录**产生的云端新项目：三个操作都可以 —— 现状已符合（`saveGuestToCloud` 写入云端行，走云端卡片规则）。

同时用户要求把游客的「保存到云端」入口从工作台左上「参考户型 ▾」下拉里**删掉**（截图 106），改成：**游客只要改过方案，顶部就出现 banner**（截图 105）提示「模版已经更改，是否登录保存到云端」，点主按钮触发登录，**登录成功后存下用户修改后的版本，然后直接进入该项目**；banner 带「暂不保存」关闭按钮，可手动关掉，再次编辑会重新出现（已与用户确认）。

已核实：全库没有任何「系统默认项目」的判定代码或数据库标记，`interior_design_projects` 里也只有用户自己的 2 行数据；所以本机默认方案需要新增标记 + 旧数据兜底识别。

## 现状要点（已核对）

- `src/features/interior/components/ProjectManager.tsx`：`list = guests(cloud:false) + cloud`；`rowActions` 里**复制按钮被 `row.cloud &&` 包住**，本机条目只有重命名 + 删除。
- `src/features/interior/cloud/guestStore.ts`：`readGuests()` 首次运行播种 `createProject("reference")`（＝「三室两厅两卫 · 原木之家」，每次新生成 id）；`readGuestDefault()` 读 DEMO_KEY，是游客正在编辑的那份（不在列表里）。已完成的项目里**没有任何系统标记**。
- `src/features/interior/components/ProjectMenu.tsx:61`：游客分支唯一的云入口就是这条 `保存到云端` `DropdownMenuItem`（依赖 props `onCloudSave` / `cloudSaving`）。
- `src/features/interior/components/Workbench.tsx:459,532`：`cloudSave = useAsyncAction(p.cloudSave)` 只喂给 `ProjectMenu`，删掉菜单项后这个入口要转给 banner 用。
- `src/pages/Index.tsx:18-26`：`cloudSave` 未登录时置 `pendingCloud` + 打开 `AuthDialog intent="cloud"`；`useEffect([owner])` 在登录后执行一次 `saveGuestToCloud()`，**目前不会进入项目**（停留在项目管理页）；另存云端副本的已登录分支早已无入口。
- `src/features/interior/cloud/useProjects.ts`：`create()` 会 `{...p, id: uid()}`（复制出的副本会继承来源项目的字段，需显式清掉系统标记）；`update()` 是唯一的编辑入口（游客分支只写 DEMO_KEY）。
- `src/index.css:349`：`.workbench` 是 `grid-template-rows: var(--toolbar-h) minmax(0,1fr) var(--status-h)` 的三行栅格，`.stage` / `.library-panel` / `.property-panel` 都写死了 `grid-row: 2` —— 直接插一行 banner 会把工具栏挤到第 3 行，所以 banner 必须放在栅格外层，不改 `.workbench` 布局。

## 改动方案

### 1. 系统默认方案标记 —— `model/types.ts` + `cloud/guestStore.ts`

- `model/types.ts` 的 `Project` 增加可选字段：`/** 系统自带的本机默认方案：不可重命名、不可删除，只能复制。 */ system?: boolean;`
- `guestStore.ts`：
  - 播种时带上标记：`export const systemProject = (): Project => ({ ...createProject("reference"), system: true });`，`readGuests()` 的三处兜底（无 key / 非数组 / 解析失败）都返回 `[systemProject()]`。
  - 新增 `withSystemMarker(list: Project[]): Project[]`：列表里已有一条 `system === true` 就原样返回；否则列表非空时把**更新时间最早**的一条标为系统默认（旧数据兜底：本机列表里最早的就是当初播种的那份，用户自己建的本机副本一定更新），空列表保持空（不重新播种，沿用既有行为）。
  - `readGuests()` 的返回改为 `withSystemMarker(mapped)`；`writeGuests()` 不变（写入即持久化标记）；`readGuestDefault()` 不加标记（DEMO_KEY 是游客工作副本，不是列表项）。

### 2. 项目来源判定与摘要 —— `cloud/useProjects.ts`

- `ProjectSummary` 增加 `system?: boolean`。
- `create()` 的 `next` 显式写 `system: false`，`saveGuestToCloud()` 的 `next` 同样写 `system: false`：**复制出的副本、游客转存出的云端项目都属于「用户新建」，三个操作都要可用**，不能继承来源的标记。
- 新增游客编辑信号（banner 用）：`const [guestEdits, setGuestEdits] = useState(0);`，在 `update()` 的 `!p.cloud && !sessionRef.current` 分支里 `setGuestEdits(n => n + 1)`（游客模式下每次真实编辑 +1，撤销/重做也走 `update`，同样算改动）；`onAuthStateChange` 里用户切换（登录/登出）时 `setGuestEdits(0)` 复位。返回值里导出 `guestEdits`。

### 3. 三种来源的卡片操作 —— `components/ProjectManager.tsx`

- 列表映射补上标记：`...projects.guests.map(g => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, revision: g.revision, cloud: false, system: g.system === true }))`。
- `rowActions(row)` 统一渲染三个按钮（每张卡都是 `重命名 / 复制 / 删除` 三件套，规则差异只体现在禁用态）：
  - 重命名：`disabled={rowAction.pending || row.system}`，`EditorTooltip label={row.system ? '系统默认方案不可重命名' : '重命名项目'} disabled={...}`（`EditorTooltip` 的 `disabled` 参数是「子按钮禁用、用外层 span 承载提示」，照现有用法传同一个布尔）。
  - 复制：去掉 `row.cloud &&` 判断，本机与云端都渲染，`onClick={() => void rowAction.run('duplicate', row)}`（`useProjects.duplicate` 已按 `!!p.cloud` 决定副本落本机还是云端）。
  - 删除：`disabled={rowAction.pending || row.system}`，提示文案 `row.system ? '系统默认方案不可删除' : '删除项目'`。
- 结果：本机默认方案 = 复制可用 + 重命名/删除置灰；云端项目（用户新建、游客转存）= 三个全开。

### 4. 去掉左上角「保存到云端」—— `components/ProjectMenu.tsx`

- 删除游客分支的 `保存到云端` `DropdownMenuItem`（连同 `Cloud` 图标 import）；下拉**保留**，里面只剩当前方案一行（用户已确认），分隔线与 `LoadMoreSentinel` 等已登录内容不动。
- 同步删除随之无用的 props `onCloudSave` / `cloudSaving`，以及 `Workbench.tsx` 里喂给它的传参。

### 5. 游客顶部 banner —— `components/Workbench.tsx` + `src/index.css`

- `Props` 增加 `guestEdits: number`。组件内：
  - `const [dismissed, setDismissed] = useState(0);`
  - `const showGuestBanner = !p.loggedIn && p.guestEdits > 0 && p.guestEdits !== dismissed;`
  - 复用现有 `cloudSave = useAsyncAction(p.cloudSave)`（改成喂 banner，防重复点击 + `loading` 态）。
- 返回值最外层包一层 `.workbench-shell`（**不动 `.workbench` 的三行栅格**）：
  ```tsx
  <div className="workbench-shell">
    {showGuestBanner && <div className="guest-cloud-banner" role="status">…banner…</div>}
    <div className={'workbench ' + …}>…现有内容…</div>
  </div>
  ```
- banner 内容：`TriangleAlert`（lucide）+「模版已经更改」+ 说明「登录后可把当前方案保存到云端」+ 主按钮 `登录并保存到云端`（`Cloud` 图标、`onClick={() => void cloudSave.run()}`、`loading={cloudSave.pending}`）+ ghost 按钮 `X` 图标 / 文案「暂不保存」（`onClick={() => setDismissed(p.guestEdits)}`）。按钮复用 `@/components/ui/button` 的 `Button` 与其 variants，不写自定义颜色。
- `src/index.css`（全部语义 token）：
  - `.workbench-shell { display: flex; flex-direction: column; height: 100dvh; background: hsl(var(--card)); }`
  - `.workbench-shell > .workbench { flex: 1 1 auto; height: auto; min-height: 0; }`（`.workbench` 原为 `height:100dvh`，放进 shell 后改为占满剩余高度，banner 显示时才不会被顶出屏幕）
  - `.guest-cloud-banner`：`flex: none` + 横向排布 + `padding: 9px 16px` + `border-bottom: 1px solid hsl(var(--border))` + `background: hsl(var(--primary) / 0.08)`；文案/次要文字用 `hsl(var(--foreground))` / `hsl(var(--muted-foreground))`；≤600px 加一条媒体查询（`padding: 8px 10px`、字号降一级、按钮 `flex: none` 不换行挤压）。

### 6. 登录后存下并进入项目 —— `src/pages/Index.tsx`

- `cloudSave` 简化为游客意图（已登录分支早已无入口，删除死代码）：
  ```tsx
  const cloudSave = async () => { if (owner) return false; pendingCloud.current = true; setAuthIntent('cloud'); setAuthOpen(true); return false; };
  ```
- 登录成功后的转存 effect 增加「进入项目」：
  ```tsx
  useEffect(() => { if (!owner || !pendingCloud.current) return; pendingCloud.current = false;
    void guestSave.current().then(ok => { if (ok) setEditingOwner(owner); }); }, [owner]);
  ```
  转存失败时保持停在项目管理页（`saveGuestToCloud` 内部已有 `notify.error`）。
- `<Workbench>` 增加 `guestEdits={projects.guestEdits}`。

## 不做

- 不改数据库表结构、RLS 与任何云端数据（不新增字段、不做迁移）。
- 不改 `interior_design_projects` 里已有的两行项目（它们是用户新建项目，仍三个操作全开）。
- 不改 `saveGuestToCloud` 的项目命名（仍为「修改的第一个版本」）与既有写入字段。
- 不改 `.workbench` 栅格、侧栏抽屉、状态栏与工具栏其余部分。
- 不改「我的账号」里的登录按钮（游客仍可从这里登录，只是不再从左上角下拉保存）。

## Implementation checklist

- [ ] `model/types.ts` 的 `Project` 增加 `system?: boolean`，注释写明「本机系统默认方案：不可重命名/删除，可复制」。
- [ ] `guestStore.ts` 导出 `systemProject()` 并在三处兜底播种时带上 `system: true`。
- [ ] `guestStore.ts` 新增 `withSystemMarker()`：已有标记则原样返回；否则标记更新时间最早的一条；空列表返回空数组（不重播种）。
- [ ] `readGuests()` 返回值经 `withSystemMarker()`；`readGuestDefault()` 与 `writeGuests()` 行为不变。
- [ ] `useProjects.ts` 的 `ProjectSummary` 增加 `system?: boolean`；`create()` 与 `saveGuestToCloud()` 产出的项目 `system: false`。
- [ ] `useProjects.ts` 新增 `guestEdits` 计数：`update()` 在游客分支 +1；登录/登出时复位为 0；随 hook 返回值导出。
- [ ] `ProjectManager.tsx` 列表映射带上 `system`；`rowActions` 三按钮：复制对全部卡片可用，重命名/删除在 `row.system` 时禁用并给出「系统默认方案不可…」提示。
- [ ] `ProjectMenu.tsx` 游客分支不再渲染「保存到云端」；`onCloudSave` / `cloudSaving` props 与 `Cloud` import 一并移除，下拉保留当前方案一行。
- [ ] `Workbench.tsx` 移除 `ProjectMenu` 的云保存传参，最外层包 `.workbench-shell`，按 `guestEdits` / `dismissed` / `p.loggedIn` 渲染 banner，主按钮走 `cloudSave.run()`，关闭按钮置 `dismissed = p.guestEdits`。
- [ ] `src/index.css` 新增 `.workbench-shell`、`.workbench-shell > .workbench` 与 `.guest-cloud-banner`（含 ≤600px 规则），颜色全部用语义 token。
- [ ] `Index.tsx` 的 `cloudSave` 只保留游客意图分支；`useEffect([owner])` 转存成功后 `setEditingOwner(owner)`；`<Workbench>` 传入 `guestEdits`。
- [ ] `managementUi.test.tsx` 更新本机/云端操作断言并新增「系统默认方案：复制可用、重命名/删除禁用」用例。
- [ ] `guestStore.test.ts` 增补：播种带 `system` 标记；缺失标记时标记最早一条；空列表不重播种。
- [ ] `Workbench.test.tsx` 与 `toolbarMenus.test.tsx` 适配新 props，并断言游客有编辑时出现 banner、已登录或无编辑时不出现、游客下拉里不再有「保存到云端」。

## Verification checklist

- 正向（游客转存 + 进入项目）：退出登录 → 游客模式改一处设计 → 顶部出现 banner → 点「登录并保存到云端」→ 邮箱密码登录 → 登录后自动转存并**直接进入该项目**（工作台左上显示项目名、状态为云端已保存），项目列表里多出该云端项目且三个操作全开。
- 数据校验：`select id,name,updated_at from public.interior_design_projects order by updated_at desc limit 3` —— 只新增一行「修改的第一个版本」，无重复行；刷新页面后不会因为 effect 重跑再插一行。
- 负向/默认态：游客未做任何修改 → 无 banner；已登录 → 无 banner；点「暂不保存」→ banner 消失且不弹登录框、云端无新行；再次编辑 → banner 重新出现。
- 负向：游客与已登录状态下，左上「参考户型 ▾」下拉里都不再出现「保存到云端」，下拉仍可展开并显示当前方案一行。
- 列表规则：本机默认方案「三室两厅两卫 · 原木之家」卡片重命名/删除置灰（悬浮提示为不可操作原因），复制可用 → 副本是可自由重命名/删除/复制的用户项目；云端「Home」等项目三个操作不变。
- 边界：清空本机列表后重进 → 列表为空、不重新播种默认方案；旧数据（本机项目没有 `system` 标记）→ 最早一条被识别为系统默认；用户在本机复制出的副本不会被标记。
- 响应式：`website_screenshot` 在 `desktop_1280` 与 `mobile_390` 分别检查游客工作台（banner 不遮挡工具栏、不撑出滚动条）与项目管理卡片（三个图标不被挤出卡片）。
- 构建范围：`pnpm test src/features/interior`、`pnpm check`（eslint + tsc）、`pnpm run build` 全绿。
