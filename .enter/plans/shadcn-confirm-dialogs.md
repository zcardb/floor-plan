# 用 shadcn AlertDialog 替换原生 confirm 弹窗

## Context

用户指出「重置方案」「清空家具」等二次确认弹窗样式太丑，属于浏览器原生 `window.confirm`（截图里的“嵌入式页面显示…”），要求统一改用 shadcn 弹窗组件，不要手写样式。

代码库中现有 6 处原生 `window.confirm`：

| 位置 | 场景 |
| --- | --- |
| `src/features/interior/components/Workbench.tsx:389` | 清空家具 |
| `src/features/interior/components/Workbench.tsx:396` | 重置方案 |
| `src/features/interior/components/PropertyPanel.tsx:491` | 缩小净宽导致对象在室外 |
| `src/features/interior/components/PropertyPanel.tsx:514` | 缩小净深导致对象在室外 |
| `src/features/interior/cloud/useProjects.ts:298` | 发现较新的本机恢复副本 |
| `src/features/interior/cloud/useProjects.ts:325` | 云端保存失败，另存为新项目 |

其中 `useProjects.ts` 的两处在 hook 内部的异步流程里，无法就地渲染声明式弹窗，因此采用**命令式 Promise 风格的统一确认组件**：底层完全复用已有的 `src/components/ui/alert-dialog.tsx`（Radix + shadcn），调用处只写一行 `await confirm({...})`，既消灭原生弹窗也避免每个组件重复写弹窗状态。

设计选择（已与用户确认）：破坏性操作（清空家具、重置方案）确认按钮用 `destructive` 红色；范围包含把现有「删除项目」弹窗一并套用同一套样式。

## 实现方案

### 1. 新增可复用确认弹窗：`src/components/ui/confirm-dialog.tsx`

（放在 `src/components/ui/` 下，与 shadcn 脚手架一致；该目录已被 `eslint.config.js` 忽略，不会因 provider + hook 同文件导出触发 react-refresh 警告。）

- 复用现有 shadcn 组件，不手写弹窗 DOM：
  `AlertDialog / AlertDialogContent / AlertDialogHeader / AlertDialogTitle / AlertDialogDescription / AlertDialogFooter / AlertDialogCancel / AlertDialogAction`
- 复用 `buttonVariants`（`src/components/ui/button.tsx`）与 `cn`（`src/lib/utils.ts`）。
- 导出：
  - `ConfirmDialogProvider`：持有当前请求 `request: ConfirmOptions | null` 与 `resolver` ref，渲染单个 `AlertDialog`，`open={!!request}`。
  - `useConfirm()`：返回 `(options: ConfirmOptions) => Promise<boolean>`；不在 provider 内调用时抛错。
- 类型：
  ```ts
  interface ConfirmOptions {
    title: string;
    description?: string;
    confirmText?: string;   // 默认「确定」
    cancelText?: string;    // 默认「取消」
    tone?: "default" | "destructive";
  }
  ```
- 关键不变式：
  - `settle(value)` 是唯一出口：先取走 `resolver.current` 并置空、`setRequest(null)`、再 `resolve(value)`，因此 Promise **只会解决一次**；`AlertDialogAction` 点击后 Radix 触发的 `onOpenChange(false)` 落在那次已清空的 ref 上，是 no-op，不会重复解决。
  - `AlertDialogCancel` 与 `onOpenChange(false)`（Esc / 点遮罩）都 `settle(false)`。
  - 新请求到来时先把上一个 pending 请求以 `false` 结束，避免悬挂 Promise。
  - `AlertDialogDescription` 始终渲染（`request?.description ?? ""`），保证 Radix alertdialog 的无障碍结构完整。
  - 破坏性请求给 `AlertDialogAction` 加 `buttonVariants({ variant: "destructive" })`。
  - 标题/正文用中文文案，`title` 为问句、`description` 为补充说明。

