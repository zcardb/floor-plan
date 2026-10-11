# 修复「新建项目」下拉菜单的图标与字号刻度

## Context

截图里的「新建项目」下拉（手动创建 / AI 创建 / 导入 DXF / 从其他软件导入）现在：图标 24px、标题和说明挤在同一行、字号大一档、「AI 创建」的星星是黑色。

原因不是这次新改坏的，而是提交 `4a8f953`（feat(interior): streamline project and editor menus）在重写项目下拉时，**把 `.create-menu / .create-option` 整段 CSS 一起删掉了**，但组件仍然在用这些 class：

- `src/features/interior/components/CreateProjectMenuItems.tsx` 仍在渲染 `create-menu` / `create-option` / `create-option-icon` / `create-option-text`
- `src/features/interior/components/ProjectManager.tsx:108` 也在用 `className="create-menu"`

class 失去定义后，菜单项退回 shadcn `DropdownMenuItem` 的默认样式（图标 16px 盒子 + `[&_svg]:size-4`，但菜单容器没有宽度约束、行高 32px、字体继承 13/14px），两行布局塌成一行，`.ai-icon` 的主色也一并丢失，所以 AI 星标变黑。

顺带确认：`4a8f953` 删掉的其他规则（`.project-menu-back`、`.project-menu-create`、`.export-menu [role="menuitem"]` 等）对应的组件已经不用了，**不要一起恢复**，只补回上面两个组件真正引用的那一组。

## 改动

### 1. `src/index.css` — 补回刻度（放在 `.project-menu` 规则组之后，即现 3906–3925 行区间内，规则写在 `@layer` 之外）

数值取自 UI_GUIDELINES.md §5.3，与 `.wall-options-item` 同一套刻度，**不要另写死数字**：

```css
/* 「新建项目」菜单：与 .wall-options-item 同一套两行刻度（标题 12px、说明 10px、padding 9px）。
   工作台下拉的「新建项目」二级菜单与项目管理页页头的新建菜单共用。 */
.create-menu { width:min(260px,calc(100vw - 24px)); padding:6px; }
.create-menu [role="menuitem"].create-option { min-height:48px; align-items:flex-start; gap:10px; padding:9px; border-radius:var(--ctl-radius-in); }
.create-option-icon { display:grid; place-items:center; flex:none; width:16px; height:16px; margin-top:2px; }
.create-option-icon>svg { width:16px; height:16px; stroke-width:1.75; }
.create-option-text { display:grid; gap:3px; flex:1; min-width:0; }
.create-option-text>b { font-size:var(--fs-group); line-height:17px; font-weight:500; color:hsl(var(--foreground)); }
.create-option-text>small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--fs-hint); line-height:15px; color:hsl(var(--muted-foreground)); }
/* 菜单里夹着的单行禁用项（从其他软件导入）：图标列、左边距与两行项对齐 */
.create-menu [role="menuitem"].soon-item { min-height:var(--ctl-md); gap:10px; padding:0 9px; font-size:var(--fs-group); }
.create-menu [role="menuitem"].soon-item>svg { width:16px; height:16px; stroke-width:1.75; }
/* AI 标识统一主色：AiIcon 在工具条、按钮、菜单里都靠这条上色 */
.ai-icon { flex:none; color:hsl(var(--primary)); }
```

说明：
- `.ai-icon` 是全局规则（`FurnitureVisual.tsx`、`SelectionEditor.tsx` 的 AI 入口也依赖它），补回时按全局写，不加 `.create-menu` 前缀。
- 不加 `.project-menu-create` / `.project-menu ::marker` 之类的旧规则，那是上一版项目下拉的结构，现已不用。
- `.create-option` 的 `data-tone="ai"` 不再单独上色，颜色由 `.ai-icon` 决定（与 UI_GUIDELINES §5.6 一致）。

### 2. `src/features/interior/components/toolbarMenus.test.tsx` — 加回归断言

样式丢失没有任何编译/测试信号，靠人眼才发现。追加一个 `it`：读 `src/index.css`，断言 `.create-menu`、`.create-option`、`.create-option-icon`、`.create-option-text>b`、`.ai-icon` 五处规则存在，并断言两行刻度关键值（`min-height:48px`、`font-size:var(--fs-hint)`）仍在。读法照抄 `src/components/ui/sonner.test.tsx` 里的 `readFileSync('src/index.css', 'utf8')`。

### 3. `src/features/interior/UI_GUIDELINES.md` — 补一条防回归说明

在第 5.3 节末尾加一句：删除菜单结构时，必须同时处理 `index.css` 里对应的 `.xxx-menu / .xxx-option` 规则，或用例被 `toolbarMenus.test.tsx` 挡住；不要留下「组件在用、CSS 已删」的 class。

## 不改动

- 组件结构（`CreateProjectMenuItems.tsx`、`ProjectMenu.tsx`、`ProjectManager.tsx`）保持原样，两行布局的 DOM 已经是正确的，缺的只是 CSS。
- 项目管理页本次 CMS 版式改动（`.cms-filter-rows` 等）不在本次范围内。

## Verification

- `pnpm run lint`、`pnpm test`、`pnpm run build` 全部通过。
- 人工核对（`website_screenshot`，`http://localhost:3000/projects`，desktop_1280）点开「新建项目」：图标 16px 线性、标题与说明两行、说明为 10px 灰字、「AI 创建…」星标为主色而非黑色、菜单宽 260px。
- 确认「从其他软件导入」的图标列与上一项「导入 DXF 图纸…」的图标左边缘对齐。

## Implementation checklist

- [ ] `src/index.css` 补回 `.create-menu` 宽度与 padding（260px / 6px）
- [ ] 补回 `.create-menu [role="menuitem"].create-option` 的两行刻度（48px、flex-start、gap 10px、padding 9px）
- [ ] 补回 `.create-option-icon` / `.create-option-icon>svg`（16px、stroke-width 1.75、margin-top 2px）
- [ ] 补回 `.create-option-text` / `>b` / `>small`（gap 3px、`--fs-group`、`--fs-hint`）
- [ ] 补回 `.create-menu ... .soon-item` 及其 svg 规则，使单行项与两行项图标列对齐
- [ ] 补回全局 `.ai-icon { color: hsl(var(--primary)) }`
- [ ] 确认未恢复 `.project-menu-create`、`.project-menu-back` 等已废弃规则
- [ ] `toolbarMenus.test.tsx` 增加 `src/index.css` 中五个 class 规则存在的断言
- [ ] `UI_GUIDELINES.md` §5.3 补「删菜单结构要同步处理 CSS」的说明

## Verification checklist

- [ ] 正向：`/projects` 下拉里四个条目均为「16px 图标 + 12px 标题 + 10px 灰字说明」两行布局
- [ ] 正向：「AI 创建…」图标颜色为 `hsl(var(--primary))`，不是前景色黑
- [ ] 负向/默认：未登录（`actions.ai` 为空）时菜单只显示手动创建 + 导入两项，且间距不塌
- [ ] 边界：菜单宽度在 390px 视口下不超过 `calc(100vw - 24px)`，不出现横向滚动
- [ ] 边界：「从其他软件导入」禁用项图标与「导入 DXF 图纸…」图标左边缘对齐
- [ ] `pnpm run lint` 通过
- [ ] `pnpm test` 通过（含新增 CSS 断言用例）
- [ ] `pnpm run build` 通过
