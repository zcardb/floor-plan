# CMS 侧边栏账号区：去掉上分隔线，直接显示 头像 + 名称（中间省略）

## Context

上一轮把 CMS 侧边栏底部账号区收敛成一个 40px 圆形头像 + 上方一条 `border-top` 分隔线，邮箱被藏进点击后的账号面板里（见 `cms-account-avatar-popover.md`）。

用户看图后要求：**这一处不要上面那条分隔线，直接展示头像加名称**；**名称超出容器时省略中间部分**。

已确认口径：

- 名称文本 = **邮箱全文**（当前唯一的账号标识，`projects.session.user.email`；`AccountCMS` 只在已登录时渲染，见 `Index.tsx:26`，不存在游客分支）。
- 中间省略用**纯 CSS 按 `@` 拆分**：`@` 之后的域名始终完整显示，`@` 之前的用户名在宽度不够时尾部接 `…`（如 `1879385…@163.com`）；DOM 里保留完整邮箱，读屏与 Ctrl+F 都拿到原文。
- 点击头像/名称仍然弹出原有账号面板（`account-popover`：大头像 + 邮箱 + 「已登录 · 云端同步」 + 分隔线 + 退出登录），**面板内容与退出登录的脏数据守卫完全不动**。
- 不改：`Workbench.tsx` 顶部「我的账号」下拉、`AccountAvatar.tsx`、`accountIdentity*.ts`、auth / 数据库。

## 改动

### 1. `src/features/interior/components/AccountCMS.tsx`（只动第 20 行的账号区）

- 组件顶部（`catalog` 那两行附近）加一行派生，避免在 JSX 里对 `email` 反复取值与 `split('@')` 的多 `@` 边界问题：

```tsx
const email=projects.session?.user.email??'',at=email.indexOf('@');
const nameHead=at<0?email:email.slice(0,at),nameTail=at<0?'':email.slice(at);
```

- `.cms-account` 的 `PopoverTrigger` 内按钮改为「头像 + 名称」两段结构，其余（Popover 结构、`side/align/sideOffset`、面板内容、退出登录 onClick）逐字不动：

```tsx
<button type="button" className="cms-account-trigger" aria-label={`账号菜单：${email}`}>
  <AccountAvatar email={projects.session?.user.email} size={40}/>
  <span className="cms-account-name"><b>{nameHead}</b><span>{nameTail}</span></span>
</button>
```

- `aria-label` 从 `"账号菜单"` 改为包含可见文本的 `账号菜单：{email}`：可见文本就在按钮里，两者不一致会破坏语音控制（WCAG 2.5.3）。`AccountAvatar` 根节点是 `aria-hidden="true"`，不含可访问文本，所以仍需 label。
- 邮箱全文与「已登录 · 云端同步」从侧边栏移除（上一轮已移除，此处保持），面板里的 `account-popover-head` 不变。

### 2. `src/index.css`

**`@layer components`（第 122-125 行）**：

- `.cms-account` 只删掉 `border-top:1px solid hsl(var(--border));`，其余 `margin-top:auto; display:flex; align-items:center; padding-top:16px;` 保留（去掉线后这点 padding 就是 nav 与头像之间的呼吸空间）。
- `.cms-account-trigger` 由 `{ display:flex; padding:0; border-radius:50%; }` 改为：
  `{ display:flex; align-items:center; gap:10px; padding:0; min-width:0; max-width:100%; border-radius:10px; text-align:left; }`
  （`min-width:0` 是必须的，否则 flex 子项撑到内容宽度，内部省略号永不触发；`border-radius` 从 50% 改 10px，让 `button:focus-visible` 的 3px offset 轮廓落在整行上而不是圆形头像上。）
- 新增名称两条规则（全部用现有语义令牌，不新增令牌、不写死颜色）：

```css
.cms-account-name { display:flex; align-items:baseline; gap:0; min-width:0; font-size:12.5px; font-weight:600; color:hsl(var(--foreground)); }
.cms-account-name b { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.cms-account-name span { flex:0 0 auto; white-space:nowrap; }
```

`b` 拿 `flex:0 1 auto` + `min-width:0` + `text-overflow:ellipsis`（用户名被挤压时尾部省略），`span` 拿 `flex:0 0 auto`（域名永不被压），整体即“中间省略”。字号/字重沿用 `.account-menu-head b` 的 12.5px / 600。

- `.cms-account-trigger .account-avatar` / `:hover .account-avatar` 两条光环规则保留不变（hover 到名称上也一样亮头像，仍是可点击信号）；`Avatar` 根节点自带 `shrink-0`，头像不会被压扁。

