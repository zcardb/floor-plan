# 项目管理三项修整：移除本机恢复副本、让本机默认方案真正可删、删除图标标红

## Context

用户在项目管理页遇到三件事：

1. 打开项目时弹出「发现较新的本机恢复副本 / 此项目的本机副本比云端更新，恢复它以保留未保存的编辑？」。用户认为打开 App 就应该只是刷新并拿到项目列表，这套机制没有必要、过于复杂。**用户已明确选择：彻底移除本机恢复副本机制，未保存的本机编辑可以丢。**
2. 「一打开 App 就自带的那份方案」——本机默认方案「三室两厅两卫 · 原木之家」删不掉。
3. 卡片上的删除图标改成红色（只改项目管理卡片，不动全局其它删除按钮）。

## 现状核对（已确认）

### 1. 弹窗来源
`src/features/interior/cloud/useProjects.ts`
- `open()`（第 339-356 行）在云端记录取回后，读 `localStorage["interior-recovery-{userId}-{projectId}"]`，若 `draft.updatedAt > found.updatedAt` 就 `confirm()` 弹窗。
- 该副本由 `update()` 第 286-292 行在每次编辑云端项目时写入；`save()` 第 236 行的失败提示也提到「已保留本机恢复副本」。
- 比较是**裸字符串比较**：本机写入的是 `new Date().toISOString()`（`…Z`），云端是 Postgres timestamptz（`…+00:00`），后缀不同 → 毫秒前缀相同时 `Z` > `+`，会误判「本机更新」。而且成功保存后副本从不清理。所以这个弹窗既不准、又不可预期。
- `open()` 用 `await confirm(...)`，所以弹窗出现时背景仍是项目列表——与用户截图一致。

### 2. 为什么本机默认方案看起来删不掉
代码里**没有任何**「默认/系统项目禁止删除」的判断（`grep 系统项目|默认项目|停用|isDefault` 无命中；云端表 `interior_design_projects` 里也没有系统标记，只有用户自己的 3 行数据）。真正会造成「删不掉」的是这三条路径：

- `remove()` 第 476 行 `if (!(await save())) return false;`：删除**任何**项目都要求先把「当前编辑中的项目」保存成功。当前项目（例如 revision 270 的 Home）一旦版本冲突或保存失败，`save()` 返回 false，删除就被静默取消——弹窗留在原地、没有任何说明。
- `persist()` 第 95-107 行**先 `setGuests(ps)` 再写 localStorage**：写入失败（配额不足）时界面已经把那行删掉了，但存储里还在，刷新后又回来——典型「删了又回来」。
- 上述失败都是 `return false`，UI 层 `ProjectManager` 的 `if (await projects.remove(row)) setDeleting(null)` 只是不关弹窗，用户看不到原因。

### 3. 删除图标
`src/features/interior/components/ProjectManager.tsx:17` `const iconAction = 'h-8 w-8 text-muted-foreground hover:text-foreground'`，第 52 行的 `Trash2` 用的就是它。设计系统已有危险色 token：`--destructive: 5 61% 42%`（Tailwind `text-destructive` / `bg-destructive/10`）。

## 改动方案

### 1. 移除本机恢复副本机制 —— `src/features/interior/cloud/useProjects.ts`

- 删除 `STATUS.recovery`（第 45 行）。
- `update()`（第 282-294 行）云端分支删掉写副本的 `try/catch`，只保留 `dirty.current = true; setStatus(STATUS.dirty);` 与 1 秒防抖 `save()`。
- `open()`（第 330-360 行）云端分支改成直接使用云端版本，删掉读副本 + `confirm` 整段：
  ```ts
  const found: Project = {
    id: data.id, name: data.name, state: validateDesign(data.state),
    revision: data.revision, updatedAt: data.updated_at || "", cloud: true,
  };
  activeRef.current = found;
  setActive(found);
  setStatus(STATUS.cloud);
  return true;
  ```
  （`dirty.current = false` 已在第 307 行统一设置，保持不动。）
- `save()` 第 236 行提示文案去掉「恢复副本」：改为 `notify.error("云端保存失败，请检查网络后重试", error)`。
- `open` 的依赖数组去掉 `confirm`（`confirm` 仍被 `create()` 使用，导入与 `useConfirm()` 调用保留）。
- 首次挂载时清掉历史遗留副本 key（否则这些死数据会长期占 localStorage 配额，正是第 2 项写入失败的诱因之一）。

