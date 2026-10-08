## Context
已完成基础自动尺寸：画布从当前墙体坐标生成四边尺寸线。但用户截图表明，把所有墙轮廓顶点投影到同一条线，会产生 0.01 m、0.04 m 等碎段与密集刻度，不能作为规范工程图。
用户本次确认：先规范尺寸线并新增 DXF＋SVG 通用矢量导出；保留现有 JSON 项目导入，不实现外部 DXF 导入。目标是导出后在支持相应格式的软件中保持比例与可编辑几何，不承诺所有软件、DWG/RVT 原生工程或完整 BIM 语义兼容。

## 推荐实现
### 1. 统一工程图数据与尺寸规则
- 从 Design 推导独立的二维图纸模型（毫米坐标、图层、线/多段线/弧/文字、尺寸对象），作为画布外围标注与 DXF/SVG 导出的共同来源；不把自动标注保存为手工 measures，不增加数据库字段。
- 重用 wallPoly、length、bbox、roomPath、doorOrientation、formatMeters 与已安装 polygon-clipping。先按当前实际连接合并有效墙轮廓，消除同一连续墙体内部的端头/搭接边界；不移动实际墙体，不扩大吸附容差去修补真实间隙。
- 四边尺寸分别从对应侧的结构边界推导：识别轴向外围墙面/外露轮廓，收集与该侧相交或连接的垂直墙带；合并同一实体墙带投影为墙厚区间，以相邻墙带之间的净空作为主要分段。避免将平行墙端点、接头半墙厚或远侧房间的全部顶点加入该侧链。
- 非矩形设计按该侧外露轴向轮廓分别生成可解释的尺寸链，不强制上下或左右完全相同；未形成闭合区域时使用当前有效墙的外露边界，不要求先形成房间。
- 分开绘制靠内的结构分段链及靠外的总尺寸链。每段保留测量起止位置、引出线、基线、端点斜刻度和真实数值；尺寸数值自动计算，不允许手填伪造长度。
- 毫米级去重仅清理浮点重复，不以“短于某阈值”删除真实小墙段或真实间隙。空间不足的标签使用引线外置/错行，并明确对应起止点；不能靠挤压字体或隐藏尺寸掩盖几何问题。斜墙不冒充水平/垂直净长，本次仅参与总体范围，不新增斜向施工标注。
- 保持 layers.dims 开关；删除/拆除、移动、端点修改、取消、撤销/重做均由当前 Design 重新派生。fit 与图片导出范围包括分段链、总尺寸链和外置标签。

### 2. DXF：二维可编辑工程交换图
- 推荐输出 ASCII DXF 2007（AC1021、UTF-8），模型空间坐标使用毫米，设置 $INSUNITS=4 与 $MEASUREMENT=1；浏览器向下的 Y 转为 CAD 向上的 Y，弧方向和文字旋转同步转换。
- 图层使用稳定 ASCII 标识：WALLS、DEMOLISHED、OPENINGS、FURNITURE、ROOM_LABELS、DIMENSIONS、MEASURES；不输出背景网格、选择框、拖动手柄或未提交草稿。
- 墙体/房间采用闭合多段线，门窗用真实宽度与位置生成线、弧及轮廓；家具含位置、旋转、外轮廓与可表达的内部线条，楼梯包含踏步和方向。通过复用 FurnitureShape 的局部 SVG 几何及统一转换器处理 rect/line/circle/ellipse/path 与 transform，避免另建一套不一致的家具图；曲线必要时按毫米容差离散为多段线并记录适配，不嵌入家具 PNG 冒充可编辑实体。
- 外围尺寸与手工测量写出真实 DIMENSION 实体、定义点、测量方向和样式，并生成关联匿名显示块（线/刻度/文字），兼顾支持原生标注的软件与依赖显示块的读取器。尺寸与几何导出时一致；不承诺 CAD 内移动墙后自动关联更新标注。
- 复用成熟 DXF 写入/解析库前核实其版本、DIMENSION、显示块及 UTF-8 支持；若写入库缺少某实体，仅为本方案实际需要的实体增加小型序列化模块，不做完整 CAD 引擎。

### 3. SVG：保留图案的矢量文件
- 从同一图纸模型输出独立 SVG，明确毫米 width/height 和同尺度 viewBox，按图层分组；样式、必要 defs 自包含，文字 XML 转义，不依赖应用 CSS 变量或外部字体。
- 保留线条、弧、家具细节与尺寸文字，不把整张图转成 PNG；与 DXF 共用有效设计快照、结构分段及几何变换规则。
- SVG 可在支持它的矢量软件中编辑几何；不是本应用 JSON 工程，中文文字显示仍取决于目标软件字体。

### 4. 下载入口与兼容边界
- 在现有 Workbench 文件菜单新增“导出 CAD 图纸（DXF）”与“导出矢量图（SVG）”；登录用户顶部下载按钮和游客保存菜单提供相同二维格式选择，3D 截图保持原行为。
- 下载前沿用 sizeTransaction.cancel() 和 model.current.current，导出已确认的设计，不导出未提交尺寸输入。读取一致快照，Blob 下载与 URL 清理由共用 helper 处理；序列化失败明确提示，不产出损坏或空白文件冒充成功。
- 保留 exportJson、JSON 的 5 MB 限制、validateDesign、现有登录限制及项目导入逻辑。不新增外部 DXF 导入、DWG 导出、三维导出或云端格式转换服务。
- 图纸内使用模型毫米，尺寸标签显示米（两位小数）；原 JSON 仍保留本应用完整编辑状态。DXF/SVG 是二维交换文件，不保证其他软件恢复材质报价、用户权限或本应用编辑历史。

