# 分割墙段 · 接触点分割

## Context

「分割墙段」现在只有手动输入距离的两种模式（单点 / 两点），输入源在 `WallSplitDialog.tsx`，最多 2 个分割点。实际画图时分割点往往就是**其他墙与这面墙相接的位置**（T 形交接、十字穿过），手量距离既慢又容易和邻墙中心线错开，后续按房间/墙段统计也会对不齐。

本次新增「接触点分割」：自动识别并列出本墙上的接触位置，用户勾选后一次分割，同时保留输入框里的快捷标签，点一下就把该接触点距离填进输入框。已确认的规则：

- 一个接触点 = 1 个分割点，位置取**相接墙中心线**与本墙投影的交点（T 形）。
- 十字穿过的墙（X 形交叉）也算接触点，一并列出。
- 新增第三个模式，且单点/两点输入框下也有快捷标签。

## 设计

### 1. 新模型：接触点识别

新文件 `src/features/interior/model/wallContacts.ts`（沿用 `wallConnections.ts` 的 epsilon 与投影写法）：

```ts
export interface WallContact { offset: number; wallIds: string[]; kind: 'tee' | 'cross'; blocked: boolean }
export function wallContacts(design: Design, wallId: string, minGap = 50): WallContact[]
```

- 只考虑 `!design.demolished.includes(w.id)`、`length(w) > epsilon`、且与本墙**不共线**的墙（共线判定复用 `wallConnections.ts` 的做法：两端点到本墙中心线的平行距离 < epsilon，避免把已分割/同轴的墙段当成接触点）。同轴度用 `cross(direction, p - wall.a)`，再把垂距与本墙半径比较。
- 距离先用 `nearestOnWall(p, wall)`（`geometry.ts`）投影端点，再判断垂距：
  - 端点垂距 ≤ `wall.thickness / 2 + epsilon`（贴面/端部对齐）→ **tee**，offset 取该端点的投影；
  - 中心线相交落在本墙内部（`0..L`）→ **cross**，offset 取交点投影。
- 多个墙落在同一位置（±50 mm）时合并为一条，`wallIds` 收集来源，`kind` 取 `cross` 优先；再吸附到 10 mm（与 `meterDraft` 两位小数一致），按 offset 升序。
- 丢弃 offset 距两端 < 50 mm 的接触点（会生成 0.05 m 以下的碎段）。
- `blocked`：offset 落在本墙任一门窗洞口内部（与 `wallSplit.ts` 第 22 行同一判据，复用 `design.openings.filter(o => o.wallId === wallId)` 的范围）时为 true，作为"列出来但不能勾选"的提示，不产生分割点。

### 2. 放宽分割点数量上限

`src/features/interior/model/wallSplit.ts` 第 9 行 `cuts.length > 2` 改为上限 12：

- 新增导出常量 `export const splitMaxCuts = 12;`，错误文案改为「请输入 1–12 个有效分割距离」。
- 其余校验（递增、每段 ≥ 50 mm、洞口内部、2000 段上限、原子拒绝、按 A→B 方向建段）全部不变，因此每段长度、门窗迁移、承重继承、费用/导出不受影响。
- 同时修掉一处顺带隐患：`intervals = [0, ...points, L]` 目前假定 `cuts` 递增，若调用方给了逆序 cuts，第 40 行门窗归属判定会取到错误区间；在生成 intervals 前对 `points` 做一次升序排序（保持 `cuts` 校验语义不变）。

### 3. 草稿层：接触点 ↔ 距离字符串的映射

`src/features/interior/model/wallSplitDraft.ts` 增加两个纯函数，`WallSplitDialog` 与测试复用：

```ts
export function contactDistance(L: number, offset: number, reversed: boolean): number  // = displayOffset
export function contactSelection(L: number, offsets: number[], distances: number[], reversed: boolean): string[]
```

