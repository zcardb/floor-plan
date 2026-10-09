# 右侧 Visual Editor 面板 UX 改造计划

## Context

右侧面板（属性 / 成本）由多轮迭代累积而成，同一类操作在不同面板里交互不一致，已经造成真实问题（例如「点完成价格不生效」）。本次依据 growth.design 心理学法则做整体走查，统一保存规则、消除「看起来可改实际不生效」的字段、降低信息噪音、统一面板骨架。

已确认的决定：
- 价格输入：**保留「应用」按钮（显式提交）**。理由：同步到账号库会影响其他项目且不在 Ctrl Z 撤销范围内；失焦自动保存会在点「同步」勾选时先按旧设置提交。改为补齐「未应用」可见性与关闭时的处理。尺寸、名称等仅影响当前项目且可撤销的字段，继续即时生效。
- 「同步到账号库」勾选：**扩展到所有价格类别、所有改价入口**（家具、地面、墙面、门窗、屋面、吊顶、拆改）。默认规则沿用：账号库未定价 → 默认勾选；已定价 → 默认不勾选。
- 「方案总览」里的「房间面积」列表：**保持不动**。

---

## 一、完整问题清单

### A. 交互一致性（P0）

| # | 问题 | 位置 | 违反法则 |
|---|---|---|---|
| A1 | 价格需要点「应用」才保存，但「未应用」状态不可见：按钮常态灰色、输入框无变化，关闭弹层 / 切换对象时修改静默丢失 | `PriceInput.tsx` | Visibility of System Status / Feedback |
| A2 | 改价入口有 5 处，只有家具属性面板能「同步到账号库」；浮动单价弹层、本间成本、全屋成本明细都没有 | `FurniturePriceField.tsx`、`SelectionEditor.tsx` 384–409、`RoomCostDetail.tsx` 98/135、`CostRowEditor.tsx` 38 | Consistency / Mental Model |
| A3 | 价格「来源」（项目覆盖 / 账号默认 / 内置参考）和「恢复账号默认」只在全屋成本明细里有，其他入口看不到当前价格从哪来 | `CostRowEditor.tsx` 46–58 | Visibility of System Status |
| A4 | 家具尺寸在右侧面板用自写的失焦输入（标签「宽度 / m」），浮动编辑器与墙 / 门窗用 `SizeFields`（输入即生效，标签「宽 / m」），同一字段两套行为和文案 | `PropertyPanel.tsx` 239–254 vs `SizeFields.tsx` | Law of Similarity |
| A5 | 地面采购规格里还有第二个「单价」输入框，与上方单价重复；切换计价单位会清空单价 | `MaterialProcurementEditor.tsx` 139–152 | Cognitive Load / Error Prevention |
| A6 | 地面选择在右侧是卡片网格，在浮动「材质」弹层是下拉，墙面只能在浮动弹层里改，右侧房间面板没有 | `PropertyPanel.tsx` 380–390、`SelectionEditor.tsx` 345–354 | Consistency |

### B. 假可编辑 / 状态不一致（P0）

| # | 问题 | 位置 | 违反法则 |
|---|---|---|---|
| B1 | 参考户型下「净宽 / 净深」可输入，失焦后无提示静默回滚 | `PropertyPanel.tsx` 525–578 | Signifiers / Feedback |
| B2 | 参考户型下「外围墙厚」改了不生效，且输入框不回滚，显示值与实际数据不一致（**真实 bug**） | `PropertyPanel.tsx` 579–588 | Feedback |
| B3 | 名称清空后失焦：不保存也不回显原名，输入框留空 | `PropertyPanel.tsx` 156–168 | Feedback |
| B4 | 「显示尺寸标注」关闭后，4 个距离输入仍可编辑但无效果 | `DimensionSettings.tsx` 15–32 | Signifiers / Progressive Disclosure |

### C. 信息噪音（P1）