### 2. 让本机默认方案真正可删 —— 新增 `src/features/interior/cloud/guestStore.ts` + 改 `useProjects.ts`

把「本机方案的 localStorage 读写」从 Hook 里抽出成不依赖 supabase 的纯模块（便于单测），并修正两个不变量：

新文件 `src/features/interior/cloud/guestStore.ts`（`useProjects.ts` 的 `KEY` / `DEMO_KEY` / `defaultGuest` / `initialProjects` 迁入此处）：
```ts
export const GUEST_KEY = "interior-guest-projects-v2";
export const GUEST_DEFAULT_KEY = "interior-guest-default-v1";
const RECOVERY_PREFIX = "interior-recovery-";

export type WriteResult = { ok: true } | { ok: false; cause: unknown };

/** 读取本机方案列表。存储不可用时返回空列表，绝不凭空造一份删不掉的项目。 */
export function readGuests(): Project[];          // 首次运行（无 key）仍播种 createProject("reference")
export function readGuestDefault(): Project;      // 原 defaultGuest()
/** 先写存储、成功了才由调用方更新状态；失败时存储内容保持原样。 */
export function writeGuests(projects: Project[]): WriteResult;
/** 清理历史上写入的 interior-recovery-* 死数据。 */
export function purgeRecoveryCopies(): void;
```

`useProjects.ts` 对应修改：
- `persist()` 改成**先写后更新状态**——这是「界面删了、刷新又回来」的根因：
  ```ts
  const persist = useCallback((ps: Project[]) => {
    const result = writeGuests(ps);
    if (!result.ok) {
      setStatus(STATUS.localFailed);
      notify.error("本机存储空间不足，请导出 JSON 保留方案", result.cause);
      return false;
    }
    setGuests(ps); guestsRef.current = ps; setStatus(STATUS.local);
    return true;
  }, []);
  ```
- `remove()`（第 473-502 行）解耦「保存当前项目」与「删除目标项目」，并把静默失败改成明确反馈：
  ```ts
  if (!sessionRef.current) return false;
  // 只有删掉正在编辑的项目才需要先落盘；删别的项目不该被当前项目的保存状态拦住。
  if (activeRef.current?.id === p.id && !(await save())) {
    notify.fail("当前项目还有未保存的改动，已取消删除");
    return false;
  }
  const generation = epoch.current;
  if (p.cloud) {
    const { data, error } = await attempt(
      supabase.from("interior_design_projects").delete().eq("id", p.id).select("id").maybeSingle(),
    );
    if (generation !== epoch.current) return false;
    if (error) { notify.error("删除项目「" + p.name + "」失败", error); return false; }
    if (!data) { notify.fail("没有权限删除项目「" + p.name + "」，它仍在云端"); return false; }
    setCloud((c) => c.filter((r) => r.id !== p.id));
  } else if (!persist(guestsRef.current.filter((r) => r.id !== p.id))) {
    return false; // persist 已提示本机存储失败，列表保持原样
  }
  ```
  （`.select("id").maybeSingle()` 让「RLS 挡掉、实际 0 行删除」不再被当成成功——否则同样表现为「删了又回来」。）
- 清理副本的挂载 effect 调用 `purgeRecoveryCopies()`。

### 3. 删除图标标红 —— `src/features/interior/components/ProjectManager.tsx`

```ts
const iconAction = 'h-8 w-8 text-muted-foreground hover:text-foreground';
// 删除是破坏性操作，图标常驻危险色（Von Restorff：让不可撤销的动作一眼可辨）
const dangerIconAction = 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive';
```
第 52 行删除按钮的 `className={iconAction}` 改为 `className={dangerIconAction}`。重命名/复制不动。

### 4. 测试
- 新增 `src/features/interior/cloud/guestStore.test.ts`（stub 一个 Storage：`getItem/setItem/removeItem/key/length`，可注入抛错）。
- 扩展 `src/features/interior/components/managementUi.test.tsx`：删除按钮带 `text-destructive`、重命名按钮不带。

## 关键文件
- `src/features/interior/cloud/useProjects.ts`（1、2 项主体）
- `src/features/interior/cloud/guestStore.ts`（新增）
- `src/features/interior/cloud/guestStore.test.ts`（新增）
- `src/features/interior/components/ProjectManager.tsx`（第 3 项）
- `src/features/interior/components/managementUi.test.tsx`（断言补充）

