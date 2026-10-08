# 全站操作提示：顶部 Toast + 「应用」类操作成功反馈

## 背景
- 截图中「茶几单价 → 应用」点了没有反馈，用户不确定是否生效；同类问题遍布全站（导出、重命名、标记承重、分割墙段、账号家具保存等）。
- 现在全站 60+ 处提示都用 shadcn 的 Sonner（`toast` from `sonner`），默认在**右下角**，成功 / 失败 / 报错外观相同，报错详情直接拼在标题里。
- 目标：
  1. 提示统一在**顶部居中**，成功、失败、报错（Error Info）一眼可分；
  2. 所有「提交型」操作成功后都有提示，失败都有提示；
  3. 统一调用方式，避免各处手写 `e instanceof Error ? e.message : ...`。

## 提示规则（全站统一）
| 场景 | 类型 | 样式 / 时长 |
|---|---|---|
| 提交型操作成功（应用、保存、创建、删除、导出、导入、重命名等） | 成功 | 绿色图标，2.5s |
| 操作未执行：规则限制或输入无效（如「承重墙不可拆除」「价格无效」） | 失败 | 红色图标，仅标题，4s |
| 异常报错：网络 / 云端 / 解析 / 导出异常 | 报错 | 红色图标，标题 + **Error Info 描述行**（原始错误信息），6s，可手动关闭 |
| 中性说明（如「房间划分已更新」「此尺寸仅供查看」） | 信息 | 中性图标，3s |

**不弹提示**（画面已即时变化，弹了会刷屏）：拖拽移动 / 缩放、方向键微调、旋转、换颜色、尺寸字段实时编辑、撤销 / 重做、切换 2D/3D、打开面板。
**内联错误保留**：对话框 / 表单里的字段校验提示继续显示在原位（对话框不关闭），同时弹失败 Toast。

## 方案

### 1. 全局 Toaster
- `src/components/ui/sonner.tsx`：`position="top-center"`、`theme="light"`、`closeButton`、`icons`（lucide：`CircleCheck` / `CircleX` / `Info` / `TriangleAlert` / `Loader2`），`toastOptions.classNames` 按 `success / error / info / warning` 用语义 token 着色，`description` 用于 Error Info。
- `src/index.css` + `tailwind.config.ts`：新增 `--success` / `--success-foreground` / `--warning` token（契合现有暖棕色系）。
- `src/App.tsx`：移除未被使用的 Radix `<Toaster />`（全站无 `useToast` 调用），只保留一套提示系统。

### 2. 统一调用：`src/lib/notify.ts`
```ts
notify.success(title, description?)
notify.fail(title)                     // 失败：规则 / 校验
notify.error(title, cause?, fallback?) // 报错：description = cause 的 message
notify.info(title)
```
- `errorMessage(cause, fallback)` 统一取错误信息；新增 `notify.test.ts` 覆盖 Error / string / 未知类型。
- 本次改动到的文件改用 `notify`；未改动的现有 `toast.*` 调用照常生效（已自动移到顶部）。

### 3. 操作清单（逐项补齐）

**价格 / 成本**
| 位置 | 操作 | 成功提示 | 失败 / 报错 |
|---|---|---|---|
| `PriceInput.tsx`（截图处，及 PropertyPanel / SelectionEditor / CostRowEditor / RoomCostDetail / LaborEditor / 账号对话框共用） | 应用单价 | 「茶几单价」已更新为 ¥400 / 已设为未定价 | 校验失败：内联 + 失败；抛错：报错；返回 false：报错「保存失败」 |
| `MaterialProcurementEditor.tsx` | 应用采购规格 | 采购规格已应用 | 内联 + 失败 |
| `CostRowEditor.tsx` | 恢复账号默认 | 已恢复账号默认价 | — |
| `LaborEditor.tsx` | 添加 / 删除人工费 | 已添加「x」/ 已删除「x」 | 内联 + 失败 |

