# 移动端加固：平台能力层 + 3D 生命周期统一

## Context
之前那次走查，加上 iPhone 点 3D 白屏的问题，说明几个根本问题：
1. **浏览器差异散落在业务代码里**：`Scene3D` 自己判断 `matchMedia("(pointer:coarse)")`、自己试 `requestPointerLock`；导出下载的 `<a download>` 逻辑在 3 个文件里各写了一遍。每修一个机型就多一个零散的判断，也就是"补丁"。
2. **3D 没有统一的失败通道**：模块加载失败、渲染器创建失败、运行中报错、显卡上下文丢失，处理方式各不相同，有的根本没处理（运行中报错会让整页白屏，上下文丢失会一直黑屏）。
3. **导出流程里，组件自己下载、自己弹成功提示**：所以微信里明明没下载成功，也会提示"已下载"。

目标是从结构上收敛这些问题：所有浏览器差异只放在一个平台层里，并用 lint 规则禁止业务代码绕过它；3D 的所有失败和恢复走同一条路径；导出改成"组件只生成文件，由一个地方负责保存和提示"。

不在本次范围：家具 AI 设计（另有计划 `ai-assisted-design.md`）、2D 画布的触控（走查确认已经做得比较完整）。

---

## 一、平台能力层 `src/lib/platform/`
所有和浏览器、设备差异有关的判断和调用都放在这里。业务代码只问"能不能做"，不直接碰原生 API。

| 文件 | 内容 |
|---|---|
| `capabilities.ts` | 纯函数，可以传入 `env`（`navigator` / `document` / `matchMedia`）方便测试：`isCoarsePointer()`、`supportsPointerLock()`、`isWeChat()`、`canDownloadDirectly()`（不是微信，并且支持 `a.download`） |
| `pointerLock.ts` | 由 `scene/pointerLock.ts` 迁移过来。`releasePointerLock(walk)` 保留；新增 `tryPointerLock(el): Promise<boolean>`，不支持或被拒绝时返回 `false`，不会抛异常 |
| `saveFile.ts` | `saveFile(blob, name): SaveResult`，返回 `{ kind: 'downloaded' }` 或 `{ kind: 'blocked', blob, name }`。整个项目只有这里会创建 `<a download>` |
| `polyfills.ts` | 在 `main.tsx` 里第一行 import。只在原生 API 缺失时补上 `structuredClone`（支持普通对象、数组、Date、Map、Set）和 `crypto.randomUUID`，覆盖 iOS 15.4 以下的设备。现有 8 处 `structuredClone` 和 `uid()` 都不用改 |
| `index.ts` | 统一导出以上内容 |

**防止以后再出现散落的判断**：在 `eslint.config.js` 加 `no-restricted-syntax`，除了 `src/lib/platform/**` 之外，禁止下面三种写法，lint 会直接报错：
- `requestPointerLock` / `exitPointerLock` 成员调用
- 给 `.download` 赋值
- 含 `pointer:coarse` 的字面量

**打包目标**：在 `vite.config.ts` 里加 `build.target: ['es2020', 'safari14']`，让打包时把新语法转成 iOS 14 也能运行的形式。

## 二、导出：组件只生成文件，Workbench 负责保存和提示
- `SceneHandle.shot` 和 `PlanCanvas` 的 `exportImage` 改为返回 `Promise<Blob>`，删掉它们内部的下载和提示代码。
- `drawingExport.ts` 改为导出 `drawingFile(design, format, name): Promise<{ blob, name }>` 和 `projectJsonFile(...)`，删掉 `downloadBlob`。
- `Workbench.exportAction` 是唯一出口：先拿到 blob，再调用 `saveFile`，然后按结果处理：
  - `downloaded` → `notify.success("已导出 …")`
  - `blocked`（微信）→ 打开新组件 `SaveFileDialog`：
    - 图片：显示预览图，提示"长按图片保存到相册"；
    - PDF / SVG / DXF / JSON：提示"点击右上角 ··· 选择在浏览器打开后再导出"。
