# 测量线：可单条删除

## Context

用户反馈：画完测量线后无法删除其中某几段，只能全部清空。

代码现状（已核对）：

- `PlanCanvas.tsx` 里已提交的测量段渲染为 `<MeasureLine>`，根节点是 `<g pointerEvents="none">`（第 847 行）。整个测量图层不参与命中测试，点击直接穿透到下面的墙/房间，所以点不中、hover 没反应、也无法选中。
- `Selection`（`model/types.ts:88`）只支持 `furniture | room | wall | opening`，没有 `measure`；`Workbench.remove()`（第 285 行）也只处理这三类，因此 `Delete` / `Backspace` 键（第 335 行）对测量线完全无效。
- 目前唯一退路是 `文件 → 清除测量线`（`Workbench.tsx:706`，`measures: []` 全清）或刚画完立刻 `Ctrl+Z`。

目标：保留现有测量画法（点击两点 / 拖动成段），补上「单条测量段可选中、可删除」，与家具/墙体/门窗的删除方式保持一致，并额外提供悬停一键删除。

## 交互设计

1. **选择工具下悬停测量线**：线条高亮光标变为手型，线段中点下方浮出一个圆形 `×` 按钮，点一下即删该段（`×` 带 `data-export-hide`，不会进入导出的 2D 图片）。
2. **选择工具下点击测量线**：选中该段（画布上以虚线高亮），右侧属性面板显示长度与「删除测量线」按钮，画布旁浮出对象工具条（含垃圾桶按钮、取消选择）。
3. **键盘**：选中后按 `Delete` / `Backspace` 删除；`Esc` 取消选择；`Ctrl+Z` 可撤销删除（`useDesign.change` 已自动入撤销栈）。
4. **测量工具（M）下行为不变**：点击仍是画新段，不会误选；退出测量模式后才可点选删除。
5. `文件 → 清除测量线`（全部清空）保持现状。

## 变更清单

### 1. `src/features/interior/model/types.ts`

`Selection` 增加 `"measure"`：

```ts
export type Selection = {
  kind: "furniture" | "room" | "wall" | "opening" | "measure";
  id: string;
} | null;
```

### 2. `src/features/interior/model/geometry.ts`（复用，避免重复写 hypot）

`length` 的参数由 `Wall` 放宽为结构化类型，测量段可直接复用：

```ts
export const length = (w: { a: Point; b: Point }) => ...
```

现有调用全部传 `Wall`，向后兼容；`geometry.test.ts` 无需改。

### 3. `src/features/interior/model/selectionAnchor.ts`

`selectionPoints` 增加分支（放在 opening 兜底之前，返回两端点，供浮出工具条定位）：

```ts
if (s.kind === "measure") {
  const m = d.measures.find((m) => m.id === s.id);
  return m ? [m.a, m.b] : [];
}
```

### 4. `src/features/interior/components/PlanCanvas.tsx`（主要改动）

- 重构 `MeasureLine` 签名：`{ a, b, scale, hit? }`，`hit = { id, hovered, onHover, onDelete }`。
  - 无 `hit`（拖拽中的草稿段）：保持 `<g pointerEvents="none">`，行为与现在一致。
  - 有 `hit`：根节点 `<g className="plan-measure" data-measure={hit.id} onPointerEnter/onPointerLeave>`，内部
    - 命中线：`stroke="transparent" strokeWidth={16 / scale} pointerEvents="stroke"`（加宽命中区，细线也好点中）；视觉线条/端点圆/尺寸文字仍为 `pointerEvents="none"`；
    - 中点下方（`my + 14 / scale`）在 `hovered` 时渲染 `×` 按钮组，`data-export-hide="true"`，`onPointerDown` 内 `e.stopPropagation()` 后调用 `onDelete()`，用两条 `<line>` 画叉 + `circle` 底。
- 新增 `hoverMeasure` state（`string | null`）。
- 已提交测量段渲染时，仅当 `tool === "select"` 才传 `hit`：

```tsx
{design.measures.map((m) => (
  <MeasureLine key={m.id} a={m.a} b={m.b} scale={view.s}
    hit={tool === "select" ? {
      id: m.id,
      hovered: hoverMeasure === m.id,
      onHover: (v) => setHoverMeasure(v ? m.id : null),
      onDelete: () => {
        const d = current.current;
        commit({ ...d, measures: d.measures.filter((x) => x.id !== m.id) });
        if (selection?.kind === "measure" && selection.id === m.id) select(null);
        setHoverMeasure(null);
      },
    } : undefined} />
))}
```

- `onPointerDown` 命中分支：在 `tool === "demolish"` 之后、`tool === "wall" || tool === "measure"` 之前插入

```ts
const mid = el.closest("[data-measure]")?.getAttribute("data-measure");
...
if (tool === "select" && mid) { select({ kind: "measure", id: mid }); return; }
```

- 选中高亮：在已有 `{selection && <g data-export-hide>…}` 覆盖层中新增 `selection.kind === "measure"` 分支，给该段画一条加粗虚线（`pointerEvents="none"`），保证不进导出图片。

### 5. `src/features/interior/components/Workbench.tsx`

- `remove()` 增加分支：

```ts
else if (s.kind === "measure")
  change((d) => ({ ...d, measures: d.measures.filter((m) => m.id !== s.id) }));
```

