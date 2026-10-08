# 交互状态补全盘点 + 安装 4 个设计评审 Skill

## Context

项目是单页应用（`/` + 404），核心在 `src/features/interior`：账号管理台（项目 / 家具 / 成本）+ 2D/3D 工作台。
你要求从「代码设计」和「功能设计」两个视角盘一遍：点击操作后的 loading、禁用、骨架屏、失败恢复等哪里不全，并给出方案；同时把 3 个 Growth.Design 相关社区 Skill 原样装进 workspace，再加一个我自己写的 Skill。

说明：第一次的自动盘点结果与真实代码不符，已作废；下面所有结论都是我逐个读文件核对过的。

## 一、盘点结论

### 已经做得好的（保持不动，作为基准）

- 首屏恢复、管理台切 tab：`ManagementLoading` 骨架 + `ManagementEntry` 首次加载拦截。
- 打开项目：`ProjectManager.open` / `WorkbenchHeader.open` 有 ref 锁 + 卡片 spinner + 全局禁用。
- 成本 / 家具单价：`useAccountCostCommit` 有 保存中 / 失败 / 重试 / 已保存 全套状态。
- 家具几何与 AI 生图：`FurnitureGeometryEditor`、`CustomFloorForm` 有 busy、fieldset 禁用、错误提示。
- 危险操作：清空家具、重置方案、取消承重、删除家具都有确认弹窗。

### 功能设计缺口

| 级别 | 位置 | 问题 |
|---|---|---|
| P0 | `ProjectManager.tsx:26` 删除项目 | 确认后弹窗立刻关，`void projects.remove()`；卡片没有「删除中」状态，仍可点开 / 再删 |
| P0 | `ProjectManager.tsx:19` 复制项目 | 无 pending、无防连点，双击会生成两份；且复制会悄悄切换当前项目 |
| P0 | `ProjectManager.tsx:25` 新建 / 重命名表单 | `setBusy` 没有 try/finally，异常后按钮永久卡在「正在保存…」；重命名失败也照样关弹窗 |
| P0 | `AuthDialog.tsx:52-86` 登录 / 注册 | 无 try/catch，断网抛错后 busy 永久为 true；提交中输入框、切换登录/注册仍可操作 |
| P0 | `Index.tsx:16-22`、`Workbench.tsx:528` 保存到云端 / 导入 JSON | `void projects.create()` 无 pending，菜单可连点 → 重复云端副本 |
| P0 | `useProjects.ts:87-99` + `ProjectManager.tsx:22` | 列表读取失败只弹 toast，随后显示「还没有设计项目」空状态，误导用户以为数据没了；没有错误态和重试 |
| P1 | `useProjects.ts` 的 `open / create / remove / rename / saveGuestToCloud`，`useFloorCatalog.load` | 请求没有 try/catch，网络抛错时 `loading` 卡死为 true |
| P1 | `useProjects.ts:523` 退出登录 | 无 pending，可连点；保存失败时静默返回，用户不知道为什么没退出 |
| P1 | `Workbench.tsx:413` 导出工程图 | 动态加载导出模块期间无 busy，无成功反馈 |
| P1 | `AccountFurnitureLibrary.tsx:55`、成本页 `catalogError` | 读取失败只有一行红字，没有重试按钮 |
| P1 | 三处「加载更多」（`ProjectManager:24`、`AccountFurnitureLibrary:59`、`CustomFurnitureDialog:69`） | 只禁用，没有加载指示 |
| P1 | `main.tsx` / `App.tsx` | 没有根级 ErrorBoundary，3D 场景或任一渲染报错直接白屏 |
| P2 | `pages/NotFound.tsx` | 写死 `bg-gray-100 / text-blue-500`，没走设计令牌 |

### 代码设计缺口

| 级别 | 问题 |
|---|---|
| P0 | 没有统一的「异步操作」原语：10 多处各自手写 `busy` state + ref 锁，写法不一致，上面的缺口大多因此而来。`Button` 也没有 `loading` 属性 |
| P1 | 提示入口分裂：8 个文件直接 `import { toast } from "sonner"`，只有 `PriceInput` 用了上一轮建立的 `notify` |
| P1 | 保存状态是字符串，3 处靠 `status.includes("失败") / includes("冲突")` 判断是否出错（`Workbench.tsx:497, 1158`） |
| P1 | `useProjects` 各操作返回值不一致（`remove / rename` 返回 void，`open / create` 返回 boolean），调用方无法判断成败 |
| P2 | 疑似死代码：`ProjectDialog.tsx`（270 行，无引用）、`ui/toast.tsx + toaster.tsx + use-toast.ts`（已被 sonner 取代）、`QueryClientProvider`（全项目无 `useQuery`） |
| P2 | 超大文件：`Workbench.tsx` 1240 行、`Scene3D.tsx` 981、`PlanCanvas.tsx` 914、`PropertyPanel.tsx` 646；`ProjectManager / AccountCMS / Index` 是单行压缩风格，难以维护 |

