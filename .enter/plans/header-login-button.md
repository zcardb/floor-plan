# 游客态顶栏：登录改为主按钮 + 保存改为二级下拉按钮

## Context

游客状态下，工作台顶栏右侧依次是「登录」（纯文字 `.header-plain`，灰字无边框）、「保存到云端」（实心主色按钮）、「下载设计图」（实心主色按钮）。「登录」看起来只是一行说明文字，用户很难发现；而两个实心按钮并排也稀释了主次。

目标（已与用户确认的方案）：

- 游客态顶栏最终只保留两个按钮，顺序为 `登录 | 保存▾`
  - **登录**：主按钮（实心主色）
  - **保存**：二级按钮（描边样式），点击展开下拉菜单
    - `保存到本地` → 复用现有 `exportImage`（就是原来的「下载设计图」）
    - `保存到云端` → 复用现有 `p.cloudSave`（未登录时会拉起登录弹窗，行为已符合预期）
- 原来的独立「下载设计图」按钮在**游客态移除**（下载动作收进「保存▾ → 保存到本地」）
- **已登录态完全不动**（返回管理 / 我的账号下拉 / 下载设计图保持原样）

## 已确认的复用点（无需新写逻辑）

- `src/pages/Index.tsx:18-22` 的 `cloudSave`：`!owner` 时 `setAuthIntent('cloud'); setAuthOpen(true)`，即「保存到云端」未登录时自动触发登录，无需改动。
- `src/features/interior/components/Workbench.tsx:370-374` 的 `exportImage`：2D 导出设计图、3D 导出当前视角，直接作为「保存到本地」的处理函数。
- `Button`（`@/components/ui/button.tsx`）、`DropdownMenu*`（`@/components/ui/dropdown-menu`）均已在 Workbench.tsx 中导入。
- 图标 `UserRound`、`Save`、`ChevronDown`、`Download`、`Cloud` 均已在 Workbench.tsx 第 2-42 行导入，**无需新增 import**。

## 改动 1：`src/features/interior/components/Workbench.tsx`

当前第 485-493 行（游客分支 + 两种状态共用的下载按钮）：

```tsx
</DropdownMenu></> : <><button className="header-plain guest-login" onClick={p.login}><UserRound size={16} />登录</button>
<Button size="sm" className="cloud-save-button" onClick={p.cloudSave}>
  <Cloud size={15} />
  <span>保存到云端</span>
</Button></>}
<Button size="sm" className="download-button" onClick={exportImage}>
  <Download />
  <span>下载{view === "2d" ? "设计图" : "当前视角"}</span>
</Button>
```

改为：把「下载设计图」按钮移入**已登录分支**（紧跟在账号 `DropdownMenu` 之后，保持已登录态外观与顺序不变），游客分支换成「登录主按钮 + 保存下拉」：

```tsx
</DropdownMenu>
<Button size="sm" className="download-button" onClick={exportImage}>
  <Download />
  <span>下载{view === "2d" ? "设计图" : "当前视角"}</span>
</Button>
</> : <>
<Button size="sm" className="login-button" onClick={p.login}>
  <UserRound />
  <span>登录</span>
</Button>
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" className="save-button">
      <Save />
      <span>保存</span>
      <ChevronDown size={12} />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={exportImage}>
      <Download />
      保存到本地
    </DropdownMenuItem>
    <DropdownMenuItem onClick={p.cloudSave}>
      <Cloud />
      保存到云端
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
</>}
```

要点：

- `size="sm"` + 默认 variant 让「登录」继承主色实心样式，与「下载设计图」视觉同源。
- 「保存」用 `variant="outline"` 打底，具体配色由下面的 `.save-button` 用语义 token 覆盖。
- 删除 `guest-login`、`cloud-save-button` 两个类名的引用；`exportImage`、`p.cloudSave`、`Cloud` 仍被使用，不会产生未使用变量。
- 已登录态 JSX 结构、类名、顺序一律不变。

## 改动 2：`src/index.css`

**(a) 桌面态**：在 `.download-button`（第 285-291 行）后新增两个类的规则，尺寸与 `.download-button` 对齐（height 34px、radius 6px、font-size 11px），全部走 `hsl(var(--primary) / α)` 语义色：

```css
.login-button {
  font-size: 11px;
  height: 34px !important;
  padding: 0 14px !important;
  border-radius: 6px !important;
  font-weight: 600;
  box-shadow: 0 2px 4px hsl(var(--primary) / 0.15);
}
.save-button {
  font-size: 11px;
  height: 34px !important;
  padding: 0 12px !important;
  border-radius: 6px !important;
  font-weight: 600;
  border-color: hsl(var(--primary) / 0.45) !important;
  color: hsl(var(--primary)) !important;
  background: hsl(var(--card)) !important;
}
.save-button:hover {
  background: hsl(var(--primary) / 0.1) !important;
  border-color: hsl(var(--primary) / 0.7) !important;
  color: hsl(var(--primary)) !important;
}
.login-button:focus-visible,
.save-button:focus-visible {
  outline: 2px solid hsl(var(--primary) / 0.4);
  outline-offset: 2px;
}
```

