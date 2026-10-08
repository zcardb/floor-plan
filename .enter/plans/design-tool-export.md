# 导入导出重构 + 编辑器顶部收敛

## Context
你的判断是对的：导入导出不影响编辑本身，只是把模型转换成不同文件。所以拆成两类：
- **按格式**：标准文件，内容完整、不按画布显示开关裁剪，到对方软件里再开关图层。
- **对接其他软件**：先列出常用软件，hover 显示 Coming soon，暂不做功能。

入口按场景放：**项目内只放导出**，**新建项目时放导入**。

关于“直接跳转到对方软件”：Illustrator、AutoCAD、SketchUp 这类桌面软件，网页没法通过链接把文件直接打开进去；Figma 也没有开放“通过链接导入文件”的接口。所以“对接其他软件”先保留选项，实际交付还是靠标准文件。

另外：顶部 header、工具栏“文件”菜单、访客“保存”菜单都有下载入口，存在重复；问号帮助和悬停里的长说明也是多余的。这次一起收敛。

### 审计结论（现状）
| 格式 | 现状 |
|---|---|
| 方案 JSON | 带版本号、严格校验，可无损往返；只有本应用能用 |
| PNG | 截图，不可编辑 |
| DXF | 毫米单位、分图层、原生尺寸标注，基础合格 |
| SVG | 1:1 尺寸会超出 Illustrator 画布上限；样式写在 CSS `<style>` 里，Figma/AI 会丢失；Inkscape 不能识别为图层；家具被拆成零散线条；中文字体缺失 |
| PDF | 没有 |
| 导出范围 | 跟随画布显示开关，关掉家具后导出也没有家具（需改） |

## 一、编辑器顶部：两行合并为一行
删除 `WorkbenchHeader` 和访客 header，只保留一行工具栏（`Workbench.tsx`）：

```
[项目名 ▾] | [2D|3D] | 工具 | 撤销 重做 | 重置 清空 | ——— | 视图 ▾ | [⤓ 导出 ▾] | 全屏 | [头像+名称]
```

- **导出按钮**：明显的 **outline 按钮**（`variant="outline"`，下载图标 + “导出” + 下拉箭头），是工具条右侧唯一的按钮型入口。
- **左侧 `ProjectMenu.tsx`（新建，替代返回按钮和切换项目）**：触发器只显示当前项目名 + 下拉箭头；展开是项目列表。
  ```
  [ 返回项目管理 ]                      ← 顶部一行，带左箭头
  ──────────────────────────────
  三室两厅两卫        10/08        ✓     ← 当前项目
  Home               10/08
  …                                      ← 滚到底自动加载下一页
  ```
  - 每项是「项目名 + 最近编辑日期 + 当前项勾选」，点击直接切换，**不放头像**（单账号下头像必然重复，对分辨项目没有帮助）。
  - 列表区限高并单独滚动，用 `IntersectionObserver` 监测底部哨兵，滚到底调用现有的 `projects.loadMore()`（受 `hasMore` / `listLoading` 控制）分页加载；`listLoading` 时显示一行 spinner。
  - 切换或返回前先调用 `sizeTransaction.cancel()`；切换中禁用列表，当前项不可再点。
  - 访客：触发器显示“参考户型”，列表顶部是“保存到云端”（未登录会先弹登录），没有返回项目管理。
- **右侧账号**：方形头像（`AccountAvatar` 加 `square` 变体，`rounded-md`）+ **头像下方显示名称**。
  - 账号没有昵称字段，**名称取邮箱 @ 前缀**（如 `1879385…`），过长的做省略。
  - 点击头像弹出小菜单：邮箱全文 + 「退出登录」（`loggingOut` 时 loading）。
  - 访客在同一位置显示“登录”按钮。
- 原“文件”菜单里的“立即保存”去掉（项目已自动保存，状态显示在底部状态栏）。
- 小屏下的 `重置方案`、`清空家具` 移到 2D 工具“更多”菜单（沿用 `compact-only`）。
- **暂不做项目缩略图**：需要给项目存一张缩略图（后端字段或新表）+ 上报生成逻辑，还要在首页项目卡片、项目菜单两处渲染，是独立的一条工作；而且它只有在同一账号有多个项目、且户型差异明显时才有分辨价值。这次的列表先用「名称 + 日期」。
- **视图菜单**：原“图层”菜单改名，原“文件”菜单里的“显示比例 1:60 / 1:100”移到这里。
- **导出菜单 `ExportMenu.tsx`（新建，替代 `DrawingExportItems` 和三处下载入口）**：
  - `按格式导出 ▸`：PNG 图片（2D 下导出平面图，3D 下导出当前视角）、PDF 矢量图、SVG 矢量图、DXF CAD 图纸、方案文件 JSON。矢量格式由模型生成，2D/3D 下都能用。
  - `导出到其他软件 ▸`：Illustrator、Figma、Inkscape、AutoCAD、SketchUp、酷家乐，都显示 Coming soon。
