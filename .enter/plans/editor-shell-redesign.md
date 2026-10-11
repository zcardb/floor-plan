# 编辑器整体重新分区（工具条 / 集合 / 统一侧栏 / 画布条）

## Context

现在的编辑器有四个各自独立的区域，功能重叠、入口散乱：

- 顶部工具条右侧：视图下拉、导出下拉、全屏、头像（`AccountMenu`）。
- 顶部工具条左侧：项目下拉里塞了返回 / 新建 / 切换。
- 画布左右：左侧家具库面板、右侧属性面板，各有一套开关（`stage-pane-buttons`），窄屏还会变成抽屉。
- 底部：状态条（提示 + 坐标 + 保存状态 + 免责声明），画布上还有比例尺。

用户希望的最终形态：

- 顶部右侧只留一个主按钮「导出」，它在有改动时就是保存，状态直接显示在按钮上。
- 顶部右侧另一个入口是「集合」图标，展开一个 popover：视图（勾选）、户型设置、家具库、方案总览。
- 所有侧栏共用一个组件，只换内容：户型设置、家具设置（家具库）、方案总览、成本、AI 对话。
- 画布右侧一条竖条：选择 / 家具 / AI 模式，默认只显示这条，左右都没有面板。
- 去掉 1 米比例尺、底部状态条；缩放和适应窗口移到左下角，适应窗口换新图标。
- 去掉全屏和头像；登录 / 账号改到左上角项目下拉的底部。

同时右侧属性面板（`PropertyPanel`）的去留：所有编辑都在 Visual Editor 工具条里做完了，属性面板只剩「方案总览 / 户型设置」两块信息，正好搬进新侧栏，面板本身不再作为选中对象的属性编辑器。

## 目标布局

```
┌──────────────────────────────────────────────────────────────────────┐
│ 项目名 ▾                      2D/3D  工具组  撤销/重做      集合 ▾  导出 │
├──────────────────────────────────────────┬───────────────────────────┤
│ 画布                                      │ 侧栏（共用 SidePanel）     │
│  · 左上：模式提示（非选择模式时）          │  标题 + 关闭              │
│  · 右上：视角按钮（仅窄屏）               │  内容 = 家具库 / AI /      │
│  · 左下：缩放 − 比例 + 适应窗口 ⤢ 新图标   │        户型设置 / 方案总览 /│
│  · 右侧中部浮条：选择 家具 AI（竖条）      │        成本                │
└──────────────────────────────────────────┴───────────────────────────┘
```

## 设计决策（对应用户的第 6、7 点）

### 方案总览放哪里

放在**「集合」菜单的第三项**，打开侧栏的「方案总览」内容。理由：

- 它是「方案级」的信息，不是某个选中对象的属性，和户型设置、家具库同级，都属于集合菜单里的全局入口。
- 侧栏里「方案总览」和「成本」是同一份数据的两种读法（面积 / 房间 / 金额），做成侧栏内部的两个内容（`overview` / `cost`），总览顶部放一行成本摘要，点一下切到成本内容。房间工具条上的金额按钮继续直接打开 `cost` 内容。

遵循规范：侧栏内容沿用现有排版（`section` + `h3.section-title` + `.property-form`），大数字不要用现在的 36px，按 `UI_GUIDELINES §3` 收成指标卡（数值 `--fs-figure` 18px / 标签 `--fs-label`），和房间尺寸弹层里的指标卡一致。

### 游客模式

- 游客（未登录）和只读模板都能看到「集合」菜单，但集合里只保留**视图**和**家具库**；户型设置、方案总览、成本、AI 都隐藏（这些现在也只在登录后才有内容，AI 面板给一句「登录后可用」的提示，不静默消失）。
- 登录入口放在左上角项目下拉底部：未登录显示「登录」，点击走现有 `p.login`（`AuthDialog`）；已登录显示邮箱 + 账号入口（小助手 / 素材库 / 账号设置，复用现有 `AccountMenu` 里那几项）+ 退出登录。`AccountMenu` 组件保留给项目管理页，或在编辑器里改成 `DropdownMenuSub` 复用它现有的项。
- 只读模板顶部横幅（`WorkbenchBanner` 只读 / 模版已更改）保留，仍负责「用此模板新建」和「登录并保存」。
- 游客改动过的保存状态：导出按钮在有改动且未登录时显示「登录并保存」，点击后先登录再 `cloudSave`（和现在横幅里的行为一致）；本机保存时显示「本机已保存」。

## 实施步骤

### 1. 侧栏共用组件 `SidePanel`

