# 家具详情弹窗改为「保存」式表单

## Context（为什么改）

账号家具库的家具详情弹窗（`AccountFurnitureDialog`）目前是「立即生效」式：

- 单价用 `PriceInput` 的「应用」按钮提交，且点击即自动保存（截图里红框标注的按钮）；
- 几何区 `FurnitureGeometryEditor` 内部还有一个独立的「保存参考几何」按钮；
- 底部是「完成」按钮（仅关闭），删除按钮在底部左侧、完成按钮在右侧（`space-between`）。

用户希望改成常规的表单式弹窗：去掉「应用」，底部改为右对齐的 `[删除家具] [保存]`，**由「保存」一次性提交表单里的所有变更**（单价 + 参考几何尺寸/类型/外形），保存成功后关闭弹窗。新生成但未保存的 AI 图片仍按现状在几何区手动保存。

## 变更设计

### 1. `src/features/interior/components/PriceInput.tsx` — 新增「延迟提交」模式

用可辨识联合类型扩展 props，**不影响现有 6 个 `onApply` 调用点**（RoomCostDetail / LaborEditor / PropertyPanel / SelectionEditor / CostRowEditor / AccountCostDialog）：

```tsx
export type PriceDraft = { value: number | null; valid: boolean };
type Shared = { value: number | null; label?: string; disabled?: boolean };
export function PriceInput(props: Shared & (
  | { deferred: true; onDraftChange: (draft: PriceDraft) => void; onSubmit?: () => void; onApply?: never }
  | { deferred?: false; onApply: (v: number | null) => PriceApplyResult; onDraftChange?: never; onSubmit?: never }
))
```

`deferred` 模式行为：

- 不渲染「应用」按钮与 `EditorTooltip`，不再逐次 `notify`；
- 复用现有解析与校验逻辑（`text.trim()==="" → null`，否则 `Number(text)` + 复用 `../model/costs` 的 `validPrice`），每次输入把 `{ value, valid }` 通过 `onDraftChange` 上报；文本非空且非法时仍渲染行内 `<small role="alert">`；
- `Enter` 改为调用 `onSubmit?.()`（保留现有 `stopPropagation`），由外层弹窗统一提交；
- 现有 `apply()` / 成功提示逻辑保持不变，仅供非 deferred 模式使用。

### 2. `src/features/interior/components/AccountFurnitureDialog.tsx` — 表单化与底部布局

- 新增状态：`const [priceDraft, setPriceDraft] = useState<PriceDraft | null>(null)`；
  `const geometry = useRef<(() => Promise<boolean>) | null>(null)`（几何提交句柄）。
- 删除内部 `applyPrice`（单价不再即时保存），改为统一的 `save()`：

```
save()
  working / retryPrice 存在 → 直接返回
  priceDraft 存在但 !valid → setError('请输入非负有效金额') + notify.fail，保持打开
  几何：isCustom && saveGeometry && geometry.current → await geometry.current()
        返回 false（尺寸非法或保存失败，编辑器已提示/上报错）→ 保持打开
  单价：priceDraft.valid 且 value !== (item.price ?? null)
        → await applyDefaultPrice(value)；false → setError('未能保存，本次修改已保留，请重试。') + 保持打开
        → 成功则 onChanged({ ...item, price: value })
  无任何变更 → 直接关闭
  全部成功 → notify.success('「name」账号默认单价已保存')（仅当单价变更）+ onOpenChange(false)
```

- 单价 `PriceInput` 改为 `deferred` + `onDraftChange={setPriceDraft}` + `onSubmit={() => void save()}`，`key` 用稳定值（`item.catalogId`），避免保存往返触发 `catalog.load()` 时重挂载丢失草稿。
- 保留现有失败态：`failure` 区块、`retryPrice`（`commit.pending`）时的「重试保存」与输入禁用。
- 底部：`<div className="cms-detail-actions">` 内 `[删除家具（isCustom，ghost destructive，type="button"）] [保存（type="button"，onClick=save）]`，二者整体右对齐；按钮文案由 `完成` 改为 `保存`（`closeLocked` 时仍为 `处理中…` + Loader）。
- 状态行文案更新：生成中 → `正在生成图片，保存并关闭会取消本次生成`；`working` → `正在保存…`；否则自定义家具 → `点击保存后一次性提交单价与参考几何；新图片需在几何区单独保存`，内置家具 → `修改单价后点击保存生效`。

