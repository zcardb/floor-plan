# 复刻项目并入「新建项目」子菜单（首项改「手动创建」）+ 菜单尺度（图标/行高）整体统一

## Context（为什么改）

截图里工作台项目下拉的一级菜单并列了三个互不相关的动作：「返回项目管理」「新建项目」「复制当前项目」。

- **Hick's Law（👀 信息阶段）**：同时可见的选项越多，决策时间与摩擦越大；「复制当前项目」和「新建项目」对用户来说都是"我要一个新方案"，却被拆成两个并列入口。
- **Chunking（🛍 记忆阶段）+ Law of Proximity（🍣 信息阶段）**：紧邻、同类的东西会被看成一组。把复刻收进「新建项目」子菜单，一级只留"离开 / 开始新方案"两类，子菜单内部按"从零开始 / 复制现有 / 导入"分块。
- **Serial Position Effect（🏁 记忆阶段）**：把最常用的「新建项目」放首位，「复刻当前项目」紧随其后（同属"起点"类，视觉同理）。
- **Cognitive Load（🚛）/ Juxtaposition（🍒）/ Aesthetic-Usability Effect（🚆）**：这是"大小布局要整体统一"的依据——同一套下拉里图标尺寸混用：一级的「返回项目管理」「复制当前项目」和子菜单的「新建项目 / AI 创建… / 导入 DXF 图纸…」都没传 `size`，走 `lucide` 默认 **24px**；子菜单触发器「新建项目」的 `Plus` 与「从其他软件导入」是 **16px**。这就是"图标太大"的直接原因，子菜单因此比父级菜单更"重"。行高同样不齐（一级菜单项 32px、项目列表行 40px）。统一到一套小尺度后，菜单会被读成"一个系统"，而不是几个拼起来的零件。
- **Von Restorff（🌶）**：只保留「新建项目」为 primary 高亮（现有 `.project-menu-create`），复刻项走普通样式，避免两个强调色互相抵消注意力。

参照来源：用户给的 Growth.Design 案例页与心理学法则库（information / memory 两册）。

用户已确认四点：**「复制当前项目」移进「新建项目」子菜单**（图 2 的箭头）；**子菜单里的图标偏大要缩小**（图 2 红框）；**「新建项目」触发器上的 `Plus` 也要一起缩小**；**子菜单第一项文案「新建项目」改成「手动创建」（图 3 红框，所有出现处都改）**。因此图标统一取 **14px**，沿用仓库里已有的密度基准 `.project-card-menu-content [role=menuitem] svg { width:14px; height:14px }`，不再出现 24px / 16px 混用。

文案命名依据：父级入口叫「新建项目」，子项若也叫「新建项目」是同一个词在两个层级重复（`Recognition Over Recall` 💾 失效——用户无法从字面分辨"选哪个"）。改成「手动创建」后，子菜单四项各自说明"怎么来"：手动创建 / 复刻当前项目 / AI 创建 / 导入图纸，互相区分明确。

「复刻当前项目」放在子菜单第一组第二位（「手动创建」之后、`AI 创建…` 之前）——同属"拿到一个新方案"的心智，`Serial Position` 上紧随最常用的第一项；它不是"用模板新建"，所以不放进导入那一组。

## 目标结构（工作台「项目」下拉，图标统一 14px、行高 32px）

```
返回项目管理          ArrowLeft 14px
新建项目   ›   ┌ 手动创建            FilePlus2 14px   ← 文案由「新建项目」改来
              │ 复刻当前项目         CopyPlus 14px   ← 新增（原一级「复制当前项目」移入）
              │ ─────────────
              │ AI 创建…            Sparkles 14px   （仅登录）
              │ ─────────────
              │ 导入 DXF 图纸…      FileUp 14px
              │ 从其他软件导入       AppWindow 14px   Coming soon
              └
────────────────
项目列表（名称 / 日期 / 当前勾选 / 重命名 / 删除）
```

一级菜单因此只剩「返回项目管理」+「新建项目」两项，与下方项目列表分组清晰；父级项与子菜单项图标同一尺度（14px），不再"一大一小"。

## 改动文件与做法

### 1. `src/features/interior/components/CreateProjectMenuItems.tsx`

- `CreateProjectActions` 增加可选 `duplicate?: () => void`。
- 第一项文案 `新建项目` → `手动创建`（图 3 要求）；在它之后渲染复刻项（图标 `CopyPlus`，与行内操作按钮的 `Copy` 区分开，语义是"复刻/克隆"）：