草稿数值仍以「用户看到的 A 端米制字符串」为准，所以交换 A/B 后已勾选接触点要按新 A 重新计算距离（`contactDistance` 即现有 `displayOffset`，直接复用而不是重复实现）。识别到但被门窗挡住或不满足最小间距的接触点由模型层排除，不在 UI 里出现。

### 4. 对话框 UI

`src/features/interior/components/WallSplitDialog.tsx`：

- `mode` 由 `1 | 2` 改为 `1 | 2 | 'contact'`；分段按钮数组改为 `[1, 2, 'contact']`，标签依次为「单点分割」「两点分割」「接触点分割」；顶部计数文案保持 `得到 {段数} 段 · 全长 {L} m`（接触点模式下由 `draft.intervals.length - 1` 推导，不再用 `mode + 1`）。
- 用 `useMemo(() => wallContacts(design, wallId), [design, wallId])` 缓存识别结果（参照 `WallSplitPreview` 里已完成的做法，避免每次按键重算）。
- 接触点模式主体：一行一个接触点复选按钮，显示「接触点 N」「距 A 0.30 m」「T 形/十字 · 相接 w12」；`blocked` 的项禁用并提示「位于门窗洞口内」。全选/全不选按钮；无接触点时提示「本墙没有其他墙相接，可使用单点或两点分割」。勾选不修改 `first`/`second` 输入草稿，只驱动 `distances`。
- 单点/两点模式下，在输入框下方显示同一条列表的**快捷标签**（同样用 `wallContacts`），点击即 `setFirst`/`setSecond`（按当前模式决定写入点 1 还是点 2），`aria-label` 形如 `填入接触点 1 距离`，沿用现有 `wall-split-hint` 视觉层级。
- 应用：`onApply(draft.cuts, stored)` 不变，`Workbench.tsx` 第 1043–1051 行无需改动（一次 `commit`、一次历史、选中段仍走 `originalSegment`）。

### 5. 预览

`src/features/interior/components/WallSplitPreview.tsx`：新增可选 `contacts?: WallContact[]`，把已识别接触点画成 `data-contact`: 灰底圆点（未选中）与标签，选中的（已在 `intervals` 内）仍走现有 `data-cut` 高亮，保证「示意 = 实际切点」。切点标签布局：≥3 个切点时用上下两行错开（y=44 / y=58），保持现有测试对「标签不出视图」的约束。

### 6. 样式

`src/index.css` 的 `wall-split-*` 段内新增：`.wall-split-contacts`（列表 + 滚动上限）、`.wall-split-contact`（复选行）、`.wall-split-contact.is-active`、`.wall-split-contact[disabled]`、`.wall-split-chips` / `.wall-split-chip`、`.wall-split-map-contact`。全部使用现有语义 token（`--primary` / `--muted-foreground` / `--border` / `--destructive`），不写死颜色，明暗模式都可用。

## 关键文件

- 新增：`src/features/interior/model/wallContacts.ts`
- 修改：`src/features/interior/model/wallSplit.ts`（上限 12 + intervals 升序 + `splitMaxCuts`）
- 修改：`src/features/interior/model/wallSplitDraft.ts`（接触点 ↔ 距离映射）
- 修改：`src/features/interior/components/WallSplitDialog.tsx`（第三模式 + 快捷标签）
- 修改：`src/features/interior/components/WallSplitPreview.tsx`（接触点标记）
- 修改：`src/index.css`（`wall-split-*` 新样式）
- 复用不改：`geometry.ts` 的 `nearestOnWall`/`length`、`wallConnections.ts` 的 epsilon 与共线判据、`lengthUnits.ts` 的 `formatMeters`/`meterDraft`/`parseMeterDraft`

## 测试

