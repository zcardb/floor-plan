# DXF 导出规范复核与整改（目标：AutoCAD 原生）

## Context

你要求复核整个项目里「最终产物」（`导出 ▸ DXF CAD 图纸`）是否符合业界 DXF 规范，并选择以 **AutoCAD 原生**为落点、按规范整改且**保留可往返**。

复核方法：用 `@tarikjabiri/dxf@2.9.0` 实际跑出字节级 DXF（未改任何文件），逐段对照 DXF R13+ 的**强制内容清单**（ezdxf《DXF File Structure → Minimal DXF Content》）+ Autodesk DXF 参考的组码表 + 两个「AutoCAD 打不开 DXF」的真实失败案例定位。

**结论：强制结构已经合规，能被 AutoCAD 打开；但有 2 处偏离规范写法，其中 1 处会让中文房间名在 AutoCAD 里显示成 `?`。**

## 一、已核验合规、无需改动

| 规范要求（R13+ 强制） | 本项目的实际输出 | 结论 |
| --- | --- | --- |
| HEADER 需 `$ACADVER`、`$HANDSEED` | `AC1021`；实测 HANDSEED=455 > 最大句柄 454（200 线 + 5 尺寸块压力用例） | 通过 |
| CLASSES 段可空 | 存在且为空 | 通过（规范明确允许） |
| TABLES: VPORT / LTYPE / LAYER / STYLE / VIEW / UCS / APPID / DIMSTYLE / BLOCK_RECORD | 9 张表齐全 | 通过 |
| LTYPE 至少 ByBlock / ByLayer / Continuous | 三条都在 | 通过 |
| LAYER 至少有 `0`；APPID 至少有 `ACAD`；STYLE/DIMSTYLE 至少有 `Standard` | 都在 | 通过 |
| BLOCK_RECORD 至少 `*Model_Space`、`*Paper_Space` | 都有，且每个匿名尺寸块 `*D<n>` 也登记了 BLOCK_RECORD | 通过 |
| BLOCKS 至少 `*Model_Space`、`*Paper_Space` | 都有（空定义） | 通过 |
| OBJECTS：根 DICTIONARY + 一个 `ACAD_GROUP` | 完全一致（`281 1` + `3 ACAD_GROUP / 350 <句柄>`） | 通过 |
| 实体需句柄(5)、所有者(330)、子类标记(100) | LINE / LWPOLYLINE / ARC / TEXT / DIMENSION 全部具备 | 通过 |

实体组码逐条核对也正确：LWPOLYLINE 有 `90` 顶点数 / `70` 闭合 / `43` 定宽；ARC 走 `AcDbCircle`(10/20/30,40) + `AcDbArc`(50/51)；TEXT 有 `72/73` 对齐 + `11` 第二对齐点（并复现了 DXF 参考里 `100 AcDbText` 出现两次的写法）；DIMENSION 走 `AcDbDimension` + `AcDbAlignedDimension`，`70|=32`（独占匿名块）、`2` 块名、`3` 样式名、`42` 实测值、`13/14` 定义点。**未发现任何 AutoCAD 会判「未定义组码」的码**（这正是 SO#75603060 中 AutoCAD 拒绝文件的根因）。

尺寸这块两个头号坑也都躲开了：SO#41273700 里 AutoCAD 打不开的头号原因是「`2` 指向的 `*D1` 伪块在文件里不存在」——本项目既写入 BLOCKS 又登记 BLOCK_RECORD，安全。

## 二、需要整改的问题

### P1-A 中文房间名在 AutoCAD 里会显示成 `?`

**证据**：施工图 TEXT 走默认样式 `Standard`，其 STYLE 记录是 `3 txt` / `4`（空）——即 `txt.shx` 且**无大字体**。`ROOM_LABELS` 写的是中文（如「客厅 & ＜书房＞」）。简单 SHX 字体没有 CJK 字形，AutoCAD 对无大字体的 CJK 会渲染成 `?`。

**修法**：新增文本样式 `STUDIO_CN`（`fontFileName='simplex.shx'`、`bigFontFileName='gbcbig.shx'`，两者为 AutoCAD 自带字体），并让所有 TEXT 实体的 `textStyle` 指向它。已实测该库可输出：`2 STUDIO_CN` + `3/4` 字体字段，TEXT 写出 `7 STUDIO_CN`。

### P2 两个头变量的非规范取值

- `$DWGCODEPAGE = 'UTF-8'`：不是 DXF 参考里的代码页取值（应为 `ANSI_936` / `ANSI_1252` / `DOS437` 之类）。AC1021 的 DXF 本身就固定 UTF-8，AutoCAD 原生写 `ANSI_1252` → 改为 `ANSI_1252`。
- `$LASTSAVEDBY = '@tarikjabiri/dxf'`：会直接写进 AutoCAD「图形特性 → 上次保存者」，暴露底层库名 → 改为 `'Zhujian Studio'`（与 `index.html` 的「筑间 Studio」一致）。

### P3（可选，最后做）换行符 LF → CRLF