### 3. `src/features/interior/components/FurnitureGeometryEditor.tsx` — 暴露提交句柄

- 新增 props：`commitRef?: { current: (() => Promise<boolean>) | null }`、`onDirtyChange?: (dirty: boolean) => void`。
- 脏值判定基于原始草稿（避免 `resolvedFurnitureType` 归一化造成误判）：
  `dirty = type !== item.type || shape !== (item.shape || 'reference') || widthMm !== item.w || depthMm !== item.d`
  （`resolveMeterDraft` 在草稿未改动时原样返回 `item.w/item.d`，因此可精确比较）。
- `apply(withImage)` 改为返回 `Promise<boolean>`（成功、`false` 表示未保存或尺寸非法）。
- 在渲染期注册句柄，供弹窗「保存」调用：`if (commitRef) commitRef.current = () => dirty ? apply(false) : Promise.resolve(true)`（无未保存改动时直接返回 `true`）。
- **移除独立的「保存参考几何」按钮**（由弹窗底部「保存」承担）；保留「重新生成图片」「保存参考几何与图片」「放弃新图片」等图片流程与既有 `notify`。

### 4. `src/features/interior/components/AccountCostDialog.tsx` — 同一套模式（材料/地面账号单价弹窗）

保持两个「账号默认单价」弹窗体验一致：单价改 `deferred` + 本地 `priceDraft`，「完成」改为右对齐的「保存」（`onClick` 提交单价后 `done()`），状态文案从底部行内 `<span>` 上移为独立状态行，文案由「应用后自动保存」改为「点击保存后生效」；footnote 的「留空并应用」改为「留空并保存」。

**不使用 `<form>` 包裹**：`MaterialProcurementEditor` 内部自带 `<form onSubmit>`（含「应用采购规格」提交按钮），嵌入外层 form 会造成非法嵌套；因此提交统一由按钮 `onClick` 触发，回车通过 `PriceInput.onSubmit` 转发。

### 5. `src/index.css`

- `.cms-detail-actions { justify-content:flex-end; }`（两个弹窗底部都只剩按钮组；`AccountCostDialog` 的状态文案已上移）。
- 保留 `@media(max-width:700px)` 中 `.cms-detail-actions` 的 `column-reverse + stretch`（移动端「保存」在上、两键全宽）。

### 6. 测试

- 更新 `src/features/interior/components/FurnitureGeometryEditor.test.tsx`：无候选图时断言不再渲染独立的「保存参考几何」按钮，仍渲染尺寸字段与「重新生成图片」；候选图场景断言不变；新增 `commitRef` 用例（`renderToStaticMarkup` 会执行组件函数体，故渲染期注册的句柄可断言：`typeof ref.current === 'function'`，`await ref.current()` 后 `save` 收到几何 payload）。
- 新增 `src/features/interior/components/PriceInput.test.tsx`：deferred 模式不渲染「应用」；非法/合法草稿经 `onDraftChange` 上报；`onSubmit` 由回车触发（沿用仓库既有的 `vi.mock('react', useState)` + 组件函数直调 harness，见 `WallSplitDialog.test.tsx`）。
- 新增 `src/features/interior/components/AccountFurnitureDialog.test.tsx`（`renderToStaticMarkup`，mock `../cloud/useFurnitureImage`）：自定义家具渲染「保存」+「删除家具」且不渲染「应用」「完成」；内置家具不渲染「删除家具」；几何区无独立「保存参考几何」按钮。

## 不改动的部分

- 单价写入路径 `applyDefaultPrice`→`useAccountCostCommit.apply`（版本校验 + 失败可重试）与 `furnitureGeometryPayload`（几何写入永不携带 price）语义不变。
- 删除家具及其确认 `AlertDialog`、`catalog.remove` 行为不变（仅位置移动到「保存」左侧）。
- 图片生成流程（`useFurnitureImage`、生成/放弃按钮、新图片需手动保存）不变。
- 其余 `PriceInput` 使用方（RoomCostDetail / LaborEditor / PropertyPanel / SelectionEditor / CostRowEditor）保持即时应用。