- **保存状态**：统一显示在底部状态栏，访客也显示。
- 删除工作台里的“导入 JSON 为新项目”（导入入口移到新建项目处），以及 `Workbench` 的 `importProject` prop。

## 二、悬停提示与帮助
- 删除问号按钮和“三步上手”弹窗（`help` 状态、`Dialog`）。
- `EditorTooltip` 去掉 `description`，只显示“名称 + 快捷键”；同时清理所有调用处的 `description`，以及 `ToolButton` 的 `note`。
- 有文字又没有快捷键的按钮（项目菜单、视图、导出、2D/3D 等），不再包提示。

## 三、新建项目处的导入（`ProjectManager.tsx`）
“新建项目”按钮改成带下拉的组合按钮：
- `新建项目…`：打开原有对话框（空白 / 参考户型）。
- `按格式导入 ▸`：本地 JSON / DXF / SVG，选完文件直接导入为新项目并打开。
- `从其他软件导入 ▸`：与导出同一份软件列表，显示 Coming soon。

**DXF / SVG 能导到什么程度（如实说明）**：
- **本应用导出的 DXF / SVG**：导出时把完整方案数据嵌进文件（SVG 用 `<metadata>`，DXF 用分段 `999` 注释），再导入时可完全还原，墙、门窗、房间、家具、材质都可编辑。
- **其他软件画的图纸**：外部 CAD/SVG 只有线条，没有“墙、门、房间”这些语义，没办法可靠地转换成可编辑户型。这类文件导入时会提示“暂不支持识别外部图纸，请导入本应用导出的文件”，不会生成错误的项目。
- 文件在 AutoCAD / Illustrator 里重新保存后，嵌入的数据可能被丢弃，这种情况按外部图纸处理。

新建 `model/designImport.ts`：`parseDesignFile(file) → { design, name }`，按扩展名分发，最后统一用现有的 `validateDesign` 校验，大小限制 5 MB。

## 四、导出格式质量（沿用上一版方案，范围改为全量）
- 导出统一传入全部图层（墙、房间、门窗、家具、房间名、尺寸、测量），不读画布的 `layers`，也不读 `dimensionSettings.visible`（偏移量仍然生效）。
- `DrawingEntity` 增加可选的 `group: { id, name }`，墙、门窗、房间、家具按对象编组；DXF 输出不受影响。
- `model/drawingScale.ts`：默认比例 1:50，纸面超过 A0 长边（1189 mm）时依次改为 1:100、1:200。
- SVG 重写：去掉 `<style>` 和 `dominant-baseline`，样式改成元素自身的属性；图层加 `inkscape:groupmode="layer"`，并用中文图层名；每个对象一个子 `<g>`；墙体实心填充；中文字体栈；`width/height` 按比例设定，`viewBox` 仍用毫米。
- PDF（`pdf-lib` + `@pdf-lib/fontkit`）：矢量绘制，比例与 SVG 一致；中文字体（Noto Sans SC，OFL 授权）放在 `public/fonts/`，只在导出 PDF 时加载并子集嵌入；每个图层是一个可开关的 PDF 图层（OCG）。
- 软件列表放在 `model/softwareTargets.ts`，导入和导出共用。Coming soon 项不用 `disabled`（禁用项在菜单里没法 hover），改用 `aria-disabled` 并阻止选中，hover / 聚焦时显示 “Coming soon” 标记。

## 关键文件
- `src/features/interior/components/Workbench.tsx`、`WorkbenchHeader.tsx`（删除）、`DrawingExportItems.tsx`（删除）
- 新建：`components/ProjectMenu.tsx`、`components/ExportMenu.tsx`、`components/SoftwareSoonItems.tsx`
- `src/components/ui/editor-tooltip.tsx` 及其调用处
- `components/ProjectManager.tsx`、`src/pages/Index.tsx`
- `model/drawingDocument.ts`、`furnitureDrawing.ts`、`svgExport.ts`、`dxfExport.ts`、`drawingExport.ts`
- 新建：`model/drawingScale.ts`、`model/pdfExport.ts`、`model/designImport.ts`、`model/softwareTargets.ts`
- `src/index.css`（单行工具栏、Coming soon 标记）

