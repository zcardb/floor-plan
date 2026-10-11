# 首屏加载提速：先出 2D 页面和数据，3D 最后加载

## 背景
默认是 2D 编辑，但首屏要下载一个 **1.56 MB（gzip 约 500 KB）** 的主包，里面有很多首屏用不到的代码：
- Markdown 渲染全家桶（react-markdown + remark-gfm，原始约 500 KB），只在「小助手」编辑弹窗里用；
- DXF 解析库 dxf-parser（约 72 KB），只在导入 DXF 时用；
- 账号管理页（AccountCMS：项目管理 / 家具管理 / 小助手等）、登录弹窗、AI 侧栏、各种编辑弹窗（拆墙、尺寸、自定义家具、AI 房间）。

3D（three.js 约 700 KB）已经是按需加载，但现在 Workbench 一挂载就用 `requestIdleCallback(timeout 4000)` 预加载，会和首屏的页面资源、项目/家具数据请求抢带宽。

目标：首屏只加载 2D 编辑器 + 项目/家具数据；首屏完成并空闲后再静默预加载 3D；用户若在此之前点 3D，照常立即加载。

## 方案

### 1. 3D 预加载推迟到首屏之后（`Workbench.tsx`）
- 把现有预加载 effect 改为：等 `window` 的 `load` 事件（已 complete 则直接继续）→ 再 `requestIdleCallback`（无该 API 时 `setTimeout`）→ 调用现有 `loadScene()`。
- 「2D / 3D」切换里的 3D 按钮加 `onPointerEnter` / `onFocus` 触发 `loadScene()`（意图预取），保证首屏后马上点 3D 也快。
- `loadScene` 的单例 promise、失败重试逻辑保持不变。

### 2. 首屏用不到的模块改为按需加载（`React.lazy` + `Suspense`）
- `src/pages/Index.tsx`
  - `AccountCMS` 改 lazy，`Suspense` 兜底复用现有 `ManagementLoading`（与当前 loading 一致）。
  - `AuthDialog` 改 lazy，且只在第一次打开后才挂载（之后保持挂载，关闭动画不受影响）。
- `src/features/interior/components/Workbench.tsx`
  - `AiChatPanel`（仅侧栏为 `ai` 时渲染）、`WallSplitDialog`、`DimensionEditDialog`、`CustomFurnitureDialog`、`AiRoomDialog` 改 lazy，只在打开时渲染；`Suspense` 兜底为 `null`（弹窗类）或侧栏内的小加载态。
- `src/features/interior/components/AssistantDialog.tsx`
  - Markdown 预览抽成新文件 `AssistantMarkdown.tsx`（内含 react-markdown + remark-gfm），在 AssistantDialog 中 lazy 引入，预览区兜底显示纯文本。
- DXF 解析
  - 把 `readDxfSource`（和 `dxf-parser` 的 import）从 `model/externalDxf/dxfSource.ts` 移到新文件 `model/externalDxf/readDxf.ts`；`dxfSource.ts` 只保留类型、单位常量和 `unitMm`（`recognize.ts`、DXF 弹窗等仍从这里引用）。
  - `model/designImport.ts` 的 `parseDesignFile`（本来就是 async）在 DXF 分支里 `await import('./externalDxf/readDxf')`。

### 3. 第三方库分包，利于并行下载和缓存（`vite.config.ts`）
- `build.rollupOptions.output.manualChunks`：`react` / `react-dom` / `react-router` → `vendor-react`；`@supabase/*` → `vendor-supabase`；`@radix-ui/*`、`@floating-ui/*` → `vendor-ui`。three 不放入任何首屏分包（保持随 3D 按需加载）。

### 不改动
- 2D 编辑、数据加载顺序、项目恢复逻辑、3D 状态机（`useSceneLifecycle`）和界面样式都不变。
- 工作区里现有未提交的成本模块改动（`CostHero.tsx` 已删除、`CostPricing.tsx` / `CostSummary.tsx` 新增）目前会让构建报错，这些不属于本次范围，我不会动；如果最后构建仍因它们失败，我会单独告诉你。

## Implementation checklist
- [x] `Workbench.tsx`：3D 预加载改为「window load → 空闲」后才调用 `loadScene()`，卸载时清理监听 / idle 回调
- [x] `Workbench.tsx`：3D 按钮 `onPointerEnter` / `onFocus` 触发 `loadScene()` 预取
- [x] `Index.tsx`：`AccountCMS` 改 lazy + `Suspense`（兜底 `ManagementLoading`）
- [x] `Index.tsx`：`AuthDialog` 改 lazy，首次打开后才挂载
- [x] `Workbench.tsx`：`AiChatPanel`、`WallSplitDialog`、`DimensionEditDialog`、`CustomFurnitureDialog`、`AiRoomDialog` 改 lazy 且仅在打开时渲染
- [x] 新建 `AssistantMarkdown.tsx`，`AssistantDialog.tsx` lazy 引入，主包不再包含 react-markdown / remark-gfm
- [x] 新建 `model/externalDxf/readDxf.ts` 承载 `readDxfSource` + `dxf-parser`；`designImport.ts` 动态导入；主包不再包含 dxf-parser
- [x] `vite.config.ts`：加 `manualChunks`（vendor-react / vendor-supabase / vendor-ui），three 不进首屏分包
- [x] 同步更新受影响的测试（如有对上述组件同步渲染的断言，改为 `findBy*` 等待 lazy 加载）

## Verification checklist
- [x] 生产构建对比：主入口 JS 体积明显小于当前的 1,557 KB（gzip 500 KB），记录前后数字
- [x] 构建产物里 react-markdown、dxf-parser、AccountCMS、three 都不在首屏入口及其静态依赖中（看 `dist/.vite/manifest.json` 的入口 imports）
- [ ] 首屏（游客 + 已登录）打开后，网络面板在页面 load 之前没有请求 `three` / `Scene3D` 分包；load 并空闲后才出现（未在真实浏览器网络面板中验证，由代码逻辑保证）
- [ ] 首屏后立刻点「3D」：正常显示加载遮罩并进入 3D；断网时仍提示「3D 引擎加载失败」并留在 2D
- [ ] 打开：项目管理 / 家具管理 / 小助手页、登录弹窗、AI 侧栏、拆墙 / 尺寸 / 自定义家具 / AI 房间弹窗、小助手 Markdown 预览、导入 DXF —— 均能正常打开和使用
- [x] `pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm exec vitest run src`、`pnpm run lint`、`pnpm run build` 全部通过（成本模块的已有问题除外，单独说明）


## 结果
- 首屏静态 JS（生产构建）：1,558 KB / gzip 500 KB → 1,430 KB / gzip 457 KB（入口 + vendor-react / vendor-ui / vendor-supabase）。
- 已拆出按需加载：AccountCMS、AuthDialog、AiChatPanel、AiRoomDialog、AiCreateProjectDialog、CustomFurnitureDialog、WallSplitDialog、DimensionEditDialog、Markdown 预览、dxf-parser。
- DxfImportDialog 未拆：它依赖的识别模块首屏已在用，拆分收益很小。
- tsc / vitest（884 项）/ lint（0 error）/ build 全部通过。
