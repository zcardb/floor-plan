# 内置户型模板（五六种常见户型）

## Context

目前项目里只有两个「户型模板」：`blank`（空白户型）和 `reference`（三室两厅两卫 · 原木之家，写死在 `data/templates.ts`）。游客打开工作台时固定编辑 `reference` 这一份；登录后新建项目只能从下拉里二选一。

用户要的是：内置五六种市面楼盘常见的主力户型（可参考实际户型设计），游客能自由切换这些内置模板并直接编辑；登录后模板以「内置模板」身份出现在项目列表里，**不可编辑、不可删除**，点击只读预览 2D/3D，顶部提供「用此模板新建」。

## 模板集合（6 种，含现有参考户型）

| id | 名称 | 面积段 | 户型 | 说明 |
| --- | --- | --- | --- | --- |
| `reference` | 三室两厅两卫 · 原木之家 | ≈125㎡ | 三室两厅两卫 | 现有 `referenceDesign()`，保留不动 |
| `studio` | 一室一厅一卫 · 阳光小筑 | ≈45㎡ | 一室一厅一卫 | 小户型首置：客餐厅一体 + 南向内阳台 |
| `two-bed` | 两室两厅一卫 · 紧凑三居 | ≈89㎡ | 两室两厅一卫 | 主力刚需盘：南向客厅 + 主卧双开间朝南 |
| `three-bed` | 三室两厅一卫 · 刚需三房 | ≈105㎡ | 三室两厅一卫 | 南北双阳台 + 干湿分离卫生间 |
| `four-bed` | 四室两厅两卫 · 大横厅 | ≈143㎡ | 四室两厅两卫 | 改善盘：大横厅（面宽≥6m）+ 双套房 |
| `wide-hall` | 三室两厅两卫 · 南北通透大面宽 | ≈139㎡ | 三室两厅两卫 | 大面宽短进深（进深≈8m）、餐客一体贯通 |

设计尺寸取市面常见值：主卧开间 3.3–3.6m、客厅开间 3.9–4.5m、次卧 2.7–3.0m、厨房开间 1.8–2.1m、卫生间开间 1.5–2.1m、进深控制在 5m 上下。每种户型都要有完整墙体、门窗开口、房间分区（含地面材质）、**成套家具布置**，保证 3D 预览、报价和导出都能跑。

## 家具布置设计（每种模板都要成套、放得下、不打架）

新增 `src/features/interior/data/templateFurniture.ts`，导出 `furnitureFor(presetId, rooms): Furniture[]`。家具坐标按房间局部尺寸计算（用房间矩形 + `aabb` 推算），不手抄魔法数字。

**通用约定**

- 家具一律贴墙或按对称轴线放置，`rot` 只取 0/90/180/270，`normalizeFurniture`（`model/costs.ts`）收尾，和 `defaultFurniture()` 一致。
- 家具类型只能从 `data/catalog.ts` 已有的类型里挑（bed / nightstand / wardrobe / dresser / baycushion / sofa / cornersofa / armchair / coffeetable / tvstand / rug / table / chair / cabinet / shoecab / bookshelf / desk / counter / stove / ksink / fridge / washer / shower / toilet / vanity / plant / roundtable 等），保证报价与库面板都能对上。
- **门扇扫掠区、过道、窗（飘窗/阳台门）前 900mm 不放家具**，避免「开门撞柜子」这类一眼假的问题。
- 同房间家具不重叠（`aabb` 判定）；只有 `rug` 允许压在 `coffeetable` / `sofa` 下，`baycushion` 允许落在飘窗区间内。

**逐户型布置要点**

| 模板 | 家具布置 |
| --- | --- |
| `studio` 45㎡ | 入户鞋柜靠门侧墙；客餐厅一体：电视柜靠西墙 + 三人沙发对面（间距≥2.6m）+ 茶几 + 地毯；餐桌 1200×750 靠厨房侧，两侧各 2 椅；开放厨房一字型台面 600 深 + 灶 + 水槽 + 冰箱收在端头；卫生间淋浴角 + 马桶 + 浴室柜；南向阳台放洗衣机 + 绿植；卧室区床（1500）床头靠墙 + 床头柜×1 + 衣柜沿墙 550 深 |
| `two-bed` 89㎡ | 客厅：电视柜 + 三人沙发 + 茶几 + 地毯 + 边几 + 绿植；餐厅：餐桌 1400×800 + 4 椅 + 餐边柜；厨房 L 型台面（冰箱—水槽—灶三角动线，台面 600 深）；主卧 1500 床双床头柜 + 衣柜 2400 + 飘窗垫；次卧 1200 床 + 书桌 + 椅 + 书架；卫生间淋浴 + 马桶 + 浴室柜；阳台洗衣机 + 水槽 + 绿植 |
| `three-bed` 105㎡ | 同上格局，主卧升级 1800 床 + 梳妆台；儿童房 1200 床 + 书桌 + 椅 + 书架 + 衣柜；厨房 U/双一字台面；干区洗手台外置（洗衣机放阳台）；餐边柜 + 绿植各一处 |
| `four-bed` 143㎡ | 大横厅：转角沙发 + 单人沙发×1 + 茶几 + 地毯 + 电视柜/装饰柜；餐厅与客厅贯通（餐桌 1600×900 + 6 椅，与沙发留 900mm 通道）；主卧套房 1800 床 + 双床头柜 + 衣柜 + 飘窗垫；次卧/儿童房 1500/1200 床 + 书桌组合；书房书桌 + 椅 + 书架；两卫均三件套；生活阳台洗衣机 + 水槽 + 绿植 |
| `wide-hall` 139㎡ | 大面宽短进深：沙发面对南向电视墙，餐客一体（餐边柜做软隔断）；主卧 1800 床 + 衣柜 + 飘窗垫；两间次卧各 1200/1500 床 + 书桌或衣柜；厨房一字 + 中岛位（`counter` 600 深）；双卫三件套 + 洗衣机 |

