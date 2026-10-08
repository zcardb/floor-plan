# 户型资产导出审计 + SVG / PDF 设计软件可用化

## Context
你想确认现有户型资产是否符合业界规范、能否导入其他软件且功能完整。本次目标软件确定为 **Illustrator / Inkscape / Figma**（SVG / PDF）。

### 审计结论（现状）
| 格式 | 现状 | 结论 |
|---|---|---|
| 方案 JSON | `version: 2`，`validateDesign` 严格校验，导入/导出可往返 | 合格，但只能本应用使用，不是行业交换格式 |
| PNG | 画布截图 | 位图，不可编辑 |
| DXF | 毫米单位、R2007、分层、原生尺寸标注、UTF-8，有独立解析器测试 | 基础合格；遗留问题：未定义中文字体样式（AutoCAD 默认字体中文可能显示 ?）、所有图层同色同线型、家具未做成块（不在本次范围） |
| **SVG** | XML 合法、毫米单位、按图层分组、文字可编辑 | **不完全可用**，见下 |
| **PDF** | 不存在 | **缺失** |
| 3D 模型 / BIM（glTF、OBJ、IFC） | 无，3D 只能截图 | 不在本次范围 |

SVG 在设计软件中的具体问题（`src/features/interior/model/svgExport.ts`）：
1. **1:1 比例**：12 m 户型输出 12000 mm 宽画板，超过 Illustrator 最大画布（约 5779 mm），会被裁切/拒绝；也不符合图纸常用比例（1:50 / 1:100）。
2. **样式写在 `<style>` CSS 里**，并使用 `dominant-baseline`：Figma / Illustrator 对这两项支持不全，可能导致线宽、颜色丢失、文字上下偏移。
3. **图层识别**：只有 `<g id>`，Inkscape 不认作图层（缺少 `inkscape:groupmode="layer"`），图层名为英文代号。
4. **对象未编组**：一张沙发、一扇门被打散成很多零碎线条，设计师无法整体选中/移动。
5. **字体**：只写了 `Arial`，中文房间名会触发缺字替换。
6. 墙体没有实心填充（行业平面图惯例为墙体涂黑/填充）。

## 方案
共用现有 `createDrawingDocument`（`model/drawingDocument.ts`）作为唯一几何来源，DXF 行为不变。

1. **对象编组信息**：`DrawingEntity` 增加可选 `group?: { id: string; name: string }`。
   - `furnitureDrawing(f)` 为每件家具的所有图元写入 `{ id: f.id, name: f.name }`。
   - 墙段（按墙 id）、门窗（按洞口 id，名称“门/窗”）、房间轮廓与房间标注（按房间 id + 名称）同样写入。
   - DXF 序列化忽略该字段（不影响现有测试）。
2. **出图比例**：新增 `model/drawingScale.ts`，默认 1:50；若纸面超过 A0 长边（1189 mm）则依次退到 1:100、1:200。SVG 的 `width/height` = 模型尺寸 / 比例（mm），`viewBox` 仍为模型毫米，保持几何精确。
3. **SVG 重写为设计软件兼容写法**（`svgExport.ts`）：
   - 去掉 `<style>`，改为图层 `<g>` 上的展示属性（`fill`、`stroke`、`stroke-width`、`stroke-dasharray`、`stroke-linejoin`）；线宽按纸面毫米 × 比例换算（墙 0.35 mm、其它 0.18 mm、尺寸 0.13 mm）。
   - 图层 `<g>` 增加 `inkscape:groupmode="layer"`、`inkscape:label="墙体/家具/…"`（中文名），保留英文 `id`。
   - 图层内按 `group` 生成子 `<g id=… data-name=…>`，名称如 `沙发`。
   - 墙体多边形实心填充；拆除墙保持虚线不填充。
   - 文字去掉 `dominant-baseline`，改用计算好的 `y` 偏移；字体栈 `"PingFang SC","Microsoft YaHei","Noto Sans SC",Arial,sans-serif`；文字元素自带 `fill`、`stroke="none"`。
   - `<desc>` 写明比例和单位。
