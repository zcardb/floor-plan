# 3D 场景：加载提速、房间切换、漫游修复

## 背景
对照参考站 wy51ai.github.io/floorplan-3d，当前项目有三处问题：
1. **进入 3D 很慢/几乎进不去**：点击「3D 场景」后才开始下载 three 模块（约 570KB），下载期间只有按钮转圈；进入后首帧要同步编译全部着色器，并且每一帧都重算 PCFSoft 阴影贴图、渲染上千个小网格（每件家具由几十个 box 组成，书架/婴儿床各 80+），低配设备首帧卡死、后续掉帧。
2. **缺少房间切换**：参考站左栏有「房间 · 点击飞到该房间」列表（房间名 + 面积 + 全屋）。我们只有选中房间时 `scene.room()` 生硬跳镜头，没有入口。
3. **漫游不可用**：控制台反复报 `SecurityError: requestPointerLock ... sandboxed`。`walk.lock()` 同步抛错，`pointerlockerror` 回调不会触发，点「点击开始漫游」没有任何反应。另外：起点固定为 `rooms[0]` 中心且朝 +X（常常落在阳台或面对墙）；墙体碰撞跳过线段端点（墙角可穿墙）；不支持方向键。

## 方案

### 1. 加载提速（`Workbench.tsx`、`Scene3D.tsx`、`scene/furniture.ts`）
- **空闲预加载**：Workbench 挂载后用 `requestIdleCallback`（回退到 `setTimeout`）提前 `import("../scene/Scene3D")`，并缓存同一个 promise；`toggleView` 复用它，点击时基本是即时的。
- **先切视图再加载**：点击 3D 立即 `setView("3d")`，舞台显示现有的 `.scene-loading` 占位；模块就绪后再挂载 Scene。加载失败时退回 2D（保留现有提示文案）。
- **首帧不卡顿**：Scene 构建完场景后先 `await renderer.compileAsync(scene, camera)` 再开始渲染循环，期间保留加载遮罩；新增 `onReady` 回调，Workbench 收到后才隐藏遮罩。
- **阴影按需更新**：`shadowMap.autoUpdate = false`，只在以下时机把 `needsUpdate` 置为 true：重建建筑/家具、光照或时间变化、门开合动画进行中、拖动家具。阴影类型由 `PCFSoftShadowMap` 改为 `PCFShadowMap`（r180 已弃用 PCFSoft）。
- **合并家具网格**：`buildFurniture` 最后按材质用 `BufferGeometryUtils.mergeGeometries` 把同一家具的子网格合并（先应用各子网格的局部矩阵），draw call 从「每件几十个」降到「每件几个」。外层 group 及其 `userData.fid`、`scale.y` 高度缩放、BoxHelper 选中框、拾取逻辑都不受影响；玻璃等透明材质单独保留。
- 去掉 `preserveDrawingBuffer: true`（`shot()` 已在 `drawImage` 前同步调用 `render`，截图不受影响）。

### 2. 房间切换（新增 `components/RoomList.tsx`，修改 `Library.tsx`、`Workbench.tsx`、`Scene3D.tsx`）
- `RoomList`：标题「房间 · 点击飞到该房间」，两列网格按钮，每项显示房间名 + `area(room).toFixed(2)` m²，最后一项为「全屋」（计入面积的房间合计）。只列出 `counted !== false` 的房间，当前房间高亮。样式加到 `index.css`，复用 library-item 的 token。
- 放在左侧家具库面板最上方（Library 新增 `rooms` 插槽 prop，由 Workbench 传入）。
- 点击行为：
  - **3D 鸟瞰**：镜头平滑飞到该房间（约 900ms 缓动，相机与 orbit target 同时插值，方向沿用当前视角方位）；「全屋」飞回等轴视角。
  - **3D 漫游**：直接把人传送到该房间中心，保持人眼高度 1.6m，朝向房间较长的方向，仍留在漫游模式。
  - **2D**：选中该房间（沿用现有房间高亮与属性面板）。
- `SceneHandle` 新增 `flyTo(roomId | "all")`，替换现有 `room()` 的瞬间跳转；`select()` 选中房间时也改为调用 `flyTo`。