## 关键文件与复用
- `src/features/interior/model/perimeterDimensions.ts` 及对应测试：替换全顶点投影，结构链/总链/标签布局与范围计算。
- `src/features/interior/components/PerimeterDimensions.tsx`、`PlanCanvas.tsx` 及对应测试：统一新标注样式与 fit/PNG 范围，保留现有绘墙、门窗、家具交互。
- 新增 `src/features/interior/model/drawingDocument.ts`、`drawingExport.ts`、`dxfExport.ts`、`svgExport.ts` 及针对性测试：图纸实体、几何转换、毫米/Y 轴与 DXF/SVG 序列化；文件过大时按实体转换职责拆分。
- `src/features/interior/components/Workbench.tsx`、`WorkbenchHeader.tsx`：格式下载入口；提取可复用 ExportMenu，复用现有 DropdownMenu/Button 和尺寸事务取消机制。
- `src/features/interior/components/FurnitureShape.tsx`：重用现有局部 SVG 形状；只有确实需要时抽取共享几何，不重写所有家具视觉。
- `src/index.css`：尺寸链、引出线和标签语义样式；不引入硬编码组件颜色。

## Implementation checklist
- [ ] 墙轮廓合并消除连续墙接头内部边，真实间隙保留，已拆除墙不参与结构尺寸计算。
- [ ] 上/下/左/右分别从相应侧结构墙带与净空生成分段，不再采集全部墙顶点；非闭合与非矩形轴向设计有明确对应起止点。
- [ ] 尺寸图元包含定义点、分段线、引出线、斜刻度和总尺寸链；短标签外置/错行且保留真实尺寸。
- [ ] 画布使用新图纸尺寸模型，图层开关、修改/取消/撤销路径仍由 Design 派生，不额外写入项目状态。
- [ ] 图纸模型生成实际墙、拆除墙、门窗弧、家具/楼梯二维几何、房间文字与手工测量，排除网格和编辑覆盖层。
- [ ] DXF 写入有效 AC1021 文件、UTF-8、毫米单位、稳定图层及正确 Y 翻转与弧方向；尺寸写 DIMENSION 与可显示匿名块。
- [ ] SVG 输出自包含 defs/样式、毫米外部尺寸、准确 viewBox、矢量实体和文本转义，不以全图位图替代。
- [ ] 文件菜单、登录下载与游客保存接入 DXF/SVG；3D 截图行为保持；统一已确认快照、失败提示、Blob 下载和 URL 清理。
- [ ] JSON 导出/导入及原项目校验、登录限制保持不变；本次不接受外部 DXF 输入。
- [ ] fit、PNG、SVG 和 DXF 的实际范围均包含尺寸链及外置标签，视图缩放不改变导出实际比例。

## Verification checklist
- [ ] 正向：规则矩形新增水平/垂直墙，尺寸标注净空与完整墙带厚度；同墙分段接头不出现半墙厚碎段，上下左右只引用对应侧结构。
- [ ] 正向：移动/端点调整、拆除/删除、取消与撤销/重做后画布和两种导出的测量定义点及数字一致。
- [ ] 负向/默认：dims 关闭不导出自动标注，手工测量保持；无有效几何不下载空白图；草稿、选择框和网格均不进入工程文件。
- [ ] 边界：截图涉及的端点/搭接碎段被结构合并消除，但真实 10 mm 间隙仍保留；重复/反向墙、T/L 接头、不同厚度、真实短段、凹形/未闭合布局、斜墙、负坐标与非原点输入无零段或 NaN。
- [ ] 比例：1000 mm 测试墙在 DXF 中仍为1000单位，$INSUNITS=4；SVG 物理尺寸与 viewBox 匹配；旋转家具、门窗弧与Y轴转换正确。
- [ ] 用独立 DXF 解析器回读导出文件，核对 HEADER、TABLES、BLOCKS、ENTITIES、DIMENSION 定义/块引用、图层、闭合轮廓及中文文本；不能仅用同一写入器自检。
- [ ] SVG 用 XML 解析器核对有效结构、自包含引用、文字转义、毫米尺寸、无外部CSS和无编辑覆盖层。
- [ ] 下载入口测试覆盖登录/游客、2D/3D、取消未提交输入、导出失败提示；JSON 导出/导入往返仍保持原 Design。
- [ ] 新增 drawingDocument、结构尺寸、DXF、SVG 和菜单接线测试；运行 `pnpm exec vitest run src/features/interior/model/perimeterDimensions.test.ts src/features/interior/components/PerimeterDimensions.test.tsx src/features/interior/components/PlanCanvas.test.tsx` 及新增导出测试，然后 `pnpm test`、`pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm run build`、`pnpm run build:prod`。
- [ ] 用户已提供重叠刻度视觉症状，检查同一受影响工作台 `/`，按未知目标设备使用 desktop_1280 与 mobile_390，记录此设备假设；没有匹配证据不声称响应式通过。
- [ ] DXF/SVG 目标软件未指定；只有取得实际软件打开证据才标记兼容通过。解析器回读不等于 AutoCAD/Illustrator 实测，外部软件验证缺失时明确标记未验证。

## 已知验证限制
此前151项室内设计测试、类型检查与开发/生产构建通过；浏览器完整交互、PNG下载及外部软件打开未实测。性能审计器缺少 parse5 且 skill 挂载只读，需平台预装依赖；本次不扩大到优化路由、埋点或改动数据库。浏览器性能、部署 HTTP 与外部软件兼容均需单独证据。
