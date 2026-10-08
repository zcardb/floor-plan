# 工具栏 / 侧栏操作外露 + 重做 Tooltip 修复

## Context

用户反馈（配合两张截图）：

1. `文件` 下拉菜单底部藏着三个高频/清理类操作（`清空家具布置`、`重置当前方案`、`清除测量线`），用户找不到，导致「测量线删不掉」的真实原因其实是入口藏太深（`清除测量线` 需展开 `文件` 菜单才看到）。
2. 希望把这三项「放出来」：
   - `删除所有测量（清除测量线）` → 放到**右侧属性侧栏的底部**（截图中该侧栏正是显示「家具 61 件 / 层高 2.8 m / 房间面积」的属性面板）。
   - `重置当前方案`、`清空家具` → 放到顶部工具栏**撤销 / 重做之后**。
3. `重做` 按钮的 Tooltip 有问题，需要修。

对应代码现状（已核对）：

- 三个入口都在 `Workbench.tsx` 的 `文件` 菜单里：`清空家具布置`（第 685 行，调用 `clear()`）、`重置当前方案`（第 689-705 行，匿名 handler）、`清除测量线`（第 706-711 行，`change((d) => ({ ...d, measures: [] }))`）。三者都走 `change()` / `useDesign` 的撤销栈，可 `Ctrl+Z` 撤销。
- `ToolButton`（第 102-137 行）的 Tooltip **没有设置 `side`**，默认朝上弹出；撤销/重做就在顶栏（`z-index: 10`）正下方，提示气泡朝上会顶到顶栏。且 `重做` 没有 `shortcut` 提示（`撤销` 有 `Ctrl Z`），重做实际支持 `Ctrl ⇧ Z` / `Ctrl Y`（第 328-330 行）。
- 撤销/重做用 `disabled={!counts.undo/redo}`。Radix 把事件挂在被禁用的 `<button>` 上，浏览器不派发指针事件，**禁用状态下 Tooltip 根本不弹**（这也是「tooltip 有问题」的常见成因）。
- `侧栏`：`property-panel`（右，第 312 行 CSS）为 `overflow-y: auto` 的滚动区，内部直接是 `PropertyPanel` / `CostPanel`，没有固定底部操作区。

本次改动**不做**逐段测量线选择删除（用户已选择用「清除测量线」入口替代该方案），只把已有操作外露 + 修 tooltip。

## 变更清单

### 1. `src/features/interior/components/Workbench.tsx`

**a) 抽出可复用回调**（把 `文件` 菜单里的匿名 handler 提为具名函数，行为不变，仍保留二次确认）：

```ts
const clearFurniture = () => {
  if (d.furniture.length && window.confirm("清空所有家具？墙体、材质和测量会保留，可撤销恢复。"))
    { change((d) => ({ ...d, furniture: [] })); setSelection(null); }
};
const resetDesign = () => {
  if (window.confirm("重置当前项目为其初始模板？可撤销恢复。")) {
    change(() => (d.template === "blank" ? blankDesign() : referenceDesign()));
    setSelection(null);
  }
};
const clearMeasures = () => {
  if (d.measures.length) change((d) => ({ ...d, measures: [] }));
};
```

**b) 工具栏：撤销/重做之后新增两个可见按钮**（第 586-598 行的 tool-group 之后）：

```tsx
<span className="toolbar-divider wide-only" />
<div className="tool-group danger-actions wide-only">
  <ToolButton label="重置方案" onClick={resetDesign}><RotateCcw size={16} /></ToolButton>
  <ToolButton label="清空家具" onClick={clearFurniture} disabled={!d.furniture.length}>
    <Trash2 size={16} />
  </ToolButton>
</div>
```

`RotateCcw` / `Trash2` 已在文件顶部导入；顺序按用户说法「重置 … 家具」；`wide-only` 用于 ≤600px 隐藏（见第 3 节）。

