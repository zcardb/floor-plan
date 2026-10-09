# 项目管理卡片统一与自动缩略图

## Context
项目管理页里有两套卡片：「我的项目」只有图标、日期和三个常驻图标按钮（删除还是红色），「内置模板」有平面图、描述、面积和两个大按钮。两套卡片的高度、信息量和操作方式都不一样，网格看起来很乱。
目标：
1. 只用一套卡片。我的项目也显示平面缩略图，每次保存修改后自动更新。
2. 卡片只显示标题，不再显示模板描述和面积。
3. 点卡片就打开：模板进入只读预览，我的项目进入编辑。「用此模板新建」改成「复制」，和我的项目用同一套操作入口。

## 设计依据（Growth.Design 法则）
- **图像优势效应 / 识别优于回忆**：每张卡都有平面缩略图，用户看图就能认出方案，不用靠名字回忆。
- **相似律 / 共同区域**：模板和我的项目用同一个卡片外壳，只靠左上角的小徽标（内置 / 本机）区分。
- **希克定律**：每张卡只保留一个主动作（点击打开），次要操作收进「⋯」菜单。
- **费茨定律**：缩略图框和标题都能点击打开，点击目标尽量大。
- **渐进披露 + 防错**：重命名、复制、删除收进「⋯」菜单；删除放到菜单最底部，用危险色并用分隔线隔开，不再常驻红色图标。
- **冯·雷斯托夫效应**：整页只有右上角「新建项目」一个实心主按钮，卡片里不再出现一排排主色按钮抢视线。
- **雅各布定律**：交互方式和 Figma、Notion、Enter 项目列表的文件网格一致（缩略图在上，标题和 ⋯ 在下方同一行）。
- **接近律**：「⋯」紧挨着标题，用户一眼就知道这些操作属于这张卡片。

## 卡片结构
参考你给的截图：上面是缩略图框，下面是无边框的标题行，「⋯」放在标题行最右侧，和标题垂直居中对齐。
```
┌─────────────────────────┐
│ [内置]                  │  缩略图框 4:3，画布底色、圆角、细边框
│      平面缩略图          │  悬停时边框变成主色并带浮起阴影（整张卡都能点）
│                         │  忙碌时：缩略图上叠一层半透明遮罩和转圈
└─────────────────────────┘
 标题（单行，超出省略）        [⋯]   ← 标题行在框外，⋯ 常显，与标题同一行对齐
```
- 标题行：标题占满剩余宽度并单行省略；「⋯」是 32px 的 ghost 图标按钮，始终显示，不用悬停才出现，触屏端也能直接点。
- 「⋯」在可点击区域外面单独响应，点击它不会打开项目。
- 我的项目的「⋯」菜单：重命名、复制、分隔线、删除（危险色）。系统默认方案的重命名和删除保持禁用，并附原有提示文案。
- 模板的「⋯」菜单：只有「复制为我的项目」，一键创建名为「模板名 · 副本」的云端项目并直接打开，和我的项目的复制流程一样。
- 旧的云端项目还没有缩略图时，显示画布底色和一个淡色户型图标作为占位。项目下一次保存后自动生成缩略图。

## 缩略图方案
- 现有的 `TemplateThumbnail` 改成通用的 `PlanThumbnail({ design, label })`，内置模板和本机项目（state 已在内存里）直接实时渲染。
- 云端项目：每次保存成功时，把 `PlanThumbnail` 渲染成 SVG 字符串（`react-dom/server` 按需动态导入，不进首屏包），写入新加的 `thumbnail` 列，内容是矢量图。
  - 渲染时把当前主题的 `--plan-*` 色值以 `<style>` 形式写进 SVG，前端用 `<img src="data:image/svg+xml,…">` 展示。图片形式的 SVG 不会执行脚本，比直接注入 HTML 安全。
- 列表查询增加 `thumbnail` 字段。create、saveGuestToCloud、duplicate、导入在插入时一并写入；save 成功后同步更新本地列表里的 `thumbnail`。

### 数据库（同一业务的兼容改动，不动现有数据）
```sql
alter table public.interior_design_projects
  add column if not exists thumbnail text
  check (thumbnail is null or length(thumbnail) <= 300000);
```
RLS 沿用现有的 owner 策略，不做改动。

