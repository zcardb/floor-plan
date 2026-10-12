# 方案报告 — 强制

把方案的成本、房间、布局体检与家具清单收成一份多页 A4 PDF：顶栏「生成方案报告」点击后**直接导出文件**，没有预览弹窗、没有页面级路由。相关文件（`src/features/interior/`）：

| 文件 | 职责 |
| --- | --- |
| `model/report.ts` | `buildReport(design, defaults?, { name, date })` → `ReportModel`；分节标题 `REPORT_SECTIONS`、目录 `REPORT_CONTENTS`、说明文案 `REPORT_NOTES`、首页信息带 `infoItems`、关键数字卡 `figureCards` |
| `model/costCategories.ts` | 成本科目与口径说明（`COST_CATEGORIES`），成本侧栏「明细」与报告「预算构成」共用 |
| `model/houseType.ts` | 户型（几室几厅几卫）：按房间名称识别 |
| `model/grossArea.ts` | 建筑面积：墙体外轮廓围合的范围（含墙体，不含公摊） |
| `model/reportPdf.ts` | `reportPdf(model, { fontBytes })`：平面图 + 关键信息页、目录 + 预算 + 关键数字页、三张清单页 |
| `model/pdfFlow.ts` | A4 流式排版：分页、按字形宽度换行、跨页表格、页脚 |
| `model/pdfPlan.ts` | 把单页矢量平面图包成表单 XObject 画进报告页，比例与图层（OCG）登记 |
| `model/pdfFont.ts` | `alignGlyphs`：PDF 嵌入前的 TrueType 字形对齐（见 §4） |
| `model/reportExport.ts` | `reportFile(design, name, defaults?)`：buildReport → loadPdfFont → reportPdf，返回 `ExportFile` |
| `model/drawingExport.ts` | 复用的 `loadPdfFont`、`fileName`、`ExportFile`（与图纸导出同一套约定） |

报告是**纯导出功能**：`model/report.ts` 之后的一切都只服务 PDF，没有 UI 组件。要改版面，改的是 `reportPdf.ts` 与它用的 `pdfFlow.ts` / `pdfPlan.ts`。

## 1. 数据（`model/report.ts`）

- **只组合现成的计算，不另算一套**：`calculateCosts`、`costBreakdown`、`roomMetrics`、`roomLayout` / `violationsOf` / `problemOf`、`decorStyleById`、`createExportDocument`。成本口径、风格表或图纸导出一变，报告自动跟着变。
- 分节固定，顺序即 `ReportModel` 的字段顺序，也就是版面顺序：关键信息 `info` → 平面图 `plan` → 预算构成 `budget` → 关键数字 `figures` → 逐间清单 `rooms` → 布局体检 `layout` → 家具清单 `furniture`。
- 首页把「关键信息 + 平面图」并成一屏，所以 `REPORT_CONTENTS` 的第一条是合并项「平面图与关键信息」，其余条目与分节标题一一对应。
- **不变量**（`report.test.ts` 守护）：
  - `figures.total === costBreakdown(design).total`，硬装、软装同样取自 `costBreakdown`；
  - Σ 逐间合计 + 公共项 = 总价；硬装 / 软装两列各自也对得上（公共项的硬装 / 软装 = 全屋 − 各房间之和，取整残差不为负）；
  - 预算构成各科目金额之和 = 总价，占比合计 100%；
  - `figures.rooms === design.rooms.length`，`figures.furniture === design.furniture.length`，家具清单件数之和 = 家具件数；
  - `plan` 就是 `createExportDocument(design)`（图纸导出同一份），没有有效墙体时为 `null`。
- 口径：
  - **套内净面积** = 计入面积的房间（`counted !== false`）净使用面积之和，与成本侧栏「套内净使用面积」相同；单价 / m² = 总价 ÷ 套内净面积，面积为 0 时为 `null`。
  - **建筑面积**（`grossArea.ts`）= 合并（未拆除墙体轮廓 ∪ 房间外环）后的**外环**面积，含墙体、填掉内部空洞，**不含公摊**，与房产证口径不是一回事。没有墙体也没有房间时为 0，信息带写「—」。合并用已有的 `polygon-clipping` 依赖。
  - **户型**（`houseType.ts`）= 按房间名称识别「几室几厅几卫」，是参考值（房间没有用途字段）。规则按顺序先中先得：飘窗 / 阳台 / 衣帽间 / 储藏 / 过道 / 玄关 / 厨卫之外的附属空间不计，「卫 / 浴 / 厕」算卫，「厅 / 起居」算厅（客餐厅合写算两厅），其余带「卧 / 房 / 室」的算室；写法十以内用中文数字（两不写二），一间都识别不出写「—」。与内置模板、AI 范例户型自己声明的户型一致（`houseType.test.ts` 逐条核对）。
  - 预算构成按 `COST_CATEGORIES` 归并（地面、墙面、门窗、屋面、吊顶、楼梯、拆改与新建、人工、软装），没有条目的科目不列。
  - 家具归属房间与成本分摊同一规则：中心点落在哪间算哪间；房外家具进公共项，不参与布局体检。
  - 家具清单按「同款（同单价）+ 名称 + 型号（宽 × 深）」归并；按小计从高到低排列，未定价的排在最后；楼梯在预算里归硬装，清单里照常列出并注明。
  - 布局体检逐条列出「房间 · 家具 · 问题」，问题描述用 `problemOf`，与 AI 布局校正同一套说法。
