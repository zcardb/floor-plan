# 移动端加固（重新走查版）

## Context
iPhone 点 3D 后整页白屏，之后我重新逐项核对了代码，确认的问题如下：

| # | 问题 | 位置 | 后果 | 根因 |
|---|---|---|---|---|
| 1 | 3D 运行中出错没有被单独兜住 | `Workbench.tsx:978` 外面只有根级的错误兜底 | 任何 3D 错误都会让**整页白屏** | 3D 没有统一的失败处理 |
| 2 | 没有监听"图形资源丢失"（`webglcontextlost`） | `Scene3D.tsx` | iOS 切后台再回来，3D 一直**黑屏** | 同上 |
| 3 | 释放 3D 时没有调用 `forceContextLoss()` | `Scene3D.tsx:746` | 来回切换 2D/3D，画布越积越多，最后打不开 3D | 同上 |
| 4 | 3D 每帧都在渲染，静止时也一样 | `Scene3D.tsx:617` 渲染循环 | 手机发热、耗电，低端机卡顿 | 没有"有变化才渲染"的机制 |
| 5 | 下载用的是 `<a download>`，一共 3 处 | `Scene3D:263`、`PlanCanvas:274`、`drawingExport:42` | 微信里下载不了，但仍然提示"已下载" | 组件自己负责下载和提示，没有统一出口 |
| 6 | 2D 导出图固定宽 3200 像素，高度按比例算 | `PlanCanvas:252` | 户型偏长时超过 iOS 画布 1677 万像素的上限，`getContext` 拿到 `null`，导出静默失败 | 导出尺寸没有考虑设备上限 |
| 7 | 输入框字号是 12/13px（`--fs-control`、`Input` 的 `text-[13px]`） | `index.css:9`、`ui/input.tsx` | iOS 点输入框时页面会**自动放大**，编辑器布局被撑乱 | 字号 token 没有区分触屏 |
| 8 | 登录用户的云端保存要等 1 秒才执行，切后台时也不会立刻保存 | `useProjects.ts:295` | 微信或 Safari 切走后页面可能被系统回收，**最后一次修改会丢失** | 没有在页面隐藏时立即保存 |
| 9 | 浏览器差异的判断分散在业务代码里（`pointer:coarse`、`requestPointerLock`） | `Scene3D:147`、`Scene3D:1016` | 每兼容一种机型就要再加一处判断 | 没有统一的平台层 |

**对上一版计划的纠正**
- 去掉 `structuredClone` / `randomUUID` 的兼容补丁，也不改打包目标。原因：Vite 默认打包目标已经包含 safari14；而项目里 `dvh`、`:has()`、`structuredClone` 本身都要求 iOS 15.4 及以上，单补其中两个没有意义。本计划明确**支持范围定为 iOS 15.4+ / Android Chrome 98+**。

**确认没问题的部分**（这次不改）
- 本机存储都包了 try/catch。
- 2D 画布已经处理好触控：设置了 `touch-action:none`，用了指针捕获，处理了 `pointercancel`，支持双指缩放。
- 家具库可以点击直接添加；撤销、重做、复制、旋转、删除都有屏幕按钮；3D 里点一下就能开关门。
- 3D 漫游在触屏上用摇杆；three.js 是进入 3D 时才加载的；画质倍率最高 1.5。
- 选中框的位置通过 ref 直接更新，不会每帧触发 React 重新渲染。
- 全屏和 `requestIdleCallback` 都已有兼容处理；布局高度普遍用的是 `dvh`。

---

## 一、平台能力层 `src/lib/platform/`（解决 #9，为 #5 和 3D 提供基础）
- `capabilities.ts`：提供 `isCoarsePointer()`、`supportsPointerLock()`、`isWeChat()`、`canDownloadDirectly()`。每个函数都可以传入 `env` 参数，方便测试。
- `pointerLock.ts`：把现在的 `scene/pointerLock.ts` 迁移过来，并新增 `tryPointerLock(el): Promise<boolean>`，失败时返回 false，不抛异常。
- `saveFile.ts`：`saveFile(blob, name): {kind:'downloaded'} | {kind:'blocked', blob, name}`。整个项目只有这里会创建 `<a download>`。
- `canvasLimits.ts`：`rasterSize(w, h, {maxSide: 4096, maxArea: 16_777_216, target: 3200})`，是个纯函数，按 iOS 画布上限等比缩小。
- **lint 规则防止以后再散落**：在 `eslint.config.js` 加 `no-restricted-syntax`，除了 `src/lib/platform/**` 之外，禁止调用 `requestPointerLock` / `exitPointerLock`、禁止给 `.download` 赋值、禁止出现 `pointer:coarse` 字面量。