**c) `文件` 菜单收口**：删除 `清空家具布置` / `重置当前方案` / `清除测量线` 三项及其上方的 `DropdownMenuSeparator`（第 684-711 行），菜单只保留文件类操作（下载 2D、保存、显示比例 ×2、导出 JSON、导入 JSON、另存云端）。为兼顾窄屏，把前两项以 `compact-only` 类重新加回菜单末尾（≤600px 才显示）：

```tsx
<DropdownMenuSeparator className="compact-only" />
<DropdownMenuItem className="compact-only" onClick={resetDesign}>…重置当前方案</DropdownMenuItem>
<DropdownMenuItem className="compact-only" onClick={clearFurniture}>…清空家具布置</DropdownMenuItem>
```

**d) 右侧侧栏底部固定操作区**（第 920-951 行的 `<aside className="property-panel">`）：内容包一层滚动容器，底部加常驻操作条：

```tsx
<aside className={"property-panel " + (drawer === "panel" ? "drawer-open" : "")}>
  <div className="panel-scroll">
    {costOpen ? <CostPanel … /> : <>…open-cost-manager + PropertyPanel…</>}
  </div>
  <div className="panel-footer">
    <button className="panel-action" onClick={clearMeasures} disabled={!d.measures.length}>
      <Ruler size={15} />
      <span>清除测量线</span>
      {d.measures.length > 0 && <span className="count">{d.measures.length}</span>}
    </button>
  </div>
</aside>
```

**e) ToolButton 结构 + tooltip 修复**（第 102-137 行）：触发器用 `span` 包裹，禁用时也能 hover 出提示；提示改为按钮下方弹出；快捷键用 `kbd` 呈现：

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="tool-button-wrap">
      <button className={"tool-button " + (active ? "active" : "")} onClick={onClick}
        disabled={disabled} aria-label={label} aria-pressed={active}>
        {children}
        <span>{label}</span>
      </button>
    </span>
  </TooltipTrigger>
  <TooltipContent side="bottom" sideOffset={8} className="tool-tooltip">
    <span>{label}</span>
    {shortcut && <kbd>{shortcut}</kbd>}
  </TooltipContent>
</Tooltip>
```

并给重做补上缺失的快捷键提示：`<ToolButton label="重做" shortcut="Ctrl ⇧ Z" …>`。

**f) 文案**：测量模式提示（第 402 行）补「测量线可在右侧面板底部清除」；帮助对话框（第 1020-1050 行）第 01/02 步的说明里加一句测量线清除入口。

### 2. `src/index.css`

（新增类名已确认与现有样式无冲突；颜色全部走语义 token）

```css
.property-panel { display: flex; flex-direction: column; overflow: hidden; }   /* 第 312 行，原 overflow-y: auto 下移 */
.panel-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
                scrollbar-width: thin; scrollbar-color: hsl(var(--border)) transparent; }
.panel-footer { flex: none; padding: 9px 14px; background: hsl(var(--card));
                border-top: 1px solid hsl(var(--border)); }
.panel-action { display: flex; align-items: center; gap: 7px; width: 100%;
                padding: 8px 10px; font-size: 11px; border-radius: 6px;
                border: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); }
.panel-action:hover:not(:disabled) { color: hsl(var(--destructive));
                border-color: hsl(var(--destructive) / 0.4); background: hsl(var(--destructive) / 0.08); }
.panel-action .count { margin-left: auto; font-size: 10px; }
.tool-button-wrap { display: inline-flex; }
.tool-button-wrap > button:disabled { pointer-events: none; }   /* 让外层 span 收到 hover，禁用也能弹提示 */
.danger-actions .tool-button:hover:not(:disabled) { background: hsl(var(--destructive) / 0.1);
                color: hsl(var(--destructive)); }
.tool-tooltip { display: flex; align-items: center; gap: 6px; font-size: 10px; }
.tool-tooltip kbd { font-size: 9px; padding: 0 4px; border-radius: 3px;
                border: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); }