### 2. 挂载 provider：`src/App.tsx`

在 `TooltipProvider` 内、`RouterProvider` 外层包一层 `<ConfirmDialogProvider>`（现有 `Toaster`/`Sonner` 位置保持不动），确保 interior 应用所有调用点都在 provider 覆盖范围内。

### 3. 设计系统样式：`src/index.css`

在 `@layer components` 中紧邻现有 `.projects-dialog`（约 1322 行）新增 `.confirm-dialog` 规则，全部使用语义 token，不写死颜色：

- `max-width: 420px`、`padding: 26px`、`border-radius: 16px`、`gap`
- `background: hsl(var(--card))`、`border-color: hsl(var(--border))`、`box-shadow: var(--shadow-panel)`
- 标题 `h2` 字号/字重对齐 `.projects-dialog h2` 风格；`[id$="description"]` 使用 `hsl(var(--muted-foreground))`。
- 沿用 `.projects-dialog` 的 `!important` 约定（Tailwind v3 中 utilities 层晚于 components 层生效）。

### 4. 替换调用点

**`src/features/interior/components/Workbench.tsx`**

- 引入 `useConfirm`，组件内 `const confirm = useConfirm();`
- `clearFurniture`（386 行）改为异步：`if (!d.furniture.length) return;` → `await confirm({ title: "清空所有家具？", description: "墙体、材质和测量会保留，可撤销恢复。", confirmText: "清空家具", tone: "destructive" })`，为 `true` 才执行原有 `change(... + furniture: [])` 与 `setSelection(null)`。
- `resetDesign`（395 行）改为异步：`await confirm({ title: "重置当前项目为其初始模板？", description: "墙体、家具与测量都会恢复到初始模板，可撤销恢复。", confirmText: "重置方案", tone: "destructive" })`，确认后执行原有 `change(() => d.template === "blank" ? blankDesign() : referenceDesign())` 与 `setSelection(null)`。
- 现有挂载点（613、618、710、716 行）继续直接传函数；`onClick` 接受返回 Promise 的回调，无需改动。

**`src/features/interior/components/PropertyPanel.tsx`**

- `input` 辅助函数（77 行）的 `update` 形参签名扩为 `(v: number) => void | Promise<boolean>`：`onBlur` 里若返回值是 Promise，则在 resolve 为 `false`（用户取消）时把输入框显示值恢复为当前模型值 `String(value)`；原有非法数值分支（`toast.error`）保持不变。
- 净宽（479 行）回调改为 `async (v) => boolean`：`d.template !== "blank"` 时返回 `false`；`outside` 判定逻辑（`d.furniture` / `partition` 墙超出）保持不变，命中时 `await confirm({ title: "部分对象将位于室外", description: "缩小净宽后，部分家具或隔墙会落在户型之外，仍保留这些对象并继续？", confirmText: "保留并继续" })`，取消返回 `false`，确认后 `change(...)` 并返回 `true`。
- 净深（502 行）同样处理，文案用「净深」。

**`src/features/interior/cloud/useProjects.ts`**

- hook 内 `const confirm = useConfirm();`
- `open`（约 298 行）把 `window.confirm(...)` 改为 `await confirm({ title: "发现较新的本机恢复副本", description: "此项目的本机副本比云端更新，恢复它以保留未保存的编辑？", confirmText: "恢复副本" })`，语义与原逻辑一致（`draft.updatedAt > found.updatedAt` 且用户确认才覆盖 `found` 并置 `dirty`）。
- `create`（约 325 行）保留原语义：`if (!saved) { const keep = dirty.current && await confirm({ title: "云端保存失败", description: "当前设计未能保存到云端，将其另存为新项目以保留更改？", confirmText: "另存为新项目" }); if (!keep) return false; }`（原式为 `if (!saved && !(dirty.current && confirm)) return false`，结果等价）。

**`src/features/interior/components/ProjectManager.tsx`（统一风格）**

