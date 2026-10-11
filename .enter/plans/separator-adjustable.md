# 编辑器整体重新分区：顶栏「集合 + 导出」/ 统一侧栏 / 画布竖条

> 上一份计划（分隔线可调整、选择框选合并等）已全部完成并提交，原文已归档到 `archived-separator-adjustable.md`。

## Context

现在编辑器的入口散在四处，功能重叠：

- **顶栏右侧**：视图下拉、导出下拉、全屏、头像（`AccountMenu`）。
- **画布两侧**：左边家具库面板、右边属性面板，各有一套开关（`stage-pane-buttons`），窄屏变抽屉。
- **底部**：状态条（模式 + 坐标 + 提示 + 保存状态 + 免责声明），画布上还有 1 米比例尺。
- **属性面板**：选中对象的编辑已经全部搬进 Visual Editor 工具条，面板只剩「方案总览 / 户型设置 / 成本」三块全局信息。

目标是让画布成为主角：进入编辑器时只有一块干净画布 + 一条竖向工具条，需要什么再从侧栏打开，所有侧栏共用一个组件。

## 目标布局

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⌂ 项目名 ▾ │ 2D/3D │ 墙 门 窗 │ 重置 清空 │ ↶ ↷                ⬡  [导出] │
├───────────────────────────────────────────────┬────────────────────────┤
│  平面布置图 / 自定义户型                         │ SidePanel（按需出现）   │
│                                               │  标题            ✕     │
│                    画布                    ┌─┐ │  家具库 / AI 对话 /     │
│                                           │↖│ │  户型设置 / 方案总览 /  │
│                                           │▦│ │  成本                  │
│                                           │✦│ │                        │
│  [− 1:93 + ⛶]                              └─┘ │                        │
└───────────────────────────────────────────────┴────────────────────────┘
   左下：缩放条                          右侧中部：画布竖条（选择 / 家具 / AI）