```tsx
<DropdownMenuItem onSelect={actions.blank}><FilePlus2 />手动创建</DropdownMenuItem>
{actions.duplicate && <DropdownMenuItem onSelect={actions.duplicate}><CopyPlus />复刻当前项目</DropdownMenuItem>}
{actions.ai && <DropdownMenuItem onSelect={actions.ai}><Sparkles />AI 创建…</DropdownMenuItem>}
<DropdownMenuSeparator />
<DropdownMenuItem onSelect={actions.importFile}><FileUp />导入 DXF 图纸…</DropdownMenuItem>
<SoftwareSoonItem label="从其他软件导入" />
```

- 该组件仍被项目管理页与工作台共用，所以**两处入口的「手动创建」文案与图标尺寸一次改到位**（"都要改"）。
- 同步更新组件顶部注释（「「新建项目」菜单的选项」保持描述父子关系即可）。
- 保持不变的文案：父级入口/触发器仍是「新建项目」（`ProjectManager.tsx` 的 `cms-create-button` 与 `ProjectMenu.tsx` 的 `project-menu-create`），`NewProjectDialog` 的标题仍是「新建项目」——它同时服务「手动创建」与「AI 创建」两条路径。

### 2. `src/features/interior/components/useProjectCreation.tsx`

- 入参增加可选 `duplicate?: () => void`（注释说明：项目管理页没有"当前项目"概念，只有工作台会传），并写进返回的 `actions`：

```tsx
const actions: CreateProjectActions = {
  blank: () => setCreating(true),
  duplicate,                                  // 新增，可选
  ai: ai ? () => setAiCreating(true) : undefined,
  importFile: () => file.current?.click(),
};
```

### 3. `src/features/interior/components/ProjectMenu.tsx`

- 删除一级项 `<DropdownMenuItem …><Copy />复制当前项目</DropdownMenuItem>`。
- 复用已有的 `duplicate()` 与 `duplicating` 状态（触发器 `Loader2` 与 `busy` 逻辑不变），把动作传进 hook：

```tsx
const creation = useProjectCreation({
  create: p.onCreateProject ?? (async () => false), opened: () => {}, ai: p.loggedIn,
  duplicate: p.onDuplicate ? () => void duplicate() : undefined,
});
```

- 移除不再使用的 `Copy` 引入；把子菜单触发器的 `<Plus size={16} />` 改为 `size={14}`（用户明确要求这一项也缩小），并把子菜单触发器渲染为 `<Plus size={14} />新建项目`。
- 子菜单触发器 `disabled={busy}` 保持不变，操作进行中时子菜单不可进入。

### 4. `src/index.css`（尺度统一的唯一落点，同时修掉"图标太大"）

沿用仓库已有的做法（`.project-card-menu-content [role=menuitem]`、`.wall-options-item > svg` 都在 CSS 里统一菜单尺度），在项目菜单那段附近补一组规则，作用于父级菜单、新建子菜单、导出菜单、账号菜单。**关键是把因未传 `size` 而默认 24px 的图标、以及显式 16px 的图标，一并压到 14px**，与仓库既有的 14px 菜单基准一致：

```css
/* 下拉菜单统一尺度：父级 / 新建子菜单 / 导出 / 账号共用一套行高与 14px 图标，避免 24px 与 16px 混用 */
.project-menu [role="menuitem"]:not(.project-menu-option),
.create-menu [role="menuitem"],
.export-menu [role="menuitem"],
.account-menu [role="menuitem"] {
  min-height:32px; gap:8px; padding:0 10px; border-radius:6px; font-size:13px;
}
.project-menu [role="menuitem"]:not(.project-menu-option)>svg,
.create-menu [role="menuitem"]>svg,
.export-menu [role="menuitem"]>svg,
.account-menu [role="menuitem"]>svg { width:14px; height:14px; flex:none; }
```

- 该规则同样覆盖 `SubTrigger`（Radix 给它的 role 也是 `menuitem`），所以子菜单触发器上的 `Plus` 与其末尾的 `ChevronRight`（`h-4 w-4`）一起收到 14px，不再有两个尺度的箭头。
- 同时把 `.project-menu-option` 的 `min-height:40px` 改为 `32px`（保留它的三列 grid 与 `gap:12px`，即名称 / 日期 / 勾选定距），使"一级项 = 子菜单项 = 项目列表行"同为 32px。
- `.create-menu` / `.export-menu` 的 `min-width:184px` 统一为 `200px`，内边距沿用内容面板的 `p-1.5` 与圆角，两张面板观感一致。
- 用 `:not(.project-menu-option)` 排除项目列表行，避免覆盖它自己的 grid `gap`。
- 不改 `DropdownMenuItem` 的公共默认样式（`src/components/ui/dropdown-menu.tsx`），避免波及其他 10 多处菜单；尺寸只在 CSS 里按菜单族收敛。