新增 `src/features/interior/components/SidePanel.tsx`：

```tsx
export type PanelKind = 'overview' | 'cost' | 'settings' | 'library' | 'ai';
export function SidePanel({ kind, title, onClose, children }: { kind: PanelKind; title: string; onClose: () => void; children: ReactNode })
```

- 结构：`<aside className="side-panel">` + 头部（标题 + 关闭按钮）+ `<div className="panel-scroll">`。
- 样式沿用现在的 `.property-panel`（宽度 340px、`--shadow-panel`、窄屏 `≤1100px` 变成抽屉），改名为 `.side-panel`，`.property-panel` 的规则删掉。抽屉遮罩 `drawer-backdrop` 复用。
- 内容 `children` 由调用方按 `kind` 决定，侧栏本身不认识业务。

`Workbench` 里把侧栏状态从 `hideLib` / `hidePanel` / `drawer` / `panelMode` 收敛成一个：

```ts
const [sidePanel, setSidePanel] = useState<PanelKind | null>(null); // 默认 null：进编辑器不展开
const [drawer, setDrawer] = useState(false); // 窄屏时 sidePanel 以抽屉形式出现
```

打开 / 切换 / 关闭：`togglePanel(kind)`（点了同一个就关掉）。

### 2. 顶栏

- 删掉全屏按钮（`Expand`、`toolbar-fullscreen`）和 `AccountMenu` 触发器（头像 `account-trigger`）。
  - 注意图片 352 顶栏里的头像和全屏是**预览条**（Enter 自己的 UI），不是我们的代码，不用改；我们代码里对应的是 `toolbar-fullscreen` 与 `AccountMenu`。
- 撤销 / 重做保持原位，仍放在工具组的右侧。
- 「集合」按钮取代原来的「视图」下拉：`DropdownMenu` 触发器是 `Layers`/`Library` 图标 + 「集合」（窄屏只剩图标），内容：
  - 分组标题「视图」，下面 6 个可勾选项（尺寸标注 / 房间名称 / 家具显示 / 辅助网格 / 承重墙高亮 / 贴墙吸附）+ 末尾两个「显示比例 1:60 / 1:100」（仅 2D 可用）。沿用现有 `layer-checkbox` 勾选样式；仍然 `onSelect` 时 `preventDefault`，勾选后不关菜单。
  - 分隔线，「户型设置」→ `togglePanel('settings')`。
  - 「家具库」→ `togglePanel('library')`。
  - 「方案总览」→ `togglePanel('overview')`（游客隐藏）。
  - 已打开的项打勾（`aria-checked` / `data-active`）。
- `ExportMenu` 改为主按钮：`variant` 用设计系统里的主按钮（`.export-trigger` 改成 `bg-primary text-primary-foreground`），文案「导出」；未登录且有改动时文案「登录并保存」，保存中显示转圈。
  - 下拉第一行是保存状态（`p.status.label` 小字 + `--fs-meta`，`isSaveProblem` 时用 `--destructive`），已登录且有改动时给一项「立即保存」`onSelect={() => void cloudSave.run()}`；分隔线后是原来的 5 个格式。
  - `p.status.label` 直接复用 `useProjects` 里的文案（本机已保存 / 正在云端保存… / 有待保存更改 / 云端保存失败 / 版本冲突，请另存），去掉现在状态条里的圆点，改成按钮上的小状态点（复用 `status-dot` / `error-dot`）。
- 登录入口加进 `ProjectMenu` 下拉底部（新 `DropdownMenuItem`「登录」，或已登录时一个 `DropdownMenuLabel` 显示邮箱 + 账号相关项 + 「退出登录」），`ProjectMenu` 新增可选 props `email` / `onLogin` / `onLogout` / `loggingOut`。

### 3. 画布条（选择 / 家具 / AI）

新增 `src/features/interior/components/CanvasRail.tsx`：画布右侧中部一条竖向浮条，三个按钮（`选择` / `家具` / `AI 模式`）+ 悬停提示：

- 「选择」：`setTool('select')`，`tool === 'select'` 时高亮（默认就是它）。
- 「家具」：`togglePanel('library')`，侧栏打开且 kind 是 `library` 时高亮。
- 「AI 模式」：`togglePanel('ai')`。
- 样式：`.canvas-rail`，`--ctl-lg` 按钮、圆角 `--ctl-radius`、`--shadow-panel`；窄屏（≤1100px）横向铺在画布底部，避免遮住画布。