**自动校验（接进测试，不靠肉眼）**

`src/features/interior/data/templateFurniture.test.ts` 对 6 个预设逐个断言：

1. 每件家具的 `aabb` 完整落在某个房间轮廓内（容差 = 墙厚/2）；
2. 同房间家具两两不重叠（`rug`、`baycushion` 例外）；
3. 每个直接开门的房间，其门扇扫掠区（门宽 × 900mm）内无家具；
4. 每个房间至少 1 件家具（储物间/管井类除外），且每套模板家具总数 ≥ 18 件；
5. `build()` 的结果能通过 `validateDesign`，家具类型都能在 `library`（`data/catalog.ts`）里查到。

## 实现方案

### 1. 模板数据层（新增文件）

- `src/features/interior/data/templatePresets.ts`（新）：`export const TEMPLATE_PRESETS: TemplatePreset[]`，每项 `{ id, name, tagline, area, layout, build: () => Design }`；另导出 `presetById(id)`、`PRESET_IDS`。
- `src/features/interior/data/floorplanBuilder.ts`（新）：把「按房间矩形生成墙体/门窗/房间」的活干完，避免手写几百行坐标（现有 `referenceDesign()` 就是这样手写的，新模板不再复制这种做法）：
  - `buildFloorplan({ outline, rooms, doors, windows, furniture })`
  - 复用现有 `outerWalls`、`rect`、`fromRect`（`data/templates.ts`）与 `normalizeFurniture`（`model/costs.ts`）。
  - 外轮廓 → `exterior` 墙；内部隔墙 → `partition`；承重段按房间标注为 `bearing`。
  - 门窗走现有 `Opening` 约定：参考户型的做法是「开口位置单独生成一段墙再挂 `Opening`（`offset = 墙长/2`、`width = 墙长`）」，新模板沿用同一约定，保证选中/拖动/开关门逻辑不用改。
- `src/features/interior/data/templates.ts`：`referenceDesign()` / `blankDesign()` 保持签名不变（多处依赖）；新增：
  - `Design` 增加可选 `templateId?: string`（`model/types.ts`），`referenceDesign()` 打 `templateId: "reference"`，`blankDesign()` 不打。
  - `createProject(templateIdOrKind, name?)` 扩展为能接受预设 id，按预设 `build()` 生成 `state`，并默认命名用预设名；`blank`/`reference` 旧调用保持兼容。
  - `designForTemplate(templateId: string): Design`，供重置和游客模板使用。

### 2. 校验（`model/validation.ts`）

`template` 继续只允许 `"reference" | "blank"`（避免动 `wallPolicy` / `dimensionWallEdit` / `costs` / `PropertyPanel` / `PlanCanvas` 里所有 `template !== 'blank'` 的分支），新增：

- `templateId` 可选；能对上已知预设（`PRESET_IDS`）就保留；对不上（旧数据/外部导入）就删掉该字段，不判失败——否则用户导入的旧 JSON 会被拒。
- 参考户型升级为「预设家族」后，旧数据里 `templateId` 缺失的 `reference` 项目按 `reference` 兜底。

### 3. 游客模式：多模板 + 各自保留改动（`cloud/guestStore.ts`、`cloud/useProjects.ts`）

- `guestStore.ts`
  - 每个模板一份草稿：`GUEST_DEFAULT_KEY`（`interior-guest-default-v1`）保留给 `reference`（老数据不丢），其余模板用 `interior-guest-default-<templateId>`。
  - `readGuestDefault(templateId)` / `writeGuestDefault(templateId, project)` / `guestKeyFor(templateId)`。
  - `LAST_GUEST_TEMPLATE_KEY`（`interior-guest-template-v1`）记住上次编辑的模板。
  - `systemProject()` 与 `withSystemMarker()` 保留不动（已有本机数据继续生效）；`readGuests()` 无 key 时返回 `[]`，不再播种参考户型副本（同步更新 `guestStore.test.ts` 对应用例）。