ASCII DXF 的规范写法是 CRLF（AutoCAD 也这么写）。AutoCAD 能读 LF，但部分 CAM / 国产 CAD 更保守。改动会触及按 `'\n'` 切分的断言，收益低、动面大，**建议放最后、可单独回滚**。

## 三、明确不改动的部分

- **999 分块保持 2000 字符/行**（原 P1-B，经复核撤回）：R2000 起字符串上限为 2049 单字节字符，本文件是 R2007、载荷为纯 ASCII base64，2000 在限内；AutoCAD 读取时直接丢弃 999 注释。仅极老的 R12 时代 256 字节行缓冲读取器有风险，不在目标范围内。改为 250 只会让载荷行数 ×8、体积 +约 2%，对 AutoCAD 无收益。
- **已知限制（与行长无关）**：在 AutoCAD 中打开并另存后 999 注释会被丢弃，再导入本应用将走「外部图纸识别」而非完整还原。
- **载荷仍留在文件开头**：`999` 注释按规范可出现在任意位置，业界大量导出器同样在头部写 `999` 横幅；ezdxf 说的「HEADER 必须是第一个 section」指的是 section 而非注释。改成尾部还需重写 `dxfPayload` 的 `i += 2` 配对逻辑，收益为零 → **不动**。
- **不补 layout 对象 / 命名对象字典**：`CLASSES` 空段、`OBJECTS` 只有根字典 + `ACAD_GROUP`，正好等于 ezdxf 列出的 R13+ 最小必需集，AutoCAD 不需要更多。
- **DIMSTYLE 的 `340` 不动**：`340` 即 `DIMTXSTY`，`Standard` 指向 STYLE `Standard`(句柄 16) 是正确的；`STUDIO_METERS` 省略即继承 Standard，而尺寸文字只有 ASCII → 无影响。
- 几何、图层划分、尺寸块机制、payload 编码格式与往返格式全部不动。

## 四、改动文件

1. `src/features/interior/model/dxfExport.ts`（P1-A / P2，三处小改）
2. `src/features/interior/model/drawingExport.test.ts`（补断言 + P3 若采纳需把 `split('\n')` 改为 `split(/\r?\n/)`）

复用既有工具，不新增依赖：`DXF_COMMENT_CHUNK` / `payloadComments` / `writeEntity` / `PAYLOAD_MARKER` / `decodePayload`，库侧用 `writer.tables.addStyle()` 与 `Text.textStyle`。

## Implementation checklist

- [ ] `dxfExport.ts`：用 `writer.tables.addStyle('STUDIO_CN')` 建样式，设 `fontFileName='simplex.shx'`、`bigFontFileName='gbcbig.shx'`
- [ ] `dxfExport.ts`：`writeEntity(target, entity)` 中 `addText` 返回的实体 `textStyle = 'STUDIO_CN'`（模型空间与尺寸显示块共用同一函数，两处都覆盖）
- [ ] `dxfExport.ts`：`$DWGCODEPAGE` 由 `'UTF-8'` 改为 `'ANSI_1252'`
- [ ] `dxfExport.ts`：`$LASTSAVEDBY` 由 `'@tarikjabiri/dxf'` 改为 `'Zhujian Studio'`
- [ ] `drawingExport.test.ts`：断言 STYLE 表含 `STUDIO_CN` 且其 `3=simplex.shx`/`4=gbcbig.shx`，且 `parsed.entities` 中所有 TEXT 的样式名解析为 `STUDIO_CN`
- [ ] `drawingExport.test.ts`：断言 `$DWGCODEPAGE === 'ANSI_1252'`、`$LASTSAVEDBY === 'Zhujian Studio'`，并断言 `$HANDSEED > 文件内最大句柄`
- [ ] P3（可选）：`serializeDxf` 返回值统一转 CRLF，并把测试里 `text.split('\n')` 改为 `text.split(/\r?\n/)`

## Verification checklist

- [ ] 正向：`pnpm test`（vitest run src/features/interior）全绿，含既有 206 项
- [ ] 正向：独立解析器 `dxf-parser` 回读导出 DXF 成功，块数 = 尺寸数、`$INSUNITS=4`、`$MEASUREMENT=1`、中文 TEXT 原文一致
- [ ] 正向：往返用例仍通过——SVG / DXF（带载荷）导入后 `validateDesign` 深度等于原设计
- [ ] 负向：`walls: []` 时三种矢量导出仍抛「没有可导出的有效墙体」
- [ ] 负向：无嵌入载荷的外部 DXF 仍走 `kind: 'dxf'` 识别流程（单位、图层不变）
- [ ] 边界：既有「999 分块每行 ≤ 2000」用例保持通过（`DXF_COMMENT_CHUNK` 未改）
- [ ] 边界：`serializeDxf(document)`（不传 payload）输出仍能被 `dxf-parser` 解析且 `$HANDSEED > 最大句柄`
- [ ] 构建：`pnpm lint` 无新增错误、`pnpm exec tsc --noEmit` 通过、`pnpm run build` 通过
- [ ] 人工（沙箱无 AutoCAD，需你确认）：AutoCAD 打开导出 DXF，房间名「客厅」等正常显示而非 `?`，尺寸标注显示为 `x.xx m`