| # | 问题 | 位置 | 违反法则 |
|---|---|---|---|
| C1 | 墙体面板 3 段灰字说明 + 1 个底部提示框；「删除隔墙」按钮与「墙选项 → 删除当前墙」重复 | `PropertyPanel.tsx` 438–464 | Cognitive Load / Banner Blindness |
| C2 | 墙体面板的分节标题写的是状态（「可编辑内部墙体」/「受保护墙体」），不是内容 | `PropertyPanel.tsx` 440–442 | Labeling |
| C3 | 家具、方案总览底部的固定操作提示每次都出现，看过即忽略 | `PropertyPanel.tsx` 317–324、670–673 | Banner Blindness |
| C4 | 键盘「操作说明」放在「户型设置」标签里，与户型参数无关 | `PropertyPanel.tsx` 600–616 | Information Architecture |
| C5 | 「空间，恰到好处。」标语占据主数据上方最显眼位置，无信息量 | `PropertyPanel.tsx` 621–624 | Signal-to-Noise |
| C6 | 材质卡片未定价时显示「¥未定价 / m²」 | `PropertyPanel.tsx` 182、`RoomSurfacePanel.tsx` 18 | Clarity |

### D. 成本口径（P1）

| # | 问题 | 位置 | 违反法则 |
|---|---|---|---|
| D1 | 标签上显示全屋合计，进入后最大的数字却是「全屋硬装」，合计被放在第二行 | `CostPanel.tsx` 67–81、`PanelModeTabs.tsx` 48 | Anchoring |
| D2 | 本间成本页没有价格来源与「恢复账号默认」，与全屋明细不对等 | `RoomCostDetail.tsx` | Consistency |

### E. 面板骨架不统一（P2）

| # | 问题 | 位置 | 违反法则 |
|---|---|---|---|
| E1 | 门窗面板无标题区、无分节标题、无价格入口；家具 / 房间都有 | `PropertyPanel.tsx` 468–491 | Law of Similarity |
| E2 | 门窗删除按钮写「删除开口」（术语），面板标题却是「门 / 窗属性」 | `PropertyPanel.tsx` 479–487 | Labeling |
| E3 | 「置顶 / 置底」没有说明是 2D 叠放顺序 | `PropertyPanel.tsx` 285–314 | Clarity |
| E4 | 家具原生取色器每次拖动都写一次撤销记录（与浮动编辑器的常用色板不一致） | `PropertyPanel.tsx` 255–269 | Consistency |

### 暗黑模式风险
- 「同步到账号库」默认勾选会影响其他项目，但旁边没说明影响范围。改造后在勾选项下写清「将同时更新账号默认价，N 个未单独调价的项目随之变化」（若取不到项目数，写「其他未单独调价的项目」）。

---

## 二、改造方案

### 1. `PriceInput`：保留「应用」，让「未应用」看得见（A1）
- 保留「应用」按钮与 `Enter` 提交、`Esc` 还原；**失焦不提交**。
- 三态视觉：
  - 无修改：按钮 `secondary` 弱化、不可点（`disabled={!dirty}`），避免「点了没反应」。
  - 有未应用修改：输入框加 `is-dirty`（主色描边），按钮切到 `default` 主色，下方小字「未应用」。
  - 应用中：按钮「应用中…」；失败保留输入并显示错误。
- 按钮文案随后果变化：勾选「同步到账号库」时显示「应用并同步」，否则「应用」（让跨项目影响在点击前就可见）。
- `flush()` 在保存进行中时等待该次结果，而不是返回 false。
- 关闭时的处理，按容器区分：
  - 有显式「完成」按钮的对话框（`AccountCostDialog`、`AccountFurnitureDialog`）：点「完成」= 显式提交，继续 `flush()`（已实现，保持）。
  - 浮动单价弹层、右侧面板切换对象 / 返回：不静默提交，也不静默丢弃；卸载时若有未应用修改，提示「『xx单价』的修改未应用，已放弃」（toast），让丢弃可感知。
