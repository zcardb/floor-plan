# 账号身份头像：CMS 侧边栏 + 顶部「我的账号」下拉

## Context

截图里的账号入口目前只有一行灰色邮箱字符串 + 「退出登录」，没有任何视觉锚点：用户看不出「这是我的账号」，两个身份入口（CMS 侧边栏 / 顶部「我的账号」下拉）也与品牌语汇无关。

用户要求：默认给账号一个有颜色的头像（首字母 + 由邮箱生成的确定性暖色渐变），位置为 CMS 侧边栏账号区 **和** 顶部「我的账号」下拉，两处保持一致。

设计依据（用户给定的 UI/UX 法则参考：Growth.Design 心理学清单）：
- **Recognition over Recall / Endowment Effect**：颜色由邮箱哈希决定 → 同一账号永远同一色，一眼认出「我」。
- **Visual Hierarchy / Von Restorff**：头像作为唯一彩色元素成为身份区的视觉锚点，其余（邮箱、退出）保持低对比。
- **Law of Proximity**：头像 + 邮箱成一组（`.cms-account-id`），退出登录单独一行，语义边界清晰。
- **Aesthetic-Usability Effect**：渐变色取「陶土棕 / 琥珀 / 橄榄 / 青灰 / 砖红 / 梅」六个暖色系，落在现有 `--primary`、`--teal` 的暖色家族内，不引入突兀的第三方色。
- **Contrast**：所有渐变端点明度 ≤ 40%，配 `--avatar-ink`（米白）作为首字母色，保证 ≥4.5:1。

不做的事：不加头像上传、不改 auth / 数据库、不动 `.cms-sidebar` 其余布局、不做暗色模式（项目 `index.css` 目前没有 `.dark` 定义）。

## 改动

### 1. 新增 `src/features/interior/model/accountIdentity.ts`（纯函数，可测）

```ts
export const AVATAR_TONES = 6;
export function accountSeed(email = '') { /* h = (h*31 + charCode) >>> 0 */ }
export function accountTone(email?: string) { return accountSeed(email ?? '') % AVATAR_TONES; }
export function accountInitial(email?: string) { /* 本地部分首个字母 → 否则首个数字 → 否则 '?'，大写 */ }
```

沿用 `model/` 目录「纯逻辑 + `.test.ts`」的既有约定（对照 `model/selectionAnchor.ts`、`model/wallDrawing.ts`）。

### 2. 新增 `src/features/interior/components/AccountAvatar.tsx`

复用 shadcn `Avatar` / `AvatarFallback`（`src/components/ui/avatar.tsx`）与 `cn`（`@/lib/utils`）：

```tsx
export function AccountAvatar({ email, size = 40, className }: { email?: string; size?: number; className?: string })
```
- 已登录（有 `email`）：根节点 `data-tone={accountTone(email)}`，`AvatarFallback` 显示 `accountInitial(email)`。
- 游客（无 `email`）：`data-tone="guest"`，fallback 渲染 lucide `UserRound`（不用 emoji）。
- 尺寸走内联 `width/height`（radix root 需要显式尺寸覆盖 `h-10 w-10`），字号 `Math.round(size*0.42)`。
- 根节点 `aria-hidden="true"`：头像纯装饰，邮箱文本始终在旁边，避免读屏重复播报。

### 3. `src/features/interior/components/AccountCMS.tsx`

`.cms-account` 内改为三件套（`projects.session?.user.email`）：

```tsx
<div className="cms-account">
  <div className="cms-account-id">
    <AccountAvatar email={projects.session?.user.email} size={44} />
    <span><b>{projects.session?.user.email}</b><small>已登录 · 云端同步</small></span>
  </div>
  <button onClick={()=>navigate('logout')}><LogOut size={16}/>退出登录</button>
</div>
```
退出登录按钮保留现有的 `navigate('logout')` 脏数据守卫（未保存的账号成本会先弹确认对话框），不改成直接 `signOut()`。其余（`modules`、`tab`、`catalog` 加载、`leaving` 对话框、`CustomFurnitureDialog`）完全不动。

### 4. `src/features/interior/components/Workbench.tsx`（`main-header` 里「我的账号」区域，约第 460–490 行；注意游客分支刚新增了 `cloud-save-button`，本次不动那部分）

- 触发器：已登录时在 `<span>我的账号</span>` 前插 `<AccountAvatar email={p.email} size={20} />`（游客/未登录分支保持原样）。
- 下拉内容：把 `DropdownMenuItem disabled`（邮箱）换成 `DropdownMenuLabel` 身份块：

```tsx
<DropdownMenuLabel className="account-menu-head">
  <AccountAvatar email={p.email} size={34} />
  <span><b>{p.email || '游客模式'}</b><small>{p.loggedIn ? '已登录 · 云端同步' : '无需登录即可编辑与下载'}</small></span>
</DropdownMenuLabel>
```
- 分隔线、`退出登录` / `登录 / 注册` / `另存到云端` 菜单项、`p.logout`、`p.login`、`p.cloudSave` 行为全部不变。

### 5. `src/index.css`

