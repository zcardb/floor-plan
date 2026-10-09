# AI 创建户型：支持不规则外轮廓（不再强制补成矩形）

## Context

用户输入不规则户型（L 形、凹凸、缺角），生成结果仍被补成方方正正的矩形。原因不只在提示词：

- `supabase/functions/interior-ai-design/index.ts` 的 `PLAN_CONTRACT` 写着「外墙固定是矩形，由系统生成，名字为 top / right / bottom / left」，模型根本没有地方表达不规则外轮廓。
- `src/features/interior/data/floorplanBuilder.ts` 的 `outline(width, depth, t)` 只会沿 `width × depth` 生成四面外墙；即使模型的房间是 L 形，外墙仍是整块矩形。

下游已能处理任意外墙：AI 方案的 `template` 是 `"reference"`，不走 `rebuildRooms / resizeBlank`；平面、3D、尺寸标注、缩略图都按墙段几何绘制（DXF 导入就是任意外墙）。所以只需打通「提示词 → 模型输出 → 前端清洗 → 建墙」这一条链路。

## 方案：新增可选 `outline`（外轮廓内侧顶点）

**约定**：矩形户型不输出 `outline`，行为与现在完全相同（外墙名 `top/right/bottom/left`，内置模板不受影响）。不规则户型输出 `outline`：外轮廓内侧（室内净轮廓）的顶点数组，横平竖直、按顺序首尾相连、全部落在 `0–width × 0–depth`；外墙沿它生成，第 k 条边（第 k 点 → 第 k+1 点，最后一点回到第 1 点）命名为 `e1、e2…`，门窗用这个名字引用外墙，`at` 仍是世界坐标（横墙给 x，竖墙给 y）。

### 1. `src/features/interior/data/floorplanBuilder.ts`
- `PlanSpec` 增加 `outline?: Point[]`（注释说明含义与 `e1…` 命名）；导出 `outlineEdgeKey = (i: number) => \`e${i + 1}\``。
- 新增 `polygonOutline(ring, t): Axis[]`：按有符号面积判断朝向，每条边沿外法线偏移 `t/2` 得墙中心线，两端各伸出 `t/2` 补转角（与现有矩形外墙同一做法；凹角处的伸出段落在相邻外墙体内，不侵入室内）。
- `buildStructure` 里 `spec.outline ? polygonOutline(...) : outline(...)`；`innerAxis` 不变（内墙顶到不规则外墙时多伸出的 60mm 落在外墙体内）。

### 2. `src/features/interior/ai/sanitize.ts`
- 新增 `parseOutline(raw, width, depth)`：≥4 个点，坐标 `round10(clamp(...))` 到 `0–width × 0–depth`，每条边必须横平或竖直且长度 ≥ `MIN_WALL_LENGTH`（600），面积 ≥ 一定下限；任一不满足 → 返回 `undefined`（退回矩形，保证仍能出方案）。不去除共线点，保证 `eK` 与模型给的序号一致。
- 外墙保留名：有 `outline` 时为 `e1…eN`，否则 `top/right/bottom/left`；内墙 key 撞保留名照旧丢弃。
- `spanOf` 支持 `eK`：返回该边沿走向的 `[min, max]`；门窗方向判断 `horizontal` 同步支持 `eK`。
- 返回的 `PlanSpec` 带上 `outline`。

### 3. `supabase/functions/interior-ai-design/index.ts`（改完重新部署）
- `PLAN_CONTRACT`：
  - 去掉「外墙固定是矩形」；输出约定里加 `outline` 字段说明与示例（L 形），写明矩形户型不输出 `outline`、外墙名 top/right/bottom/left；不规则户型外墙名 e1、e2…。
  - 理解需求一节补一句：用户描述或参考图是 L 形、凹凸、缺角等不规则外形时，按原外形输出 `outline`，不要补成矩形。
- `SIZE_LINE`：说明 `width / depth` 是外轮廓外接矩形的长宽。
- `validatePlan`：解析可选 `outline`（同上规则，不合法 → soft 提示让模型修）；外墙名集合按有无 `outline` 切换；外墙门窗范围按对应边计算；窗只能开在外墙、入户门在外墙的判断沿用新集合。

### 4. 测试
- 新增 `src/features/interior/data/floorplanBuilder.test.ts`：L 形 `outline` 生成 6 面外墙（`e1…e6`），中心线在内侧外偏 `t/2`；外墙 `e2` 上的窗落在正确位置；不传 `outline` 时仍是 `top/right/bottom/left` 四面墙。
- `src/features/interior/ai/ai.test.ts`：`sanitizePlan` 保留合法 L 形 `outline`、门窗引用 `eK` 被保留；斜边 / 点数不足的 `outline` 被忽略回退矩形、引用 `eK` 的门窗被丢弃；`planToDesign` 的结果外墙不是 4 面。

## 关键文件
- `src/features/interior/data/floorplanBuilder.ts`
- `src/features/interior/ai/sanitize.ts`
- `supabase/functions/interior-ai-design/index.ts`

## Implementation checklist
- [x] `PlanSpec.outline?: Point[]` 与 `outlineEdgeKey` 导出
- [x] `polygonOutline` 按朝向外偏 `t/2`，凸角伸出 `t`、凹角不伸（与矩形外墙一致），`buildStructure` 有 `outline` 时用它，无 `outline` 时走原 `outline()`
- [x] `sanitize.ts` 的 `parseOutline` 校验横平竖直 / 范围 / 最短边，非法时返回 `undefined`
- [x] `sanitizePlan` 的外墙保留名、`spanOf`、门窗 `horizontal` 判断支持 `eK`，结果带 `outline`
- [x] 后端 `PLAN_CONTRACT` 去掉「外墙固定是矩形」，加入 `outline` 字段说明、L 形示例与「不要补成矩形」
- [x] 后端 `SIZE_LINE` 说明 width / depth 是外接矩形
- [x] 后端 `validatePlan` 支持 `outline` 与 `eK` 外墙名，窗 / 入户门判断用新外墙集合
- [x] 新增 / 更新 `floorplanBuilder.test.ts`、`ai.test.ts`
- [x] 重新部署 `interior-ai-design`

## Verification checklist
- [x] `pnpm exec tsc --noEmit`、`pnpm lint` 无新错误
- [ ] `pnpm test`：新增用例全部通过（L 形外墙、`eK` 门窗、非法 outline 回退、矩形 outline 与原矩形几何一致）；另有 2 个失败来自同期合并的 `9916530`（wallRemoval / roomFollow），与本改动无关。原文：L 形 6 面外墙、`eK` 门窗保留、非法 `outline` 回退矩形、无 `outline` 仍为 top/right/bottom/left
- [x] `pnpm run build` 通过
- [x] 内置户型模板（无 `outline`）生成结果不变：现有 `templates` 相关测试不需改动即通过
- [x] 部署后预检请求返回 `ok`，未带登录的请求返回 401
- [ ] 人工确认（需登录与 AI 额度）：描述「L 形户型，长 12 m × 宽 10 m，右上角缺 4 m × 3 m」或上传不规则户型图，生成方案外墙为不规则轮廓而不是矩形；描述普通矩形户型时仍正常