## 二、导出：组件只生成文件，Workbench 统一保存和提示（解决 #5、#6）
- `SceneHandle.shot()`、`CanvasHandle.exportImage()` 改为返回 `Promise<Blob>`，删掉它们内部的下载代码和提示。
- `PlanCanvas` 导出时用 `rasterSize` 计算画布尺寸；如果 `getContext` 返回 `null`，就抛出明确的错误，不再用 `!` 强行断言。
- `drawingExport.ts` 改为导出 `drawingFile()` 和 `projectJsonFile()`，返回 `{blob, name}`，删除 `downloadBlob`。
- `Workbench.exportAction` 是唯一出口：拿到 blob 后调用 `saveFile`：
  - 结果是 `downloaded`：显示成功提示；
  - 结果是 `blocked`：打开新组件 `SaveFileDialog`。图片显示预览，提示"长按保存"；其他格式提示"右上角 ··· 在浏览器打开后导出"。
- 原来的 `notify.error("导出失败", e)` 会兜住所有失败，包括画布超限。

## 三、3D 生命周期：统一失败处理，自动恢复一次（解决 #1、#2、#3）
- 新增 `components/useSceneLifecycle.ts`，核心是一个纯 reducer。它把 Workbench 里现在分开的 `view` / `sceneLoading` 合并起来：
  - 事件：`open` / `ready` / `close` / `fail(reason)`，其中 `reason` 为 `module | renderer | crash | context-lost`；
  - 规则：本次 3D 会话中第一次 `context-lost` 时，`generation+1`，保持 3D 并显示加载中，场景会用新的 `key` 重新挂载；其他原因，或者第二次丢失时，切回 2D 并按原因提示；`open` 时恢复次数归零。
  - 删掉 Workbench 第 329–334 行和第 988–992 行两段重复的失败处理。
- 给 `src/components/ErrorBoundary.tsx` 增加可选的 `fallback` 和 `onError`，根级用法不变。Workbench 用 `<ErrorBoundary fallback={null} onError={() => lifecycle.fail('crash')}>` 包住 `<Scene key={generation}>`。
- 新增 `scene/listeners.ts`：`createListenerRegistry(onFatal)`。登记的回调都会包一层 try/catch，出错时调用 `onFatal`。`Scene3D` 里现在的 12 组 `addEventListener` 全部改用它，cleanup 只需要调用一次 `disposeAll()`。渲染循环出错时也走同一个 `onFatal`。
- 监听 `webglcontextlost`：调用 `preventDefault()`，停止循环，然后 `onError('context-lost')`。
- cleanup 的顺序：先 `disposeAll()`，再释放场景资源，然后 `renderer.dispose()`，最后 `renderer.forceContextLoss()`。
- `start()` 改用 `isCoarsePointer()` + `tryPointerLock()`，删掉本地的 `coarse` 函数。
- `Props.onError` 改为接收 `reason` 参数。

## 四、3D 有变化才渲染（解决 #4）
- `Scene3D` 内部用一个 `invalidate()` 标记需要重绘，循环每帧检查：只有标记了，或者正在动画时才调用 `renderer.render`。"正在动画"包括：`r.fly` 镜头飞行中、`orbit.update()` 返回 true（还在惯性滑动）、漫游中有键盘或摇杆输入、门还在转动。
- 以下情况会调用 `invalidate()`：OrbitControls 的 `change` 事件、尺寸变化（ResizeObserver）、设计 / 图层 / 选中 / 光照变化（已有的相关 effect 末尾各加一次）、家具拖拽、开关门。
- 选中框位置的计算移到"本帧确实渲染"的分支里，并复用循环外创建好的 `Box3` / `Vector3`，不再每帧新建对象。

## 五、触屏输入字号 token（解决 #7）
- 在 `index.css` 新增 `--fs-input`：默认等于 `--fs-control`；在 `@media (pointer: coarse)` 下设为 `16px`。
- `ui/input.tsx`、`ui/textarea.tsx`、`.editor-control`、`.cms-search input`、`.cost-search input` 都改用 `var(--fs-input)`。以后新加的输入框只要用 `Input` 或 `.editor-control`，就会自动符合要求。

## 六、页面隐藏时立即保存（解决 #8）
- `useProjects.ts` 新增 effect：监听 `pagehide`，以及 `visibilitychange` 变为 `hidden` 的时机。如果 `timer.current` 还在等待，就立即 `clearTimeout` 并执行 `save()`；如果正在保存，就不重复发起。
- 在这之前，Workbench 先调用 `sizeTransaction.flush()`，把尺寸输入框里还没提交的修改并入设计。做法是在 Workbench 里监听同样的事件，放在保存之前执行。

---

## 关键文件
- 新增：`src/lib/platform/{capabilities,pointerLock,saveFile,canvasLimits,index}.ts`、`scene/listeners.ts`、`components/useSceneLifecycle.ts`、`components/SaveFileDialog.tsx`
- 修改：`eslint.config.js`、`src/index.css`、`src/components/ui/{input,textarea}.tsx`、`src/components/ErrorBoundary.tsx`、`scene/Scene3D.tsx`、`components/PlanCanvas.tsx`、`components/Workbench.tsx`、`model/drawingExport.ts`、`cloud/useProjects.ts`
- 删除：`scene/pointerLock.ts` 和对应的测试（迁移到平台层）

