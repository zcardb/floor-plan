# 高危操作回到顶部工具栏 + 去掉「另存云端」重复入口

## Context

用户标注了工作台「文件」下拉菜单（截图红框圈住 `重置当前方案` / `清空家具布置`，红箭头指向顶部工具栏），提出两点：

1. **高危操作放回顶部工具栏**：这两个破坏性操作现在只藏在「文件」菜单底部（上一次「工具栏精简」把它们从 `wide-only` 工具栏分组移进了菜单），用户希望它们像原来一样作为顶层按钮直接可见 —— 已确认：**登录与游客模式都显示**，与「撤销 / 重做」同排。
2. **「另存云端」是冗余入口**：登录后当前项目本身就在云端（截图状态为「云端已保存」，项目名「我的家」），再提供「另存云端项目」／「将当前项目另存到云端」只会复制出一个「· 云端副本」新项目，令人困惑 —— 已确认：**两处入口都删除**，未登录用户的「保存到云端」注册转存流程保留（`Index.tsx` 的 `cloudSave` → `saveGuestToCloud`）。

范围限定：只改工作台顶部工具栏、「文件」菜单、「我的账号」菜单及其样式与帮助文案。数据库、RLS、`useProjects` 的数据流、2D 画布、3D 场景、项目管理页（`ProjectManager` 的「复制到云端」）全部不动。

## 现状要点（已核对）

- `src/features/interior/components/Workbench.tsx`
  - 工具栏历史分组：第 665-683 行（`<span className="toolbar-divider" />` + `.tool-group` 撤销/重做）；该分组在两个视图分支之外，2D/3D 都渲染。
  - 「文件」菜单：第 734-781 行。第 761-768 行是 `p.loggedIn && <>…</>` 包裹的「导入 JSON 为新项目」+「另存云端项目」；第 769-780 行是分隔线 + 两个 `danger-item` 菜单项（`resetDesign` / `clearFurniture`）。
  - 「我的账号」菜单：第 466-492 行，只在已登录分支渲染；第 488-490 行是「将当前项目另存到云端」。
  - 已有可直接复用的回调：`resetDesign`（第 403-413 行，含 `useConfirm` 破坏性确认）、`clearFurniture`（第 391-402 行，同样带确认 + `可撤销恢复` 文案）、`ToolButton`（第 105-142 行，含 Tooltip/`aria-label`/`disabled`）。
  - 图标 `RotateCcw`、`Trash2` 已在文件顶部 import；`Cloud` 在删除「另存云端项目」后仍被游客「保存」菜单（第 515 行）使用，不得移除 import。
  - 帮助弹窗第 1119-1121 行文案「…登录可另存多个云端项目。」与本次删除冲突，需改为「登录后项目自动保存到云端」。
- `src/index.css`：`.danger-item` 规则在第 2762-2768 行（工具栏相关样式块内）；旧的 `.danger-actions .tool-button:hover` 规则已在 commit `332b18e` 中随工具栏分组一起删除，需按同样风格重建。≤600px 媒体查询里 `.tool-group .tool-button > span` 与尾部 `svg` 已隐藏（第 1915-1919 行），因此工具栏按钮在窄屏自动降级为纯图标。
- 上一轮（`332b18e`）删除工具栏分组时的原始标记：`<div className="tool-group danger-actions wide-only">` + `ToolButton label="重置方案"` / `label="清空家具" disabled={!d.furniture.length}` —— 本次按同样写法恢复，但不加 `wide-only`。

## 改动方案

### 1. 工具栏恢复破坏性分组 — `Workbench.tsx`

在撤销/重做分组之后、`<div className="header-spacer" />` 之前插入（与 2D/3D 视图无关，两个视图都显示）：

```tsx
<span className="toolbar-divider" />
<div className="tool-group danger-actions">
  <ToolButton label="重置方案" onClick={resetDesign}>
    <RotateCcw size={16} />
  </ToolButton>
  <ToolButton
    label="清空家具"
    disabled={!d.furniture.length}
    onClick={clearFurniture}
  >
    <Trash2 size={16} />
  </ToolButton>
</div>
```

- 不加登录判断（两种状态都显示）；不加 `wide-only`。
- 保留 `useConfirm` 二次确认（`resetDesign` / `clearFurniture` 内部逻辑不改）。
- 最终顺序：`[2D 平面 | 3D 场景]` ─ `[选择 · 绘墙* · 测量▾ · 结构▾]` ─ `[撤销 · 重做]` ─ `[重置方案 · 清空家具]` ─ `[图层▾ · 文件▾ · 帮助 · 全屏]`。

### 2. 删除「文件」菜单中的重复项与「另存云端项目」— `Workbench.tsx`

- 删除第 769-780 行的 `<DropdownMenuSeparator />` + 两个 `danger-item` 菜单项（已上移到工具栏，避免双入口）。
- 删除第 765-768 行的「另存云端项目」`DropdownMenuItem`；`{p.loggedIn && <>…</>}` 只保留「导入 JSON 为新项目」（`file.current?.click()`）。
- 前台菜单保留：「下载 2D 图片」「立即保存当前项目」「显示比例 1:60 / 1:100」「下载方案 JSON」「（登录后）导入 JSON 为新项目」。

