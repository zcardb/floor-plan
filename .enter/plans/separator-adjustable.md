# 房间分隔线：可调长度与位置 + 墙体工具下拉收敛

## Context

房间分隔线（Revit 的 Room Separation Line）目前只能画、选中、删除：画完后端点不可拖动，线身不可平移，工具条上的「1.24 m」只是只读提示，所以用户想让它精准落在墙左端 / 右端、或缩短一点时只能删除重画。同时顶部「墙 ▾」下拉里每项的图标按 lucide 默认 24px 渲染、说明文字也偏大，弹层显得臃肿。

本次要做三件事：

1. 选中分隔线后，两端出现可拖动的圆点（贴墙 / 贴线吸附、沿分隔线方向正交），拖动即改长度。
2. 整条线可沿自身法向平移，端点自动跟着贴到新墙面，用来对齐墙的左端 / 右端。
3. 工具条上的长度值改成可点开的弹层：长度输入 + 固定哪一端（另一端自动伸缩）。
4. 「墙 ▾」下拉收紧：图标 16px、标题 13px、说明 11.5px 并换行收窄，文案缩短。

调整完成后房间自动按「墙 + 分隔线」重算（`deriveRooms`），名称、材质按重叠沿用，选中该房间时布局随之更新 —— 这条链路已存在，本次只是把新的编辑入口接到它上面。

## 涉及文件

- `src/features/interior/model/separators.ts`：新增 `moveSeparator` / `resizeSeparator`，复用已有 `MIN_LENGTH`、`separatorLength`。
- `src/features/interior/components/PlanSeparators.tsx`：选中时渲染端点手柄与命中区，拖动时在线上画长度。
- `src/features/interior/components/PlanCanvas.tsx`：新增 `sepmove` / `sependpoint` 两种拖动，复用 `resolveWallPoint`（正交约束）、`stepDelta`、`snapToDragStep`、`setView`/`showGuides` 同级的预览与提交路径；提交走 `deriveRooms` 并沿用「房间数变化 → notify.info」的提示。
- `src/features/interior/components/SeparatorLengthFields.tsx`（新建）：长度 + 固定端的输入面板。
- `src/features/interior/components/SelectionEditor.tsx`：`separator` 分支的只读 span 改成 `Popover`（复用现有 `visual-editor-popover`、`SizeFields` 用到的 `transaction` 事务）。
- `src/features/interior/components/wallTools.ts`：缩短分隔线说明文案。
- `src/features/interior/components/WallToolMenu.tsx` + `src/index.css`（`.wall-tool-menu` 段）：图标尺寸与字号、行距、内边距。
- 测试：`src/features/interior/model/separators.test.ts`、`src/features/interior/components/Workbench.test.tsx`（可选中分隔线、工具条出现长度弹层）。

## 实施要点

### 1. 模型层（separators.ts）

```ts
/** 移动 / 缩短端点：线性插值到新端点，重算房间。 */
export function moveSeparator(d: Design, id: string, end: 'a' | 'b', to: Point): Design
/** 整线沿法向平移，两端同量位移。 */
export function moveSeparatorBy(d: Design, id: string, delta: Point): Design
/** 以某一端为锚点改长度（另一端落在原方向上）。 */
export function resizeSeparator(d: Design, id: string, length: number, anchor: 'a' | 'b'): Design
```

共用的校验放进一个 `placeSeparator(d, id, a, b)`：长度 < `MIN_LENGTH`（20 mm）抛「分隔线太短」；与另一条分隔线共线且沿自身方向有重叠时抛「分隔线不能重叠」；通过则 `deriveRooms({...d, separators: 替换后的数组})`。找不到 id 抛「分隔线不存在，请重新选择」（与 `removeSeparator` 一致）。

不要把分隔线改动接进 `syncRooms`：`followSeparators` 是给「墙动了、分隔线跟着走」用的，本次是分隔线自身在动，直接 `deriveRooms` 即可，也不会误删家具（`dropOrphanFurniture` 只在墙被删的场景需要）。

### 2. 画布拖动（PlanSeparators.tsx + PlanCanvas.tsx）

