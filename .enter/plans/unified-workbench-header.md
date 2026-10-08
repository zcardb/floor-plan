# 顶栏与工具栏视觉统一

## 背景
现在顶栏（返回 / 项目名 / 头像 / 下载）高 70px，按钮都是 44px，下载按钮是带阴影的大块实心按钮；下面的工具栏高 54px，按钮 31px、字号 11px。两行比例、左边缘、圆角和视觉重量都不一致，看起来像两个不相关的模块拼在一起。
参考 growth.design 的几条法则来改：
- **共同区域律 / 邻近律**：两行合成一个整体的"顶部栏"，中间只用很淡的分隔线，与下方内容用一条实线分开。
- **一致性**：控件高度、圆角、字号、左右内边距和工具栏保持同一套尺度。
- **视觉层级 / 冯·雷斯托夫效应**：只保留"下载设计图"一个主色强调；减轻它的体积和阴影，让它不再压过画布。
- **雅各布定律**：账号头像放在最右侧。

已确认：保持两行结构；头像移到下载按钮右侧。

## 方案
### 1. 布局 token（`src/index.css` → `.workbench`）
- 新增 CSS 变量：`--header-h: 52px`、`--toolbar-h: 48px`、`--status-h: 30px`。
- `grid-template-rows: var(--header-h) var(--toolbar-h) minmax(0,1fr) var(--status-h)`。
- 把写死的抽屉偏移（`top:124px`、`inset:124px 0 30px`，以及移动端的 `114px` / `28px`）改为 `calc(var(--header-h) + var(--toolbar-h))` 和 `var(--status-h)`；移动端（≤600px）只覆盖这几个变量（`--status-h: 28px`），头部高度保持 52/48，保证 44px 触控区放得下。

### 2. 顶栏外观（`.main-header`）
- 和工具栏同样的 `padding: 0 22px`、背景 `--card`。
- 底部分隔线改为 `hsl(var(--border) / 0.5)`，弱化两行之间的割裂感；工具栏保留实线，作为整个顶部栏与内容区的分界。
- 未登录时的品牌区：`.brand-mark` 从 37px 缩到 32px，在 52px 行高内更协调。

### 3. 已登录顶栏控件（`WorkbenchHeader.tsx` + `.workspace-*` 样式）
- 返回按钮：32×32，圆角 6px，加 `margin-left:-8px`，让箭头图标与下面"2D 平面"切换器的左边缘对齐。
- 项目切换按钮：高 32px，13px / 600 字重（作为页面标题锚点），内边距 8px，hover 用 `--secondary`，与工具栏按钮的 hover 一致。
- 下载按钮：高 32px，`padding: 0 12px`，圆角 6px，12px 字号，去掉 `--shadow-float`；保留 primary 色，作为唯一主操作。
- 头像：移到下载按钮右边，前面加一个 `toolbar-divider` 竖线（复用现有类）；按钮 32px，头像从 32 改为 28px。
- 移动端（≤600px）：返回、头像、下载（只显示图标）的点击区保持 44px，和现有无障碍要求一致。

### 4. 测试
- `managementUi.test.tsx`：期望的 DOM 顺序改为 返回 → 切换项目 → 下载设计图 → 我的账号。

## 关键文件
- `src/features/interior/components/WorkbenchHeader.tsx`
- `src/index.css`（`.workbench`、`.main-header`、`.workspace-*`、`.brand-mark`，以及 ≤1100px / ≤600px 下的抽屉偏移）
- `src/features/interior/components/managementUi.test.tsx`

## 实施清单
- [ ] `.workbench` 新增 `--header-h` / `--toolbar-h` / `--status-h`，`grid-template-rows` 改用这些变量
- [ ] ≤1100px 时 `.library-panel` / `.property-panel` 的 `top`、`bottom` 和 `.drawer-backdrop` 的 `inset` 改用变量
- [ ] ≤600px 时删掉写死的 `62px 52px … 28px` 以及 `114px` 偏移，改为只覆盖 `--status-h`
- [ ] `.main-header` 底边线改为 `hsl(var(--border) / 0.5)`；`.brand-mark` 改为 32px
- [ ] `.workspace-icon-button` 改为 32px、圆角 6px；返回按钮通过 `margin-left:-8px` 与工具栏左边缘对齐
- [ ] `.workspace-project-switch` 改为高 32px、内边距 8px、hover 用 `--secondary`
- [ ] `.workspace-download` 改为高 32px、内边距 12px、圆角 6px、12px 字号，去掉阴影
- [ ] `WorkbenchHeader.tsx`：头像下拉菜单移到下载按钮之后，前面加 `<span className="toolbar-divider" />`，`AccountAvatar` 尺寸改为 28
- [ ] ≤600px 时返回、头像、下载按钮保持 44px 点击区，下载只显示图标
- [ ] `managementUi.test.tsx` 的顺序断言改为 返回 → 切换 → 下载 → 账号

## 验证清单
- [ ] `pnpm test` 全部通过（包括更新后的顺序断言："STUDIO"、"save-indicator" 仍然不出现）
- [ ] `pnpm run lint` 和 `pnpm run build` 通过
- [ ] 在 `desktop_1280` 和 `mobile_390` 下截图：顶栏 52px + 工具栏 48px 读起来是一个整体；返回箭头与"2D 平面"左边缘对齐；下载按钮与工具栏按钮同一尺度；头像在最右侧
- [ ] 边界情况：≤1100px 打开家具库 / 属性抽屉时，抽屉顶部正好贴着工具栏下边缘，底部贴着状态栏，不重叠也没有缝隙
- [ ] 默认态：未登录的品牌顶栏（Logo、登录、保存）在 52px 行高内不被裁切