### 3. 删除「我的账号」菜单中的冗余项 — `Workbench.tsx`

删除第 488-490 行的「将当前项目另存到云端」`DropdownMenuItem`。该菜单只剩账号信息 + 分隔线 + 退出登录。

### 4. 样式 — `src/index.css`

在 `.danger-item` 规则（第 2762-2768 行）之后新增，全部走语义令牌、沿用 `.danger-item` 的破坏性配色：

```css
.danger-actions .tool-button {
  color: hsl(var(--destructive));
}
.danger-actions .tool-button:hover:not(:disabled) {
  background: hsl(var(--destructive) / 0.1);
}
```

`.tool-button-wrap > button:disabled`（第 2759-2761 行）已让禁用态不触发 hover，无需额外覆盖。

### 5. 文案同步 — `Workbench.tsx`

帮助弹窗第 1120 行「直接下载 2D 图与当前 3D 视角，导出 JSON 备份；登录可另存多个云端项目。」→ 「直接下载 2D 图与当前 3D 视角，导出 JSON 备份；登录后项目自动保存到云端，可在项目管理中管理多个方案。」

## 不做

- 不改 `useProjects.ts`（含 `cloudSave` / `saveGuestToCloud` / `create(..., true)`）、`Index.tsx`、数据库与 RLS。
- 不删除未登录用户头部「保存 → 保存到云端」入口（这是游客转存的唯一路径）。
- 不改 `ProjectManager` 的「复制到云端」与项目管理页任何逻辑。
- 不动 `AccountCMS.tsx` / `CustomFurnitureDialog.tsx`（当前工作区有其它会话未提交的改动，避免冲突）。
- 不新增快捷键、不改键盘处理逻辑（`撤销/重做` 的 Ctrl+Z 等保持不变）。

## Implementation checklist

- [ ] `Workbench.tsx` 撤销/重做分组之后出现 `<div className="tool-group danger-actions">`，含「重置方案」（`RotateCcw`）与「清空家具」（`Trash2`，`disabled={!d.furniture.length}`），且不加 `p.loggedIn` 判断
- [ ] 顶部工具栏两个破坏性按钮在 2D 与 3D 视图下都渲染（位于视图分支之外）
- [ ] 「文件」菜单中不再存在 `重置当前方案` / `清空家具布置` 及其前置分隔线
- [ ] 「文件」菜单中不再存在「另存云端项目」，且已登录时「导入 JSON 为新项目」仍然渲染
- [ ] 「我的账号」菜单中不再存在「将当前项目另存到云端」，退出登录仍可用
- [ ] `Workbench.tsx` 中 `Cloud` / `Save` / `FolderOpen` / `RotateCcw` / `Trash2` 图标仍被使用，无未使用 import（lint 通过）
- [ ] `src/index.css` 新增 `.danger-actions .tool-button` 与 `:hover:not(:disabled)` 规则，颜色只使用 `hsl(var(--destructive)…)`
- [ ] 帮助弹窗「保存你的创作」文案改为「登录后项目自动保存到云端，可在项目管理中管理多个方案。」
- [ ] `pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm test`、`pnpm run build` 全部通过

## Verification checklist

- [ ] 正向（游客，未登录）：工具栏可见「重置方案 / 清空家具」两个破坏性按钮 → 点「清空家具」弹出确认框，确认后家具清空、`Ctrl+Z` 可撤销；点「重置方案」弹出确认框，确认后回到初始模板
- [ ] 正向（已登录）：打开一个云端项目（状态显示「云端已保存」）→ 工具栏同样出现两个按钮且行为一致；「文件」菜单只剩下载/比例/JSON/导入 JSON，「我的账号」菜单只剩账号信息与退出登录
- [ ] 负向/默认态：无家具时「清空家具」为禁用态且不触发点击；菜单打开/关闭不会产生任何数据库写入
- [ ] 游客转存回归（关键路径未破坏）：退出登录 → 游客模式改一处设计 → 头部「保存 → 保存到云端」→ 注册/登录成功后自动生成「修改的第一个版本」云端项目（`select id,name,updated_at from interior_design_projects order by updated_at desc limit 3` 只新增一行）
- [ ] 边界：3D 视图下工具栏两个破坏性按钮可用且布局不错位；「结构」菜单里的「拆改非承重墙」与工具栏破坏性按钮配色一致
- [ ] 响应式：`website_screenshot` 抓取 `desktop_1280` 与 `mobile_390` 的工作台，确认工具栏仍为一排不溢出；若 390px 下溢出，则在 `@media (max-width: 600px)` 中隐藏 `.danger-actions`，并把两个菜单项按窄屏恢复（作为降级方案，需在结论中说明）
- [ ] 构建范围：`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm test`、`pnpm run build` 全绿
