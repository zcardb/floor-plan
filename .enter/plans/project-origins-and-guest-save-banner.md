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

## 追加一轮（用户反馈）

### 1. 回到初始态时提示条消失 —— `model/templateState.ts`（新增）+ `cloud/useProjects.ts`

原来 `guestEdits` 只做单调累加，所以「重置方案」后提示条还挂着。改为按「方案内容是否等于系统初始模版」判定：

- 新增 `model/templateState.ts`：`fingerprint(design)` 只比较方案内容（墙体、门窗、房间、材质、家具与位置、拆改标记），剔除每次都变的 `uid()`（家具 id、空白户型的房间 id），并忽略与内容无关的 `structureUnlocked`（解锁标记）与 `dimensionSettings`（尺寸标注显示）；
- `isPristineDesign(design)`：与 `referenceDesign()` / `blankDesign()` 的指纹比较，模版指纹按 template 缓存一次；
- `nextGuestEditCount(current, design)`：回到初始模版返回 0，否则 +1；
- `useProjects.update()` 的游客分支改用 `nextGuestEditCount(n, design)`，于是**重置方案、一路撤销回起点都会让提示条消失**，之后再次编辑又会重新出现。

### 2. 提示条视觉 —— `components/Workbench.tsx` + `src/index.css`

按用户反馈「颜色醒目一点、宽度窄一些、操作按钮小一点、和页面设计统一」重做：

- 不再通栏：`margin:10px 16px 0` + `border-radius:10px`，成为一条比工具栏窄的浮起提示条；
- 醒目：primary 前景渐变底（0.22 → 0.07）+ `1px` primary 边框 + 柔和投影，左侧加 primary 实底圆角图标徽标（Visual Anchor / Von Restorff）；
- 按钮变小：CTA 与关闭都收到 28px 高、12px 字号（≤600px 提到 32px 保证可点，Fitts's Law），并保持「一个主按钮 + 一个次要出口」两级层次（Hick's Law、Reactance：不阻断编辑，随时可「暂不保存」）；
- 文案同步收短：`登录并保存` / `暂不保存`，副文案改为「登录后即可保存到云端，换设备也能继续编辑」；移动端隐藏副文案，关闭按钮只留图标。

## 不做

- 不改数据库表结构、RLS 与任何云端数据（不新增字段、不做迁移）。
- 不改 `interior_design_projects` 里已有的两行项目（它们是用户新建项目，仍三个操作全开）。
- 不改 `saveGuestToCloud` 的项目命名（仍为「修改的第一个版本」）与既有写入字段。
- 不改 `.workbench` 栅格、侧栏抽屉、状态栏与工具栏其余部分。
- 不改「我的账号」里的登录按钮（游客仍可从这里登录，只是不再从左上角下拉保存）。

## Implementation checklist

- [x] `model/types.ts` 的 `Project` 增加 `system?: boolean`，注释写明「本机系统默认方案：不可重命名/删除，可复制」。
- [x] `guestStore.ts` 导出 `systemProject()` 并在三处兜底播种时带上 `system: true`。
- [x] `guestStore.ts` 新增 `withSystemMarker()`：已有标记则原样返回；否则标记更新时间最早的一条；空列表返回空数组（不重播种）。
- [x] `readGuests()` 返回值经 `withSystemMarker()`；`readGuestDefault()` 与 `writeGuests()` 行为不变。
- [x] `useProjects.ts` 的 `ProjectSummary` 增加 `system?: boolean`；`create()` 与 `saveGuestToCloud()` 产出的项目 `system: false`。
- [x] `useProjects.ts` 新增 `guestEdits` 计数：`update()` 在游客分支 +1；登录/登出时复位为 0；随 hook 返回值导出。
- [x] `model/templateState.ts` 提供 `isPristineDesign` / `nextGuestEditCount`，剔除 `uid()` 波动字段、忽略解锁标记与尺寸标注显示，模版指纹按 template 缓存。
- [x] `useProjects.update()` 游客分支改用 `nextGuestEditCount(n, design)`：重置方案 / 撤销回初始模版计数归零。
- [x] 提示条改为窄幅浮起样式（16px 边距、圆角、primary 渐变底 + 边框 + 徽标），按钮 28px / 12px，≤600px 32px 且隐藏副文案与关闭按钮文字。
- [x] `ProjectManager.tsx` 列表映射带上 `system`；`rowActions` 三按钮：复制对全部卡片可用，重命名/删除在 `row.system` 时禁用并给出「系统默认方案不可…」提示。
- [x] `ProjectMenu.tsx` 游客分支不再渲染「保存到云端」；`onCloudSave` / `cloudSaving` props 与 `Cloud` import 一并移除，下拉保留当前方案一行。
- [x] `Workbench.tsx` 移除 `ProjectMenu` 的云保存传参，最外层包 `.workbench-shell`，按 `guestEdits` / `dismissed` / `p.loggedIn` 渲染 banner，主按钮走 `cloudSave.run()`，关闭按钮置 `dismissed = p.guestEdits`。
- [x] `src/index.css` 新增 `.workbench-shell`、`.workbench-shell > .workbench` 与 `.guest-cloud-banner`（含 ≤600px 规则），颜色全部用语义 token。
- [x] `Index.tsx` 的 `cloudSave` 只保留游客意图分支；`useEffect([owner])` 转存成功后 `setEditingOwner(owner)`；`<Workbench>` 传入 `guestEdits`。
- [x] `managementUi.test.tsx` 更新本机/云端操作断言并新增「系统默认方案：复制可用、重命名/删除禁用」用例。
- [x] `guestStore.test.ts` 增补：播种带 `system` 标记；缺失标记时标记最早一条；空列表不重播种。
- [x] `Workbench.test.tsx` 与 `toolbarMenus.test.tsx` 适配新 props，并断言游客有编辑时出现 banner、已登录或无编辑时不出现、游客下拉里不再有「保存到云端」。