「家具库」这个入口原来在 `stage-pane-buttons`（`PanelLeftOpen` / `PanelLeftClose`），随新浮条一起删掉；`stage-pane-buttons` 整个移除，`mobile-library` 浮动按钮也一并删掉（浮条已覆盖）。

### 4. 家具库（家具设置）UI 简化

`Library.tsx`：

- 顶部 `panel-heading` 的「构件与家具 / 素材库」删掉，改用 `SidePanel` 的标题「家具」。
- 「新建家具 / 账号库」按钮不再独占一行大字，收到标题右侧当一个图标按钮（`Plus`，提示「新建家具 / 账号库」），或作为搜索行右侧的图标——推荐标题右侧图标按钮，登录后才出现。
- 搜索行、分类九宫格保持。
- 提示文案 `library-tip` 简化为一行：`点击添加或拖入画布`，删掉「所有家具均按真实尺寸绘制」。
- 下面「客厅家具 / 16 件」小标题 + 家具网格保持不变。
- 顶部的 `Hardware`(硬装) 分类与构件按钮保持不变。

### 5. AI 对话面板

新增 `src/features/interior/components/AiChatPanel.tsx`，作为 `SidePanel` 的一个内容：

- 结构：上面一块空的消息区（空状态：一行说明「让 AI 帮你规划布局」），底部固定 `AiComposer`（复用现有组件和它的样式，竖条布局里输入框是整块宽度，下面的输入框与 AI 布局弹窗里一模一样）。
- 状态用 `useState<AiComposerValue>`，`count` 默认 1、`engine` 默认 `{ kind: 'builtin' }`（按 `AiComposer` 现有默认值）。
- **这轮不接后端**：发送按钮保持禁用（`AiComposer` 的 `hint` 说明功能待接入），不调 `useRoomAi`。后续要接的时候，把它指向选中房间的 `roomAi.open`。
- 游客：内容区显示「登录后可用」，不渲染输入框。

### 6. 画布上其他清理

- 删掉 `.scale-bar`（1 米比例尺）和它的 JSX。
- 删掉 `.status-bar`（整个底部条）：
  - 提示文案 `tip` 本来就是「非选择模式」的提示，继续由现有的 `mode-hint` 承担；给 `wall` 工具也显示 `mode-hint`（这样「完成绘墙」按钮不丢，挂到 `mode-hint` 里）。
  - `X / Y` 坐标（`status-coordinates`）删掉。
  - 保存状态移到导出按钮（第 2 步）。
  - 「设计示意 · 拆改须专业确认」（`status-safe`）暂时移到侧栏底部一行小字（只在有内容时显示），不留在画布下方。
- 缩放条 `.canvas-zoom` 从右下移到左下（`left: var(--sp-x); bottom: var(--sp-x)`），保留 −/比例/＋；「适应窗口」换图标：`Maximize2` → `Scan`（四角框，提示仍为「适应窗口」，快捷键 `F`）。
- `stage-topline` 里的「平面布置图 / 自定义户型」与视角按钮：保留「平面布置图」这行，`stage-pane-buttons` 删掉。

### 7. 属性面板的归宿

- `PropertyPanel.tsx` 拆成两块内容组件并复用：
  - `overview`：现在的「方案总览」标签页内容（指标卡 + 房间面积列表），大数字收成指标卡。
  - `settings`：现在的「户型设置」标签页内容（净宽 / 净深 / 层高 / 步进 / 日照 / 指北针 / 尺寸设置等），原样搬。
- `PanelModeTabs` 不再需要（属性 / 成本改成侧栏内容），删除它以及 `panelMode` 状态。
- `CostPanel` 作为侧栏的 `cost` 内容复用，`back` 改成返回 `overview`。
- `SelectionEditor` 的金额按钮（房间）继续打开侧栏 `cost`；`PropertyPanel` 里给选中对象用的那些 section 全部删除（工具条已经覆盖），`PropertyPanel.tsx` 文件消失，只剩 `OverviewPanel.tsx` / `HouseSettingsPanel.tsx` 两个新文件。
- 布局类名 `.hide-library` / `.hide-properties` 及相关的 `hideProperties` 逻辑全部删除。

## 涉及文件

