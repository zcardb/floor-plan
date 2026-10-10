# 移除左侧面板的「房间」快捷切换列表

## Context

左侧家具库顶部目前有一块「房间 · 点击飞到该房间」的两列卡片列表（`RoomList`），列出各房间名称 + 面积，外加一项「全屋」合计。用户反馈这个房间选择能力没必要，要求直接删除。

删除后不丢失任何独有能力：

- 2D 视图里点击画布中的房间仍会选中该房间；
- 3D 视图里选中房间时 `select()`（`Workbench.tsx:373`）依旧调用 `scene.current?.flyTo(s.id)`，飞行动画保留；
- 「适应窗口 / 全屋」由工具栏 F 键与「适应窗口」按钮（`Workbench.tsx:1221-1228`）承担。

## 实施方案

### 1. 删除组件文件

- 删除 `src/features/interior/components/RoomList.tsx`（该文件仅被 `Workbench.tsx` 引用）。

### 2. `src/features/interior/components/Workbench.tsx`

- 删除 `import { RoomList } from "./RoomList";`（第 106 行）。
- 删除传给 `<Library>` 的 `rooms={ <RoomList ... /> }` 属性块（第 1045-1051 行）。
- 删除 `focusRoom` 函数（第 390-398 行）——它只服务 RoomList。
- 删除 `roomFocus` 状态（第 198 行中的 `[roomFocus, setRoomFocus] = useState<string | null>(null),`）。确认无其他引用后再删，避免留下未使用变量触发 lint。

### 3. `src/features/interior/components/Library.tsx`

- 删除可选的 `rooms?: ReactNode` 属性声明与顶部 `{rooms}` 渲染（第 47-48、57 行）。
- 若 `ReactNode` 类型不再被使用，同步从 `import { useState, type ReactNode } from "react";` 中移除该类型导入。

### 4. `src/index.css`

- 删除 `.room-list`、`.room-list-heading`、`.room-list-grid`、`.room-list-grid button`（含 `:hover`、`.active`）、`.room-list-grid b`、`.room-list-grid small` 共 9 条规则（第 1852-1901 行），避免留下死样式。

### 不改动

- `Scene3D.tsx` 的 `flyTo`（仍被房间选中路径使用）。
- `Library.tsx` 的其余内容、`PlanCanvas`、成本/房间相关的其他面板。
- 不新增任何替代 UI。

### 关键文件

- `src/features/interior/components/RoomList.tsx`（删除）
- `src/features/interior/components/Workbench.tsx`
- `src/features/interior/components/Library.tsx`
- `src/index.css`

## Implementation checklist

- [ ] 删除 `RoomList.tsx`
- [ ] `Workbench.tsx`：移除 RoomList import、`rooms={...}` 传参、`focusRoom` 函数、`roomFocus` 状态
- [ ] `Library.tsx`：移除 `rooms` 属性与渲染，清理不再使用的 `ReactNode` 导入
- [ ] `index.css`：移除 `.room-list*` 全部规则

## Verification checklist

- [ ] `grep -rn "RoomList\|room-list\|roomFocus\|focusRoom" src` 无残留引用（except 已删除文件）
- [ ] `pnpm run lint` 通过（无未使用变量 / 未使用导入报错）
- [ ] `pnpm test` 通过（现有 interior 组件测试不回归）
- [ ] `pnpm run build` 通过
- [ ] 浏览器打开编辑器：左侧面板顶部不再出现「房间 · 点击飞到该房间」区块，家具库从「构件与家具」标题开始
- [ ] 正向：2D 点击画布中的房间仍能选中；3D 选中房间仍执行飞行动画
- [ ] 边界：切到 3D / 漫游模式、以及 2D 下点击空白处，均无报错（控制台无异常）
- [ ] 响应式：移动端抽屉展开家具库时顶部同样不再出现该区块