- 新增 `src/features/interior/model/wallContacts.test.ts`：T 形交接识别为一个接触点；十字穿过识别为 `cross`；共线已分割墙段**不**算接触点；贴面端点超出半厚时不算；间隔 < 50 mm 的两处合并；端点 50 mm 内被丢弃；洞口内部标记 `blocked`；已拆除墙不参与；`blankDesign()` 外围角点行为符合预期。
- 扩展 `src/features/interior/model/wallSplit.test.ts`：3 个以上分割点成功建段且总长/洞口/费用等价于原墙；13 个点被拒绝且原设计不变；门窗迁移在多点下仍完整。
- 扩展 `src/features/interior/model/wallSplitDraft.test.ts`：交换 A/B 后接触点距离按新 A 重算，往返一次恢复。
- 扩展 `src/features/interior/components/WallSplitDialog.test.tsx`（沿用手写 `useState` 桩 + `nodes()` 递归遍历）：切到「接触点分割」列出接触点、勾选后 `预览 intervals` 与 `onApply` 的 cuts 正确、`blocked` 项点不动、快捷标签写入点 1/点 2、取消不提交。
- 扩展 `src/features/interior/components/WallSplitPreview.test.tsx`：接触点渲染为 `data-contact`，选中项与 `data-cut` 对齐，标签仍在视口内。

## Implementation checklist

- [ ] `wallContacts.ts` 导出 `WallContact` 与 `wallContacts`，含 tee/cross/合并/吸附/最小间距/洞口 `blocked` 规则
- [ ] `wallSplit.ts` 导出 `splitMaxCuts = 12`，上限校验替换为 12，错误文案同步
- [ ] `wallSplit.ts` 生成 `intervals` 前对分割点升序排序，门窗归属判定用升序区间
- [ ] `wallSplitDraft.ts` 导出 `contactDistance` / `contactSelection`，交换 A/B 后距离按新 A 计算
- [ ] `WallSplitDialog.tsx` 支持 `mode = 'contact'`，计数文案由 intervals 推导，识别结果用 `useMemo` 缓存
- [ ] `WallSplitDialog.tsx` 接触点模式下勾选驱动 `distances`，`blocked` 项禁用并给出洞口提示，无接触点给出空状态文案
- [ ] `WallSplitDialog.tsx` 单点/两点模式下渲染接触点快捷标签并写入对应输入框
- [ ] `WallSplitPreview.tsx` 接受 `contacts` 并渲染 `data-contact`，≥3 切点标签错行
- [ ] `index.css` 新增 `wall-split-contact*` / `wall-split-chips` / `wall-split-map-contact`，仅用语义 token
- [ ] `Workbench.tsx` 分割入口无需改动（确认 `onApply` 签名兼容）

## Verification checklist

- [ ] 正向：`pnpm exec vitest run src/features/interior` 全绿，含新增 `wallContacts.test.ts` 与三处扩展用例
- [ ] 正向：打开一面有 T 形交接的外围墙，「接触点分割」列出全部接触点，勾选 2–3 个后应用，墙段数、每段长度、选中段与预览一致
- [ ] 正向：切换「交换 A/B」后接触点显示距离镜像，勾选集合不变，应用的 cuts 与显示一致
- [ ] 正向：单点/两点模式下点快捷标签，输入框出现对应距离且 `intervals` 立即更新
- [ ] 负向：接触点落在门窗洞口内时该行禁用并给出提示，无法勾选，`应用分割` 不产生非法 cuts
- [ ] 负向：无其他墙相接的孤立墙显示空状态文案，仍可用手输距离分割
- [ ] 边界：同一位置 ±50 mm 的两个接触点合并为一行；端点 50 mm 内不出现接触点；13 个分割点被拒绝且报错为 1–12 文案
- [ ] 边界：分割点落在洞口边缘 ±10 mm 时按现有规则吸附至洞口边，门窗仍完整迁移
- [ ] 回归：`splitWall` 既有用例（方向、几何、承重继承、费用、导出、2000 上限、原子拒绝）全部通过
- [ ] 构建：`pnpm run build` 与 lint 通过；`pnpm exec tsc -p tsconfig.app.json --noEmit` 无类型错误
- [ ] 视觉：在 preview 中以 390 宽与 1280 宽查看该弹窗，接触点列表、快捷标签与预览均不溢出、不截断