- `PriceInput` 新增 `onDirtyChange` 回调，供外层（如弹层）需要时感知未应用状态。

### 2. 新建统一改价组件 `PriceField`（A2、A3、D2、暗黑风险）
新文件 `src/features/interior/components/PriceField.tsx`，替代 `FurniturePriceField` 并用于所有项目内改价入口：
- Props：`design, group, key, name, unit, change, compact?`。
- 内容：`PriceInput` + 来源标签（复用 `priceSource`）+「恢复账号默认」（复用 `restorePrice`，仅「项目覆盖」时显示）+「同步到账号库」勾选（复用 `AccountCostSaveContext`，未登录不显示）。
- 勾选默认值：该 group/key 在账号默认里为 `undefined` 或 `null` → 勾选；有值 → 不勾选。
- 勾选时保存顺序：先写账号库，成功后再写项目价；失败则提示并保持输入（沿用当前 `FurniturePriceField` 的逻辑，推广到全部 group）。
- 勾选说明文案统一写明影响范围（见暗黑风险）。
- 布局顺序：**勾选项放在输入框与「应用」按钮之前**（先决定作用范围，再输入、再提交），按钮文案随勾选切换「应用 / 应用并同步」。
- 接入位置：
  - 家具属性面板（替换 `FurniturePriceField`，删除该文件）
  - 浮动编辑器单价弹层 `SelectionEditor.tsx` 389–398
  - 本间成本 `RoomCostDetail.tsx` 98、135（`labor` 组除外）
  - 全屋成本明细 `CostRowEditor.tsx` 38–58（其原有来源与恢复逻辑并入 `PriceField`）

### 3. 地面采购规格去重（A5）
- `MaterialProcurementEditor` 删除内部「单价」输入框，规格表单只管长 / 宽 / 损耗 / 每箱张数 / 计价单位。
- 切换计价单位时提示「单位已变更，请在上方单价重新填写」，并把上方 `PriceField` 的单位文案随之更新；不再自动清空价格（改为提示）。

### 4. 尺寸字段统一（A4）
- 家具属性面板改用 `SizeFields`（与墙 / 门窗一致，输入即生效、一步撤销），删除 `PropertyPanel` 内自写的 `w/d/cx/cy` 输入。
- `SizeFields` 家具标签统一为「宽度 / 深度（楼梯为长度）/ 中心 X / 中心 Y」，与墙 / 门窗的「长度 / 宽度」用词一致。
- `RotationControls` 已由 `SizeFields` 渲染，移除 `PropertyPanel` 里的重复调用。

### 5. 房间面板补齐墙面（A6）
- 房间属性新增「墙面」分节，用与地面相同的卡片网格（复用 `pickableWalls` + `applyRoomWall`），位置在「地面材质」之后、屋面之前。
- 浮动编辑器的「材质」弹层保持下拉不变（空间受限），只确保选项与右侧一致。

### 6. 假可编辑字段（B1–B4）
- 参考户型：「净宽 / 净深 / 外围墙厚」设为 `disabled`，分节说明改为一句「参考户型的外围尺寸已锁定；如需调整，请新建空白项目」。仅「层高」保持可编辑。
- 修复 B2：墙厚更新函数在非空白户型下返回 false，确保回滚（在禁用后作为兜底）。
- 名称清空失焦：回显原名并 `notify.fail('名称不能为空')`。
- 尺寸标注关闭时，4 个距离输入 `disabled`。

### 7. 降噪（C1–C6）
- 墙体面板：
  - 分节标题改为墙的名称 / 类型（如「隔墙 · 3.20 m」），状态改成一个小徽标（可编辑 / 可调尺寸 / 受保护）。
  - 合并 3 段说明为 1 段，按状态只显示最相关的一句；底部「仅用于设计示意…」提示保留（法律性质），其余删除。
  - 删除重复的「删除隔墙」按钮，统一由「墙选项」承担。