```

Tooltip 的底色/字号沿用 shadcn 的 `bg-popover text-popover-foreground text-sm`（`--popover-foreground` 为深色，对比度足够），因此只追加 `kbd` 与布局属性，不覆盖 Tailwind 工具类，避免 `@layer components` 优先级低于 utilities 导致不生效。

窄屏：`@media (max-width: 600px) { .wide-only { display: none; } }`，`@media (min-width: 601px) { .compact-only { display: none; } }`（390px 截图显示工具栏已接近满宽，因此窄屏只在菜单里保留这两项）。

### 3. 不改动

- `清除测量线` / `清空家具` / `重置` 的既有语义与二次确认文案、`change()` 撤销栈行为。
- 测量线的绘制方式、`Measure` 数据结构、`validateDesign` 校验。
- 左侧 `library-panel` 结构与 `.library-*` 样式。

## Implementation checklist

- [x] `resetDesign` / `clearFurniture` / `clearMeasures` 三个具名回调已抽出，`文件` 菜单与新增按钮共用同一实现（`Workbench.tsx:380-399`）
- [x] 工具栏在「撤销/重做」之后出现「重置方案」「清空家具」，中间有 `.toolbar-divider.wide-only`，违规操作用 `.danger-actions` 样式
- [x] `清空家具` 在家具数为 0 时 disabled；`重置方案` 始终可用；两者仍弹原有 `window.confirm`
- [x] `文件` 菜单移除 `清空家具布置` / `重置当前方案` / `清除测量线`，仅保留文件类操作
- [x] 右侧面板底部常驻「清除测量线」，测量数为 0 时 disabled，>0 时显示数量
- [x] `.property-panel` 改为 flex 列 + `.panel-scroll` 承担滚动；抽屉版 `top/bottom/width/transform` 规则未改动
- [x] `ToolButton` 触发器改为 `.tool-button-wrap > button`，禁用按钮 `pointer-events: none`
- [x] Tooltip 改为 `side="bottom"`，内容为「名称 + kbd 快捷键」，重做补上 `Ctrl ⇧ Z`
- [x] ≤600px 时工具栏两个新按钮与对应分隔线隐藏、菜单里 `compact-only` 两项可见；桌面端相反
- [x] 新增 CSS 全部使用语义 token，且写在 `@layer components` 之外，不覆盖 Tailwind 工具类属性
- [x] 测量模式提示与帮助对话框补充「清除测量线」入口说明

## Verification checklist

- [x] `pnpm test`（`vitest run src/features/interior`）23 passed
- [x] `pnpm check`：`tsc --noEmit` 无输出；`eslint .` 0 errors（2 个既有 warning 在 `useAccountCosts.ts` / `CustomFurnitureDialog.tsx`，与本次无关）
- [x] `pnpm run build` 通过
- [x] 视觉核对（1280）：工具栏出现「重置方案 / 清空家具」，分隔线与撤销/重做区分；右侧面板底部固定「清除测量线」
- [ ] 正向（1280 桌面）：点击「重置方案」「清空家具」行为与旧菜单项一致，确认弹窗仍在，`Ctrl+Z` 可撤销（handlers 与旧实现同一函数，未交互点击）
- [ ] 正向（1280 桌面）：画 3 段测量线后底部按钮显示 `3`，点击后测量线全部消失且 `Ctrl+Z` 可恢复
- [ ] 正向：`文件` 菜单不再出现这三项（桌面端）
- [ ] Tooltip：hover「撤销」「重做」提示在按钮**下方**、完整可见；「重做」显示 `Ctrl ⇧ Z`；按钮 disabled 时 hover 仍能弹出（静态截图无法触发 hover，需人工确认）
- [x] 边界：测量数为 0 时底部「清除测量线」为禁用态（截图中为灰色）
- [ ] 边界：家具数为 0 时「清空家具」禁用且 hover 有提示、点击无效果
- [x] 边界（390 移动端）：工具栏未因新增按钮溢出；截图与改动前布局一致
- [ ] 边界（390 移动端）：`文件` 菜单内可见「重置当前方案」「清空家具布置」；抽屉形式打开右侧面板时底部「清除测量线」可见可用
- [ ] 回归：`图层`/`文件` 下拉、全屏与帮助按钮位置与点击区域正常；选中家具/房间后属性面板滚动正常（滚动条在内容区，底部操作条固定）