## Implementation checklist
- [x] `useProjects.ts`：删除 `STATUS.recovery`，且全文件不再出现 `STATUS.recovery`。
- [x] `useProjects.ts`：`update()` 云端分支不再写 `interior-recovery-*`（仅保留 dirty 标记 + 1s 防抖 save）。
- [x] `useProjects.ts`：`open()` 云端分支不再读副本、不再 `confirm`，直接使用云端 state 并 `setStatus(STATUS.cloud)`；`open` 依赖数组不再含 `confirm`。
- [x] `useProjects.ts`：`save()` 失败提示不再出现「恢复副本」字样；`create()` 里的 `confirm` 用法保留可用。
- [x] 新增 `guestStore.ts`，含 `readGuests` / `readGuestDefault` / `writeGuests` / `purgeRecoveryCopies` 与两个 key 常量；`useProjects.ts` 中原 `KEY`/`DEMO_KEY`/`defaultGuest`/`initialProjects` 已迁出且无重复定义。
- [x] `persist()` 先 `writeGuests()` 成功后才 `setGuests`：写入失败时 `guests` 状态与 localStorage 内容都不变。
- [x] `remove()` 删除非当前项目时不调用 `save()`；删除当前项目且 `save()` 失败时给出 `notify.fail` 并保留该项目。
- [x] `remove()` 本机分支 `persist()` 失败时返回 false 且不弹「已删除项目」成功提示。
- [x] `remove()` 云端分支用 `.delete().eq("id",…).select("id").maybeSingle()`，0 行时提示无权限并保留卡片。
- [x] 挂载 effect 调用 `purgeRecoveryCopies()`，清除所有 `interior-recovery-*` key。
- [x] 项目管理卡片删除按钮 class 含 `text-destructive`，重命名/复制按钮不含。

## Verification checklist
- [x] `pnpm exec tsc --noEmit` 通过。
- [x] `pnpm lint` 通过（仅剩 PlanCanvas 既有的 useEffect 依赖 warning，与本次无关）。
- [x] 改动完成时刻 `pnpm test` 全绿：58 文件 / 397 用例，含新增 `guestStore.test.ts` 6 条。
  - [x] 正向：`writeGuests` 成功后 `readGuests` 能读回同样内容。
  - [x] 负向：`setItem` 抛错时 `writeGuests` 返回 `{ok:false}`，且存储里仍是上一次的内容（不会「界面删了、刷新又回来」）。
  - [x] 边界：`writeGuests([])` 之后 `readGuests()` 返回 `[]`（删掉的本机默认方案不会被重新播种）。
  - [x] 负向：`getItem` 抛错时 `readGuests()` 返回 `[]`，不凭空造项目。
  - [x] `purgeRecoveryCopies()` 清掉全部 `interior-recovery-*`，且保留其它 key。
- [x] 新增断言：`managementUi.test.tsx` 中「删除X」按钮 class 含 `text-destructive`，「重命名/复制X」按钮不含（该文件 8 条断言全绿）。
- [x] `pnpm run build` 成功。
- [x] 预览渲染正常（desktop_1280 与 mobile_390 各一张截图），状态显示「本机已保存」，无新的控制台报错。
- [ ] 浏览器（预览）人工确认：打开项目**不再**出现「发现较新的本机恢复副本」弹窗。— 需登录态，本地无法进入项目管理页，未验证。
- [ ] 浏览器人工确认：本机默认方案「三室两厅两卫 · 原木之家」删除后刷新不再出现。— 同上，未验证。
- [x] 删除图标为红色的证据：DOM 断言确认「删除X」按钮 class 含 `text-destructive`；构建产物 CSS 含 `.text-destructive{color:hsl(var(--destructive))}` 与 `hover:bg-destructive/10`，`:root` 中 `--destructive: 5 61% 42%` 未被并行改动移除。
- [ ] 浏览器人工确认：卡片删除图标视觉为红色。— 需登录态，页面级视觉未核对。
- [x] 代码层面确认：`useProjects.ts` 不再读写任何 `interior-recovery-*` key（grep 无命中）。

## 备注
执行期间工作区另有一个并行改动（`model/wallRemoval.ts` 新增、`softwareTargets.ts` 删除、`Design.measures` 移除、`index.css` 大幅精简）正在进行中，导致 `PlanCanvas.test.tsx` / `Workbench.test.tsx` / `useSegmentDrawing.test.ts` / `drawingExport.test.ts` 等 51 条用例失败。这些失败与本次改动无关（上述文件均不引用 `useProjects` / `guestStore` / `ProjectManager`），本次自己引入的 `guestStore.test.ts` 与 `managementUi.test.tsx` 独立运行全绿。