- **账号默认价**：`buildReport(design, defaults)` 与成本侧栏的 `useCostDesign` 同一套 `effectiveCostDesign` 合并规则；`defaults` 的类型即 `calculateCosts` 的第二个参数（`AccountCostSettings`）。不传就按方案自带单价算，与成本侧栏一致。
- **未定价不计入金额，必须写明**：首页信息带的预算总价下写「另有 N 项未定价」，关键数字下方写「另有 N 项未定价，没有计入以上金额」，预算构成在口径里注明，家具清单单价写「未定价」。
- **一次要出图纸（约 30–40 ms）与成本分摊**：只在导出时调用（`reportFile` 内部调一次），不要放进渲染路径。`buildReport` 是纯函数、可 JSON 序列化，`report.test.ts` 直接测它。

## 2. 入口与导出出口

- 入口：**顶栏右侧「生成方案报告」，点击直接导出 PDF**，不打开任何预览。游客与登录一致（未登录按方案自带单价算）。
- 工作台的接法：`exportAction.run("方案报告", …)` 里动态 `import("../model/reportExport")` → `reportFile(snapshot, 项目名, defaults?)` → 把 `ExportFile` 交给 `exportAction` 的统一出口（`saveFile` → `notify`，微信等不能直接下载时由 `SaveFileDialog` 兜底）。**不要另写下载逻辑**，也不要在首屏静态导入 `reportExport`（pdf-lib 不进首屏包）。
- 文件由 `reportFile(design: Design, name: string, defaults?: AccountCostSettings): Promise<ExportFile>` 生成（`model/reportExport.ts`）：内部 `buildReport` → `loadPdfFont` → `reportPdf`（含平面图页），只生成、不保存。
- 文件名：`项目名-方案报告.pdf`，非法字符按 `drawingExport.ts` 的 `fileName` 规则替换为 `-`；项目名为空时写「未命名方案」。
- 导出中由 `exportAction` 的 pending 状态负责（入口禁用、防止重复点击），报告侧不需要额外的 UI 状态。

## 3. PDF（`model/reportPdf.ts`）

- 全部 A4（第 1 页可能横向），`reportPdf(model, { fontBytes })`，页序固定：
  1. **平面图 + 关键信息**（第 1 页）：页顶是项目名（最多两行，超出截断）与右侧「方案报告 · 日期」，下面一条信息带——户型、套内 / 建筑面积、房间数、装修风格、预算总价（有未定价项时在总价下注明）；再下面是「平面图」标题（右侧写打印比例、尺寸单位与图层说明）与**整页主体的矢量平面图**。**没有封面页**。没有有效墙体时不跳过这一页：信息带照旧，平面图的位置写「暂无平面图」与下一步怎么做，比例说明也一并省略。
  2. **目录 + 预算构成 + 关键数字**（第 2 页）：目录列出每个分节与它的页码（**排完全文后回填**，见下），预算构成表含科目、口径说明、类别、金额、占比与合计，下面是计价依据；关键数字是六张卡（总价为主指标）加未定价说明与面积、户型的口径。
  3. **逐间清单、布局体检、家具清单**（第 3 页起）：三张表各自独立分节，标题至少与表头、首行留在同一页；表格跨页时新页先写「标题（续）」并重复表头。
- **第 1 页的实现**：`serializePdf(plan)` 出单页矢量平面图 → 拷贝进目标文档后 `embedPage` 包成表单 XObject → 把这张表单画在一张新的 A4 页面上（`page.drawPage`），标题、信息带、图名、页脚照常用 `pdfFlow` 画。选这种做法而不是直接改拷贝来的页，是因为 pdf-lib 的 `scaleContent` / `translateContent` 会连后画的文字一起变换。平面的图层（OCG）随表单的资源留在标记内容里，再登记到文档目录的 `OCProperties`，阅读器里仍可逐层开关；拷贝来的原页与它的内容流用完即删，图形不在文件里存两遍。
- **横竖版自动选择**：横竖两种 A4 各排一遍页头并算一次平面图的缩放余地，取缩得更多的那种（相同则竖版；没有平面图时竖版）。横向户型因此用横版 A4，图能印得更大；其余页一律竖版。
- **打印比例**：平面图整张放得下就保持图纸自己的出图比例，放不下时取 GB/T 50001 常用 / 可用比例里能放下的最大比例（`pdfPlan.ts` 的 `PRINT_SCALES`），并在图名右侧写明「比例 1:N（A4）」。图等比缩放、水平居中，四周不出页边距，上面让出信息带与图名、下面让出页脚，**不能为了塞信息把图压小**（第 1 页的用例会核对这些约束）。
- **目录页码**：正文排版跑两遍——先在草稿文档上排一遍量出各分节的起始页，再在正式文档上按真实页码排一遍。两遍排版一致（第一遍的页码只占位、不改行高），文字按自然顺序写入内容流。改分节顺序或增减页时不需要手工维护页码。
- 文字用中文字体子集嵌入，换行与列宽都按 `font.widthOfTextAtSize` 计算；页边距统一 48 pt；每页页脚左侧「项目名 · 方案报告」（过长截断，不压到页码），右侧「第 N / M 页」。
- 打印稿固定浅色，配色由 `index.css` 浅色主题的 HSL token 换算（`pdfFlow.ts` 的 `COLORS`）。

