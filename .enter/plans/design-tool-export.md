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
[项目名 ▾] | [2D|3D] | 工具 | 撤销 重做 | 重置 清空 | ——— | 视图 ▾ | 导出 ▾ | 全屏 | [头像 / 登录]
```

- **项目菜单 `ProjectMenu.tsx`（新建，替代返回按钮和切换项目）**：
  - 触发器只显示项目名 + 下拉箭头，不加图标、不加头像；访客显示“参考户型”。
  - 菜单结构：
    ```
    当前项目
      项目名（只读标题）
      最近编辑 2026/10/08
      ← 返回项目管理
      ⌄ 立即保存
    切换项目
      项目名 · 10/08        ✓（当前）
      …
      加载更多
    ```
  - 列表项只放「项目名 + 最近编辑时间 + 当前项勾选」，**不放头像**（`ProjectSummary` 只有 id/name/updatedAt/revision/cloud，没有协作者信息，单账号下列表头像必然重复，只是噪音）。头像只保留在工具条最右端的账号入口和账号管理页。
  - 访客：菜单只有 `保存到云端`（未登录会先弹登录）。
  - 小屏追加 `重置方案`、`清空家具`（沿用 `compact-only`）。
  - 暂不做户型缩略图（需要在后端为项目存缩略图，属于独立任务）。
- **视图菜单**：原“图层”菜单改名，原“文件”菜单里的“显示比例 1:60 / 1:100”移到这里。
- **导出菜单 `ExportMenu.tsx`（新建，替代 `DrawingExportItems` 和三处下载入口）**：
  - `按格式导出 ▸`：PNG 图片（2D 下导出平面图，3D 下导出当前视角）、PDF 矢量图、SVG 矢量图、DXF CAD 图纸、方案文件 JSON。矢量格式由模型生成，2D/3D 下都能用。
  - `导出到其他软件 ▸`：Illustrator、Figma、Inkscape、AutoCAD、SketchUp、酷家乐，都显示 Coming soon。
- **账号**：头像菜单（邮箱 + “已登录 · 云端同步” + 退出登录）放到最右端；访客在同一位置显示“登录”按钮。
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
- [ ] 删除 `WorkbenchHeader` 和访客 header，工具栏成为唯一顶部栏
- [ ] `ProjectMenu` 触发器只显示项目名 + 箭头；菜单分「当前项目」（名称、最近编辑时间、返回项目管理、立即保存）和「切换项目」（名称 + 日期 + 当前项勾选、加载更多）两组；列表项无头像
- [ ] 访客的 `ProjectMenu` 只有保存到云端；小屏有重置 / 清空
- [ ] “图层”改名“视图”，加入显示比例 1:60 / 1:100
- [ ] `ExportMenu` 包含“按格式导出”的 5 项和“导出到其他软件”的 Coming soon 列表；原“文件”菜单、header 下载菜单、访客“保存”菜单移除
- [ ] 头像菜单 / 登录按钮放在工具栏最右端；底部状态栏对访客也显示保存状态
- [ ] 删除帮助按钮和帮助弹窗；`EditorTooltip` 去掉 `description`，清理全部调用处和 `ToolButton.note`
- [ ] 有文字、无快捷键的工具栏按钮不再包 `EditorTooltip`
- [ ] 导出始终使用全部图层，忽略 `layers` 和 `dimensionSettings.visible`
- [ ] `DrawingEntity.group` 写入墙、门窗、房间、家具；`serializeDxf` 的几何输出不变
- [ ] `drawingScale.ts` 实现 1:50 → 1:100 → 1:200 的规则
- [ ] SVG：无 `<style>`、无 `dominant-baseline`，带 Inkscape 图层、对象子组、墙体填充、中文字体栈和 `<metadata>` 方案数据
- [ ] DXF：在文件开头写入分段 `999` 方案数据，每行 ≤ 2000 字符
- [ ] 安装 `pdf-lib`、`@pdf-lib/fontkit`，并放入中文字体；`pdfExport.ts` 输出矢量内容、OCG 图层和子集字体
- [ ] `designImport.ts`：JSON 直接解析；SVG / DXF 读取嵌入数据；没有嵌入数据时报“暂不支持识别外部图纸”；统一经过 `validateDesign`
- [ ] `ProjectManager` 的“新建项目”改为下拉：新建项目…、按格式导入 ▸（JSON/DXF/SVG）、从其他软件导入 ▸（Coming soon）
- [ ] Coming soon 项 hover / 聚焦时显示标记，点击不触发任何操作

## Verification checklist
- [ ] 单元测试：SVG 通过 `XMLValidator`，不含 `<style>` 和 `dominant-baseline`，含 `inkscape:groupmode="layer"`，“沙发”有独立 `<g>`
- [ ] 单元测试：画布上关掉家具 / 尺寸后，SVG / DXF / PDF 里仍有 `FURNITURE` / `DIMENSIONS`
- [ ] 单元测试：比例选择，10 m 户型为 1:50，60 m 户型为 1:100 或更小
- [ ] 单元测试：PDF 能用 `pdf-lib` 回读，1 页，页面尺寸与比例一致，OCG 数量与图层数相同
- [ ] 往返测试：导出 SVG / DXF 后用 `parseDesignFile` 导入，结果与原方案深度相等；JSON 同样
- [ ] 负向测试：导入不带嵌入数据的外部 SVG / DXF、损坏的 JSON、超过 5 MB 的文件，都报错且不创建项目
- [ ] 负向测试：点击 Coming soon 项不触发导入 / 导出
- [ ] 负向测试：没有有效墙体时，矢量导出报错且不下载
- [ ] 组件测试：顶部只剩一行；登录用户 / 访客的项目菜单和账号区内容正确；项目列表里没有头像元素，当前项有勾选；没有帮助按钮
- [ ] 更新受影响的测试（`DrawingExportItems.test.tsx`、`editorTooltip.test.tsx`、`Workbench.test.tsx`）
- [ ] 运行 `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build`
- [ ] 在 `desktop_1280` 和 `mobile_390` 下截图检查工作台单行工具栏、项目管理页的新建下拉
