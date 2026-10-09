# 清空下拉 / 选择模式墙体测距 / 新建项目预览

## Context
1. 顶部工具栏只有「清空家具」，需要新增「清空门窗」，两者合并为一个「清空」下拉，各自二次确认。
2. 选择模式下鼠标悬停墙体没有测距；需要悬停即显示到两端的距离。已确认：沿墙画两段标注线分别标出到两端的距离，绘墙模式的悬停提示也改成同样的显示（替换原「距近端 X 米」）。
3. 新建项目弹窗：选「空白户型」时出现长、宽输入；弹窗底部显示户型预览，**只显示墙体**（不画门窗、家具）。选其他模板时显示该模板的墙体布局。
4. 已确认：承重墙上的门窗洞口**允许删除**（单个删除与清空门窗都放开）；尺寸、位置、款式仍保持锁定（`openingIsLocked` 的其他用途不变）。

## 1. 承重墙门窗允许删除
- `Workbench.tsx` `remove()`：去掉 `openingIsLocked` → `notify.fail('承重墙上的门窗洞口不可删除')` 的拦截。
- `SelectionEditor.tsx`：删除按钮条件改为 `(f || o || editableWall)`。
- `PropertyPanel.tsx` 门窗属性底部「删除门/窗」按钮：不再随 `locked` 禁用，提示统一为 `删除这扇门/窗，可撤销`；`locked` 仍用于款式选择禁用。
- `SizeFields` / `PlanCanvas` 拖拽 / `selectionEdits` 的锁定逻辑不动。

## 2. 清空下拉（Workbench）
文件：`src/features/interior/components/Workbench.tsx`
- 新增 `clearOpenings`：只读直接返回；无门窗直接返回；二次确认 `confirm({ title: '清空所有门窗？', description: '将删除 N 个门窗（含承重墙上的洞口），墙体和家具会保留，可撤销恢复。', confirmText: '清空门窗', tone: 'destructive' })`；`change(d => ({ ...d, openings: [] }))`；当前选中门窗则 `setSelection(null)`；成功提示 `已清空 N 个门窗，可撤销恢复`。
- `danger-actions` 组：「清空家具」ToolButton 换成 `DropdownMenu`，触发按钮沿用 `tool-button` 样式（Trash2 +「清空」+ ChevronDown，`aria-label="清空"`）；菜单项「清空家具 · 数量」「清空门窗 · 数量」，均为 `danger-item`，数量为 0 时禁用。「重置方案」不变。
- 窄屏「更多」菜单 compact-only 项追加「清空门窗」。

## 3. 墙体悬停测距（选择 + 绘墙共用）
- 新建 `components/WallRangeDimensions.tsx`：从 `OpeningDistances` 抽出沿墙分段标注（偏移 `thickness/2 + 24/scale` 的标注线 + 端点刻度 + 居中 `X.XX m`，短段错行）。入参 `wall, ranges: [number, number][], scale`。
- `OpeningDistances.tsx` 改用 `WallRangeDimensions`，显示不变。
- `WallHoverOverlay.tsx`：保留墙体高亮与悬停圆点；「距近端」文字改为两段 `[0, offset]`、`[offset, L]` 标注；绘墙模式「点击连接」提示保留。
- `PlanCanvas.tsx`：新增 `selectHover`（`WallSnap | null`）。`onPointerMove` 在 `tool === 'select'` 且无拖拽时，用 `closest('[data-wall]')` 取墙（排除已拆除），点位 `nearestOnWall(p, wall).point`；拖拽开始、`onPointerLeave`、切换工具时清空。渲染 `<WallHoverOverlay candidate={selectHover} connection={null} />`。

