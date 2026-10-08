# CMS 账号区：只留一个头像 + 点击弹出账号面板

## Context

图 1（现网 CMS 侧边栏底部的账号区）里同时挤着 44px 头像、被折成两行的邮箱（`18793850224@163.` / `com`）、「已登录 · 云端同步」文字，以及一个通栏的「退出登录」按钮，视觉噪音大、断行难看。

用户要求：这一处**只保留一个头像**，点击头像再弹出账号面板，结构参照图 2 —— 上方账号名片（头像 + 邮箱 + 登录状态）、一条分隔线、底部「退出登录」。

已确认口径：

- 位置：只改 **CMS 侧边栏底部账号区**（`AccountCMS`）。顶部「我的账号」下拉（`Workbench`）保持现状不动。
- popover：**单列面板**（账号名片在上 → 分隔线 → 退出登录），不额外加「论坛 / 学校 / Discord / 更新日志 / 语言 / 主题 / 更多产品」这类本项目不存在的菜单项，只展示账号信息 + 退出登录。
- 不做：头像上传 / 编辑铅笔徽标、昵称字段、i18n、暗色模式、auth 与数据库改动。

前提事实：`Index.tsx:26` 只在 `owner`（已登录）时渲染 `AccountCMS`，所以这里 `projects.session?.user.email` 必定存在，**不需要游客分支**。

## 改动

### 1. `src/features/interior/components/AccountCMS.tsx`

- 新增 `const [accountOpen,setAccountOpen]=useState(false);`（`useState` 已导入）。
- 导入 `Popover, PopoverTrigger, PopoverContent` from `@/components/ui/popover`（复用 `SelectionEditor.tsx:23-25` 的既有用法，`PopoverContent` 自身已带 Portal + 动画）。
- `.cms-account` 内改写为：

```tsx
<div className="cms-account">
  <Popover open={accountOpen} onOpenChange={setAccountOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="cms-account-trigger" aria-label="账号菜单">
        <AccountAvatar email={projects.session?.user.email} size={40} />
      </button>
    </PopoverTrigger>
    <PopoverContent className="account-popover" side="top" align="start" sideOffset={10}>
      <div className="account-popover-head">
        <AccountAvatar email={projects.session?.user.email} size={52} />
        <b>{projects.session?.user.email}</b>
        <small>已登录 · 云端同步</small>
      </div>
      <span className="account-popover-sep" aria-hidden="true" />
      <button type="button" className="account-popover-logout" onClick={()=>{setAccountOpen(false);navigate('logout');}}>
        <LogOut size={16} />退出登录
      </button>
    </PopoverContent>
  </Popover>
</div>
```

- `aria-label="账号菜单"` 是必须的：`AccountAvatar` 根节点是 `aria-hidden="true"`，按钮本身要能播报（Radix 自动补 `aria-expanded` / `aria-controls`）。
- `side="top"` 配 Radix 默认 `avoidCollisions`，移动端侧边栏在顶部时会自动翻转到下方，不需要自己写判断。
- 退出登录仍走现有的 `navigate('logout')`，**脏数据守卫（AlertDialog「账号成本尚未保存」）与 `projects.signOut()` 行为完全保留**；先 `setAccountOpen(false)` 再 `navigate('logout')`，避免 popover 与 AlertDialog 叠层。选「继续编辑」时面板已关闭，用户在底部头像上再点一次即可。
- 其余全部不动：`modules` / `nav` / `tab` / `catalog` 加载、`leaving` AlertDialog、`CustomFurnitureDialog`。

### 2. `src/index.css`

**共享选择器收窄**（账号区不再有带 padding 的行按钮）：

- 第 118 行 `.cms-brand small,.cms-account small` → `.cms-brand small`。
- 第 120 行 `.cms-sidebar nav button,.cms-account button` → `.cms-sidebar nav button`。

**`@layer components` 内**（约 122-126 行）：