> 注：`.save-button` 用 `!important` 覆盖 shadcn outline variant 自带的 `bg-background / hover:bg-accent / hover:text-accent-foreground`，避免 hover 时文字色被改成 accent-foreground 而失去橙色。

**(b) 清理失效类**：删除仅服务于旧结构的 `.main-header > .guest-login { ... }`（第 1837 行）和 `.main-header > .cloud-save-button { ... }`（第 1838 行）。

**(c) 移动端 `@media (max-width: 600px)`**：现有第 1834-1836 行 `.main-header > .header-plain { display:none }` 仍用于已登录态的「返回管理 / 我的账号」，保留；为两个新按钮补上等价的尺寸规则（按钮数从 3 减到 2，宽度比现状更宽松，文字标签保留）：

```css
.main-header > .login-button { min-height: 44px; padding: 0 12px !important; font-size: 12px; }
.main-header > .save-button { min-height: 44px; padding: 0 10px !important; font-size: 12px; gap: 4px !important; }
```

`.download-button` 的移动端规则（1839-1846 行）保留，已登录态仍在使用。

## 不改动的部分

- 已登录态顶栏（返回管理 / 我的账号下拉 / 下载设计图）零改动。
- `AuthDialog`、`ProjectDialog`、`AccountCMS` 中的登录入口不变。
- `src/pages/Index.tsx` 的 `login` / `cloudSave` 逻辑不变。
- 不新增颜色 token、不改 `tailwind.config.ts`、不触碰 backend / 数据库。

## 关键文件

- `src/features/interior/components/Workbench.tsx`（第 459-493 行）
- `src/index.css`（第 285-291 行、1834-1846 行）

## Implementation checklist

- [x] 将「下载设计图」`Button` 移入 `p.loggedIn` 为真的分支，已登录态渲染顺序与类名保持不变
- [x] 游客分支用 `<Button size="sm" className="login-button" onClick={p.login}>` 替换原 `header-plain guest-login` 按钮，含 `UserRound` + 「登录」文字
- [x] 游客分支新增「保存▾」`DropdownMenu`：触发器为 `<Button variant="outline" size="sm" className="save-button">`（`Save` + 「保存」+ `ChevronDown`）
- [x] 「保存」下拉含两项：`保存到本地` → `exportImage`，`保存到云端` → `p.cloudSave`，`DropdownMenuContent` 用 `align="end"`
- [x] 游客态不再渲染独立的 `.download-button`；`guest-login` 与 `cloud-save-button` 类名引用从 Workbench.tsx 中消失
- [x] `index.css` 新增 `.login-button`、`.save-button`（含 `:hover`、`:focus-visible`），尺寸与 `.download-button` 一致（height 34px、radius 6px）
- [x] `index.css` 删除 `.main-header > .guest-login` 与 `.main-header > .cloud-save-button` 规则
- [x] `index.css` 的 `max-width:600px` 分支为 `.main-header > .login-button` / `.main-header > .save-button` 补上 44px 触控高度规则

## Verification checklist

- [x] 游客态 1280px：顶栏右侧只有两个按钮，顺序为「登录（实心主色）| 保存▾（描边）」，二者不重叠、不溢出（`desktop_1280` 截图已确认）
- [x] `website_screenshot` @ `mobile_390` 复核：两个按钮文字（登录 / 保存 + 折叠箭头）完整显示、触控高度充足，顶栏与「参考户型」标题均未溢出或裁切
- [x] 已登录态代码路径核对：已登录分支 JSX（返回管理 / 我的账号下拉 / 下载设计图）逐行未改动（未登录账号，无法截图对比）
- [x] 运行 `pnpm run lint` 与 `pnpm run build`，均无新增报错
- [ ] 点击「登录」→ 打开 `AuthDialog`（与改动前 `p.login` 行为一致）— 需人工点击确认
- [ ] 打开「保存▾」→ 菜单出现「保存到本地」「保存到云端」两项；点「保存到本地」触发下载（2D 导出设计图 / 3D 导出当前视角），点「保存到云端」拉起 `AuthDialog` 的 cloud intent — 需人工点击确认
- [ ] 悬停「保存▾」背景变浅橙、文字保持橙色；Tab 聚焦出现 `focus-visible` 描边 — 需人工交互确认
- [x] 深色模式检查：`index.css` 中不存在 `.dark` 主题变量块（`--primary` 仅定义于 `:root`），UI 无深色主题，该项不适用（已登录态/3D 的 Moon/Sun 图标是场景夜模式，非 UI 主题）
