# 品牌 Logo 统一：用小助手插画替换各处图标

## Context

项目目前没有真正的品牌图片：`index.html` 的 favicon 是模板自带的灰色方块 SVG，左上角工作台工具栏最左边只有「项目名 + 下拉」，账号管理侧栏的品牌位用的是 lucide 的 `LayoutTemplate`，登录弹窗的圆形徽标用的是 lucide 的 `Cloud`。用户希望把这些位置统一成同一个品牌标志。

用户已确认两点：

1. 标志就用**代码库里已有**的小助手插画 —— `AvatarFigure.tsx` 里的 `roller`（滚筒刷）+ `look="up"`，也就是「白菜」头像配色中的 `tone="2"` 那一款（浅绿底 + 绿色滚筒）。不新增图片素材。
2. 左上角（工作台工具栏）在**项目名左边**加一个 24px 的小 logo，不额外增加文字，不改变原有布局宽度策略。

目标：一个可复用的 `Logo` 组件 + 一份静态 favicon，四处（favicon / 左上角 / 侧栏品牌位 / 登录弹窗徽标）都由同一份几何图形驱动。

## 关键复用点

- `src/features/interior/components/AvatarFigure.tsx` — 已有的 64×64 插画组件，导出 `AvatarFigure({ prop, look })`。
- `src/features/interior/ai/assistantAvatars.ts` — 插画注册表，`roller` 道具与之对应的 `tone: 2`。
- `src/index.css:4234-4245` — 已有的 `.assistant-avatar[data-tone="2"]` 规则，给出 tone 2 的配色：底色 `hsl(var(--success) / 0.14)`、图形色 `hsl(var(--success))`。新样式沿用同一套 token，不引入新颜色。
- `src/index.css:4237-4239` — `.avatar-ink`（`--foreground`）、`.avatar-eye`（`--background`），插画内部线条自动跟随主题。

## 改动

### 1. 新增 `src/features/interior/components/Logo.tsx`

薄封装，复用插画并统一尺寸与形状：

```tsx
import { AvatarFigure } from "./AvatarFigure";

/** 品牌标志：小助手插画（滚筒刷 + 仰视）配上 tone 2 的浅绿底，用作 favicon 与各处 logo。 */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return <span className={`brand-logo ${className}`.trim()} style={{ width: size, height: size }}>
    <AvatarFigure prop="roller" look="up" />
  </span>;
}
```

### 2. `src/index.css` — 新增 `.brand-logo` 规则

放在 `.assistant-avatar` 一组规则附近（约 4234 行），颜色全部用语义 token：

- `display:inline-grid; place-items:center; flex:none; overflow:hidden;`
- `border-radius` 用较大圆角（约 30%）与插画头像一致；外圈加一圈 `hsl(var(--primary) / .55)` 的细边框，呼应参考图里的棕色描边。
- `background: hsl(var(--success) / .14); color: hsl(var(--success));`
- 内部 `.avatar-figure` 尺寸沿用已有规则即可，无需覆写。

只改新增规则，不动既有选择器。

### 3. `src/features/interior/components/Workbench.tsx` — 左上角加 logo

在 `main-toolbar` 内、`<ProjectMenu ...>` 之前插入 `<Logo size={24} />`（约 778 行，紧邻 `className="main-toolbar"` 的 div 之后）。保持 `ProjectMenu` 的 `project-menu-trigger` 结构不变 —— `toolbarMenus.test.tsx:94` 断言该按钮的文本等于项目名，logo 作为**兄弟节点**插入才不会破坏它。

### 4. `src/features/interior/components/AccountCMS.tsx` — 侧栏品牌位

第 37 行 `.cms-brand` 里的 `<LayoutTemplate/>` 换成 `<Logo size={26} />`，文案「筑间 STUDIO / 我的设计工作室」不动。同时从该文件的 lucide 导入里移除不再使用的 `LayoutTemplate`（注意该文件是单行写法，需精确替换）。

### 5. `src/features/interior/components/AuthDialog.tsx` — 登录弹窗徽标

第 34-36 行 `.dialog-emblem` 里的 `<Cloud size={24} />` 换成 `<Logo size={44} />`，让徽标呈现出参考图那种「圆角方块 + 绿色底 + 插画」的外观；从 lucide 导入中移除 `Cloud`。`.dialog-emblem` 的既有 CSS 保留（其 `padding` 与 `background` 会让 Logo 居中）。

### 6. favicon

`public/favicon.svg` 目前是模板自带的灰色方块，`index.html` 里 `favicon.svg` 在前、`favicon.ico` 作为 alternate。处理方式：

