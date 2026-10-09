# 删墙后把两侧房间并成一间

## Context

用户反馈：删掉两间房间之间的墙后，两个空间没有合并，中间还留着那面墙占的地面（一条墙带宽的空隙）。

已核对的现状（`model` 层）：

- 删墙链路：`removeWall`（`model/wallRemoval.ts:7`）= 删墙 + 删墙上门窗 + `rebuildRooms` + `dropOpenRooms`。
- `rebuildRooms`（`model/geometry.ts:135`）只对 `template === 'blank'` 生效（按外框减隔墙重算房间）：空白户型删隔墙本来就连成一间；参考户型与 AI 户型（都是 `template === 'reference'`）直接返回原设计，房间一动不动。
- `dropOpenRooms`（`model/roomEnclosure.ts:58`）只删「与室外连通」的房间，从不合并。
- 房间 `rings` 是**净空**轮廓（贴墙面），墙带在环之外，所以删墙后两间净空环之间正好隔着被删墙的墙带 → 看起来没合并。

用户已确认的规则：

1. 室内隔墙：两侧房间 + 这面墙的墙带并成一间，名称 / `mat` / `wallMat` / `roofMat` / `roofSlope` / `ceilingMat` / `counted` 取**面积较大**的那一间，另一间从房间列表删除；房间顺序保持较大那间原来的位置。
2. 墙的两侧是同一个房间（墙垛缺口）：只把该房间环与墙带并集，补上缺口。
3. 墙不在房间之间、或一侧没有房间（外围墙、外圈、夹在别的墙带里）：保持现状。
4. 删外围墙 / 外墙：**房间原样保留**，不再因为「区域开敞」而删除房间（现在删空白户型外围墙会把唯一房间删掉，导致「方案格式不正确」报错；参考户型删顶墙会丢「小孩房」）。画墙 / 改墙时的自动清理（`syncRooms`，`model/roomFollow.ts:183`）不动。

### 用户截图（三个洗澡间）的真实数据核对

读 `interior_design_projects.state`（项目「一层后」，13 个房间，改动前最后保存于 15:18）：

- 截图那三个洗澡间就是 `洗澡间 3`（2.04 m²，x 0–2040 / y 10965–11965）、`洗澡间`（1.23 m²，x 0–953 / y 12205–13500）、`洗澡间 4`（1.10 m²，x 1193–2040 / y 12205–13500）。
- 这个角上**一面隔墙都没有**：唯二相邻的墙是 `e66637c9`（`exterior`，左，x −120）与 `bottom-end` / `3b6d7645`（`exterior`，下，y 13620），就是截图里那两条厚灰墙。外墙在 y 12090、x 1070 处被切成两段，正是这些洗澡间以前那圈隔墙留下的接缝。
- 这一片房间（三个洗澡间 + `院子` + `堂屋` …）彼此连通，而现在的 `removeWall` 会 `dropOpenRooms(after)`（不带 before）：删掉一面外墙就让整片区域跟室外连通 → **一次删掉一大片房间**，正是用户担心的「这些房间是不是也就没了」。规则 4 直接针对它：删墙只删墙，房间一律保留，所以截图里这些洗澡间不会被删掉（它们没有隔墙，也不会触发合并）。

## 方案

### 1. 新增 `src/features/interior/model/roomMerge.ts`

导出 `mergeRoomsAcrossWall(d: Design, wall: Wall): Design`：

- 空白户型直接返回原对象（房间按外框重算，删墙后本来就连成一体；不做二次并集，避免等价变换改动既有坐标）。
- 两侧探测：沿墙中心线取 5 个比例位置（`0.5 / 0.35 / 0.65 / 0.2 / 0.8`，避开墙端接缝）× 法向两侧各 3 个距离（`thickness / 2 + 40 / 150 / 400`，先试近的），用现成的 `inRoom`（`geometry.ts:65`）得到「左侧房间集合 / 右侧房间集合」（按 id 去重）。多比例采样是为了绕过「墙端接缝、以及紧邻的其它墙带把探测点挡住」的情况。
- `participants = 左 ∪ 右`：
  - 空 → 返回原对象（墙不在房间之间 / 一侧没有房间）。
  - 恰好 1 间、且左右两侧探到的都是它 → 只补缺口：`union(room.rings, [wallPoly(wall)])` 写回该房间。
  - ≥2 间 → `union(...各房间 rings, [wallPoly(wall)])` 并成一间：`area()`（`geometry.ts:25`）最大的一间保留原 id、名称、材质、计价开关与在 `rooms` 中的位置（只替换 `rings`），其余房间从 `rooms` 删除。
- 安全阀：并集结果必须是**单一多边形**（`polygonClipping.union` 返回 `length === 1`）、每个环 ≥3 点；否则视为「无法安全合并」，原样返回（两侧房间若仍被别的墙隔开就不会乱并）。并集输出按 `roomFollow.ts` 的 `openRing` 规则去掉首尾重复点。

### 2. 修改 `src/features/interior/model/wallRemoval.ts`

- `removeWall` 改为 `mergeRoomsAcrossWall(rebuildRooms({...}), wall)`，**去掉 `dropOpenRooms` 调用与 import**（规则 4：删墙只删墙与墙上门窗）。更新函数注释：房间不再因为区域开敞被删除。

### 3. 测试

新增 `src/features/interior/model/roomMerge.test.ts`（手工 fixture：`blankDesign()` 的四面外围墙 + 自绘隔墙，`template` 改成 `'reference'`，房间环按净空手写，复用 `rect` / `area` / `validateDesign`）：

