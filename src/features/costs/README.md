# costs · 方案与成本

## 职责

编辑器里的成本界面：「方案与成本」侧栏（方案指标、合计、定价进度、科目明细、逐间成本）、顶栏造价 `CostChip`、单价输入与同步账号库、人工与材料采购编辑。计价规则本身（`calculateCosts`、`costBreakdown`、科目、默认价）在 `lib/floor-plan`，账号默认价的读写与 Context 在 `contexts/account-costs`。

## 公开入口

`CostPanel`、`CostChip`、`PriceField`、`MaterialProcurementEditor`。

## 规则

- 成本口径只在 `lib/floor-plan` 里算一次，侧栏、报告、AI 都用同一套。
- 项目内改价回车即刻生效（乐观写入账号默认价，失败回滚）。