- `toggleView`：切到 3D 时清掉测量选择，避免浮出工具条残留在 3D 视图：
  `setSelection((s) => (s?.kind === "measure" ? null : s))`。
- 选择模式提示文案（第 409 行）补一句：`"点选对象编辑 · 点测量线可删除 · 拖入家具布置空间"`。
- 测量模式提示（第 402 行）保持原文案。
- `文件 → 清除测量线` 不改。

### 6. `src/features/interior/components/SelectionEditor.tsx`

- 增加 `m` 查询：`p.selection?.kind === "measure" ? p.design.measures.find(...) : null`。
- 空守卫改为 `if (!f && !w && !r && !o && !m) return null;`。
- 名称显示：`f?.name || r?.name || (m ? "测量线" : w ? "墙体" : o?.kind === "door" ? "门" : "窗")`。
- 删除按钮条件改为 `(f || o || editableWall || m)`；`m` 时 `fields` 仍为空数组，尺寸弹层自然不渲染（长度直接画在画布上）。

### 7. `src/features/interior/components/PropertyPanel.tsx`

- 增加 `m = s?.kind === "measure" ? d.measures.find(...) : null`。
- 在 `if (o) { … }` 之后新增 `if (m)` 分支：面板标题「测量线 / 临时标注」，复用现有 `back` 返回链接、`muted-note` 显示 `长度 {Math.round(length(m))} mm`（用第 2 步的 `length`），并用现有 `Button variant="outline" size="sm"` + `<Trash2 />` 渲染「删除测量线」按钮。
- 这样选中测量线时右侧面板不再落回「方案总览」。

### 8. `src/index.css`

按现有 `.plan-*` 区块（第 560 行附近）追加，只用语义 token：

```css
.plan-measure { cursor: pointer; }
.measure-delete { cursor: pointer; }
.measure-delete circle { fill: hsl(var(--card)); stroke: hsl(var(--destructive)); }
.measure-delete line { stroke: hsl(var(--destructive)); }
```

命中线只在此工具为「选择」时存在，`.tool-measure` 的 crosshair 不受影响。

### 9. `src/features/interior/model/selectionAnchor.test.ts`

新增用例：构造 `blankDesign()` 并塞入两条 `measures`，断言
`selectionPoints(d, { kind: "measure", id })` 返回 `[a, b]` 两端点、`length(measure)` 等于手算值，且未命中 id 时返回 `[]`。

## Implementation checklist

- [ ] `Selection` 类型补 `"measure"`，且 `tsc --noEmit` 在 4、5、6、7 各处新增分支后仍通过
- [ ] `length` 参数放宽为 `{ a: Point; b: Point }` 后，`geometry.ts` 与全部调用方无需额外改动即可编译
- [ ] `selectionPoints` 对 `measure` 返回两端点，且不影响 furniture/room/wall/opening 现有行为
- [ ] `MeasureLine` 草稿态（无 `hit`）仍为 `pointerEvents="none"`，绘制中的预览线不可点、不进导出
- [ ] 选择工具下测量段命中区可点（透明加宽 stroke 生效），测量工具下不接管点击
- [ ] 悬停测量段出现 `×`，点击 `×` 仅删除该段且不触发画布 pan/选中；`×` 组带 `data-export-hide`
- [ ] 点击测量段后画布出现虚线高亮（带 `data-export-hide`），对象工具条出现在该段附近
- [ ] `Workbench.remove()` 支持 `measure`，`Delete`/`Backspace` 可删除选中测量段，`Esc` 可取消选择
- [ ] 切到 3D 视图时测量选择被清空，不残留浮出工具条
- [ ] 属性面板在选中测量线时显示长度与「删除测量线」，不再回落到方案总览
- [ ] 选择模式提示文案已更新；`文件 → 清除测量线` 行为不变
- [ ] `index.css` 新增样式全部使用语义 token，无硬编码颜色

## Verification checklist

- [ ] `pnpm test`（同 `vitest run src/features/interior`）全绿，含新增测量选中用例
- [ ] `pnpm check`（`eslint .` + `tsc --noEmit`）无错误
- [ ] `pnpm run build` 通过
- [ ] 正向：`M` 画 3 段测量线 → 切到「选择」→ 悬停某段出现 `×` → 点击后该段消失，其余两段与尺寸数字保持原位
- [ ] 正向：点击线段选中 → 画布虚线高亮 + 浮出工具条 → 点垃圾桶或按 `Delete` 删除；属性面板显示该段长度与删除按钮
- [ ] 边界：端点重合或极短线段（点击两点不拖动）仍可被 hover/点击删除
- [ ] 边界：`Ctrl+Z` 撤销删除后线段原样恢复（含两端坐标）；`文件 → 清除测量线` 仍一次清空全部
- [ ] 反向：处于测量工具（`M`）时点击已有测量线不会删除也不会选中，而是开始画新段；点击空白房区仍是取消选择
- [ ] 反向：先选中测量线再切到 3D，浮出工具条不再显示；2D 下导出的 PNG 里没有 `×` 按钮和虚线高亮（`data-export-hide` 生效）
- [ ] 回归：家具/墙体/门窗的选中、浮出工具条、删除、属性面板行为与改动前一致