## 验证方式

- `pnpm test`（= `vitest run src/features/interior`）全绿；`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build` 均通过。
- 预览手测（账号家具库 →「家具」页）：
  1. 打开自定义家具（如微波炉）：单价输入无「应用」按钮，输入 `510` 后点底部「保存」→ 弹窗关闭，卡片单价变 ¥510；重开弹窗显示已保存值。
  2. 单价改为空并保存 → 视为「未定价」并生效。
  3. 展开「调整参考类型与外形」，改外形/尺寸后点底部「保存」→ 弹窗关闭，卡片尺寸/图形随之更新（几何区已无独立保存按钮）。
  4. 生成新图片但未保存时点「保存」→ 几何变更提交、弹窗关闭并取消生成，卡片图片未替换。
  5. 输入非法尺寸（如 30 m）后保存 → 不关闭，编辑器提示尺寸范围；失败态「重试保存」仍可用。
  6. 非自定义家具（如三人沙发）：无「删除家具」，右侧单个「保存」；删除家具的确认弹窗流程不变。
  7. 材料/地面账号单价弹窗（`AccountCostDialog`）：同样只有右侧「保存」，保存后生效并关闭。
  8. 窄屏（≤700px）下底部两键全宽、保存在上。

## Implementation checklist

- [ ] `PriceInput.tsx` 增加 `deferred` / `onDraftChange` / `onSubmit` 与 `PriceDraft` 导出，deferred 下不渲染「应用」按钮且回车触发 `onSubmit`
- [ ] `PriceInput.tsx` 既有非 deferred 行为与 `editorUnits.test.tsx` 断言的「应用」按钮/禁用语义保持不变
- [ ] `AccountFurnitureDialog.tsx` 移除 `applyPrice` 即时保存，新增 `priceDraft` 与几何 `commitRef` 状态
- [ ] `AccountFurnitureDialog.tsx` 实现 `save()`：几何→单价→通知→`onOpenChange(false)`，任一失败保持弹窗并显示错误
- [ ] `AccountFurnitureDialog.tsx` 底部改为右对齐 `[删除家具][保存]`，保存按钮文案与 loading 状态正确
- [ ] `AccountFurnitureDialog.tsx` 状态行/说明文案更新，不再出现「价格应用后自动保存」
- [ ] `FurnitureGeometryEditor.tsx` 移除独立「保存参考几何」按钮，保留图片相关按钮
- [ ] `FurnitureGeometryEditor.tsx` `apply` 返回 `Promise<boolean>`，渲染期注册 `commitRef`，`onDirtyChange` 按原始草稿判定脏值
- [ ] `AccountCostDialog.tsx` 改为 deferred 单价 + 右对齐「保存」+ 状态行上移，且不引入嵌套 `<form>`
- [ ] `index.css` `.cms-detail-actions` 右对齐，移动端规则保留
- [ ] 更新 `FurnitureGeometryEditor.test.tsx`、新增 `PriceInput.test.tsx` 与 `AccountFurnitureDialog.test.tsx`

## Verification checklist

- [ ] `pnpm test` 覆盖：几何编辑器无独立保存按钮且 `commitRef` 可提交几何；deferred PriceInput 不渲染「应用」并按草稿上报；自定义/内置家具的弹窗按钮组合正确
- [ ] 正向：自定义家具改单价 + 几何后点「保存」，`applyDefaultPrice` 与 `saveGeometry` 各被调用一次并关闭弹窗
- [ ] 负向/默认：单价草稿非法或未变更时点「保存」不写库（未变更则直接关闭）；几何 `commitRef` 返回 false 时弹窗不关闭
- [ ] 边界：单价清空按「未定价」提交；`retryPrice`（保存失败重试）态下输入禁用且「保存」不误触发
- [ ] `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build` 全部通过
- [ ] 预览按验证方式 1–8 人工核对，窄屏 700px 以下底部按钮布局正确