- `useProjects.ts`
  - 新增 `guestTemplateId` state + `switchGuestTemplate(templateId)`：先 `save()` 落盘当前草稿，再切 key、`setActive(readGuestDefault(next))`。
  - `update()` 游客分支改写成写到「当前模板的 key」。
  - 项目菜单/工作台顶部在游客模式下把 6 个内置模板列出来，可自由切换；`<Workbench key>` 已包含项目 id，切模板会自然重挂载，编辑器状态不会串。
  - 登录后切模板时游客草稿保留在本机（下次登录前还能接着改）。

### 4. 登录后：内置模板在项目列表里只读（`ProjectManager.tsx`、`useProjects.ts`、`ProjectMenu.tsx`）

- `ProjectSummary` 增加 `builtin?: boolean`、`templateId?: string`。
- `list` 里内置模板作为独立分组「内置模板」置顶（不参与用户项目的按时间排序）；卡片带「内置模板」标记，只提供两个操作：
  - **预览**：`projects.openTemplate(id)` → `active` 为只读预览态，**不写库、不改任何项目**。
  - **用此模板新建**：打开「新建项目」对话框并预选该模板，确认后走现有 `projects.create(project, true)` 建云端项目，随后进入工作台。
- 内置模板卡片不渲染重命名 / 复制 / 删除入口（现状 `system` 只挡了重命名和删除，复制按钮仍在——按用户要求一并去掉），`rename`/`remove`/`duplicate` 对 `builtin` 行直接返回 false 兜底。
- `ProjectMenu`（工作台左上角切换菜单）列表里同样展示内置模板分组，切换即进入只读预览。

### 5. 只读预览（`Workbench.tsx` + 子组件）

- `Project` 增加 `builtin?: boolean`；`Workbench` 内部 `const readOnly = !!p.project.builtin`，不新增 prop。
- 保护放在数据层最外层：`update={readOnly ? noop : projects.update}`，从根上保证预览态不写任何存储/云端。
- UI：
  - 顶部一条提示条：`内置模板 · 只读预览` + 主要按钮「用此模板新建」（复用现有 guest banner 的样式与位置）。
  - 隐藏/禁用写操作：绘墙、门、窗工具，重置方案、清空家具、撤销/重做、导入类入口；左侧家具库隐藏「拖入新增」（仍可浏览），属性面板只读展示。
  - 保留：2D/3D 视图切换、鸟瞰/漫游/剖切、视图图层开关、显示比例、导出、全屏、账号菜单、选中查看。
  - 键盘快捷键在开头直接 return（只读时）。
- 子组件最小改动：`PlanCanvas` 加 `readOnly`（指针交互直接 return）、`PropertyPanel` 加 `readOnly`（隐藏增删改控件）、`Library` 加 `readOnly`（隐藏拖入/新增）。

### 6. 创建/重置链路

- `ProjectManager` 新建对话框的「户型模板」下拉换成 6 个预设（分组：空白户型 + 5 个预设 + 参考户型），`createProject` 按预设生成。
- `Workbench.resetDesign()`：由 `d.templateId ? designForTemplate(d.templateId) : (d.template === 'blank' ? blankDesign() : referenceDesign())` 决定重置目标。
- 舞台顶部模板名（现在写死 `/ 三室两厅两卫`）改为读预设名；`Library` 的 `blank`、`data/templates.ts` 的 `createProject` 判断逻辑保持原样。

### 7. 样式（`src/index.css`）

沿用现有 `cms-*` 设计令牌体系新增：内置模板分组标题、模板卡片（缩略 + 名称 + 面积/户型标签）、`内置模板` 徽标、只读提示条。不写死颜色，全部走 `hsl(var(--...))`。模板缩略图用现有平面绘制能力画 SVG 简图（不引入图片资源）。

## 关键文件

- 新增：`src/features/interior/data/templatePresets.ts`、`src/features/interior/data/floorplanBuilder.ts`、`src/features/interior/data/templateFurniture.ts`
- 修改：`src/features/interior/data/templates.ts`、`src/features/interior/model/types.ts`、`src/features/interior/model/validation.ts`、`src/features/interior/cloud/guestStore.ts`、`src/features/interior/cloud/useProjects.ts`、`src/features/interior/components/ProjectManager.tsx`、`src/features/interior/components/ProjectMenu.tsx`、`src/features/interior/components/Workbench.tsx`、`src/features/interior/components/PlanCanvas.tsx`、`src/features/interior/components/PropertyPanel.tsx`、`src/features/interior/components/Library.tsx`、`src/index.css`
- 测试：`src/features/interior/data/templateFurniture.test.ts`（家具布置 5 条校验）、`src/features/interior/model/validation.test.ts`（`templateId` 校验）、`cloud/guestStore.test.ts`（不再播种 / 多模板草稿 key）、`components/Workbench.test.tsx`（只读态）、`managementUi.test.tsx`（内置模板卡片无重命名/删除/复制）