4. **新增矢量 PDF 导出**（`model/pdfExport.ts`，依赖 `pdf-lib`、`@pdf-lib/fontkit`）：
   - 页面尺寸 = 图纸范围 / 比例 + 边距（单位换算为 pt），与 SVG 同比例。
   - 折线/弧/文字直接按 `DrawingDocument` 绘制成矢量；样式与 SVG 一致。
   - 中文：导出时按需加载放在 `public/fonts/` 的中文 TTF（思源黑体 / Noto Sans SC Regular 静态版），以子集方式嵌入，文件体积小、文字可搜索可选。
   - 每个图层写为 PDF 可选内容组（OCG），Acrobat / Inkscape 中可开关图层。
   - 元数据：标题 = 项目名，主题写比例。
5. **入口**：`drawingExport.ts` 的 `DrawingFormat` 增加 `'pdf'`，`downloadDrawing` 改为 async（PDF 需加载字体），MIME `application/pdf`；`DrawingExportItems.tsx` 增加“导出矢量 PDF”菜单项；`Workbench.tsx` 的成功提示补充 PDF 文案（`exportDrawingAction` 已是 async，直接 await）。

## 关键文件
- `src/features/interior/model/drawingDocument.ts`（`group` 字段、墙/洞口/房间写入）
- `src/features/interior/model/furnitureDrawing.ts`
- `src/features/interior/model/drawingScale.ts`（新）
- `src/features/interior/model/svgExport.ts`
- `src/features/interior/model/pdfExport.ts`（新）
- `src/features/interior/model/drawingExport.ts`
- `src/features/interior/components/DrawingExportItems.tsx`、`Workbench.tsx`
- `public/fonts/`（中文字体文件）

## Implementation checklist
- [ ] `DrawingEntity` 增加可选 `group`，墙段、门窗、房间轮廓、房间标注、家具图元均带 `group`
- [ ] `serializeDxf` 输出与改动前一致（忽略 `group`）
- [ ] `drawingScale.ts` 实现 1:50 → 1:100 → 1:200 选择规则（以 A0 长边 1189 mm 为上限）
- [ ] SVG 不再包含 `<style>` 与 `dominant-baseline`，样式全部为展示属性
- [ ] SVG 图层 `<g>` 带 `inkscape:groupmode="layer"` 与中文 `inkscape:label`，根节点声明 `xmlns:inkscape`
- [ ] SVG 每件家具/每扇门窗/每个房间为独立子 `<g>`，带可读名称
- [ ] SVG `width/height` 按比例换算，`viewBox` 仍为模型毫米
- [ ] 墙体实心填充，拆除墙虚线无填充
- [ ] 安装 `pdf-lib`、`@pdf-lib/fontkit`；中文 TTF 放入 `public/fonts/` 并仅在 PDF 导出时加载
- [ ] `pdfExport.ts` 绘制折线、弧、文字，页面尺寸与 SVG 比例一致，字体子集嵌入
- [ ] PDF 每个图层为一个 OCG，目录含 `OCProperties`
- [ ] `DrawingFormat` 支持 `'pdf'`，菜单新增“导出矢量 PDF”，成功/失败提示正确

## Verification checklist
- [ ] 扩展 `drawingExport.test.ts`：SVG 通过 `XMLValidator`；无 `<style>`、无 `dominant-baseline`；含 `inkscape:groupmode="layer"`；家具 `沙发` 有独立 `<g>`
- [ ] 比例测试：10 m 户型为 1:50（宽 = 范围/50 mm）；超 A0 的 60 m 户型退到 1:100 及以上
- [ ] PDF 测试：用 `pdf-lib` 回读页数为 1、页面尺寸与比例一致、`OCProperties` 中 OCG 数量 = 有内容的图层数、嵌入字体为子集
- [ ] 负向：无有效墙体时 SVG/PDF 都抛出“有效墙体”错误，不触发下载
- [ ] 关闭家具/标注/尺寸显示层后，SVG/PDF 不含对应图层
- [ ] 现有 DXF 解析测试全部通过（行为不变）
- [ ] 运行 `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build`
- [ ] 预览中依次点击 SVG / PDF 导出，确认文件下载且无控制台报错
