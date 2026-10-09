# 清空下拉 / 选择模式墙体测距 / 新建项目预览

## Context
1. 顶部工具栏只有「清空家具」，需要新增「清空门窗」，两者合并为一个「清空」下拉，各自二次确认。
2. 选择模式下鼠标悬停墙体没有任何测距；需要悬停即显示到两端的距离。已确认：沿墙画两段标注线分别标出到两端的距离，绘墙模式的悬停提示也改成同样的显示（替换原「距近端 X 米」）。
3. 新建项目弹窗：选「空白户型」时出现长、宽输入；弹窗底部显示户型预览（墙体 + 门 + 窗，样式参考 DXF 导入预览），选其他模板时显示该模板的布局与门窗，不画家具。

已确认：「清空门窗」跳过承重墙上的门窗（与现有单个删除规则 `openingIsLocked` 一致），并提示跳过数量。

## 1. 清空下拉（Workbench）
文件：`src/features/interior/components/Workbench.tsx`
- 新增 `clearOpenings`：只读直接返回；可删 = `d.openings` 中 `!openingIsLocked(d, o.wallId)`；可删为 0 时若有锁定的给 `notify.fail('承重墙上的门窗洞口不可删除')`；二次确认 `confirm({ title: '清空所有门窗？', description: '墙体、家具会保留；承重墙上的门窗洞口不会删除，可撤销恢复。', confirmText: '清空门窗', tone: 'destructive' })`；`change` 只保留锁定的 openings；若当前选中的是门窗则 `setSelection(null)`；成功提示 `已清空 N 个门窗，可撤销恢复`，有跳过时追加 `（承重墙上 M 个已保留）`。
- `danger-actions` 组：把「清空家具」ToolButton 换成 `DropdownMenu`，触发按钮为 `tool-button`（Trash2 + 「清空」+ ChevronDown，`aria-label="清空"`），菜单项 `清空家具`（无家具时 disabled）、`清空门窗`（无门窗时 disabled），均为 `danger-item`。「重置方案」保持不变。
- 窄屏「更多」菜单的 compact-only 项追加「清空门窗」。

## 2. 墙体悬停测距（选择 + 绘墙共用）
- 新建 `src/features/interior/components/WallRangeDimensions.tsx`：从 `OpeningDistances` 抽出沿墙分段标注的绘制（偏移 `thickness/2 + 24/scale` 的标注线 + 端点短刻度 + 居中 `X.XX m` 文本，短段错行）。入参 `wall, ranges: [number, number][], scale`。
- `OpeningDistances.tsx` 改为调用 `WallRangeDimensions`，ranges 不变（行为不变）。
- `WallHoverOverlay.tsx`：保留墙体高亮多边形和悬停圆点；把「距近端」文字改为 `WallRangeDimensions` 的两段 `[0, offset]`、`[offset, L]`；绘墙模式的「点击连接」提示保留。
- `PlanCanvas.tsx`：新增 `selectHover` 状态（`WallSnap | null`）。`onPointerMove` 中当 `tool === 'select'` 且没有进行中的拖拽时，用事件目标 `closest('[data-wall]')` 取墙（排除 `design.demolished`），点位取 `nearestOnWall(p, wall).point`；否则清空。拖拽开始、`onPointerLeave`、切换工具时清空。渲染 `{tool === 'select' && <WallHoverOverlay ... candidate={selectHover} connection={null} />}`。

## 3. 新建项目弹窗
- `src/features/interior/data/templates.ts`：`blankDesign(width = 6000, depth = 6000)`，外墙、房间按入参生成；`createProject(template, name, size?)` 在空白户型时传入尺寸。其余调用点默认值不变。
- 新建 `src/features/interior/model/planPreview.ts`：从 `DxfImportPreview` 的 `plan` 计算抽出 `planPreviewShapes(design)` → rooms / walls（`connectedWallPoly`）/ openings 多边形；门额外输出门扇线和开启弧（复用 `doorOrientation`）。`DxfImportPreview` 改用它。
- 新建 `src/features/interior/components/PlanLayoutPreview.tsx`：SVG 只画房间底色、墙体、门（含弧线）、窗，不画家具；视框用 `thumbnailBounds` 的思路按墙体包围盒 + 边距；下方图例「墙体 / 门 / 窗」。复用 `.dxf-import-map*` / `.dxf-import-legend` 样式，新增门弧线 class。
- 新建 `src/features/interior/components/NewProjectDialog.tsx`（从 `ProjectManager` 拆出）：项目名称、户型模板 Select（默认「空白户型」）；空白户型时显示「长 / m」「宽 / m」两个输入（默认 6.00，范围 0.5–50，用 `parseMeterDraft` 解析，非法时禁用提交并给出提示）；底部 `PlanLayoutPreview`（空白 → `blankDesign(w, d)`，模板 → `preset.build()`，均 `useMemo`）。提交调用 `createProject(template, name, size)`。
- `ProjectManager.tsx`：替换内联 Dialog 为 `NewProjectDialog`，保留 `submit`/`opened` 流程。
- `index.css`：弹窗加宽（如 `new-project-dialog` max-width ~560px）、预览高度限制，移动端单列。

## Implementation checklist
- [ ] `Workbench.tsx` 新增 `clearOpenings`，跳过承重墙门窗并提示数量
- [ ] 工具栏「清空」下拉包含「清空家具」「清空门窗」，各自二次确认且无对象时禁用
- [ ] 「更多」compact 菜单追加「清空门窗」
- [ ] 抽出 `WallRangeDimensions`，`OpeningDistances` 改用它且显示不变
- [ ] `WallHoverOverlay` 显示两段到两端的距离，保留「点击连接」
- [ ] `PlanCanvas` 选择模式悬停墙体显示同一 overlay；拖拽中、离开画布、拆除墙不显示
- [ ] `blankDesign(width, depth)` + `createProject(..., size)` 支持自定义尺寸
- [ ] 抽出 `planPreviewShapes`，`DxfImportPreview` 改用
- [ ] 新增 `PlanLayoutPreview`（无家具、门带弧线、图例）
- [ ] 新增 `NewProjectDialog`，空白户型显示长宽输入，底部实时预览；`ProjectManager` 改用

## Verification checklist
- [ ] 更新 `Workbench.test.tsx`：工具栏/更多菜单项为 `重置方案 / 清空家具 / 清空门窗`
- [ ] 新增测试：`clearOpenings` 删除非承重墙门窗、保留承重墙门窗；全部锁定时不弹确认
- [ ] 更新 `WallHoverOverlay.test.tsx`：悬停点在 3m/6m 墙中点显示两段 `3.00 m`；端点显示 `0.00 m` 与 `6.00 m`；无目标/被拆除时为空；`pointer-events="none"`、`data-export-hide` 保持
- [ ] `OpeningDistances` 现有测试保持通过
- [ ] 新增测试：`blankDesign(8000, 5000)` 外墙与房间尺寸正确；`createProject('blank', name, {width, depth})` 生效
- [ ] 新增测试：`NewProjectDialog` 默认空白户型显示长宽输入；切换模板后长宽隐藏、预览不含家具；非法长宽（0.4 / 空）禁用提交
- [ ] `pnpm vitest run src/features/interior` 与 `pnpm run build`、lint 通过