**`@media(max-width:700px)`（第 204 行）**：`.cms-account { margin-top:8px; padding-top:10px; }` 里没有 `border-top`，**无需改动**；移动端侧栏变整行宽度，名称空间更宽，省略逻辑自动不触发。

### 3. 明确不改

`src/features/interior/components/Workbench.tsx`、`AccountAvatar.tsx`、`model/accountIdentity*.ts`、`src/components/ui/popover.tsx`、auth / 数据库 / 迁移。

## 关键文件

- 改：`src/features/interior/components/AccountCMS.tsx`（账号区 + 派生 2 行）、`src/index.css`（`.cms-account` / `.cms-account-trigger` / 新增 `.cms-account-name`）
- 复用：`AccountAvatar`（`accountInitial` / `accountTone` 已实现）、`@/components/ui/popover`、`lucide-react` 的 `LogOut`、令牌 `--foreground` / `--accent` / `--border` / `--shadow-float`

## Implementation checklist

- [x] `AccountCMS.tsx` 新增 `email` / `at` / `nameHead` / `nameTail` 派生（`indexOf('@')` + `slice`，不用 `split`，避免多 `@` 时丢尾段）。
- [x] `.cms-account` 的 trigger 按钮渲染 40px `AccountAvatar` + `.cms-account-name`（`<b>{nameHead}</b><span>{nameTail}</span>`），`aria-label={`账号菜单：${email}`}`。
- [x] Popover 结构、`PopoverContent className="account-popover" side="top" align="start" sideOffset={10}`、面板三块内容与退出登录 `onClick`（先 `setAccountOpen(false)` 再 `navigate('logout')`）逐字不变。
- [x] `index.css` 第 122 行 `.cms-account` 删除 `border-top`，保留 `margin-top:auto; display:flex; align-items:center; padding-top:16px`。
- [x] `.cms-account-trigger` 增加 `align-items:center; gap:10px; min-width:0; max-width:100%; text-align:left`，`border-radius` 由 `50%` 改 `10px`。
- [x] 新增 `.cms-account-name` / `.cms-account-name b` / `.cms-account-name span` 三条规则，只用现有语义令牌，无 `#` / `rgb(` / 无变量 `hsl(` 数字。
- [x] `@media(max-width:700px)` 与 `Workbench.tsx` / `AccountAvatar.tsx` / `accountIdentity*` / auth 代码零改动。

## Verification checklist

- [x] `pnpm lint` 通过（无未使用 import；`LogOut`、`AccountAvatar` 仍被使用）。
- [x] `pnpm exec tsc --noEmit` 通过（新增派生变量无隐式 `any` / 无未使用变量）。
- [x] `pnpm test` 通过（`vitest run src/features/interior`，含既有 `accountIdentity.test.ts`；本轮不新增 model 函数，不新增用例）。
- [x] `pnpm run build` 成功。
- [x] `git diff --stat` 中我的改动只落在 `AccountCMS.tsx`（3 行）与 `index.css`（7 行）；`CustomFurnitureDialog.tsx` / `ProjectManager.tsx` 的改动来自并发的另一个会话，与本轮无关。
- [x] 层叠验证（构建产物或 DevTools）：`.account-popover` 仍在非 layer 区且晚于 Tailwind 工具类；`.cms-account-name` 位于 `@layer components` 内、早于非 layer 规则。
- [ ] 正常路径（预览已登录会话 + `website_screenshot`，`desktop_1280`）：CMS 侧栏底部只有「彩色圆形头像 + 邮箱」，**上方没有分隔线**；短邮箱（能放下时）完整显示、无省略号。
- [ ] 边界（`desktop_1280`，同一个已登录会话）：用 `18793850224@163.com` 这类长邮箱确认渲染为 `187938xxx…@163.com`，`@` 与域名完整、省略号出现在用户名尾部、不换行、不溢出 220px 侧栏（侧栏内容宽 184px，头像 40 + gap 10 = 名称可用 ≈134px）。
- [ ] 边界（`mobile_390`）：≤700px 侧栏变为顶部条 + 三列 nav，账号行仍是头像 + 名称、单行不换行、不挤压 nav。
- [ ] 边界：点击头像或名称仍在其上方弹出 `account-popover`，面板宽 246px 不溢出左边界；Tab 聚焦时 `button:focus-visible` 轮廓包住整行；Esc / 点击外部关闭后焦点回到该按钮。
- [ ] 边界（需登录）：在「成本管理」改价产生未保存状态后，从面板点「退出登录」→ 面板先关闭并弹出「账号成本尚未保存」AlertDialog，两个分支行为与改动前一致。
- [ ] 说明：预览默认是游客态（`AccountCMS` 仅登录后渲染），若无法在该会话登录，则视觉两项标记为未验证并说明原因，不谎报已完成。