- `.cms-account { margin-top:auto; display:flex; align-items:center; padding-top:16px; border-top:1px solid hsl(var(--border)); }` —— 底部头像栏与 nav 之间一条分隔线（图 2 底栏的语义）。
- 新增：
  - `.cms-account-trigger { display:flex; padding:0; border-radius:50%; }`
  - `.cms-account-trigger .account-avatar { transition:box-shadow .2s ease; }`
  - `.cms-account-trigger:hover .account-avatar { box-shadow:0 0 0 3px hsl(var(--accent)); }`
- 删除已失效、仅此处使用的 `.cms-account-id`、`.cms-account-id>span`、`.cms-account-id b`、`.cms-account-id small`（`overflow-wrap:anywhere` 移到面板名片里）。

**非 layer 区（`@layer components` 之后的普通 CSS，紧跟 `.visual-editor-popover` 2186 行附近）**：`.visual-editor-popover` 就是放在这里才能压过 `PopoverContent` 自带的 `w-72 p-4 rounded-md border bg-popover shadow-md`，`.account-popover` 沿用同样位置与写法：

- `.account-popover { width:246px; max-width:calc(100vw - 24px); padding:16px 14px 12px; display:grid; gap:12px; border:1px solid hsl(var(--border)); border-radius:14px; background:hsl(var(--card)); box-shadow:var(--shadow-panel); }`
- `.account-popover-head { display:grid; justify-items:center; gap:8px; text-align:center; }`
- `.account-popover-head .account-avatar { box-shadow:0 0 0 3px hsl(var(--accent)),var(--shadow-float); }`
- `.account-popover-head b { font-size:12.5px; font-weight:600; color:hsl(var(--foreground)); overflow-wrap:anywhere; }`
- `.account-popover-head small { font-size:11px; color:hsl(var(--muted-foreground)); }`
- `.account-popover-sep { display:block; height:1px; margin:0 -14px; background:hsl(var(--border)); }`
- `.account-popover-logout { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:9px; font-size:12.5px; color:hsl(var(--foreground)); }`
- `.account-popover-logout:hover { background:hsl(var(--destructive)/0.08); color:hsl(var(--destructive)); }`（与既有 `.cms-danger-link` 的破坏性语义一致）

字号 / 色彩令牌全部复用现有 `--card`、`--border`、`--accent`、`--foreground`、`--muted-foreground`、`--destructive`、`--shadow-panel`、`--shadow-float`，**不新增令牌、不写死颜色**。

**`@media(max-width:700px)`（205 行）**：`.cms-account` 改为 `{ margin-top:8px; padding-top:10px; }`（保留基类的 flex + 左对齐，头像位置与改动前一致）；删除 `.cms-account-id`、`.cms-account-id>span`、`.cms-account-id small`、`.cms-account button{padding:8px}`，以及 `.cms-account .account-avatar{width:32px;height:32px}` / `.cms-account .account-avatar-fallback{font-size:14px}` 这两条**实际无效**的规则（`AccountAvatar` 用内联 `width/height`，媒体查询覆盖不了，属于死代码）。

### 3. 明确不改

`src/features/interior/components/Workbench.tsx`（顶部「我的账号」下拉保持头像 20px + `account-menu-head` 现状）、`src/features/interior/components/AccountAvatar.tsx`、`src/features/interior/model/accountIdentity*.ts`、auth / 数据库。

## 关键文件

- 改：`src/features/interior/components/AccountCMS.tsx`、`src/index.css`
- 复用：`src/components/ui/popover.tsx`、`src/features/interior/components/AccountAvatar.tsx`、`src/features/interior/model/accountIdentity.ts`（`accountInitial` / `accountTone` 已实现，无需改动）、`lucide-react` 的 `LogOut`
- 参照：`src/features/interior/components/SelectionEditor.tsx`（Popover 用法）、`src/index.css` 的 `.visual-editor-popover`（popover 样式位置）

## Implementation checklist