- `PriceInput` 的 `onApply` 放宽为 `(v) => void | boolean | Promise<void | boolean>`，异步时按钮显示处理中并禁用，结束后再提示。
- `SelectionEditor.tsx`：补 `label`，去掉自己的 try/catch（交给 PriceInput）。
- 账号级（需等云端保存完成才提示成功）：
  - `AccountCostManager.tsx`：`change` 返回 `commit.apply(...)` 的 `Promise<boolean>`；`AccountCostDialog.tsx` 把它 `return` 给 PriceInput / MaterialProcurementEditor。
  - `AccountFurnitureDialog.tsx`：`applyPrice` 返回 boolean 并直接作为 `onApply`。
  - 「重试保存」按钮（`AccountCostManager` / `AccountFurnitureLibrary` / `AccountCostDialog` / `AccountFurnitureDialog`）：成功提示「已保存」，失败报错。

**户型 / 墙体**
| 位置 | 操作 | 成功提示 | 失败 / 报错 |
|---|---|---|---|
| `WallSplitDialog.tsx` | 应用分割 | 墙段已分割为 N 段 | 内联 + 失败 |
| `DimensionEditDialog.tsx` | 应用距离 | 墙间净距已更新为 x m（未改动直接关闭，不提示） | 内联 + 失败 |
| `WallBearingControls.tsx` | 标记 / 取消承重 | 已标记为承重墙 / 已取消承重标记 | 失败 |
| `PlanCanvas.tsx` `wallToggle` | 拆除 / 恢复墙体 | 已拆除墙体 / 已恢复墙体 | 已有失败 |
| `Workbench.tsx` `remove` | 删除家具 / 门窗 / 墙体 | 已删除「茶几」/ 门窗 / 墙体 | 已有失败 |
| `Workbench.tsx` `duplicate` | 复制家具（按钮 / Ctrl D） | 已复制「茶几」 | — |
| `Workbench.tsx` `clearFurniture` / `resetDesign` / `clearMeasures` | 清空家具 / 重置方案 / 清除测量 | 已清空 N 件家具 / 已重置为初始模板 / 已清除测量 | — |

**导出 / 导入 / 保存**
| 位置 | 操作 | 成功提示 | 失败 / 报错 |
|---|---|---|---|
| `PlanCanvas.tsx` `exportImage` | 下载 2D 图片 | 2D 图片已下载 | `toBlob` 为空 / 加载失败：报错 |
| `Scene3D.tsx` `shot` | 3D 截图下载 | 3D 截图已下载 | 报错 |
| `Workbench.tsx` `exportDrawing` | 导出 DXF / SVG | 已导出 CAD 图纸（DXF）/ 矢量图（SVG） | 已有，改为带 Error Info |
| `Workbench.tsx` `exportJson` | 下载 JSON 备份 | JSON 备份已下载 | — |
| `Workbench.tsx` JSON 导入 | 导入方案 | 已导入「name」 | 已有，改为带 Error Info |
| `pages/Index.tsx` `cloudSave` | 另存云端副本 | 已另存为云端项目「x · 云端副本」 | `create` 已有 |

**项目 / 账号**
| 位置 | 操作 | 成功提示 | 失败 / 报错 |
|---|---|---|---|
| `ProjectDialog.tsx` / `ProjectManager.tsx` | 新建项目 | 已创建项目「x」 | `create` 已有 |
| `useProjects.ts` `rename`（改为返回 boolean） | 重命名 | 已重命名为「x」 | 已有 |
| `useProjects.ts` `duplicate` | 复制项目 | 已复制为「x · 副本」 | 已有 |
| `useProjects.ts` `signOut` | 退出登录 | 已退出登录 | 已有 |
| `useProjects.ts` 各云端错误 | 读取 / 创建 / 保存 / 删除失败 | — | 由「失败：+ message」拼接改为标题 + Error Info 描述 |
| `AuthDialog.tsx` | 登录 / 注册 | 登录成功 / 注册成功，请查收验证邮件 | 内联 + 报错 |
| `AccountFurnitureDialog.tsx` | 删除账号家具 | 已删除「x」 | 内联 + 报错 |
| `FurnitureGeometryEditor.tsx` | 保存参考几何（含图片） | 参考几何已保存 / 参考几何与图片已保存 | 内联 + 报错；AI 生成失败报错 |
| `CustomFurnitureDialog.tsx` | 新建家具（仅账号库模式）/ 从账号库导入地面 | 已保存到账号家具库 / 地面已加入当前项目 | 内联 + 报错 |
| `CustomFloorForm.tsx` | 创建地面（仅账号库模式） | 已保存到账号地面库 | 内联 + 报错 |