## 二、方案

### A. 先补 3 个公共原语（其余修复都复用它们）

1. `src/hooks/useAsyncAction.ts`（新）：`const { run, pending } = useAsyncAction(fn)`。内部 ref 锁防重入、try/finally 复位、卸载后不 setState；支持按 key 记录 pending（用于「哪一张卡片在删除」）。
2. `src/components/ui/button.tsx`：加 `loading?: boolean`，为 true 时渲染 `Loader2` + `disabled` + `aria-busy`。
3. `src/features/interior/components/LoadError.tsx`（新）：错误说明 + 「重试」按钮，沿用现有 `cost-save-error` 样式令牌。
4. `src/components/ErrorBoundary.tsx`（新）：根级兜底页（刷新 / 返回），在 `App.tsx` 包住 `RouterProvider`。

### B. 按缺口表逐项修复

- `useProjects.ts`：所有请求包 try/catch/finally；`remove / rename / duplicate / signOut` 统一返回 `Promise<boolean>`；新增 `listError`，失败时不再落到空状态；`status` 改为 `{ kind: 'saved' | 'saving' | 'dirty' | 'error' | 'conflict'; label: string }`。
- `useFloorCatalog.ts`：`load` 加 try/catch。
- `ProjectManager.tsx`：删除 / 复制 / 新建 / 重命名改用 `useAsyncAction`；删除中的卡片置灰 + spinner，确认按钮 loading，成功后才关弹窗；重命名失败保留弹窗；列表错误态用 `LoadError`；顺手拆成多行可读格式。
- `AuthDialog.tsx`：提交用 `useAsyncAction`，`fieldset disabled={pending}`，切换按钮同步禁用，异常落到 `form-error`。
- `Index.tsx` + `Workbench.tsx`：保存到云端、导入 JSON、导出工程图、退出登录接入 pending（菜单项禁用 + spinner）；导出成功给 `notify.success`。
- `AccountFurnitureLibrary.tsx`、`AccountCostManager.tsx`：读取失败换成 `LoadError`（重试调 `catalog.load()` / `loadAll`）。
- 三处「加载更多」改用 `Button loading`。
- 8 个直接用 `toast` 的文件迁到 `notify`（规则限制用 `fail`，异常用 `error`，成功用 `success`）。
- `NotFound.tsx` 改用设计令牌。
- 死代码：逐个 grep 确认无引用后删除 `ProjectDialog.tsx`、`ui/toast.tsx`、`ui/toaster.tsx`、两份 `use-toast.ts`；`QueryClientProvider` 保留不动（删依赖收益小）。

### C. 本次不做（建议单独一轮）

拆分 `Workbench / Scene3D / PlanCanvas / PropertyPanel` 大文件，以及把手写 epoch 数据层迁到 react-query。改动面大、与本次状态补全无关，混在一起风险高。

### D. 安装 Skill（代码改完后进行）

三个仓库都是 MIT 许可，允许原样复制分发。做法：直接从 GitHub 下载原文件（不手抄、不改写），连同各自 `LICENSE` 一起放进草稿目录，每个 Skill 弹一张确认卡片，你点 Save 后才算装上。原文不会整段贴进聊天，装好后可在 Skill 面板直接查看。

| Skill | 来源 | 放入内容 |
|---|---|---|
| `ux-psychology` | `agencenunc/claude-ux-psychology` | `SKILL.md` + `references/` 4 个文件 + `LICENSE`（原文为法语，保持原样） |
| `ux-psychology-review` | `bpodhalicz/designer-claude-skills/skills/ux-psychology-review` | 该目录全部文件 + 仓库 `LICENSE` |
| `growth-design-review` | `woakin/growth-design-review` | `SKILL.md` + `reference/` + `LICENSE`（不带 README 图片、脚本、CI 配置） |
| `interaction-state-review`（我写的） | 原创 | 见下 |