- 结果：成功提示只在真正下载时出现；以后新增导出格式也会自动走同一条路径。

## 三、3D 生命周期：一条失败通道，加上重新挂载式恢复
**`useSceneLifecycle` hook**（新文件 `components/useSceneLifecycle.ts`，核心是一个纯 reducer，方便测试）。它接管 Workbench 里现在分散的 `view` / `sceneLoading` / `Scene` 三份状态：
- 状态：`{ view, loading, generation, recoveries }`
- 事件：`open`、`ready`、`close`、`fail(reason)`；`reason` 为 `module` / `renderer` / `crash` / `context-lost`
- 规则：
  - `context-lost` 且本次 3D 会话还没恢复过：`generation + 1`，保持 3D 并显示加载中，场景会用新的 `key` 重新挂载，由当前设计重建。
  - 其他原因，或者已经恢复过一次：切回 2D，并按原因给出统一的提示文案。
  - `open` 时 `recoveries` 归零。
- Workbench 删掉第 329–334 行和第 988–992 行两段重复的处理代码，统一调用 `lifecycle.fail(...)`。

**错误兜底组件复用**：给现有的 `src/components/ErrorBoundary.tsx` 增加可选的 `fallback` 和 `onError` 两个 props。根级用法不变；Workbench 用 `<ErrorBoundary fallback={null} onError={() => lifecycle.fail('crash')}>` 包住 `<Scene key={generation}>`。这样渲染和 effect 里的报错只会让 3D 回退到 2D，不会整页白屏。

**Scene3D 内部：事件统一登记**（这部分能覆盖 React 错误兜底捕获不到的事件回调和渲染循环）：
- 新增 `scene/listeners.ts`：`createListenerRegistry(onFatal)`，提供 `on(target, type, fn, opts)` 和 `disposeAll()`。登记的回调会自动包一层 try/catch，出错时调用 `onFatal`。
- `Scene3D` 里现在的 12 组 `addEventListener` / `removeEventListener` 都改用这个登记表，cleanup 里那一长串手动移除换成一句 `disposeAll()`。
- 渲染循环 `loop` 的每一帧也走同一个出错处理：出错就停止循环，并调用 `onError('crash')`。
- `Props.onError` 改为接收 `reason` 参数。

**显卡上下文丢失与资源释放**：
- 通过登记表监听 canvas 的 `webglcontextlost`：调用 `preventDefault()`，停止循环，然后 `onError('context-lost')`，由 lifecycle 负责重新挂载。不需要逐个恢复资源。
- cleanup 的顺序：先 `disposeAll()`（这样下一步不会触发上面的丢失监听），再释放场景资源，然后 `renderer.dispose()`，最后 `renderer.forceContextLoss()`，立即归还上下文，来回切换 2D/3D 不会越积越多。
- `start()` 改用 `isCoarsePointer()` + `tryPointerLock()`，删掉本地的 `coarse` 和 try/catch。

---

## 关键文件
- 新增：`src/lib/platform/{capabilities,pointerLock,saveFile,polyfills,index}.ts`、`src/features/interior/scene/listeners.ts`、`src/features/interior/components/useSceneLifecycle.ts`、`src/features/interior/components/SaveFileDialog.tsx`
- 修改：`src/main.tsx`、`eslint.config.js`、`vite.config.ts`、`src/components/ErrorBoundary.tsx`、`src/features/interior/scene/Scene3D.tsx`、`src/features/interior/components/PlanCanvas.tsx`、`src/features/interior/model/drawingExport.ts`、`src/features/interior/components/Workbench.tsx`
- 删除：`src/features/interior/scene/pointerLock.ts` 及其测试（迁移到平台层）