已有成功提示保留：添加家具、自定义家具 / 地面加入项目、项目删除、保存到云端。

## Implementation checklist
- [x] `sonner.tsx`：top-center、light、closeButton、lucide 图标、四种类型语义着色、description 样式
- [x] `index.css` / `tailwind.config.ts`：新增 success / warning token
- [x] `App.tsx`：移除 Radix `<Toaster />`
- [x] `src/lib/notify.ts` + `notify.test.ts`
- [x] `PriceInput.tsx`：onApply 结果处理、异步禁用、成功 / 失败 / 报错提示
- [x] `SelectionEditor.tsx`：label + 移除重复 try/catch
- [x] `AccountCostManager.tsx` / `AccountCostDialog.tsx`：change 返回 Promise<boolean>，重试保存提示
- [x] `AccountFurnitureDialog.tsx` / `AccountFurnitureLibrary.tsx`：价格、重试、删除提示
- [x] `MaterialProcurementEditor.tsx` / `CostRowEditor.tsx` / `LaborEditor.tsx`
- [x] `WallSplitDialog.tsx` / `DimensionEditDialog.tsx` / `WallBearingControls.tsx`
- [x] `PlanCanvas.tsx`：拆除 / 恢复、PNG 导出成功与失败
- [x] `Scene3D.tsx`：3D 截图成功与失败
- [x] `Workbench.tsx`：删除、复制、清空家具、重置、清除测量、DXF/SVG、JSON 导出 / 导入
- [x] `pages/Index.tsx`：云端副本成功提示
- [x] `useProjects.ts`：rename 返回 boolean + 成功提示、duplicate / signOut 成功提示、错误改用 notify.error
- [x] `ProjectDialog.tsx` / `ProjectManager.tsx`：新建成功提示
- [x] `AuthDialog.tsx` / `FurnitureGeometryEditor.tsx` / `CustomFurnitureDialog.tsx` / `CustomFloorForm.tsx`
- [x] 动手前重新读取上述文件（近期有其他改动，如 AccountCostManager 新增 floors 属性）

## Verification checklist
- [ ] 截图场景：选中茶几 → 价格弹层输入 400 → 应用，顶部居中出现成功提示「「茶几单价」已更新为 ¥400」
- [ ] 清空后应用 → 「已设为未定价」；输入 -1 → 内联提示 + 红色失败提示，价格不变
- [ ] 账号成本 / 账号家具改价：云端保存完成后才出现成功；保存失败出现带 Error Info 的报错
- [ ] 分割墙段、编辑净距、标记承重、拆除墙体、删除 / 复制家具各出现一次对应成功提示；净距未改动直接关闭无提示
- [ ] 拖拽、方向键、旋转、换色、撤销 / 重做 不出现提示
- [ ] 导出 PNG / DXF / SVG / JSON、导入 JSON、新建 / 重命名 / 复制项目、登录 / 退出 均有成功提示
- [ ] 断网或模拟错误时，云端类操作报错提示带描述行
- [ ] 所有提示位于顶部居中，成功 / 失败 / 报错 / 信息颜色与图标区分清楚，且不遮挡顶部工具栏关键按钮（必要时 `offset` 下移到 header 下方）
- [x] lint 0 error、`pnpm run build` 通过；本次相关测试通过（其余失败来自并行进行中的 Tooltip / useAsyncAction 改动）
- [ ] `website_screenshot` 桌面 1280 检查一次提示外观