- `PlanSeparators` 在 `selected` 时于 `s.a` / `s.b` 画两个手柄：`data-handle="sepa" | "sepb"`、半径 `10 / scale`、`fill: var(--plan-porcelain)`、`stroke: var(--plan-selection)`；命中区比视觉半径大一圈（约 `18 / scale` 的透明圆），满足 Fitts 定律——手柄小、可点区域不小。
- 选中的那条线的透明命中线加 `className="plan-separator-hit"`，`cursor: move`（css），表示可整条拖动。
- `PlanCanvas` 的 `onPointerDown` 里，在现有 `sid` 分支之前读取 `data-handle`：命中 `sepa` / `sepb` → `base.kind = 'sependpoint'`、`base.id = sid`、`base.room = end`；否则若 `sid` 且工具为 `select` → 选中并以 `base.kind = 'sepmove'` 起拖。
- `onPointerMove`：
  - `sependpoint`：`resolveWallPoint(p, before, view.s, layers.snap, 另一端)` 拿到正交吸附点（贴墙 / 贴洞口 / 贴另一条线的端点），没有吸附命中的则按 `snapToDragStep` 对位移取步进；模型抛错（太短 / 重叠）时本帧不预览，线停在最后一次有效位置，松手即提交该位置。
  - `sepmove`：只取沿自身法向的位移 `dot(p - start, normal)`，按 `dragStep` 取整后两端同量平移 —— 「只沿法向」保证端点始终留在墙面上。
  - 两者都 `preview(…)`（房间填充、面积、名称实时重算，符合「拖动中就能看到布局变化」）；拖动中在线旁用 `MeasureLine` 显示当前长度。
- `onPointerUp` → 现有 `finish()`：`dr.moved` 时 `commit(d, dr.before)`；`next.rooms.length !== before.rooms.length` 时沿用现有提示「房间划分已更新，请检查名称与地面材质」。撤销仍是一步。
- 端点拖动中把 `data-editor-keep-visible="handle"` 也加到手柄上，保持与墙端点手柄一致的可见性行为。

### 3. 工具条弹层（SelectionEditor.tsx + SeparatorLengthFields.tsx）

- 现在 `{separator && <span className="visual-size-trigger">…}` 保留外观（`Ruler` + 长度），但换成 `PopoverTrigger asChild` 的 `<button>`，点开 `visual-editor-popover`。
- 面板内容 `SeparatorLengthFields`：
  - 「长度 / m」数字输入（`step=0.01`，复用 `meterDraft` / `sizeDraftToModel` 的输入即生效模式）；
  - 「固定端」两个互斥选项，按方向命名（横向线：左端 / 右端；纵向线：上端 / 下端），默认取已经贴在墙面 / 另一条分隔线上的那一端，都没贴则取 `a`；
  - 输入过程走 `transaction.begin(selection)` + `transaction.updateWith(token, before => resizeSeparator(...))`，失焦 / 关闭时 `apply`，非法输入 `cancel` —— 与 `SizeFields` 完全相同的事务语义，保证一步撤销。
- 弹层里补一行说明：「拖动两端圆点或整条线也能直接调整」，把两个入口关联起来（手势与数值两条路径都可见）。

### 4. 「墙 ▾」下拉收敛（WallToolMenu.tsx + wallTools.ts + index.css）

- `WallToolMenu.tsx`：菜单项图标显式 `<t.icon size={16} />`（当前无 `size`，lucide 默认 24px 偏大）。
- `wallTools.ts` 缩短说明，减少一行文字占宽：
  - 墙：「点击起点与转角连续绘墙」
  - 垭口：「无门扇的落地洞口」
  - 房间分隔线：「不砌墙也能划分房间，不计价」
- `src/index.css` 的 `.wall-tool-menu` 段：
  - `[role="menuitem"]`：`gap: 8px`、`padding: 6px 8px`、`min-height: 40px`，图标 `margin-top: 2px` 与标题基线对齐；
  - `.wall-tool-item`：`gap: 1px`，`max-width: 200px`；
  - `.wall-tool-item strong`：`font-size: 13px; line-height: 18px; font-weight: 500`；
  - `.wall-tool-item small`：`font-size: 11.5px; line-height: 16px; color: hsl(var(--muted-foreground))`；
  - `min-width: 240px` 保持，避免文案换行后弹层跳动。