## Implementation checklist
- [x] 删除 `WorkbenchHeader` 和访客 header，工具栏成为唯一顶部栏
- [x] `ProjectMenu` 触发器只显示项目名 + 箭头；展开后顶部是带左箭头的「返回项目管理」，中间是项目列表（名称 + 日期 + 当前项勾选，无头像，点击切换），滚动到底触发 `loadMore()`，`hasMore` 为 false 时停止，加载中显示 spinner
- [x] 切换项目 / 返回前调用 `sizeTransaction.cancel()`，切换中列表禁用且当前项不可再点
- [x] 访客的 `ProjectMenu` 触发器显示“参考户型”，顶部为「保存到云端」，无返回项目管理
- [x] 右侧账号（按最新反馈调整）：只显示圆形头像，冷色调配色；点击弹出名称、邮箱全文与「退出登录」；访客显示「登录」按钮
- [x] 右侧面板「属性 / 成本」改为分段控件，未选中项也有明确的可点击样式
- [x] 小屏 `重置方案` / `清空家具` 出现在 2D「更多」菜单的 `compact-only` 项里
- [x] “图层”改名“视图”，加入显示比例 1:60 / 1:100
- [x] `ExportMenu` 包含“按格式导出”的 5 项和“导出到其他软件”的 Coming soon 列表；原“文件”菜单、header 下载菜单、访客“保存”菜单移除
- [x] 底部状态栏对访客也显示保存状态
- [x] 删除帮助按钮和帮助弹窗；`EditorTooltip` 去掉 `description`，清理全部调用处和 `ToolButton.note`
- [x] 有文字、无快捷键的工具栏按钮不再包 `EditorTooltip`
- [x] 导出始终使用全部图层，忽略 `layers` 和 `dimensionSettings.visible`
- [x] `DrawingEntity.group` 写入墙、门窗、房间、家具；`serializeDxf` 的几何输出不变
- [x] `drawingScale.ts` 实现 1:50 → 1:100 → 1:200 的规则
- [x] SVG：无 `<style>`、无 `dominant-baseline`，带 Inkscape 图层、对象子组、墙体填充、中文字体栈和 `<metadata>` 方案数据
- [x] DXF：在文件开头写入分段 `999` 方案数据，每行 ≤ 2000 字符
- [x] 安装 `pdf-lib`、`@pdf-lib/fontkit`，并放入中文字体；`pdfExport.ts` 输出矢量内容、OCG 图层和子集字体
- [x] `designImport.ts`：JSON 直接解析；SVG / DXF 读取嵌入数据；没有嵌入数据时报“暂不支持识别外部图纸”；统一经过 `validateDesign`
- [x] `ProjectManager` 的“新建项目”改为下拉：新建项目…、按格式导入 ▸（JSON/DXF/SVG）、从其他软件导入 ▸（Coming soon）
- [x] Coming soon 项 hover / 聚焦时显示标记，点击不触发任何操作

## Verification checklist
- [x] 单元测试：SVG 通过 `XMLValidator`，不含 `<style>` 和 `dominant-baseline`，含 `inkscape:groupmode="layer"`，“沙发”有独立 `<g>`
- [x] 单元测试：画布上关掉家具 / 尺寸后，SVG / DXF / PDF 里仍有 `FURNITURE` / `DIMENSIONS`
- [x] 单元测试：比例选择，10 m 户型为 1:50，60 m 户型为 1:100 或更小
- [x] 单元测试：PDF 能用 `pdf-lib` 回读，1 页，页面尺寸与比例一致，OCG 数量与图层数相同
- [x] 往返测试：导出 SVG / DXF 后用 `parseDesignFile` 导入，结果与原方案深度相等；JSON 同样
- [x] 负向测试：导入不带嵌入数据的外部 SVG / DXF、损坏的 JSON、超过 5 MB 的文件，都报错且不创建项目
- [x] 负向测试：点击 Coming soon 项不触发导入 / 导出
- [x] 负向测试：没有有效墙体时，矢量导出报错且不下载
- [x] 组件测试：顶部只剩一行；`ProjectMenu` 含返回项目管理、项目列表（无头像元素、当前项有勾选）、滚到底触发加载；账号按钮显示方形头像与名称；访客版本无返回、有保存到云端；`ExportMenu` 按钮为 outline 且文案为“导出”；没有帮助按钮
- [x] 更新受影响的测试（`DrawingExportItems.test.tsx`、`editorTooltip.test.tsx`、`Workbench.test.tsx`）
- [x] 运行 `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build`
- [x] (登录态需人工确认) 在 `desktop_1280` 和 `mobile_390` 下截图检查工作台单行工具栏、项目 Popover、项目管理页的新建下拉