### 5. `src/features/interior/components/toolbarMenus.test.tsx`

- 「共享的新建选项」用例：断言标签顺序为 `['手动创建', '复刻当前项目', 'AI 创建…', '导入 DXF 图纸…']`（传 `duplicate` 时），不传 `duplicate` 时不出现「复刻当前项目」，并断言点击第一项调用 `actions.blank`、点击复刻项调用 `actions.duplicate`。
- 「新建项目为悬停子菜单…」用例：触发器文案仍断言 `'新建项目'`（父级不变），补充 `menu({ onCreateProject, onDuplicate })` 时子菜单内的 `CreateProjectMenuItems` 收到 `duplicate` 函数。
- 原「复制当前项目：登录且可复制时显示」用例改写：一级项不再有「复制当前项目」；`onDuplicate` 存在时子菜单里出现「复刻当前项目」，点击后以当前项目调用 `onDuplicate`；未登录时不出现。
- 不动 `managementUi.test.tsx`：它断言的是项目管理页 HEADER 的 `新建项目` 按钮（`cms-create-button`），该文案保持不变。

## Implementation checklist

- [x] `CreateProjectActions` 增加 `duplicate?: () => void`，`CreateProjectMenuItems` 第一项文案改为「手动创建」，并在其后渲染「复刻当前项目」（`CopyPlus`，条件渲染）。
- [x] 全文检索 `新建项目`，确认除子菜单项外的出现处（`ProjectManager` 触发器、`ProjectMenu` 子菜单触发器、`NewProjectDialog` 标题、注释）均保持原样，只有 `CreateProjectMenuItems` 的那一项改成「手动创建」。
- [x] `useProjectCreation` 接受可选 `duplicate` 并写入 `actions`。
- [x] `ProjectMenu` 移除一级「复制当前项目」项与 `Copy` 引入，改为把 `p.onDuplicate ? () => void duplicate() : undefined` 传给 hook，触发器 busy/`Loader2` 行为不变；子菜单触发器 `<Plus size={16} />` 改为 `size={14}`。
- [x] `ProjectManager` 不传 `duplicate`（该页无"当前项目"，卡片级「复制」已覆盖），确认其「新建项目」下拉仍渲染 3 项。
- [x] `index.css` 增加菜单尺度统一规则（父级 / 子菜单 / 导出 / 账号图标一律 14px、行高 32px），`.project-menu-option` 行高 40px→32px，`.create-menu`/`.export-menu` 最小宽度统一 200px。
- [x] `toolbarMenus.test.tsx` 中三个相关用例更新为新结构。
- [x] 不修改 `src/components/ui/dropdown-menu.tsx` 的默认条目样式，确认其他菜单（墙选项、画布比例、图层等）未被波及。

## Verification checklist

- [x] `pnpm exec vitest run src/features/interior/components/toolbarMenus.test.tsx` 全绿。
- [x] `pnpm exec vitest run src/features/interior`（`pnpm test`）无回归。
- [x] `pnpm run check`（eslint + tsc）与 `pnpm run build` 通过。
- [x] 正向：登录后工作台「项目」下拉 → 一级只有「返回项目管理」「新建项目」；悬停「新建项目」出现子菜单，依次为「手动创建」「复刻当前项目」「AI 创建…」「导入 DXF 图纸…」「从其他软件导入」；点「手动创建」打开新建弹窗，点「复刻当前项目」生成「… · 副本」并进入副本（沿用 `Index.tsx` 的 `duplicateProject`，内置模板走「用模板创建」）。
- [x] 正向：项目管理页右上「新建项目」下拉的第一项同样显示「手动创建」（共享组件，两处文案一致）。
- [x] 负向/默认：未登录（访客）时下拉无「新建项目」子菜单、无复刻项，仅显示模板列表；`onDuplicate` 未传时子菜单不出现复刻项。
- [x] 边界：复制进行中触发器显示 `Loader2`，子菜单触发器 disabled，无法重复触发；子菜单内「从其他软件导入」仍为禁用 + Coming soon 提示，无子菜单展开。
- [x] 视觉：`website_screenshot` 取工作台路由 desktop_1280 与 mobile_390 各一张，确认父级与子菜单图标同为 14px（含「新建项目」触发器上的 `Plus`）、菜单项行高一致、窄屏（≤600px）无溢出。