- 家具 / 方案总览底部固定操作提示：改为首次出现，用户点关闭后通过 `localStorage` 记住不再显示；占地面积移到家具标题副行（「1.20 × 0.60 m · 0.72 m²」）。
- 键盘「操作说明」从「户型设置」移到方案总览底部提示的展开项中（「查看快捷键」）。
- 「空间，恰到好处。」改为「套内净使用面积」（并删除下方重复的同名描述行，只保留「· N 个空间」）。
- 材质卡片未定价显示为「未定价」（不带 ¥ 和单位）。

### 8. 成本口径（D1）
- `CostPanel` 的 `CostHero` 主金额改为 `b.total`（硬装 + 软装合计），eyebrow 改为「全屋合计」；拆分条与图例保持硬装 / 软装。
- 删除原有的 `cost-total-line`（合计行），避免重复。

### 9. 面板骨架统一（E1–E4）
- 统一顺序：**面板标题 → 对象标题区（图标 + 名称 + 副信息）→ 尺寸 → 外观 / 材质 → 价格 → 操作按钮**，每段有 `section-title`。
- 门窗面板：补对象标题区（门 / 窗名称 + 宽 × 高），分节「款式」「尺寸」「开向」（仅门）「单价」（登录时，用 `PriceField`，group `openingPrices`，key 复用 `SelectionEditor` 计算价格目标的同一逻辑），删除按钮文案改为「删除门」/「删除窗」。
- 「置顶 / 置底」tooltip 改为「平面图中显示在最上层 / 最下层」。
- 家具颜色：改为与浮动编辑器一致的常用色板 + 自定义色（抽取 `SelectionEditor` 309–328 的色板为 `ColorSwatches` 组件共用）；自定义取色只在 `onBlur` / 关闭时提交一次。

---

## 涉及文件
- 修改：`PriceInput.tsx`、`PropertyPanel.tsx`、`SelectionEditor.tsx`、`RoomCostDetail.tsx`、`CostRowEditor.tsx`、`CostPanel.tsx`、`MaterialProcurementEditor.tsx`、`SizeFields.tsx`、`DimensionSettings.tsx`、`RoomSurfacePanel.tsx`、`AccountCostDialog.tsx`、`src/index.css`
- 新增：`PriceField.tsx`、`ColorSwatches.tsx`、`PanelHint.tsx`（可关闭的首次提示）
- 删除：`FurniturePriceField.tsx`
- 复用：`priceSource` / `restorePrice`（`model/costDefaults.ts`）、`AccountCostSaveContext`、`pickableWalls` / `applyRoomWall`、`SizeFields`、`EditorTooltip`、`useConfirm`

---