- 现有删除项目的 `AlertDialog` 的 `AlertDialogContent` 加 `className="confirm-dialog"`，`AlertDialogAction` 加 destructive 变体与明确按钮文案（如「删除项目」），使与新的确认弹窗视觉一致；逻辑（`projects.remove`、`setDeleting(null)`）不变。

### 实现清单（不在此次范围）

- 不改动 `useWallDrawing.ts:21` 的同名 `confirm(p)`（局部函数，非弹窗）。
- 不新增依赖，不新增测试文件（现有测试只覆盖 `model/*`，与本次 UI 改动无关）。

## Implementation checklist

- [x] 新增 `src/components/ui/confirm-dialog.tsx`，导出 `ConfirmDialogProvider` 与 `useConfirm`，内部只组合 `alert-dialog`、`button` 的现成导出。
- [x] `settle` 保证 Promise 只解决一次；Esc/遮罩/取消 → `false`，确认 → `true`；新请求到来时上一个 pending 请求以 `false` 结束。
- [x] `tone: "destructive"` 时确认按钮使用 `buttonVariants({ variant: "destructive" })`，默认仍为 primary。
- [x] `src/App.tsx` 在 `TooltipProvider` 内包裹 `<ConfirmDialogProvider>`，`Toaster`/`Sonner` 保持原样。
- [x] `src/index.css` 新增 `.confirm-dialog`（`@layer components`，全部语义 token，含标题与 description 样式，并补齐窄屏规则）。
- [x] `Workbench.tsx` 的 `clearFurniture` / `resetDesign` 不再调用 `window.confirm`，且取消时不产生任何 state 变更。
- [x] `PropertyPanel.tsx` 的 `input` 支持 `Promise<boolean>` 返回值并仅在被拒绝时恢复输入框显示值。
- [x] `PropertyPanel.tsx` 净宽、净深两处 `window.confirm` 替换为 `await confirm(...)`，取消时宽度/深度保持原值。
- [x] `useProjects.ts` 两处 `window.confirm` 替换为 `await confirm(...)`，`create` 在保存失败且用户选择不另存时仍返回 `false`。
- [x] `ProjectManager.tsx` 删除项目弹窗套用 `confirm-dialog` 样式，删除逻辑不变。
- [x] 全仓 `grep "window.confirm"` 无结果。

## Verification checklist

- [x] `pnpm lint` 通过（`src/components/ui/**` 被忽略，`src/features/**` 与 `App.tsx` 必须无新增告警）。
- [x] `pnpm exec tsc --noEmit` 通过（重点：`input` 的 `update` 联合返回类型、`onClick` 接收 async 回调）。
- [x] `pnpm test` 通过（`src/features/interior` 现有测试无回归，33 tests / 7 files 全绿）。
- [x] `pnpm run build` 通过。
- [ ] 预览人工验证（正向）：点击「清空家具」「重置方案」出现 shadcn 弹窗，确认后家具清空/方案重置，且可用撤销恢复。
- [ ] 预览人工验证（取消/默认路径）：弹窗点「取消」或按 Esc，均不改变设计内容；弹窗为浅色卡片样式，不再是浏览器原生弹窗。
- [ ] 预览人工验证（边界）：空白户型下把净宽改小到对象在室外时弹出确认，取消后输入框显示值回到当前模型值且平面图未变形；确认后户型按新尺寸重排。
- [ ] 预览人工验证（异步路径）：在云端项目存在本机较新恢复副本时打开项目会弹出确认；云端保存失败时弹出「另存为新项目」确认，选择取消不改动本机项目。
- [ ] 预览人工验证（风格一致性）：项目管理中删除项目弹窗与新确认弹窗外观一致，破坏性按钮为红色 destructive。
- 说明：以上 5 项为交互触发的运行时检查，未在本次自动化验证中执行（静态截图无法打开弹窗）。