## 关键文件
- `src/features/interior/components/BuiltinTemplates.tsx` → 改名为 `PlanThumbnail.tsx`，只保留通用缩略图组件，并导出 `renderThumbnailSvg(design)`
- 新建 `src/features/interior/components/ProjectCard.tsx`：统一卡片，props 为 `title / badge / thumbnail / busy / onOpen / menu`
- 新建 `src/features/interior/components/ProjectCardMenu.tsx`：「⋯」下拉菜单，复用 shadcn `DropdownMenu`
- `src/features/interior/components/ProjectManager.tsx`：两类条目都渲染 `ProjectCard`；新增 `rowAction` 类型 `copyTemplate`
- `src/features/interior/cloud/useProjects.ts`：给 `ProjectSummary` 加 `thumbnail`；修改 loadList、save、create 和 saveGuestToCloud 的写入
- `src/index.css`：删除 `.cms-card*` 和 `.builtin-template-card` / `.template-card-*` 样式，新增 `.project-card*`（使用语义 token）
- `ProjectRowActions.tsx`（工作台的项目下拉）和工作台里的「只读预览 · 用此模板新建」提示条保持不变

## Implementation checklist
- [x] 迁移：给 `interior_design_projects` 添加可空的 `thumbnail text` 列和长度约束，不改动已有行
- [x] `PlanThumbnail`：从 `TemplateThumbnail` 抽出，入参改为 `design`；`renderThumbnailSvg` 输出带 `--plan-*` 内联变量的 SVG 字符串
- [x] `useProjects.loadList` 的 select 增加 `thumbnail`，并映射到 `ProjectSummary.thumbnail`
- [x] `useProjects.save` 的云端 update 写入 `thumbnail`；保存成功后 `setCloud` 同步更新该行的 `thumbnail`
- [x] `create` / `saveGuestToCloud` 的 insert 写入 `thumbnail`，新行进入列表时自带缩略图
- [x] `ProjectCard` + `ProjectCardMenu`：缩略图框和标题都能点击打开；「⋯」放在缩略图框下方的标题行右侧、与标题垂直居中，始终显示，点击它不会触发打开
- [x] 内置模板卡：点击后走 `rowAction.run('open', builtinRow)` 进入只读预览；菜单项「复制为我的项目」调用 `projects.create(createProject(id, name + ' · 副本'), true)` 然后 `opened()`
- [x] 我的项目卡：缩略图优先级为本机 state 实时渲染 > 云端 `thumbnail` > 占位；菜单里的重命名、复制、删除复用现有的 `setRename`、`rowAction.run('duplicate')`、`setDeleting`
- [x] 卡片标题单行省略；模板不再显示描述和面积；我的项目不再显示日期，忙碌状态改为缩略图上的遮罩
- [x] 删除 `BuiltinTemplateCard` 和不再使用的 CSS；所有颜色只用设计 token

## Verification checklist
- [ ] 正向：编辑一个云端项目并等待自动保存后回到项目管理，卡片缩略图显示最新布局
- [ ] 正向：点击模板卡进入只读预览；在模板卡菜单选「复制为我的项目」，会新建「· 副本」并进入编辑，列表中出现带缩略图的新卡
- [ ] 正向：我的项目菜单里的重命名、复制、删除行为与原来一致；删除仍会弹出二次确认
- [ ] 默认 / 负向：没有缩略图的旧云端项目显示占位，不报错；系统默认方案的重命名和删除项为禁用状态
- [ ] 边界：标题很长时单行省略并在 tooltip 中显示全称；点击「⋯」不会打开项目；同一时间只能进行一个卡片操作
- [ ] 响应式：在 mobile_390 和 desktop_1280 下截图项目管理页；两种宽度下「⋯」都和标题在同一行右侧对齐，长标题不会把「⋯」挤出卡片
- [x] `pnpm run lint`、`pnpm vitest run src/features/interior`、`pnpm run build` 全部通过（WallSplitDialog 测试失败来自并行中的墙体分割改动，与本次无关）