- 用 AvatarFigure 的几何数据（`roller` 道具 + `up` 视线 + 墨色身体）写一份**静态** `public/favicon.svg`：64×64 viewBox，底色与图形色写成固定 HSL（不能用 CSS 变量，文件在 React 之外）：底 `hsl(142 38% 95%)`、图形 `hsl(142 38% 32%)`、墨色 `hsl(33 13% 17%)`、眼睛 `hsl(40 60% 99%)`，外框描边 `hsl(21 52% 40% / .5)`。写完后用 `read_file` 查看渲染结果或与 `AvatarFigure` 的 `roller` 分支逐一比对坐标。
- `index.html` 把 `<link href="/favicon.ico" rel="alternate icon">` 这一行去掉，只保留 `favicon.svg`（`favicon.ico` 是模板默认图标，作为 alternate 会与新的 SVG 冲突；浏览器标签页优先 SVG，删除可避免旧图标在部分环境继续出现）。`public/favicon.ico` 文件本身保留不动，避免影响其他引用。

## 不改动的部分

- 工具栏里 `LayoutTemplate` 的其它用途（2D 视图切换按钮、3D 俯视按钮）是功能图标，不属于 logo，保持原样。
- 项目管理卡片的 `<LayoutTemplate size={24} />` 空状态占位、`ProjectManager` 的空态插画同样保留。
- `AssistantAvatarView` / 小助手头像体系、账号圆形头像（`AccountAvatar`）不动 —— 用户只要求 logo 位置。
- 不改 `index.html` 的 `og:image`、标题与描述。

## 验证

1. `pnpm lint && pnpm exec tsc --noEmit`（也可直接 `pnpm check`）通过，确认 lucide 导入清理后没有未使用导出报错。
2. `pnpm test`（vitest，范围 `src/features/interior`）通过，重点看 `toolbarMenus.test.tsx` 里 `project-menu-trigger` 文本断言未被 logo 影响。
3. `pnpm run build` 通过。
4. 浏览器核对（`website_screenshot`，用 `mobile_390` 与 `desktop_1280` 两个视口）：
   - 工作台工具栏：项目名左边出现 24px logo，窄屏（600px 断点）下工具栏不换行、不溢出。
   - `/projects` 账号管理页：侧栏品牌位显示 logo + 「筑间 STUDIO」。
   - 登录弹窗（点工具栏「登录」）：徽标位显示 44px logo，弹窗排版未错位。
   - favicon：浏览器标签页显示新的绿色滚筒刷图标，且不出现旧的灰色方块图标。
5. 确认组件在浅色主题下对比度正常（`.brand-logo` 的绿色底与深色图形来自 `--success`，与既有 `.assistant-avatar[data-tone="2"]` 完全一致）。

## Implementation checklist

- [ ] 新建 `src/features/interior/components/Logo.tsx`，复用 `AvatarFigure` 的 `prop="roller"`、`look="up"`。
- [ ] `src/index.css` 新增 `.brand-logo` 规则（tone 2 的 `--success` 底色/图形色 + 圆角 + `--primary` 细描边），不改动既有选择器。
- [ ] `Workbench.tsx` 在 `main-toolbar` 内、`ProjectMenu` 之前插入 `<Logo size={24} />`，`project-menu-trigger` 结构保持原样。
- [ ] `AccountCMS.tsx` 的 `.cms-brand` 用 `<Logo size={26} />` 替换 `<LayoutTemplate/>`，并清理该文件的 `LayoutTemplate` 导入。
- [ ] `AuthDialog.tsx` 的 `.dialog-emblem` 用 `<Logo size={44} />` 替换 `<Cloud size={24} />`，并清理 `Cloud` 导入。
- [ ] 重写 `public/favicon.svg` 为滚筒刷图形（静态 HSL 颜色，64×64 viewBox），坐标与 `AvatarFigure` 的 `roller` 分支一致。
- [ ] `index.html` 删除 `favicon.ico` 的 alternate 链接，保留 `favicon.svg`。

## Verification checklist

- [ ] `pnpm check`（lint + `tsc --noEmit`）无错误，无未使用导入告警。
- [ ] `pnpm test` 全绿，特别确认 `toolbarMenus.test.tsx` 的 `project-menu-trigger` 文本断言通过。
- [ ] `pnpm run build` 成功。
- [ ] 正向：工作台工具栏、账号管理侧栏、登录弹窗三处都显示同一个绿色滚筒刷 logo，尺寸分别为 24 / 26 / 44。
- [ ] 负向：工具栏 2D / 俯视按钮、项目管理空状态仍是原来的 `LayoutTemplate` 图标；账号圆形头像未被替换。
- [ ] 边界：`mobile_390` 视口下工具栏不溢出、logo 不被裁切；`desktop_1280` 下排版与改动前一致。
- [ ] 边界：浏览器标签页 favicon 为新的绿色图标，不再出现旧的灰色方块。
