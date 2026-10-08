## Context
在“家具管理”或“成本管理”选中家具分类后，新建家具应默认使用该分类，减少重复选择。未选择有效家具分类时默认“客厅”。用户已确认成本管理的“地面、墙面、门窗”也回退到“客厅”。

补充需求：点击左侧“项目管理 / 家具管理 / 成本管理”进入页面时，真实数据加载期间只显示主内容区骨架屏；加载结束后直接展示对应 UI。左侧导航和账号菜单保留，不增加人为等待。

## 推荐方案
沿用两个管理页面现有的 `category` 筛选状态及 `onNew` 回调，将点击时的分类传给 `AccountCMS`。在父组件保存此次新建的初始分类，并传入 `CustomFurnitureDialog` 的可选 `initialCategory` 属性。复用 `data/catalog.ts` 的 `categories` 校验有效分类，非家具分类统一回退“客厅”。
账号管理弹窗现有 `{creating && ...}` 会在关闭时卸载，因此每次打开均用本次传入的分类初始化；打开后用户的手动选择不被覆盖。工作台未传入此属性时保持现有“客厅”默认值，不更改其草稿行为。

### 三个菜单的进入骨架屏
当前项目页只在无列表数据时显示卡片骨架；家具页一开始直接显示内置家具；成本页只等待账号成本而不等待家具目录。统一复用 `ManagementLoading heading` 和现有 `cms-skeleton` 样式，不新增样式体系或依赖。

在 `AccountCMS` 管理“本次进入尚未就绪”状态：导航切换的同一帧即可显示骨架，家具/成本目录加载仍沿用现有 effect，不等待子页面挂载才请求。家具及成本页等待目录首批数据、分类数量和账号成本请求全部结束后展示 UI；项目页只等待项目列表就绪。已就绪的项目缓存可直接展示，不为显示骨架额外请求。首次项目列表尚未启动的间隙，通过 `useProjects` 的列表初始化完成状态区别于已就绪空列表。

进入完成后不再以一般 `loading` 卸载管理页面，保留刷新、加载更多和新建后的原位反馈，避免丢失筛选、编辑草稿和弹窗。快速切换沿用目录的 `epoch` 失效机制，并让进入状态关联当前菜单/账号；失败也结束骨架并显示原有错误或提示，不无限等待。不把骨架屏描述为请求提速。

## 关键文件
- `src/features/interior/components/AccountFurnitureLibrary.tsx`：新建回调携带当前分类。
- `src/features/interior/components/AccountCostManager.tsx`：新建回调携带当前分类。
- `src/features/interior/components/AccountCMS.tsx`：接收分类，保存此次打开的有效初始分类，传入弹窗。
- `src/features/interior/components/CustomFurnitureDialog.tsx`：增加可选初始分类，初始化分类字段。
- `src/features/interior/components/newFurnitureCategory.test.tsx`：使用现有 Vitest 编写分类传递与初始化回归测试；不增加运行时依赖。

骨架屏涉及补充路径：
- `src/features/interior/cloud/useProjects.ts`：暴露项目列表首次读取已完成状态（含失败），不把打开项目的 loading 当成进入页面加载。
- `src/features/interior/components/AccountCMS.tsx`：统一进入状态及骨架分支，复用现有目录加载与失效机制。
- `src/features/interior/components/managementUi.test.tsx`：补充进入加载、结束、失败及后台刷新的回归断言。
- `src/features/interior/components/ManagementLoading.tsx` 与 `src/index.css`：复用现有组件和样式，原则上无需修改。

## Implementation checklist
- [x] 项目列表首次读取完成状态在成功、空结果、失败时结束，换账号时重新初始化。
- [x] 三个菜单进入加载时主内容区仅渲染带标题占位的 `ManagementLoading`，导航及账号菜单仍可用。
- [x] 家具及成本页等待目录首批与账号成本读取结束；项目页按项目列表状态展示，不依赖家具或成本请求。
- [x] 切换菜单同帧进入骨架，旧请求结束不能解除新菜单的进入状态；失败结束骨架并保留错误反馈。
- [x] 已展示页面的刷新、分页、新建后重载不重新进入全页骨架，不卸载筛选和草稿状态。
- [x] 两个管理页面的 `onNew` 参数包含点击时当前 `category`，筛选与搜索行为不变。
- [x] `AccountCMS` 通过复用 `categories` 的 `model/newFurnitureCategory.ts` 将有效家具分类原样传入，其他值统一转为“客厅”。
- [x] `CustomFurnitureDialog` 使用可选 `initialCategory` 初始化分类，未传入时默认“客厅”。
- [x] 关闭再打开账号新建弹窗时取本次页面分类；弹窗内手动改分类不被初始值覆盖。
- [x] 家具提交仍使用弹窗当前 `category`；不改保存、图片生成、价格、数据库或页面样式。

实际加载边界抽取为 `components/ManagementEntry.tsx`，按菜单 key 挂载；目录请求在该边界启动与清理，子页面不负责启动请求。新增 `ManagementEntry.test.tsx` 验证进入、两路等待、刷新保留及卸载迟到结果。


## Verification checklist
- [ ] 三个入口在加载未完成时只显示主区骨架；请求完成后直接显示各自标题、控件和列表。
- [ ] 验证目录已结束但成本仍读取、成本已结束但目录仍读取两种情况，家具及成本页不提前展示半完成 UI。
- [ ] 验证空结果、请求失败能离开骨架；无请求或已有就绪项目数据时不强制等待。
- [ ] 验证快速“家具→成本→项目→家具”切换及换账号，迟到结果不显示错误页面；刷新、分页和价格编辑草稿不因骨架丢失。
- [ ] 在 `/` 的管理主区检查骨架及完成态；未指定设备，按 `mobile_390` 与 `desktop_1280` 检查，无法取得登录态或浏览器证据时明确标记未验证。
- [ ] 实施前后执行 `pnpm run build:prod -- --manifest`；使用性能技能审计脚本 `audit-vite-build.mjs --profile app --dist dist --strict` 检查产物，保留原有告警及缺少浏览器/部署 HTTP 证据，不以骨架推断性能提升。不为此需求改造全站打包、路由或部署。
- [ ] 回归测试覆盖两个页面选中“卧室”“餐厨”等有效分类后，新建回调和弹窗初始分类一致。
- [ ] 回归测试覆盖“全部”“自定义”、空值及硬装“地面”“墙面”“门窗”均回退“客厅”。
- [ ] 检查关闭弹窗后切换分类再打开使用新分类，且手动修改后提交使用手动选择。
- [ ] 检查未传 `initialCategory` 的工作台入口仍默认“客厅”，不改变原有草稿生命周期。
- [ ] 执行 `pnpm test`（`src/features/interior` 全部现有与新增测试）、`pnpm run check`（全项目 ESLint 与 TypeScript）以及 `pnpm run build`。