- 新增：`components/SidePanel.tsx`、`components/CanvasRail.tsx`、`components/AiChatPanel.tsx`、`components/OverviewPanel.tsx`、`components/HouseSettingsPanel.tsx`
- 改写：`components/Workbench.tsx`（布局 + 状态收敛）、`components/Library.tsx`（简化头部与提示）、`components/ExportMenu.tsx`（主按钮 + 保存状态）
- 小改：`components/ProjectMenu.tsx` + `useProjectCreation`（登录项）、`components/PropertyPanel.tsx`（拆分后删除）、`components/PanelModeTabs.tsx`（删除）、`components/AccountMenu.tsx`（保留给项目管理页）
- 样式：`src/index.css`（新增 `.side-panel` / `.canvas-rail` / `.export-trigger` 状态，删除 `.status-bar` / `.scale-bar` / `.stage-pane-buttons` / `.hide-*` / `.property-panel` 与 `.library-panel` 的布局规则、`panel-mode-tabs`）
- 文档：`UI_GUIDELINES.md`（新增「编辑器分区」一章：顶栏 / 集合 / 画布浮条 / 侧栏四块，侧栏宽度与抽屉行为、导出按钮的保存状态文案）、`AGENTS.md`（把 `SidePanel` / `CanvasRail` / `AiChatPanel` 加进通用组件表）
- 测试：`components/Workbench.test.tsx`、`components/toolbarMenus.test.tsx`、`components/Library.test.tsx`、`components/managementUi.test.tsx`、`components/CostPanel.test.tsx`（涉及状态条、面板开关、视图下拉、导出菜单的断言都要按新结构更新）

## 实施清单

- [ ] `SidePanel` 组件：五个内容 kind、标题 + 关闭、`panel-scroll`，窄屏抽屉化
- [ ] `Workbench` 状态收敛：`sidePanel: PanelKind | null` + `drawer`，删除 `hideLib` / `hidePanel` / `panelMode`
- [ ] 画布 CSS 分区：右侧浮条 + 侧栏布局，删掉 `.hide-library` / `.hide-properties` / `stage-pane-buttons` / `mobile-library`
- [ ] `CanvasRail`：选择（默认高亮）/ 家具 / AI 模式，点击切换侧栏，窄屏横排
- [ ] 顶栏「集合」菜单：视图勾选项写回现有 `layers` 与 `dimensionSettings`，三项面板入口，已打开项高亮
- [ ] 顶栏：删掉全屏按钮与头像；`ExportMenu` 改主按钮并显示保存状态；有改动未登录时显示「登录并保存」
- [ ] `ProjectMenu` 底部加登录 / 邮箱 + 退出登录
- [ ] `Library` 简化：去掉大标题与素材库字样、新建入口收到标题右侧、提示改一行「点击添加或拖入画布」
- [ ] `AiChatPanel`：空消息区 + 底部复用 `AiComposer`（竖条全宽），发送先禁用，游客显示「登录后可用」
- [ ] 画布清理：删比例尺、删底部状态条（坐标删除 / 图纸提示并入 `mode-hint` / 免责声明移到侧栏底部 / 保存状态移到导出按钮）
- [ ] 缩放条移到左下角，适应窗口图标换成 `Scan`
- [ ] `PropertyPanel` 拆成 `OverviewPanel` + `HouseSettingsPanel`，删除 `PropertyPanel.tsx` 与 `PanelModeTabs.tsx`
- [ ] 方案总览顶部加成本摘要行，可切到 `cost` 内容；`CostPanel.back` 返回 `overview`
- [ ] 更新 `UI_GUIDELINES.md` 与 `AGENTS.md`

## 验证清单

- [ ] `pnpm exec tsc -p tsconfig.app.json --noEmit`（除既有的 `model/wallFaces.ts` 报错外无新增）
- [ ] `pnpm exec vitest run src`：全部通过，并覆盖以下新增用例
  - [ ] 默认进入编辑器 `sidePanel === null`，左右都没有面板；点「家具」打开家具库侧栏，再点一次关闭
  - [ ] 点「AI 模式」打开 AI 侧栏，输入框为竖条全宽，发送按钮禁用
  - [ ] 「集合」菜单：视图勾选项写回 `layers` / `dimensionSettings`，且不关闭菜单；游客只看到视图 + 家具库
  - [ ] `ExportMenu`：无改动时「导出」；有改动未登录时「登录并保存」；保存失败时状态文案用错误色
  - [ ] `ProjectMenu`：未登录显示「登录」，已登录显示邮箱与「退出登录」并回调
- [ ] `pnpm run lint` 无新增警告
- [ ] `pnpm run build` 通过
- [ ] `website_screenshot` 核对 1280 宽：顶栏只有集合 + 导出，画布右侧浮条，左下缩放条
- [ ] `website_screenshot` 核对 390 宽：浮条横排、侧栏以抽屉形式出现、顶栏图标化