## 4. PDF 中文字体（所有 PDF 导出都适用）

- `public/fonts/NotoSansSC-Regular.ttf` 用长格式 loca，约一半字形记录是奇数字节长；pdf-lib 的 fontkit 子集化原样拷贝字形，子集小于 64 KB 时改用短格式 loca（存「偏移 ÷ 2」），奇数偏移被截断，阅读器里这些字直接不显示（FreeType 报 invalid outline）。
- 规则：**PDF 用的字体一律经 `loadPdfFont()` 取得**，它在缓存前调用 `alignGlyphs` 把字形补齐到偶数字节、loca 改为长格式（字形轮廓不变，已对齐的原样返回）。不要把字体文件字节直接交给 `embedFont(..., { subset: true })`；`reportPdf` 对传入的字节也会再对齐一次。
- 平面图表单与报告正文共用同一份字节与子集，字形不会重复存储。
- `pdfFont.test.ts` 逐字形比对子集与原字体的轮廓，图纸 PDF 与方案报告都覆盖。

## 5. 必须有的测试

- `model/report.test.ts`：分节齐全且可 JSON 往返；目录顺序；首页信息带的五项、未定价说明、无房间时写占位符；`plan` 与图纸导出一致、无墙体时为 `null`；总价等于 `costBreakdown().total`；逐间合计 + 公共项 = 总价；预算构成之和与占比；房间数、家具件数；家具归并与排序；布局体检描述；账号默认价；空家具 / 未定价 / 无房间 / 无墙体不抛错。
- `model/houseType.test.ts` / `model/grossArea.test.ts`：户型识别与内置模板、AI 范例一致；建筑面积大于套内净面积、无墙无房时为 0。
- `model/reportPdf.test.ts`：回读页数 ≥ 3 且每页 A4；第 1 页文字按「项目名 → 日期 → 信息带 → 图名与比例」的顺序出现、没有封面内容；平面图是一张表单 XObject，等比、居中、落在信息带之下与页脚之上、占正文一半以上，图层对象与平面图自己导出的那份逐名逐序一致、默认全开、没有多余页对象；第 2 页以目录开头，目录页码等于各分节实际所在的页（含九科目全有的最挤情况与长清单页码后移的情况），预算构成与关键数字六张卡都在；第 3 页起依次是三张清单、页脚每页都有项目名与页码；表格跨页重复「标题（续）」与表头；横竖版自动选择；无墙体时第 1 页照旧并写「暂无平面图」；项目名很长时页标题与页脚截断不溢出；`reportFile` 的文件名、账号默认价与空项目名。字体文件缺失时整组跳过（标题写明原因），不报红。
- `model/pdfFont.test.ts`：补齐后 loca 为长格式、偏移全为偶数、轮廓不变、可重复调用；子集嵌入与图纸 PDF 导出后每个字形都完整。
- 报告是纯导出功能，没有组件测试；页面观感靠下面的手工复查。

### 手工复查做法（改了页序 / 平面图页 / 字体后必做）

1. 临时脚本调 `reportFile` 导出样例（参考户型、横向大开间、纵向长条、无墙体、长清单、超长项目名），用 MuPDF 渲染成 PNG 逐页看：中文字形、页序、目录页码、页脚、横竖版。
2. **图层面板用两个内核各测一遍**：MuPDF（`layer_ui_configs` / `set_layer_ui_config`，SumatraPDF 一类阅读器的内核）与 pdf.js（Firefox 的内核，`getOptionalContentConfig()` / `setVisibility()`）。逐个关掉每个图层，比对渲染结果：平面图区有变化、页头信息带与页脚 0 变化、重新打开与原图逐像素一致。只有「阅读器里还能开关图层」这一点被真实测过，才算这一页没写坏。

## 6. 当前未做

报告预览弹层与分享链接（**产品上就是直接下载，不做预览**，见 §2）、3D 效果图封面、PDF 书签（大纲，「目录」目前只有文字页码，点不进页面）、过道连通与家具重叠体检、税费与多币种。要补哪一项，先更新本文件再实施。
