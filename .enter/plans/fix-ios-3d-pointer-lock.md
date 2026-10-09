# 修复：手机端点击 3D 报错（exitPointerLock is not a function）

## Context
截图里的报错是：
`this.domElement.ownerDocument.exitPointerLock is not a function`，调用栈从 `unlock` 开始，出错位置在 `Scene3D`。

原因：iPhone 上的 Safari 和微信内置浏览器都**不支持 Pointer Lock API**，所以 `document.exitPointerLock` 是 `undefined`。
`Scene3D.tsx` 会在两个地方无条件调用 `PointerLockControls.unlock()`，它内部调用的就是 `document.exitPointerLock()`：
- 第 991 行：视角模式 effect 首次运行时，不是漫游模式就走 `else` 分支调用 `r.walk.unlock()`。所以**一进入 3D 就会执行**，异常被抛出后，整页显示 "Unexpected Application Error"。
- 第 729 行：卸载清理时调用 `walk.unlock()`，离开 3D 时也会崩溃。

这和是否登录无关。只要是 iOS 浏览器，进入 3D 就会触发。游客更容易遇到，是因为游客通常直接在手机上打开。进入漫游模式的入口（`start()`）已经对触屏设备做了兜底（`coarse()` 分支加 try/catch），不需要改。

## 方案
新增一个小工具函数，只有在**确实处于锁定状态**、并且浏览器支持 `exitPointerLock` 时才调用 `unlock()`。然后在两个调用点都改用它。

- 新文件 `src/features/interior/scene/pointerLock.ts`：
  ```ts
  export function releasePointerLock(walk: { isLocked: boolean; unlock(): void; domElement?: HTMLElement | null }) {
    const doc = walk.domElement?.ownerDocument;
    if (!walk.isLocked || typeof doc?.exitPointerLock !== 'function') return;
    walk.unlock();
  }
  ```
- `Scene3D.tsx` 第 729 行和第 991 行：`walk.unlock()` / `r.walk.unlock()` 改为 `releasePointerLock(walk)` / `releasePointerLock(r.walk)`。
- `walk.dispose()` 只负责移除 document 上的事件监听，不会调用 `exitPointerLock`，保持不动。

不在本次修改范围内：漫游模式的交互、桌面端的指针锁定流程、其他 3D 逻辑。

## Implementation checklist
- [ ] 新建 `src/features/interior/scene/pointerLock.ts`，导出 `releasePointerLock`：未锁定，或 `ownerDocument.exitPointerLock` 不是函数时，直接返回
- [ ] `Scene3D.tsx` 视角模式 effect 的 `else` 分支改为 `releasePointerLock(r.walk)`
- [ ] `Scene3D.tsx` 卸载清理改为 `releasePointerLock(walk)`，`walk.dispose()` 保留
- [ ] 确认 `Scene3D.tsx` 里不再有直接调用 `.unlock()` 的地方

## Verification checklist
- [ ] 新增 `pointerLock.test.ts`：`exitPointerLock` 未定义时（模拟 iOS），调用 `releasePointerLock` 不抛异常，也不调用 `unlock`
- [ ] 测试：未锁定时（`isLocked=false`），不调用 `unlock`
- [ ] 测试：已锁定，并且支持 `exitPointerLock` 时（桌面端），调用 `unlock` 一次
- [ ] 运行 `pnpm vitest run src/features/interior/scene` 并通过
- [ ] 运行 `pnpm run lint` 和 `pnpm run build` 并通过
- [ ] 用户在 iPhone 上以游客身份点 3D：能进入 3D 场景，不出现 "Unexpected Application Error"；切回 2D 也不报错