## Implementation checklist
- [x] `capabilities.ts`：实现 4 个能力判断，都支持传入 `env`
- [x] `pointerLock.ts` 迁移到平台层，新增 `tryPointerLock`，删除 `scene/pointerLock.*`
- [x] `saveFile.ts`：微信返回 `blocked`；其他浏览器下载后返回 `downloaded`
- [x] `canvasLimits.ts`：`rasterSize` 保证宽、高都不超过 `maxSide`，面积不超过 `maxArea`，并且保持宽高比
- [x] `eslint.config.js`：加 3 条 `no-restricted-syntax`，`src/lib/platform/**` 除外
- [x] `shot` / `exportImage` 改为返回 `Promise<Blob>`，内部不再有 `<a>` 和提示
- [x] `PlanCanvas` 导出用 `rasterSize`；`getContext` 返回 null 时 reject
- [x] `drawingExport.ts` 改为输出 `{blob,name}`，删除 `downloadBlob`
- [x] `Workbench.exportAction` 所有格式都走 `saveFile`；`blocked` 时打开 `SaveFileDialog`
- [x] `SaveFileDialog`：图片显示预览和长按提示；其他格式提示在浏览器打开；只用设计系统的 token
- [x] `useSceneLifecycle` reducer 实现，Workbench 接入，两段重复的失败处理删除
- [x] `ErrorBoundary` 增加 `fallback` / `onError`；`<Scene key={generation}>` 外面包上它
- [x] `listeners.ts` 实现；Scene3D 的所有事件监听都改用登记表，cleanup 用 `disposeAll()`
- [x] 渲染循环出错时停止，并 `onError('crash')`
- [x] 监听 `webglcontextlost`，然后 `onError('context-lost')`
- [x] cleanup 最后调用 `forceContextLoss()`
- [x] `start()` 改用平台层的函数，删除本地 `coarse`
- [x] 加入 `invalidate()` 机制，只在需要时调用 `renderer.render`；循环内不再新建 `Box3`
- [x] 加 `--fs-input` token，并在 `(pointer:coarse)` 下设为 16px；所有输入框都改用它（同时删除了散落的 `max-width` 下 16px 补丁规则，并在 base 层给未设字号的文本输入兜底）
- [x] `useProjects` 在 `pagehide` / 页面隐藏时立即保存；Workbench 先 flush 尺寸输入（实现补充：新增 `src/lib/platform/pageLifecycle.ts` 的 `onPageHide(handler, "flush" | "persist")`，按阶段保证先 flush 再保存，不依赖监听注册顺序；附 `pageLifecycle.test.ts`）
- [x] 全局搜索 `.download =`、`exitPointerLock`、`pointer:coarse`，确认只出现在 `src/lib/platform/`

## Verification checklist
- [x] `capabilities.test.ts`：微信 UA 时 `canDownloadDirectly` 为 false；没有 `exitPointerLock` 时 `supportsPointerLock` 为 false
- [x] `pointerLock.test.ts`：iOS 环境下不抛异常；未锁定时不 unlock；桌面端已锁定时 unlock 一次；`tryPointerLock` 被拒绝时返回 false
- [x] `saveFile.test.ts`：微信时返回 `blocked`，并且没有创建 `<a>`；普通浏览器时返回 `downloaded`，并 click 一次
- [x] `canvasLimits.test.ts`：3200×6400 的输入，面积会被压到不超过 16777216 且比例不变；小尺寸保持 3200 宽；极端的 1:20 比例时边长不超过 4096
- [x] `useSceneLifecycle.test.ts`：第一次 context-lost 时 generation+1 并保持 3D；第二次切回 2D；crash / renderer / module 直接切回 2D；open 后恢复次数归零
- [x] `listeners.test.ts`：回调抛错时调用 `onFatal` 一次；`disposeAll` 之后再派发事件不会触发回调
- [x] `ErrorBoundary` 测试：传了 props 时会调用 `onError` 并渲染 `fallback`；不传时仍显示原来的整页提示
- [x] `useProjects` 测试：保存在等待中时派发 `pagehide`，会立即保存一次；没有待保存内容时不保存
- [x] `drawingExport.test.ts` 改为断言返回 `{blob,name}`，并且通过
- [x] 运行 `pnpm vitest run`（全量）并通过
- [x] 运行 `pnpm run lint` 并通过；临时在业务文件里写一次 `a.download='x'`，确认 lint 报错，然后撤掉
- [x] 运行 `pnpm run build` 并通过
- [ ] 真机，需要你来验：
  - iPhone Safari / 微信：进出 3D 各 10 次，不白屏；切后台再回来，3D 能自动恢复；
  - 3D 静止时手机不再持续发热；
  - 点输入框时页面不再放大；
  - 微信里导出 PNG 会弹出长按保存，导出 PDF 会提示在浏览器打开；
  - 登录状态下修改后立刻切走 App，再回来时修改还在