```

- 顶栏右侧只剩两个：**集合**（立方体图标，样式参考图 353 的那个图标按钮）和**导出**（主按钮）。
- 默认 `sidePanel = null`：左右都没有面板。
- 画布竖条贴画布右边缘、垂直居中（参考图 355 红框位置）；侧栏打开时竖条跟着左移，始终贴在侧栏左侧。

## 各区域设计

### 1. 顶栏

| 项 | 改动 |
|---|---|
| 全屏按钮 `toolbar-fullscreen` | 删除 |
| 头像 `AccountMenu` | 从顶栏删除；登录 / 账号移到左上角项目下拉底部（见 §5） |
| 视图下拉 | 并入「集合」菜单 |
| 导出 | 改成主按钮（`--primary` 底），兼任保存（见 §2） |
| 集合 | 新增，图标按钮，仅图标 + 悬停提示「集合」 |

说明：图 352 / 353 最上面那一行（预览、地址栏、头像、立方体、发布）是 Enter 预览器自己的界面，不是项目代码，这次不动。

### 2. 导出按钮 = 保存状态

导出按钮的文案和状态直接取 `useProjects` 里已有的 `p.status`（`saved` / `saving` / `dirty` / `error` / `conflict`），不新增保存逻辑：

| 状态 | 按钮 | 下拉第一行 |
|---|---|---|
| 已登录 · `dirty` | 「保存」+ 小圆点 | 「有待保存更改」+「立即保存」（调用现有 `cloudSave`） |
| 已登录 · `saving` | 「保存」+ 转圈 | 「正在云端保存…」 |
| 已登录 · `saved` | 「导出」 | 「云端已保存」 |
| `error` / `conflict` | 「保存」+ 红点 | 错误文案（`--destructive`） |
| 游客 · 有改动 | 「保存」+ 小圆点 | 「登录后保存到云端」+「登录并保存」（等同现有横幅的按钮） |
| 游客 · 无改动 / 只读模板 | 「导出」 | 「本机已保存」/「内置模板 · 只读」 |

下拉其余部分保持现在的一级结构：分组标题「按格式导出」+ 5 个格式 + 分隔线 +「导出到其他软件」。

### 3. 集合菜单（`CollectionMenu`）

窄菜单（232px，与项目下拉同一刻度），四项单行入口：

1. **视图 ▸**：悬停展开二级菜单，内容就是现在「视图」下拉里的 6 个勾选项（尺寸标注 / 房间名称 / 家具显示 / 辅助网格 / 承重墙高亮 / 贴墙吸附）+ 分隔线 + 显示比例 1:60 / 1:100。勾选不关菜单（沿用现有 `preventDefault`），写回现有的 `layers` 与 `dimensionSettings`。
2. **户型设置**：点击打开侧栏 `settings`。
3. **家具库**：点击打开侧栏 `library`。
4. **方案总览**：点击打开侧栏 `overview`（见 §7）。

当前已打开的侧栏对应项高亮（`data-active`）。

### 4. 统一侧栏（`SidePanel`）

```tsx
export type PanelKind = 'library' | 'ai' | 'settings' | 'overview' | 'cost';
<SidePanel title="家具库" onClose={...}>{content}</SidePanel>
```

- 外壳：标题（`--fs-title`）+ 右侧关闭按钮 + 可滚动内容区；宽 340px，复用现在 `.property-panel` 的阴影 / 背景 / 抽屉规则（改名 `.side-panel`）。
- 同一时间只开一个；再点同一个入口就关闭。
- 窄屏（≤1100px）以抽屉形式从右侧滑出，复用现有 `drawer-backdrop`。
- `Workbench` 状态收敛为 `sidePanel: PanelKind | null`，删除 `hideLib` / `hidePanel` / `panelMode` / `drawer` 的 `"lib" | "panel"` 两态，以及 `.hide-library` / `.hide-properties` 布局类。

| kind | 标题 | 内容 | 来源 |
|---|---|---|---|
| `library` | 家具库 | `Library`（简化头部，见 §6） | 竖条「家具」、集合「家具库」 |
| `ai` | AI 模式 | `AiChatPanel`（见 §8） | 竖条「AI 模式」 |
| `settings` | 户型设置 | 现在属性面板「户型设置」标签页的内容，原样搬 | 集合「户型设置」 |
| `overview` | 方案总览 | 现在「方案总览」标签页的内容 + 顶部成本摘要行 | 集合「方案总览」 |
| `cost` | 成本 | 现在的 `CostPanel`，返回按钮回到 `overview` | 方案总览的成本摘要、房间工具条的金额按钮 |

### 5. 登录 / 账号（项目下拉底部）

`ProjectMenu` 在「切换项目 ▸」下方加分隔线，然后：

- 游客：「登录」→ 现有 `p.login`。
- 已登录：灰字邮箱（`--fs-meta`）+「退出登录」→ 现有 `p.logout`（`loggingOut` 时转圈）。

`AccountMenu` 组件保留，项目管理页还在用。

### 6. 画布竖条（`CanvasRail`）+ 画布清理

竖条三个图标按钮（`--ctl-lg` 方块、竖排、白底卡片 + `--shadow-panel`，样式参考图 355）：

| 按钮 | 行为 | 高亮条件 |
|---|---|---|
| 选择（`MousePointer2`，快捷键 V） | `setTool('select')` | `tool === 'select'`（默认） |
| 家具（`Armchair`） | 切换侧栏 `library` | `sidePanel === 'library'` |
| AI 模式（`AiIcon`） | 切换侧栏 `ai` | `sidePanel === 'ai'` |

顶栏里原来的「选择」按钮移到竖条，顶栏工具组只留墙 / 门 / 窗。窄屏时竖条横排在画布底部中间。

画布上一起清理：

- 删除 1 米比例尺 `.scale-bar`。
- 删除底部状态条 `.status-bar`：
  - 坐标 `X / Y`：删除。
  - 操作提示 `tip`：交给已有的 `mode-hint` 浮层，并让绘墙模式也显示 `mode-hint`，把「完成绘墙」按钮挂进去，不丢功能。
  - 保存状态：搬到导出按钮（§2）。
  - 「设计示意 · 拆改须专业确认」：放进方案总览底部注释。
- 缩放条 `.canvas-zoom` 从右下移到**左下**；「适应窗口」图标从 `Maximize2` 换成 `Scan`（取景框形状，和「全屏」的双向箭头区分开），提示和快捷键 F 不变。
- 删除 `stage-pane-buttons`（左右面板开关）和 `mobile-library` 浮动按钮，竖条已覆盖。

### 7. 家具库头部简化（下方家具卡片不动）

现在头部从上到下：「构件与家具 / 素材库」→ 大号虚线「新建家具 / 账号库」→ 搜索框 → 7 个分类九宫格 → 两行提示卡 → 「客厅家具 16 件」→ 卡片。

改成：

1. 标题由 `SidePanel` 提供（「家具库」），去掉「构件与家具 / 素材库」。
2. **搜索框 + 新建**同一行：搜索框占满，右侧一个 32px 图标按钮（`Plus`，悬停提示「新建家具 / 账号库」，只在登录可编辑时出现），不再占一整行。
3. **分类**改成一行可横向滚动的胶囊标签（`卧室 客厅 餐厨 卫浴 家电 书房 硬装`），当前项用 `--accent` 底；去掉每格的图标，高度从 3 行九宫格降到 1 行。
4. **提示**合进分组小标题行：「客厅家具 · 16 件」右侧灰字「点击添加或拖入」，不再单独一张卡片。
5. 硬装构件按钮（墙 / 门窗）、家具卡片网格保持不变。

### 8. AI 对话面板（`AiChatPanel`，本轮只做布局）

- 侧栏内上下两段：上面是消息区（空状态：`AiIcon` + 一行「描述你想要的布局，AI 帮你规划」），下面贴底是输入框。
- 输入框直接复用 `AiComposer`，和 AI 布局、AI 新建里的输入框一模一样，在侧栏里全宽显示。初始值沿用现有默认：`count: DEFAULT_AI_COUNT`、`engine: DEFAULT_AI_ENGINE`。
- **功能先不接**：`onSend` 不调用任何生成逻辑，发送按钮靠 `AiComposer` 自身的校验（无描述时禁用）；有描述时发送仅保留在输入框里，不清空、不报错。`hint` 写「对话功能即将接入」。
- 游客：消息区显示「登录后可使用 AI 模式」+「登录」按钮，不渲染输入框。

## 方案总览放哪里（第 1 个问题的回答）

**放在「集合」菜单里，打开统一侧栏的 `overview` 内容。**

理由：

- 它描述的是整个方案（总面积、房间面积列表、家具数、层高），和「户型设置」同属全局信息，不属于某个选中对象，所以不该进 Visual Editor 工具条，也不需要常驻。
- 成本是同一份方案的另一种读法：方案总览顶部放一行「成本 ¥30,442 ›」，点一下切到 `cost`；房间工具条的金额按钮也直达 `cost`。这样原来属性面板顶部的「属性 / 成本」两个标签可以去掉。

是否符合 UI 规范：现在的「134.82 m²」用的是大号数字，超出了 `UI_GUIDELINES §1` 的字号档位。搬过来时改成和房间尺寸弹层一样的**指标卡**（数值 `--fs-figure` 18px、标签 `--fs-label`、浅底圆角），一排三张：套内净使用面积（主指标，`--accent` 底）/ 空间数 / 家具数；层高放进「户型设置」。房间面积列表沿用现有行样式。

## 游客模式（第 2 个问题的回答）

| 能力 | 游客（未登录） | 只读内置模板 |
|---|---|---|
| 画布编辑 | 可以，改动存本机 | 不可编辑 |
| 竖条：选择 / 家具 | 可用 | 选择可用；家具库可浏览，卡片禁用（现有逻辑） |
| 竖条：AI 模式 | 侧栏显示「登录后可使用」+ 登录按钮 | 同左 |
| 集合：视图 / 家具库 | 可用 | 可用 |
| 集合：户型设置 / 方案总览 | 可用（只读字段照现有规则禁用） | 可看不可改（沿用 `fieldset disabled`） |
| 成本 | 隐藏（现在就只对登录用户显示） | 隐藏 |
| 导出按钮 | 有改动时显示「保存」，下拉里「登录并保存」 | 「导出」，可正常导出 |
| 顶部横幅 | 保留「用此模板新建」（只读）；「模版已更改 · 登录并保存」横幅删除，由导出按钮承担 | 保留 |
| 登录入口 | 项目下拉底部「登录」 | 同左 |

## 涉及文件

- **新增**：`components/SidePanel.tsx`、`components/CanvasRail.tsx`、`components/CollectionMenu.tsx`、`components/AiChatPanel.tsx`、`components/OverviewPanel.tsx`、`components/HouseSettingsPanel.tsx`
- **改写**：`components/Workbench.tsx`（布局与状态收敛）、`components/Library.tsx`（头部简化）、`components/ExportMenu.tsx`（主按钮 + 保存状态）
- **小改**：`components/ProjectMenu.tsx`（底部登录区）、`components/CostPanel.tsx`（返回到总览）、`components/SelectionEditor.tsx`（金额按钮打开 `cost`，接口不变）
- **删除**：`components/PropertyPanel.tsx`（内容拆进 `OverviewPanel` / `HouseSettingsPanel`）、`components/PanelModeTabs.tsx`
- **样式**：`src/index.css` 新增 `.side-panel` / `.canvas-rail` / `.collection-*` / 导出按钮状态 / 胶囊分类；删除 `.status-bar` / `.scale-bar` / `.stage-pane-buttons` / `.mobile-library` / `.hide-*` / `.library-panel` / `.panel-mode-tabs` / `.library-tip`
- **文档**：`UI_GUIDELINES.md` 新增「编辑器分区」一节（顶栏 / 集合 / 竖条 / 侧栏的位置、刻度、导出按钮状态表、游客规则）；`AGENTS.md` 通用组件表加入 `SidePanel` / `CanvasRail` / `CollectionMenu` / `AiChatPanel`
- **测试**：`Workbench.test.tsx`、`toolbarMenus.test.tsx`、`Library.test.tsx`、`CostPanel.test.tsx` 及引用状态条 / 面板开关 / 视图下拉的用例按新结构更新
- **清理**：删除本次规划时误建的 `.enter/plans/editor-shell-redesign.md`

## Implementation checklist

- [ ] 删除误建的 `.enter/plans/editor-shell-redesign.md`
- [ ] `SidePanel`：标题 + 关闭 + 滚动内容区，340px，窄屏抽屉，样式由 `.property-panel` 改名而来
- [ ] `Workbench`：`sidePanel: PanelKind | null` 默认 `null`，`togglePanel(kind)` 同入口再点关闭；删除 `hideLib` / `hidePanel` / `panelMode` 及 `.hide-library` / `.hide-properties`
- [ ] `CanvasRail`：选择 / 家具 / AI 三按钮，高亮规则按 §6 表格；贴画布右边缘垂直居中，侧栏打开时贴侧栏左侧；窄屏横排底部
- [ ] 顶栏：删除全屏与头像；工具组去掉「选择」（移到竖条）
- [ ] `CollectionMenu`：立方体图标触发；视图 ▸ 二级菜单（6 勾选 + 2 比例，勾选不关菜单）；户型设置 / 家具库 / 方案总览三项打开对应侧栏并高亮
- [ ] `ExportMenu`：主按钮；文案与状态点按 §2 表格；下拉首行保存状态 +「立即保存」/「登录并保存」
- [ ] 删除游客「模版已更改」横幅，保留只读模板横幅
- [ ] `ProjectMenu` 底部：游客「登录」；已登录邮箱 +「退出登录」
- [ ] `Library` 头部：去大标题、搜索与新建同行、分类改单行胶囊、提示并入小标题「点击添加或拖入」；卡片网格不变
- [ ] `AiChatPanel`：空状态消息区 + 贴底 `AiComposer`（默认值 `DEFAULT_AI_COUNT` / `DEFAULT_AI_ENGINE`），不接生成；游客显示登录提示
- [ ] `OverviewPanel`：指标卡三张 + 成本摘要行（登录可见，点击切 `cost`）+ 房间面积列表 + 免责声明注释
- [ ] `HouseSettingsPanel`：原「户型设置」内容原样迁移（净宽 / 净深 / 层高 / 步进 / 指北 / 尺寸设置）
- [ ] `CostPanel` 的返回回到 `overview`；`SelectionEditor` 金额按钮打开 `cost`
- [ ] 画布：删除比例尺、状态条、`stage-pane-buttons`、`mobile-library`；绘墙模式显示 `mode-hint` 并含「完成绘墙」
- [ ] 缩放条移左下，适应窗口图标换 `Scan`
- [ ] 删除 `PropertyPanel.tsx`、`PanelModeTabs.tsx` 及无用 CSS
- [ ] 更新 `UI_GUIDELINES.md`、`AGENTS.md`

## Verification checklist

- [ ] `pnpm exec tsc -p tsconfig.app.json --noEmit`：除既有 `model/wallFaces.ts` 外无新增错误
- [ ] `pnpm exec vitest run src` 全部通过，新增 / 更新用例覆盖：
  - [ ] 默认进入：`sidePanel` 为空，不渲染 `SidePanel`
  - [ ] 竖条「家具」打开 `library`，再点关闭；「AI 模式」打开 `ai`；「选择」切回 select 工具
  - [ ] 集合菜单：勾选「辅助网格」写回 `layers.grid` 且菜单不关闭；「户型设置」打开 `settings`
  - [ ] 导出按钮：`saved` 显示「导出」；`dirty` 显示「保存」并有「立即保存」；游客有改动显示「登录并保存」；`error` 用错误色
  - [ ] 项目下拉：游客有「登录」，已登录有邮箱与「退出登录」且回调
  - [ ] 方案总览成本摘要点击后切到 `cost`；`CostPanel` 返回回到 `overview`
  - [ ] 绘墙模式下 `mode-hint` 含「完成绘墙」，点击回到选择工具
  - [ ] 页面中不再渲染 `.status-bar`、`.scale-bar`、全屏按钮、`AccountMenu` 触发器
- [ ] `pnpm run lint` 无新增警告
- [ ] `pnpm run build` 通过
- [ ] 截图核对 `desktop_1280`：顶栏右侧只有集合 + 导出；画布右侧竖条；左下缩放条；无底部状态条
- [ ] 截图核对 `mobile_390`：竖条横排底部、侧栏以抽屉出现、顶栏不溢出