## 4. 新建项目弹窗
- `data/templates.ts`：`blankDesign(width = 6000, depth = 6000)`，外墙与房间按入参生成；`createProject(template, name, size?)` 空白户型时传入尺寸，其他调用点默认值不变。
- 新建 `components/WallLayoutPreview.tsx`：SVG 只画墙体（`connectedWallPoly`，排除已拆除墙），视框按墙体包围盒 + 边距；空白户型额外在外框标注长、宽尺寸。样式复用 `.dxf-import-map*` 的墙体配色。
- 新建 `components/NewProjectDialog.tsx`（从 `ProjectManager` 拆出）：项目名称、户型模板 Select（默认「空白户型」）；空白户型时并排显示「长 / m」「宽 / m」输入（默认 6.00，范围 0.5–50，`parseMeterDraft` 解析，非法时禁用提交并提示）；底部 `WallLayoutPreview`（空白 → `blankDesign(w, d)`，模板 → `preset.build()`，`useMemo`）+ 一行摘要（空白「6.00 × 6.00 m · 36.00 m²」，模板显示户型名与面积）。提交调用 `createProject(template, name, size)`。
- `ProjectManager.tsx`：内联 Dialog 换成 `NewProjectDialog`，保留 `submit` / `opened` 流程。
- `index.css`：`new-project-dialog` 加宽（~560px）、预览高度限制，窄屏单列。

## 设计法则对照（growth.design）
| 法则 | 落点 |
| --- | --- |
| Hick's Law / Chunking | 两个清空操作收进一个下拉，工具栏少一个按钮 |
| Signifiers | 垃圾桶 + 「清空」+ 下箭头，提示可展开；菜单项红色危险样式 |
| Feedforward | 菜单项显示数量；确认弹窗写明删除数量与保留内容 |
| Loss Aversion | 文案强调「墙体/家具保留」「可撤销恢复」；数量为 0 直接禁用 |
| Feedback Loop | 清空后 toast 给出实际数量；预览随长宽输入实时更新 |
| Law of Proximity / Cognitive Load | 距离标注紧贴墙段，仅悬停出现，拖拽时隐藏 |
| Default Bias | 默认空白户型、6.00 × 6.00 m，直接可提交 |
| Progressive Disclosure | 长宽输入仅在空白户型时出现 |
| Picture Superiority | 用户型预览图辅助选模板，而非只看名称 |

## Implementation checklist
- [ ] `Workbench.remove()` 不再拦截承重墙门窗删除
- [ ] `SelectionEditor` 浮动工具条对所有门窗显示删除按钮
- [ ] `PropertyPanel` 门窗「删除」按钮不随 `locked` 禁用；款式选择仍锁定
- [ ] `Workbench` 新增 `clearOpenings`（删除全部门窗、二次确认、选中清除、toast 数量）
- [ ] 工具栏「清空」下拉含「清空家具」「清空门窗」，带数量，0 时禁用
- [ ] 「更多」compact 菜单追加「清空门窗」
- [ ] 抽出 `WallRangeDimensions`，`OpeningDistances` 改用且显示不变
- [ ] `WallHoverOverlay` 显示到两端的两段距离，保留「点击连接」
- [ ] `PlanCanvas` 选择模式悬停墙体显示 overlay；拖拽中 / 离开画布 / 拆除墙不显示
- [ ] `blankDesign(width, depth)` + `createProject(..., size)`
- [ ] 新增 `WallLayoutPreview`（只画墙体）
- [ ] 新增 `NewProjectDialog`（长宽输入、实时预览、摘要），`ProjectManager` 改用

## Verification checklist
- [ ] 测试：承重墙上的门可通过 `remove()` 删除；承重墙门窗尺寸仍不可改（`selectionEdits` 抛错保持）
- [ ] 更新 `Workbench.test.tsx`：工具栏 / 更多菜单项为「重置方案 / 清空家具 / 清空门窗」
- [ ] 测试：`clearOpenings` 清空含承重墙在内的全部门窗，墙体与家具不变；无门窗时菜单项禁用
- [ ] 更新 `WallHoverOverlay.test.tsx`：6 m 墙中点显示两段 `3.00 m`；端点显示 `0.00 m` / `6.00 m`；无目标或拆除墙时为空；`pointer-events="none"`、`data-export-hide` 保持
- [ ] `OpeningDistances` 现有测试通过
- [ ] 测试：`blankDesign(8000, 5000)` 外墙与房间尺寸正确；`createProject('blank', name, { width, depth })` 生效
- [ ] 测试：`NewProjectDialog` 默认空白户型显示长宽；切换模板后长宽隐藏；预览只含墙体（无门窗/家具元素）；长宽 0.4 或空时提交禁用
- [ ] `pnpm vitest run src/features/interior`、lint、`pnpm run build` 通过
