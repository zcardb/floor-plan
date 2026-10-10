# 墙身悬停点与绘墙落点按全局步进移动

## 背景
选择模式悬停墙身时，圆点和「到两端距离」目前直接取鼠标在墙中心线上的投影，读数是 2.07 m 这类任意值。这个点同时也是单击后的绘墙起点。拖动墙、端点、家具和门窗已经按全局拖动步进（`dragStep(design)`，默认 5 cm）取整，这几个点还没有。

## 要做的
1. **悬停圆点和单击起点**：沿墙按步进移动，到墙起点的距离取步进的整数倍。靠近墙终点时直接取终点，所以墙两端都能点到。
2. **绘墙终点**（已确认）：没吸附到端点、洞口边或墙时，新墙长度按步进取整。吸附到确定点时，仍以吸附点为准。
3. **在空白处起笔**：起点坐标按步进对齐网格。
4. 端点和门窗洞口边的吸附优先级、吸附开关的行为都不变。

## 实现
### `src/features/interior/model/wallDrawing.ts`
- 新增 `stepOffsetOnWall(w, offset, step)`：`clamp(snapToDragStep(offset, step), 0, L)`；如果原偏移离 L 更近，就取 L。
- 新增 `steppedPointOnWall(p, w, step): Point`：先用 `nearestOnWall` 求出偏移，按上面的规则取整，再换算回墙上的点。
- `resolveWallHover(raw, d, scale, step)`：增加必填参数 `step`，把现有的 `nearestOnWall(raw, wall).point` 换成 `steppedPointOnWall(raw, wall, step)`。
- 新增 `resolveDrawPoint(raw, d, scale, snap, step, start?)`，内部调用 `resolveWallPoint`：
  - 吸附到 `endpoint` 或 `opening`：原样返回。
  - 已有起点：吸附到 `intersection`（T 形交点）时原样返回；没有吸附时，沿轴向把位移按步进取整（`start + snapToDragStep(Δ)`）。
  - 没有起点：吸附到 `intersection` 时，换成目标墙上的 `steppedPointOnWall`；没有吸附时，x 和 y 分别按步进取整。
- 复用 `dragStep.ts` 里的 `snapToDragStep`。

### `src/features/interior/components/useSegmentDrawing.ts`
- `move()` 中先取 `step = dragStep(design.current)`，悬停改调 `resolveWallHover(p, d, scale, step)`，落点改调 `resolveDrawPoint(p, d, scale, snap, step, chain.current?.start)`。

### `src/features/interior/components/PlanCanvas.tsx`
- `wallStartPoint`：`resolveWallPoint` 吸附到 `endpoint` 或 `opening` 时，返回吸附点；否则返回 `steppedPointOnWall(p, wall, dragStep(current.current))`，目标是被悬停或单击的那面墙。悬停圆点和单击起点因此始终是同一个点。

## Implementation checklist
- [ ] 在 `wallDrawing.ts` 中新增 `stepOffsetOnWall`、`steppedPointOnWall`，靠近墙终点时取 L
- [ ] `resolveWallHover` 增加 `step` 参数，按步进取整沿墙偏移
- [ ] 新增 `resolveDrawPoint`：吸附点优先；有起点时轴向长度取整；无起点时按墙或网格取整
- [ ] `useSegmentDrawing.move()` 改用 `dragStep(design.current)` + `resolveWallHover` / `resolveDrawPoint`
- [ ] `PlanCanvas.wallStartPoint` 在非端点、非洞口吸附时改用 `steppedPointOnWall`
- [ ] 更新 `wallDrawing.test.ts` 和 `WallHoverOverlay.test.tsx` 中 `resolveWallHover` 的调用（传入 50）

## Verification checklist
- [ ] 正向：竖墙 a=[2000,0]，悬停 raw=[1950,1823]，step=50 时得 [2000,1800]，step=100 时也得 [2000,1800]
- [ ] 边界：墙长 3020，raw y=3015 时得 3020（终点）；raw y=-50 时得 0
- [ ] 绘墙：起点 [500,1000]、raw [1234,1010]、无吸附时，终点得 [1250,1000]
- [ ] 绘墙：落点吸附到端点或洞口边时，坐标与 `resolveWallPoint` 完全一致（不取整）
- [ ] 空白起笔：raw [512,988] 得 [500,1000]；关闭吸附时仍按步进取整
- [ ] 现有的 wallDrawing 和 WallHoverOverlay 测试全部通过
- [ ] 运行 `pnpm vitest run src/features/interior`、`pnpm lint`、`pnpm run build`