## Verification checklist

- [x] 卡片规则（`managementUi.test.tsx`）：系统默认方案重命名/删除渲染为 `disabled`，复制可用；用户新建的本机与云端项目三个操作都可用。
- [x] 默认态（`Workbench.test.tsx`）：`guestEdits = 0` 无 banner；已登录时即使 `guestEdits > 0` 也不出现 banner。
- [x] 「暂不保存」（`Workbench.test.tsx`）：点击后 banner 消失，同一 `guestEdits` 不再出现；`guestEdits` 增加到下一版时重新出现。
- [x] 主按钮（`Workbench.test.tsx`）：点击后调用传入的 `cloudSave`（未被禁用/防重复逻辑吞掉）。
- [x] 下拉入口（`toolbarMenus.test.tsx`）：游客与已登录的「项目 ▾」菜单都不再包含「保存到云端」，游客只剩当前方案一行。
- [x] 边界（`guestStore.test.ts`）：播种的默认方案带 `system` 标记；已有标记的列表不被重新指派；旧列表无标记时最早一条被标记；清空后读到空列表且不重新播种。
- [x] 初始态判定（`model/templateState.test.ts`）：刚生成的模版 / 带解锁标记 / 重新生成 id 都算初始态；移动家具、删家具、拆墙标记、改房间材质都算改过；尺寸标注显示不算；`nextGuestEditCount` 回初始态归零。
- [x] 计数链路（`cloud/useProjects.test.ts`，hook 替身不连后端）：游客未改动为 0 → `update(改动后方案)` 变 1、再改变 2 → `update(重置方案产出的初始模版)` 归零。
- [x] 视觉实测：临时强制显示提示条后 `website_screenshot` 抓 `desktop_1280` 与 `mobile_390`，确认窄幅、配色醒目、按钮变小、移动端不换行不溢出；随后已还原强制标记（`git` 中该行为原判定条件）。
- [x] 构建范围：`pnpm test`（63 文件 / 436 条全绿）、`pnpm check`（eslint 0 error、tsc 干净）、`pnpm run build` 通过。
- [ ] 正向（游客转存 + 进入项目，需真实登录）：退出登录 → 游客改一处设计 → 顶部 banner → 「登录并保存到云端」→ 登录后自动转存并直接进入该项目（工作台左上显示项目名、状态为云端已保存）。本次会话无法代替用户登录，未在浏览器里走完。
- [ ] 数据校验：`select id,name,updated_at from public.interior_design_projects order by updated_at desc limit 3` —— 转存后只新增一行「修改的第一个版本」，刷新后不重复插入（同因未登录未执行）。
- [x] 响应式（提示条本体）：`desktop_1280` 与 `mobile_390` 都实拍过提示条（临时强制显示），移动端单行不溢出、关闭按钮收起文字；无提示条时的 `desktop_1280` / `mobile_390` 工作台布局也已确认完好。
