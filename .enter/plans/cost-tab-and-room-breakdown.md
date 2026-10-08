# 成本：右侧「属性 / 成本」双页 + 按房间分摊

## Context（为什么做）

现状逻辑（`src/features/interior/model/costs.ts › calculateCosts`）：
- **软装** = 每件家具 × 同款单价（`furniturePrices`，只有自定义目录可能自带价，内置家具默认未定价 → 软装常为 ¥0）。
- **硬装** = 地面（按材质汇总 → 含损耗 + 按张/箱取整，`projectProcurement`；支持内置与自定义地面 `floorMaterialOf`）+ 墙面（周长 × 层高 − 门窗，`wallSurfaceArea`）+ 门窗面积 + 拆除/新建隔墙 + 人工。
- 只有**全屋**一个口径。

两个问题：
1. **不够明显**：入口是属性面板顶部一个 11px 文字按钮（`.open-cost-manager`），成本和属性混在一起；总额“¥25,610.87”里软装 ¥0 实为“未定价”，却看起来像“免费”。
2. **计算口径弱**：选中房间时只显示「本项目同材质采购合计」（全屋数字，不是这一间）；选中家具只显示单价；无法回答“这间房花多少 / 房里家具多少”。

按你的反馈定方向：**不做重**——画布与底部状态栏不加东西；成本单独作为右侧边栏的一页，选「成本」时右侧直接切过去；**总览口径以硬装为主**，**选中房间时能看到并修改该房间的家具成本**；选中工具条直接显示对象金额。

参考的法则（growth.design）：**视觉层级/对比**（成本独立成页 + 标签上常驻金额，弱透出）、**框架效应**（“未定价 N 件”而不是“¥0”）、**蔡加尼克效应/目标梯度**（定价完成度进度条）、**渐进披露 + 组块化**（类别卡默认折叠）、**希克定律**（一个入口，去掉重复的地面采购估算块）、**反馈回路**（选中即显示其金额）。

## 口径定义

`calculateCosts()` 仍是唯一总额来源；新增的按房间视图必须与之对齐：

| 项目 | 归属 |
| --- | --- |
| 地面 | 该材质**实际采购额**（含损耗/取整）按房间**面积占比**分摊 |
| 墙面 | 每间精确：`wallSurfaceArea(r, d) × 单价` |
| 门窗 | 贴在哪几间房的边界就**平分**给这几间（与墙面扣减用同一几何判定）；贴不到任何房间 → 全屋公共项 |
| 家具（软装） | 中心点 `inRoom()` 落在哪间算哪间；不在任何房间 → 全屋公共项 |
| 拆除 / 新建隔墙 / 人工 | 全屋公共项，不分摊 |

**不变量**：`Σ 房间金额 + 全屋公共项 = calculateCosts().total`。

## 交互

**右侧面板顶部**改为两个标签：`属性` | `成本 ¥25,611`（金额实时，登录后才显示成本标签）。删除旧的 `.open-cost-manager` 按钮。

**成本页口径跟随选中**：
- 未选中 / 选中墙或门窗 → **全屋口径**
  - Hero：硬装合计（主数字）+ 软装合计（次级，未定价时显示「未定价 N 件」）+ 总计一行；定价完成度进度条「已定价 X / Y 项」，点击「只看未定价」筛选。
  - 类别卡（默认折叠）：地面 / 墙面 / 门窗 / 拆改与新建 / 人工 / 软装；展开后沿用现有 `PriceInput`、`MaterialProcurementEditor`、`priceSource`、`restorePrice`。原「地面采购估算」并入「地面」卡。
  - 「按房间」列表：每间房金额 + 占比条，点击即选中该房间并切到房间口径；末行「全屋公共项」。
- 选中房间 → **房间口径**
  - 头部：房间名 · 面积 · 「返回全屋」。
  - Hero：本间合计、硬装/软装、占全屋 x%。
  - 硬装：地面（注明“按面积分摊”）/ 墙面 / 门窗，可改单价。
  - **房内家具列表**：每件名称 + 单价输入（同款联动，`setPrice('furniturePrices')`），未定价高亮。
- 选中家具 → 房间口径（其所在房间），该家具行高亮；不在任何房间则全屋口径并高亮软装卡中的该行。

**示意（右侧面板）**

```
┌ 属性 │ 成本 ¥25,611 ┐        ┌ 属性 │ 成本 ¥25,611 ┐
│ 全屋                     │        │ ← 全屋   厨房 · 11.75 m² │
│ 硬装  ¥25,611            │        │ 本间  ¥3,420   占全屋 13% │
│ 软装  未定价 2 件         │        │ 硬装 ¥3,420 · 软装 未定价 │
│ ▓▓▓▓▓▓▓░░░ 已定价 8/13   │        │ 地面 橡木 (按面积分摊) ¥… │
│ [只看未定价]              │        │ 墙面 乳胶漆          ¥… │
│ ▸ 地面   ¥24,611          │        │ 门窗 (邻间平分)       ¥… │
│ ▸ 墙面   未定价           │        │ 房内家具 2 件            │
│ ▸ 门窗 / 拆改 / 人工 / 软装 │        │  三人沙发 [ 单价 ] 应用   │
│ 按房间                    │        │  边几     [ 单价 ] 应用   │
│ 院子 ▓▓▓▓▓▓ ¥11,657       │        └──────────────────────┘
│ 厨房 ▓▓ ¥3,420 …          │
│ 全屋公共项 ¥0              │
└──────────────────────┘
```

**属性页瘦身**：删去「整体成本 · 已录入费用」块和「地面采购估算」块；房间页「本项目同材质采购合计」换成弱链接「本间成本 ¥X →」（切到成本页）；家具页单价输入保留。