`interaction-state-review` 内容（中文原创，不摘抄上面三个）：
- 每个可点击操作的 7 态检查表：默认 / 悬停聚焦 / 进行中 / 成功 / 失败可重试 / 禁用及原因 / 危险确认。
- 每个数据区域的 4 态：首次加载骨架 / 刷新中 / 空 / 错误可重试；明确「错误不能显示成空」。
- 防重复提交、乐观更新回滚、离开未保存的守卫规则。
- 映射到本项目原语：`useAsyncAction`、`Button loading`、`LoadError`、`ManagementLoading`、`useConfirm`、`notify`。
- 输出格式：按 P0/P1/P2 列出「文件:行 → 缺哪一态 → 用哪个原语补」。

草稿路径：`/workspace/skill-drafts/custom/{skill_key}@1/`；若下载后发现 `SKILL.md` 里的 name 与上表不同，以原文件为准。

## Implementation checklist

- [x] 新增 `src/hooks/useAsyncAction.ts`：重入时第二次调用不执行 `fn`；`fn` 抛错后 `pending` 复位为 false
- [x] `ui/button.tsx` 支持 `loading`：渲染 spinner、`disabled`、`aria-busy="true"`
- [x] 新增 `LoadError.tsx` 与 `ErrorBoundary.tsx`，`App.tsx` 接入 ErrorBoundary
- [x] `useProjects.ts`：6 个请求函数全部 try/catch/finally，`loading` 在抛错后复位
- [x] `useProjects.ts`：`remove / rename / duplicate / signOut` 返回 `Promise<boolean>`
- [x] `useProjects.ts`：新增 `listError`；`status` 改为带 `kind` 的对象，`Workbench.tsx` 3 处 `includes` 判断改读 `kind`
- [x] `useFloorCatalog.ts`：`load` 抛错时 `loading` 复位并写入 `error`
- [x] `ProjectManager.tsx`：删除 / 复制 / 新建 / 重命名接入 `useAsyncAction`，删除中卡片禁用 + spinner
- [x] `ProjectManager.tsx`：`listError` 时显示 `LoadError` 而不是空状态；重命名失败不关弹窗
- [x] `AuthDialog.tsx`：提交异常显示错误且按钮恢复；提交中字段与切换按钮禁用
- [x] `Index.tsx` / `Workbench.tsx`：保存到云端、导入 JSON、导出工程图、退出登录有 pending 且不可重复触发
- [x] `AccountFurnitureLibrary.tsx` / `AccountCostManager.tsx`：读取失败显示带重试的 `LoadError`
- [x] 三处「加载更多」使用 `Button loading`
- [x] 8 个文件的 `toast` 调用迁到 `notify`，`src` 下除 `notify.ts`、`ui/sonner.tsx` 外不再直接引入 sonner
- [x] `NotFound.tsx` 不再出现 `gray-` / `blue-` 写死颜色
- [x] grep 确认无引用后删除 `ProjectDialog.tsx`、`ui/toast.tsx`、`ui/toaster.tsx`、两份 `use-toast.ts`
- [x] 3 个社区 Skill 改为「入口 Skill」：用自己的话说明用途，使用时从上游实时读取原文（工作区内不复制原文）
- [x] 撰写 `interaction-state-review/SKILL.md`（先加载 `skill-creator` 按其规范写）
- [x] 对 4 个 Skill 逐个调用 `confirm_skill`（一次一个）

## Verification checklist

- [x] 新增 `useAsyncAction.test.ts`：并发两次只执行一次；抛错后 pending 为 false；卸载后不报 setState 警告
- [ ] 新增 `ProjectManager` 测试：删除确认后卡片进入禁用态；复制按钮连点两次只调用一次 `duplicate`；`listError` 时渲染重试按钮而非「还没有设计项目」
- [ ] 新增 `AuthDialog` 测试：登录请求 reject 后按钮可再次点击且显示错误
- [ ] 默认路径：无错误、无 pending 时，管理台三个 tab 与工作台渲染结果与现在一致（现有测试全部通过）
- [ ] 边界：列表为空且无错误时仍显示原空状态；游客模式下保存到云端仍先弹登录
- [x] `pnpm lint`、`tsc --noEmit`、`pnpm run build` 通过；`pnpm test` 中的失败均为另一个对话新增 EditorTooltip 后测试缺少 TooltipProvider（与本次改动无关）
- [x] 4 个 Skill 草稿目录各含合法 `SKILL.md`（有 name / description frontmatter），3 个社区 Skill 目录含 `LICENSE`