- `:root` 追加语义令牌（不写死颜色）：`--avatar-ink: 40 60% 99%`，以及 6 组 `--avatar-0-from/--avatar-0-to` … `--avatar-5-to`（明度 ≤40% 的暖色端点，取自 `--primary` / `--teal` 家族）。
- `@layer components` 追加：
  - `.account-avatar`：`border-radius:50%; overflow:hidden; display:flex; box-shadow:var(--shadow-float)`。
  - `.account-avatar[data-tone="0"…"5"]`：`linear-gradient(140deg, hsl(var(--avatar-N-from)), hsl(var(--avatar-N-to)))`。
  - `.account-avatar[data-tone="guest"]`：`background:hsl(var(--secondary)); color:hsl(var(--muted-foreground))`。
  - `.account-avatar-fallback`：`background:transparent; color:hsl(var(--avatar-ink)); font-weight:650; letter-spacing:.4px`。
  - `.cms-account { align-content:start; gap:14px; }`、`.cms-account-id { display:flex; align-items:center; gap:12px; min-width:0; }`、`.cms-account-id b { font-size:12.5px; font-weight:600; overflow-wrap:anywhere; }`、`.cms-account-id small { font-size:11px; }`。
  - `.account-menu-head { display:flex; align-items:center; gap:10px; padding:8px 10px; }`（`b` 13px 前景色、`small` 11px 弱化色，覆盖 shadcn label 的 12px/600 默认）。
- `@media(max-width:700px)`：在现有 `.cms-account` 规则里补 `.cms-account .account-avatar { width:32px; height:32px; } .cms-account-id small { display:none; }`，保持「头像 + 邮箱 | 退出登录」一行不换行。

## 关键文件

- 新增：`src/features/interior/components/AccountAvatar.tsx`、`src/features/interior/model/accountIdentity.ts`、`src/features/interior/model/accountIdentity.test.ts`
- 修改：`src/features/interior/components/AccountCMS.tsx`、`src/features/interior/components/Workbench.tsx`、`src/index.css`

## Implementation checklist

- [ ] `accountIdentity.ts` 导出 `AVATAR_TONES`、`accountSeed`、`accountTone`、`accountInitial`，全部无副作用、无 DOM 依赖。
- [ ] `accountTone` 对空 `email` / `undefined` 返回 0..5 内的整数，同一 `email` 多次调用结果恒定。
- [ ] `accountInitial('18793850224@163.com')` 返回 `'1'`（无字母时用首个数字），`'alice@x.com'` 返回 `'A'`，空字符串返回 `'?'`。
- [ ] `AccountAvatar` 有 `email` 时渲染首字母 + `data-tone` 0..5；无 `email` 时渲染 `UserRound` 图标 + `data-tone="guest"`。
- [ ] `AccountAvatar` 根节点带内联 `width/height`（默认 40），`aria-hidden="true"`。
- [ ] `AccountCMS` 侧边栏账号区渲染头像 + 邮箱 + 「已登录 · 云端同步」，退出登录按钮仍走 `navigate('logout')`（有未保存成本时先弹 AlertDialog）。
- [ ] `Workbench` 已登录时「我的账号」触发器内显示 20px 头像，未登录分支不渲染头像且仍显示「登录」。
- [ ] `Workbench` 下拉顶部为 `account-menu-head` 身份块（头像 + 邮箱 + 状态副文案），游客态文案为「无需登录即可编辑与下载」。
- [ ] 下拉内 `退出登录` / `登录 / 注册` / `另存到云端` 三个菜单项及回调与改动前完全一致。
- [ ] `index.css` 新增 `--avatar-ink` 与 6 组 `--avatar-N-from/to`，组件内不出现任何硬编码颜色（`#`/`rgb(`/无变量 `hsl(` 数字）。
- [ ] `index.css` 新增 `.account-avatar`、`.account-avatar[data-tone]`、`.account-avatar-fallback`、`.cms-account-id`、`.account-menu-head`，并在 700px 断点补 `.cms-account` 移动端规则。

## Verification checklist

- [ ] `pnpm lint` 通过（无未使用 import、无 hooks 依赖告警）。
- [ ] `pnpm exec tsc --noEmit` 通过。
- [ ] `pnpm test`（`vitest run src/features/interior`）通过，含新增 `accountIdentity.test.ts`（确定性、取值范围、首字母提取三个分支）。
- [ ] `pnpm run build` 成功。
- [ ] 正常路径：登录后 CMS 侧边栏底部显示彩色圆形头像 + 邮箱 + 「已登录 · 云端同步」，退出登录按钮位置/行为不变。
- [ ] 正常路径：顶部「我的账号」触发器出现 20px 头像，展开后下拉顶部身份块头像与侧边栏颜色一致（同邮箱同色）。
- [ ] 默认/边界：未登录（游客）时，下拉身份块为灰底 `UserRound` 头像 + 「无需登录即可编辑与下载」，顶部触发器不显示头像，仍可「登录 / 注册」。
- [ ] 边界：邮箱切换账号后头像颜色随之改变（`accountTone` 仅依赖邮箱字符串，不依赖登录会话）。
- [ ] 视觉：`website_screenshot` 在 `desktop_1280` 与 `mobile_390` 检查头像尺寸、邮箱换行与 700px 以下「头像 + 邮箱 | 退出登录」一行布局；账号区需登录，若预览会话未登录则视觉部分标注为需人工确认，不声称已截图验证。