## 实施清单

- [ ] `sep`：`placeSeparator` 校验（太短 / 共线重叠 / 不存在）+ `moveSeparator`、`moveSeparatorBy`、`resizeSeparator` 三个导出函数落在 `separators.ts`
- [ ] `sep`：三个函数都返回 `deriveRooms` 后的新设计，且无改动时返回原对象
- [ ] `sep`：`PlanSeparators` 选中时渲染两端手柄（`data-handle="sepa"/"sepb"`、含放大的透明命中圆）
- [ ] `sep`：`PlanCanvas` 命中手柄 → `sependpoint` 拖动，走 `resolveWallPoint` 正交吸附
- [ ] `sep`：`PlanCanvas` 命中线身 → `sepmove` 拖动，位移只投影到自身法向
- [ ] `sep`：拖动中 `preview` 实时刷新房间填充与面积；模型抛错的帧跳过，停在最后有效位置
- [ ] `sep`：`finish()` 提交时房间数变化给出既有提示；一步撤销可回到拖动前
- [ ] `sep`：拖动中沿分隔线显示长度标注
- [ ] `ui`：`SelectionEditor` 的长度 span 换成按钮 + `Popover`，键盘可打开
- [ ] `ui`：`SeparatorLengthFields` 长度输入即改即生效、非法输入回滚
- [ ] `ui`：固定端默认取贴墙的一端，切换后长度不变、另一端正对墙面伸缩
- [ ] `ui`：`WallToolMenu` 菜单项图标 16px；`wallTools.ts` 三条 hint 缩短
- [ ] `ui`：`.wall-tool-menu` 字号 / 行距 / 内边距按上文调整，文字无溢出

## 验证清单

正向

- [ ] 选中一条分隔线 → 两端出现圆点；拖动圆点，长度改变、房间面积与名称随之更新
- [ ] 端点拖到墙端 / 墙面附近 → 吸附到墙端或墙面（正交不歪斜）
- [ ] 拖动线身 → 只沿垂直方向移动，端点仍贴墙，房间划分照旧
- [ ] 打开长度弹层输入 2.5 → 线长为 2.5 m，选「固定右端」时右端不动、左端伸缩
- [ ] 打开「墙 ▾」下拉：三项图标约 16px，标题与说明不再溢出弹层

负向 / 默认

- [ ] 把端点拖过另一端（长度 < 20 mm）→ 线停在最后一次有效长度，不会翻转或消失；撤销一步回到拖动前
- [ ] 弹层输入 0 或空值 → 显示「分隔线太短」/「尺寸不能为空」，失焦后回显原长度，图纸不变
- [ ] 拖到与另一条分隔线共线重叠 → 停在重叠前的位置，不产生重叠线
- [ ] 未选中分隔线时，画布行为不变（点击仍然选中、拖动空白仍然平移画布）
- [ ] 分隔线删除 / 撤销（Esc 与 Delete）行为不变；3D 视图与成本面板仍不包含分隔线

边界

- [ ] 分隔线端点同时贴在墙面与另一条分隔线上时不报错，房间仍能重算
- [ ] 缩放（0.012 ~ 1）后手柄大小与命中区域保持恒定屏幕尺寸
- [ ] 两端都悬空（未贴墙）的分隔线拖动法向平移后仍可正常划分房间
- [ ] 房间数变化（合并 / 拆分）时名称与地面材质按重叠沿用，未出现重复名

构建与测试范围

- [ ] `pnpm exec vitest run src/features/interior/model/separators.test.ts src/features/interior/model/roomDerive.test.ts src/features/interior/components/Workbench.test.tsx`
- [ ] `pnpm run lint`
- [ ] `pnpm run build`
- [ ] 预览中人工复核一次：图片 306 那张图里的分隔线选中后能拖端点与线身，工具条能改长度