### 3. 漫游修复（`Scene3D.tsx`）
- `start()` 用 try/catch 包住 `walk.lock()`，并处理 `requestPointerLock` 返回的 promise 被拒绝的情况；失败时（嵌入预览的 iframe、浏览器拒绝）自动进入**拖动视角模式**：按住鼠标拖动转向，WASD/方向键移动，Shift 加速，E 开关门。
- 把现有的 `touch` 状态拆成两个：「免锁定拖动视角」（`free`）和「显示摇杆」（只在粗指针设备上显示），这样桌面端兜底时不会出现摇杆。
- 起点：放在面积最大的计入房间（通常是客厅）中心，朝向房间较长的方向，不再固定 `rooms[0]` + X 方向。
- 碰撞：`blocked()` 把投影参数 t 夹到 [0,1] 内计算到线段的距离，墙端和墙角不再能穿过去；门洞放行逻辑只在 t 落在墙段内时生效。
- 键位加入 ArrowUp/Down/Left/Right、ShiftRight；漫游时方向键 `preventDefault`，避免页面滚动。
- 提示文案根据模式区分：「WASD/方向键移动 · 拖动鼠标转向 · E 开关门」。

## 不改动的部分
2D 编辑、家具外观与尺寸、导出、数据模型、后端。

## 关键文件
- `src/features/interior/scene/Scene3D.tsx`
- `src/features/interior/scene/furniture.ts`
- `src/features/interior/components/Workbench.tsx`
- `src/features/interior/components/Library.tsx`
- `src/features/interior/components/RoomList.tsx`（新增）
- `src/index.css`
- 复用：`model/geometry.ts` 里的 `area`、`center`、`bbox`

## Implementation checklist
- [ ] Workbench 挂载后在空闲时预加载 Scene3D 模块，`toggleView` 复用同一个 promise
- [ ] 点击 3D 立即切换视图并显示 `.scene-loading`，导入失败时退回 2D 并提示
- [ ] Scene3D 在首次构建后执行 `compileAsync`，完成后触发 `onReady`；Workbench 收到前一直显示加载遮罩
- [ ] `shadowMap.autoUpdate=false`，在建筑/家具重建、光照变化、门动画、家具拖动时置 `needsUpdate`；阴影类型改为 PCFShadowMap
- [ ] `buildFurniture` 按材质合并子网格，group 上的 `fid`、`scale.y`、位置和旋转保持不变
- [ ] 移除 `preserveDrawingBuffer`，`shot()` 导出仍然有效
- [ ] 新增 `RoomList.tsx`（房间名、面积、全屋合计、高亮），放在 Library 顶部
- [ ] `SceneHandle.flyTo(id|"all")`：鸟瞰时平滑飞行，漫游时传送到房间中心、眼高 1.6m
- [ ] 2D 下点击房间会选中该房间
- [ ] `walk.lock()` 加 try/catch 和 promise 拒绝处理，失败后进入拖动视角模式
- [ ] `touch` 拆分为 `free` 和摇杆显示，摇杆只在粗指针设备出现
- [ ] 漫游起点改为最大计入房间中心，朝向长边
- [ ] `blocked()` 计算到线段（t 夹到 [0,1]）的距离，墙角无法穿过
- [ ] 支持方向键和 ShiftRight，漫游时方向键阻止页面滚动

## Verification checklist
- [ ] 正向：在预览中点「3D 场景」后，先看到加载占位，随后进入场景且不再无限转圈；鸟瞰拖动流畅
- [ ] 正向：点房间列表里的「厨房」，3D 鸟瞰镜头平滑飞到厨房；点「全屋」回到整体视角
- [ ] 正向：在 iframe 预览中点「点击开始漫游」，进入拖动视角模式，控制台不再出现未捕获的 SecurityError；WASD/方向键可以移动，拖动可以转向
- [ ] 正向：漫游中点「主卧室」，人被传送到主卧内部
- [ ] 默认值：漫游起点在客厅内，不在墙里或户型外
- [ ] 边界：沿墙走到墙角时不能穿墙；门关闭后（E）无法通过，打开后可以通过
- [ ] 边界：2D 下点房间只选中，不切换视图；面积为 0 或不计入的房间不出现在列表里
- [ ] 回归：3D 截图导出正常；选中家具后的 BoxHelper 框和 3D 拖动家具仍然正常
- [ ] 运行 `pnpm run lint`、`pnpm exec tsc --noEmit -p tsconfig.app.json`、`pnpm vitest run src/features/interior`、`pnpm run build`