- [x] `AccountCMS.tsx` 导入 `Popover/PopoverTrigger/PopoverContent`，新增 `accountOpen` state。
- [x] `.cms-account` 内只渲染一个 `<button type="button" className="cms-account-trigger" aria-label="账号菜单">`，内含 40px `AccountAvatar`；邮箱文本与「已登录 · 云端同步」从侧边栏移除。
- [x] `PopoverContent` 使用 `className="account-popover" side="top" align="start" sideOffset={10}`。
- [x] 面板内容为 `.account-popover-head`（52px 头像 + 邮箱 + 「已登录 · 云端同步」）、`.account-popover-sep`、`.account-popover-logout`（`LogOut size={16}` + 退出登录），无任何其它菜单项。
- [x] 退出登录按钮 `onClick` 先 `setAccountOpen(false)` 再 `navigate('logout')`，`navigate` 的脏数据分支（`setLeaving` → AlertDialog → `projects.signOut()`）与改动前逐字一致。
- [x] `index.css` 收窄第 118 / 120 行共享选择器；删除 `.cms-account-id*` 与移动端两条无效头像尺寸规则。
- [x] `index.css` 的 `@layer components` 内新增 `.cms-account`（flex + `border-top` 分隔线）与 `.cms-account-trigger`（含 hover 光环）。
- [x] `index.css` 在非 layer 区（`.visual-editor-popover` 附近）新增 `.account-popover` 及 `.account-popover-head` / `-head b` / `-head small` / `-sep` / `-logout`（含 hover），全部使用现有语义令牌，无 `#` / `rgb(` / 无变量 `hsl(` 数字。
- [x] `Workbench.tsx`、`AccountAvatar.tsx`、`accountIdentity*`、auth 代码零改动。
- [x] 层叠验证：构建产物中 `.account-popover{` 偏移 69136，晚于 `.w-72`(46618) / `.rounded-md`(51739) / `.border`(51984) / `.p-4`(53847) / `.bg-popover`(53422) / `.shadow-md`(57828)，面板尺寸与底色确实生效。

## Verification checklist

- [x] `pnpm lint` 通过（无未使用 import：`LogOut`、`AccountAvatar` 仍被使用）。
- [x] `pnpm exec tsc --noEmit` 通过。
- [x] `pnpm test` 通过（`vitest run src/features/interior`：8 文件 36 用例，含 `accountIdentity.test.ts` 既有用例）。
- [x] `pnpm run build` 成功。
- [x] `git diff --stat` 只包含 `AccountCMS.tsx`（5 行）与 `index.css`（64 行）两个文件。
- [ ] 正常路径（需登录，人工确认）：CMS 侧边栏底部只剩一个彩色圆形头像 + 一条上方分隔线；点击头像在其**上方**弹出面板：居中大头像、邮箱、「已登录 · 云端同步」、分隔线、「退出登录」。
- [ ] 边界（需登录，人工确认）：在「成本管理」改价产生未保存状态后点面板里的「退出登录」→ 面板先关闭，再弹「账号成本尚未保存」AlertDialog；选「继续编辑」停留在成本页、会话不退出，选「放弃更改并离开」正常登出并回到登录入口。
- [ ] 边界：Popover 打开后点击面板外部或按 Esc 关闭，焦点回到头像按钮（Radix 默认行为）；面板在 246px 宽侧边栏内不溢出左边界。
- [ ] 视觉（`website_screenshot`，`desktop_1280` / `mobile_390`，需登录后截图）：账号区不再出现通栏按钮样式，邮箱不再折行；移动端 ≤700px 时头像仍在原位置、不换行、不溢出。
- [ ] 说明：预览会话默认是游客态（`AccountCMS` 仅登录后渲染）。已用 `website_screenshot`（desktop_1280）确认预览顶层为游客态（右上角「登录 / 保存」），CMS 账号区无法在此会话中截图，需用一个真实账号登录预览后再确认视觉。