## Implementation checklist
- [ ] `capabilities.ts`：实现 4 个能力判断，都支持传入 `env`
- [ ] `pointerLock.ts` 迁移到平台层，新增 `tryPointerLock`，删除原 `scene/pointerLock.ts`
- [ ] `saveFile.ts`：微信返回 `blocked`，其他环境用 `<a download>` 下载后返回 `downloaded`
- [ ] `polyfills.ts`：只在缺失时补 `structuredClone` / `randomUUID`；`main.tsx` 第一行 import
- [ ] `eslint.config.js`：`no-restricted-syntax` 三条规则，`src/lib/platform/**` 除外
- [ ] `vite.config.ts`：`build.target = ['es2020','safari14']`
- [ ] `Scene3D.shot` / `PlanCanvas.exportImage` 返回 `Promise<Blob>`，删掉内部的 `<a download>` 和成功提示
- [ ] `drawingExport.ts`：改为输出文件对象，删除 `downloadBlob`
- [ ] `Workbench.exportAction`：所有格式统一走 `saveFile`；结果是 `blocked` 时打开 `SaveFileDialog`
- [ ] `SaveFileDialog`：图片显示预览并提示长按保存；其他格式提示"在浏览器打开"；只用设计系统的 token
- [ ] `useSceneLifecycle` reducer：`open` / `ready` / `close` / `fail(reason)`，`context-lost` 只自动恢复一次
- [ ] Workbench 改用 lifecycle，删除两段重复的失败处理；`<Scene key={generation}>`
- [ ] `ErrorBoundary` 增加 `fallback` / `onError` props，根级行为不变
- [ ] `scene/listeners.ts` 登记表；Scene3D 所有事件监听都改用登记表，cleanup 用 `disposeAll()`
- [ ] 渲染循环出错时停止，并调用 `onError('crash')`
- [ ] 监听 `webglcontextlost`：`preventDefault`，停止循环，然后 `onError('context-lost')`
- [ ] cleanup 最后调用 `renderer.forceContextLoss()`，并且在 `disposeAll()` 之后
- [ ] `start()` 改用 `isCoarsePointer` + `tryPointerLock`
- [ ] 全局搜索 `.download =`、`exitPointerLock`、`pointer:coarse`，确认只出现在 `src/lib/platform/`

## Verification checklist
- [ ] `capabilities.test.ts`：微信 UA → `isWeChat` 为 true，`canDownloadDirectly` 为 false；没有 `exitPointerLock` → `supportsPointerLock` 为 false
- [ ] `pointerLock.test.ts`（迁移过来）：iOS 环境下不抛异常；未锁定时不调用 unlock；桌面端已锁定时调用一次；`tryPointerLock` 被拒绝时返回 false
- [ ] `saveFile.test.ts`：微信 → `blocked` 并且没有创建 `<a>`；普通浏览器 → `downloaded`，并触发一次 click
- [ ] `polyfills.test.ts`：删掉原生 `structuredClone` 后，补上的版本能深拷贝嵌套对象、Date、Map；原生存在时不会被覆盖
- [ ] `useSceneLifecycle.test.ts`：第一次 `context-lost` 时 generation+1 并保持 3D；第二次切回 2D；`crash` / `renderer` / `module` 都直接切回 2D；`open` 后恢复次数归零
- [ ] `listeners.test.ts`：回调抛错时调用 `onFatal` 一次；`disposeAll` 后再派发事件不会触发回调
- [ ] `ErrorBoundary` 测试：子组件抛错时调用 `onError` 并渲染 `fallback`；不传 props 时仍显示原来的整页提示
- [ ] 现有的 `drawingExport.test.ts` 改为断言返回的 `{blob,name}`，并且通过
- [ ] 运行 `pnpm vitest run`（全量）并通过
- [ ] 运行 `pnpm run lint` 并通过；临时在业务文件里写一次 `a.download = 'x'`，确认 lint 报错，然后撤掉
- [ ] 运行 `pnpm run build` 并通过
- [ ] 真机，需要你来验：iPhone Safari 和微信分别进出 3D 各 10 次，都不白屏；切到后台再回来，3D 能自动恢复；在微信里导出 PNG 会弹出长按保存，导出 PDF 会提示在浏览器打开