## 不做的事

- 不新增数据库表、不改 `interior_design_projects`：模板是代码常量，登录用户「用此模板新建」= 普通云端项目，天然出现在项目列表里。
- 不扩展 `Design["template"]` 枚举、不动承重墙/结构锁定等既有策略。
- 不删除、不改用户本机已有的 `system` 默认方案（保留原「只能复制」规则）；`readGuests()` 首次运行不再播种它——内置模板已覆盖这个用途。

## Implementation checklist

- [ ] `Design` 增加可选 `templateId`；`referenceDesign()` 标记 `templateId: "reference"`，`blankDesign()` 不变
- [ ] `data/floorplanBuilder.ts` 能由房间矩形生成 `exterior`/`partition`/`bearing` 墙体、门窗 `Opening`（沿用「开口位置单独一段墙 + offset=墙长/2」约定）与房间环
- [ ] `data/templatePresets.ts` 定义 6 个预设，每个 `build()` 返回通过 `validateDesign` 的 `Design`（含墙体、门窗、房间材质、家具）
- [ ] `data/templateFurniture.ts` 按「家具布置设计」表为 5 个新预设生成成套家具（坐标由房间矩形推算，`rot` 只取 0/90/180/270，经 `normalizeFurniture` 收尾）
- [ ] `data/templateFurniture.test.ts` 覆盖 5 条自动校验：落在房间内 / 同房间不重叠 / 门扇扫掠区无家具 / 每房间有家具且总数 ≥18 / 类型都在 `library` 内
- [ ] `createProject()` 支持预设 id 并按预设命名；`designForTemplate(id)` 可复用
- [ ] `validateDesign` 接受并保留已知 `templateId`，未知 `templateId` 丢弃且不判失败；缺失时按 `reference` 兜底
- [ ] `guestStore` 按 `templateId` 分 key 读写草稿，`reference` 继续用 `interior-guest-default-v1`，记录上次编辑模板
- [ ] `useProjects` 提供 `guestTemplateId` / `switchGuestTemplate`，切换前先 `save()` 当前草稿
- [ ] 登录后项目列表出现「内置模板」分组，卡片只有「预览」与「用此模板新建」；`rename`/`remove`/`duplicate` 对内置模板行返回 false
- [ ] `ProjectMenu` 下拉里内置模板可切换到只读预览
- [ ] `Workbench` 只读态：`update` 走 noop、绘墙/门窗、重置、清空家具、撤销重做不可用、快捷键早退、顶部「用此模板新建」提示条可见
- [ ] `PlanCanvas`/`PropertyPanel`/`Library` 的 `readOnly` 分支生效（预览态无法改动，仍可查看/导出）
- [ ] `resetDesign()` 按 `templateId` 重置到正确模板
- [ ] 舞台顶部显示当前模板名（不再写死「三室两厅两卫」）
- [ ] `index.css` 新增内置模板分组/卡片/徽标/只读提示条样式，全部使用语义令牌

## Verification checklist

- [ ] `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build` 全部通过
- [ ] `pnpm test` 通过；新增/更新用例覆盖：`templateId` 校验（合法 / 未知 id 丢弃）、6 个预设 `build()` 都能通过 `validateDesign`、内置模板行不可重命名删除复制
- [ ] 游客：不登录打开工作台，能切换 6 个内置模板；在模板 A 改动 → 切到 B 改动 → 切回 A，A 的改动仍在（本机 localStorage 各自一份 key）
- [ ] 游客：刷新页面后回到上次编辑的模板且改动保留
- [ ] 登录后：项目列表出现「内置模板」分组，无重命名/删除/复制入口；点击「预览」进入只读工作台，2D/3D 可切换、可导出，绘制/重置/清空家具均无效，且刷新后模板内容仍是原始状态（未被写入）
- [ ] 登录后：点「用此模板新建」→ 生成一个云端项目，名称默认取模板名，出现在项目列表里并可正常编辑保存
- [ ] 边界：旧的 `reference` 项目（无 `templateId`）打开、编辑、重置都正常；导入的 JSON 带未知 `templateId` 不被拒绝
- [ ] 视觉：6 个模板逐个在 2D 平面截图检查家具朝向（床头靠墙、沙发面对电视柜、餐椅围桌）、贴墙、不挡门；抽 2 个模板切 3D 检查无穿墙
- [ ] 移动端 390px 与桌面 1280px 各截图确认内置模板分组卡片与只读提示条布局正常