**选中工具条**：价格按钮直接显示金额（家具 `¥2,000`、房间 `本间 ¥6,320`、门窗 `¥1,200`、墙体拆改 `¥800`；未定价显示「未定价」），弹层逻辑保留，「查看软装 / 硬装成本」改为切到成本页。

## 改动文件

1. `src/features/interior/model/costs.ts`
   - 从 `wallSurfaceArea` 抽出 `openingRoomOverlap(room, opening, d)`（复用私有 `overlapOnBoundary`），墙面扣减改为调用它，行为不变。
   - 新增 `openingRoomIds(d, o): string[]`。
   - `calculateCosts` 返回结构不变。
2. 新增 `src/features/interior/model/costBreakdown.ts`
   ```ts
   export interface CostPart { group: PriceGroup | 'labor'; key: string; label: string; quantity: number; unit: string; price: number | null; subtotal: number; refId?: string }
   export interface RoomCost { roomId: string; hard: CostPart[]; soft: CostPart[]; hardTotal: number; softTotal: number; total: number; unpriced: number }
   export function costBreakdown(d: Design): { rooms: RoomCost[]; shared: CostPart[]; sharedTotal: number; total: number }
   export function selectionCost(d: Design, s: Selection): { label: string; amount: number | null } | null
   ```
   调用方传入 `useCostDesign()` 生效后的 design，与 `calculateCosts` 共享账号默认价。
3. 新增 `src/features/interior/model/costBreakdown.test.ts`
4. 拆分成本页组件（替换 `CostPanel.tsx` 内部）：
   - `CostPanel.tsx`：根据 `selection` 选口径
   - `CostHero.tsx`：总额 / 硬软装 / 完成度
   - `CostCategoryList.tsx`：全屋类别卡（含原有 rows 渲染 + 人工表单 `LaborEditor`）
   - `RoomCostList.tsx`：按房间列表
   - `RoomCostDetail.tsx`：房间口径（硬装 + 房内家具）
5. `src/features/interior/components/Workbench.tsx`：`costOpen` → `panelMode: 'props' | 'cost'`；新增面板标签；`SelectionEditor.costs` 与属性页弱链接都切到 `'cost'`；删除旧按钮。
6. `src/features/interior/components/PropertyPanel.tsx`：删除两块重复成本；房间页加弱链接（新增 `openCosts` prop）。
7. `src/features/interior/components/SelectionEditor.tsx`：价格按钮显示 `selectionCost` 金额。
8. `src/index.css`：新增 `.panel-mode-tabs`、`.cost-hero`、`.cost-progress`、`.cost-category`、`.room-cost-row`（占比条）、`.cost-unpriced` 等，全部用语义 token；删除 `.open-cost-manager`。

## Implementation checklist
- [ ] `costs.ts` 抽出 `openingRoomOverlap`，`wallSurfaceArea` 改用它，现有 `costs.test.ts` 全绿
- [ ] `costs.ts` 新增 `openingRoomIds`：共享隔墙上的门返回 2 个房间 id，外墙窗返回 1 个
- [ ] `costBreakdown` 地面按面积占比分摊，同材质各房间之和 = 该材质采购小计（含自定义地面）
- [ ] `costBreakdown` 门窗按相邻房间平分，房间门窗之和 + 公共项门窗 = 硬装门窗小计
- [ ] `costBreakdown` 房外家具、拆除/新建、人工都进入 `shared`
- [ ] 不变量：`Σ rooms.total + sharedTotal ≈ calculateCosts().total`
- [ ] `selectionCost` 覆盖家具 / 房间 / 门窗 / 墙体，无选中返回 `null`，未定价返回 `amount: null`
- [ ] 成本页：未选中时为全屋口径，Hero 主数字是硬装合计，软装未定价显示「未定价 N 件」
- [ ] 成本页：定价完成度进度条 + 「只看未定价」筛选可用
- [ ] 成本页：全屋类别卡默认折叠，「地面」卡包含原地面采购估算内容与 `MaterialProcurementEditor`
- [ ] 成本页：「按房间」列表点击后选中房间并切到房间口径
- [ ] 成本页：房间口径显示本间硬装分项 + 房内家具列表，家具单价可改且同款联动
- [ ] 成本页：选中家具时高亮对应家具行
- [ ] `Workbench`：面板顶部 `属性 / 成本 ¥X` 标签，`.open-cost-manager` 按钮移除
- [ ] `PropertyPanel`：删除「整体成本」与「地面采购估算」块，房间页弱链接切到成本页
- [ ] `SelectionEditor`：价格按钮显示金额；「查看软装 / 硬装成本」切到成本页
- [ ] `index.css`：新样式只用语义 token，`.open-cost-manager` 删除

## Verification checklist
- [ ] `pnpm test`（`src/features/interior`）全绿，含新增 `costBreakdown.test.ts`
- [ ] `pnpm lint && pnpm exec tsc --noEmit` 通过
- [ ] `pnpm run build` 通过
- [ ] 正向：截图中参考方案，成本页全屋总计与改动前 ¥25,610.87 一致
- [ ] 正向：选中「厨房」后成本页 = 地面分摊 + 墙面 + 门窗 + 房内家具，且占比显示正确
- [ ] 边界：某材质只有一间房使用时，分摊 100%，金额等于该材质采购小计
- [ ] 边界：空白项目（无家具）打开成本页不报错，显示空状态文案
- [ ] 默认：只贴一间房边界的窗全额归该房间，不出现 0.5 分摊
- [ ] 负例：未登录时不显示成本标签与工具条金额（沿用 `showCosts = loggedIn`）
- [ ] 视觉：desktop_1280 与 mobile_390 截图检查标签、Hero、进度条、房间列表无溢出、对比度正常