- 两侧各一间 → 并成一间：房间数 -1、保留面积较大者的 id/name/mat、`rooms` 顺序不变、`area ≈ 两间面积 + 墙带面积`、单一多边形、`validateDesign` 往返相等。
- 同侧同一间（房间环里带一个墙垛洞）→ 只补缺口：房间数与 id/name 不变、面积增加 ≈ 墙带面积。
- 一侧没有房间（外围墙）→ 返回同一个对象（`toBe`）。
- 空白户型 → 返回同一个对象（`toBe`）。

更新 `src/features/interior/model/wallRemoval.test.ts`：

- 原用例「外围墙与参考户型的隔墙、外墙、矮墙都可删除」：保留空白户型删 `outer-0` 后 `validateDesign` 通过（规则 4 让它恢复）；墙 / 门窗删除断言保留；外墙分支断言 `rooms` 与原来同引用（规则 4），隔墙 / 矮墙的房间断言移到下面两条。
- 参考户型逐面删墙的性质用例：对每面可删墙（`!isBearingWall`）断言 `validateDesign` 往返相等、保留房间的 id 顺序是参考房间顺序的子序列、房间数只减不增、发生合并时面积 ≈ 被并房间之和 + 墙带面积，且至少有一面墙真的触发合并。

## 关键文件

- 新增：`src/features/interior/model/roomMerge.ts`、`src/features/interior/model/roomMerge.test.ts`
- 修改：`src/features/interior/model/wallRemoval.ts`、`src/features/interior/model/wallRemoval.test.ts`
- 复用不改：`geometry.ts` 的 `wallPoly` / `inRoom` / `area` / `length`、`roomEnclosure.ts`（`syncRooms` 继续使用）、`wallPolicy.ts` 的 `canDeleteWall` / `isBearingWall`
- 不动：`roomEnclosure.ts`、`roomFollow.ts`、`wallFaces.ts`（另一个会话在改）；`Workbench.tsx` / `SelectionEditor.tsx` 调用方式不变

## Implementation checklist

- [x] 新增 `roomMerge.ts`：`mergeRoomsAcrossWall` + 两侧探测（实际改为沿墙每 200 mm × 3 个法向距离，按 id 去重，见实施备注）
- [x] 空白户型短路：返回传入的同一个 design 对象
- [x] 一侧没有房间 → 返回原对象；两侧同一间 → 并集补缺口；≥2 间 → 并成一间并取较大者属性与位置
- [x] 并集安全阀：单一多边形 + 每环 ≥3 点，否则原样返回
- [x] `wallRemoval.ts`：接入 `mergeRoomsAcrossWall`，移除 `dropOpenRooms` 调用与 import，更新注释
- [x] 新增 `roomMerge.test.ts` 的 4 条用例
- [x] 更新 `wallRemoval.test.ts`：外墙保留房间 + 参考户型逐面删墙性质用例

## Verification checklist

- [x] `pnpm exec vitest run src/features/interior/model/roomMerge.test.ts src/features/interior/model/wallRemoval.test.ts` 全绿（`wallRemoval.test.ts` 此前两条既有红灯因规则 4 恢复）
- [x] `pnpm exec vitest run src/features/interior` 全量：除另一个会话的 `dimensionWallEdit` 红灯外无新增失败
- [x] 正向：参考户型删「客卫浴 / 餐厅」之间的隔墙（`w34`）→ 房间数 -1、「餐厅」保留且面积 ≈ 原两间 + 墙带；删 `w26`（下一侧埋在别的墙带里）→ 房间原样
- [x] 负向/边界：空白户型删自绘隔墙仍是 1 间；删外围墙（空白 `outer-0`、参考 `w2`）房间原样保留且 `validateDesign` 通过；承重墙 / 最后一面墙的既有报错文案不变
- [x] 反跑校验：临时让 `mergeRoomsAcrossWall` 直接返回原设计（等于关掉合并）后，3 条合并用例 + 参考户型逐面删墙用例共 4 条失败，确认用例不是空跑（已改回，未留在仓库）
- [x] 真实数据回归（项目「一层后」的 state）：分别删 `left-0`（左外墙）与 `bottom-end`（下外墙）——改动前统计被连带删掉的房间数（预期整片洗澡间 / 院子 / 堂屋），改动后断言房间原样保留、`validateDesign` 通过；再用截图那三个洗澡间核对「删墙后它们还在，且面积 / 名称不变」（临时脚本按计划删除，不留在仓库）
- [x] `pnpm lint` 无新增 error；`pnpm run build` 通过
- [ ] 未验证（需人工点击）：2D 编辑界面里删两间之间的隔墙 → 并成一间、无缝隙、可撤销；删外围墙 → 房间还在。截图工具无法代替点击操作，只能靠模型层用例覆盖

## 实施备注

- 签名为 `mergeRoomsAcrossWall(after, before, wall)`：墙带用删墙前的 `connectedWallPoly` 斜接轮廓；两侧各加宽 50 mm 容差（限制在参与房间的外接矩形内），再减去剩余墙体，避免并进墙里。真实数据里房间环与墙面常差约 10 mm，不加容差时 3 面墙无法合并。
- 探测改为沿墙每 200 mm 采样（两端各让出一个墙厚），长墙一侧挨着多间房时都能探到（例：「一层后」x≈7380 的长隔墙，院子并入楼梯间 / 厨房 / 房间5）。
- 真实数据回归：「一层后」删 `left-0` / `bottom-end`，旧逻辑各连带删掉 5 个房间（含截图 3 个洗澡间）；新逻辑 13 间全保留，洗澡间面积 2.04 / 1.23 / 1.10 不变。
- 全量 `vitest src/features/interior`：644 通过，仅 `dimensionWallEdit` 一条既有红灯（另一个会话）；`wallRemoval.test.ts` 原来的红灯已恢复。lint 0 error；build 通过；tsc 仅剩 `wallFaces.ts:37` 既有错误。