## Implementation checklist
- [ ] `PriceInput`：保留「应用」+ Enter 提交、Esc 还原，失焦不提交
- [ ] `PriceInput`：无修改时按钮禁用；有修改时输入框 `is-dirty` + 按钮主色 +「未应用」小字（`index.css` 用设计 token）
- [ ] `PriceInput`：支持 `applyLabel`，同步勾选时显示「应用并同步」
- [ ] `PriceInput`：`flush()` 在保存进行中时等待该次结果
- [ ] `PriceInput`：卸载时若有未应用修改，toast 提示「修改未应用，已放弃」（对话框「完成」路径仍走 flush 提交）
- [ ] 新建 `PriceField`：来源标签 + 恢复账号默认 + 同步勾选（全部 7 个 group），勾选项位于输入框之前
- [ ] `PriceField` 同步勾选默认值：账号库无价 → 勾选，有价 → 不勾选
- [ ] `PriceField` 同步失败时项目价不变、输入保留、提示错误
- [ ] 家具属性面板改用 `PriceField`，删除 `FurniturePriceField.tsx`
- [ ] 浮动单价弹层改用 `PriceField`
- [ ] `RoomCostDetail` 硬装 / 家具行改用 `PriceField`（labor 除外）
- [ ] `CostRowEditor` 改用 `PriceField`，移除其内部重复的来源 / 恢复逻辑
- [ ] `MaterialProcurementEditor` 删除内部单价框，单位切换改为提示而非清空
- [ ] 家具属性面板尺寸改用 `SizeFields`，移除自写输入与重复 `RotationControls`
- [ ] `SizeFields` 家具标签统一为「宽度 / 深度 / 长度」
- [ ] 房间面板新增「墙面」卡片网格
- [ ] 参考户型禁用净宽 / 净深 / 外围墙厚，说明合并为一句
- [ ] 外围墙厚在非空白户型下回滚（B2 兜底）
- [ ] 名称清空失焦回显原名并提示
- [ ] 尺寸标注关闭时禁用 4 个距离输入
- [ ] 墙体面板：标题改名称 + 状态徽标，说明合并为 1 段，删除「删除隔墙」按钮
- [ ] 新建 `PanelHint`（可关闭，localStorage 记忆），替换家具 / 总览底部提示
- [ ] 家具占地面积移到标题副行
- [ ] 快捷键说明从户型设置移到总览提示的「查看快捷键」
- [ ] 总览标语替换为「套内净使用面积」，删除重复描述行；房间面积列表不动
- [ ] 材质卡片未定价文案改为「未定价」
- [ ] `CostPanel` 主金额改为全屋合计，删除 `cost-total-line`
- [ ] 门窗面板：对象标题区、分节标题、`PriceField`（openingPrices）、删除按钮文案「删除门 / 删除窗」
- [ ] 置顶 / 置底 tooltip 文案说明叠放顺序
- [ ] 抽取 `ColorSwatches`，家具面板与浮动编辑器共用；自定义色只提交一次

## Verification checklist
- [ ] 正向：家具属性面板输入价格后，输入框高亮、按钮变主色并显示「未应用」；点「应用」或回车后生效并恢复常态
- [ ] 正向：勾选同步后按钮文案为「应用并同步」，取消勾选变回「应用」
- [ ] 负向：输入价格后点击「同步」勾选，不会触发提交（失焦不保存）
- [ ] 负向：浮动单价弹层输入后不点应用直接关闭，价格不变并出现「修改未应用，已放弃」提示
- [ ] 默认：未修改时「应用」按钮为禁用态
- [ ] 正向：账号库未定价的地面 / 墙面 / 门窗价格，勾选默认开启，保存后账号库中出现该价
- [ ] 默认：账号库已有价的项目，勾选默认关闭，保存只改当前项目，来源显示「项目覆盖」，「恢复账号默认」可还原
- [ ] 负向：输入负数 / 非数字，blur 后不保存、输入框标红、原值不变
- [ ] 负向：同步账号库失败（模拟 save 返回 false），项目价不变、输入保留
- [ ] 边界：在 `AccountCostDialog` 输入后直接点「完成」，只保存一次且对话框正常关闭
- [ ] 边界：Esc 还原未保存输入，不触发保存
- [ ] 参考户型下净宽 / 净深 / 墙厚为禁用；空白户型仍可修改且缩小时确认弹窗正常
- [ ] 名称清空失焦后回显原名
- [ ] 尺寸标注关闭后距离输入禁用，重新打开可编辑
- [ ] 家具尺寸在右侧面板与浮动编辑器表现一致（输入即生效、一次撤销还原）
- [ ] 墙体面板不再出现「删除隔墙」按钮，「墙选项」删除仍可用
- [ ] 关闭底部提示后刷新页面不再出现
- [ ] 成本页主金额等于成本标签上的金额
- [ ] 门窗面板显示单价入口，改价后全屋成本「门窗」类别同步变化
- [ ] 「方案总览」房间面积列表与改造前一致
- [ ] 运行：`npx tsc --noEmit -p tsconfig.app.json`、`npx eslint src/features/interior`、`npx vitest run src/features/interior`（更新受影响的价格输入相关用例）、`pnpm run build`
- [ ] 截图验证：desktop_1280 下选中家具 / 房间 / 墙 / 门窗 / 成本页各一次
