# dxf-import · 导入户型图

## 职责

把外部文件变成方案：DXF 户型图（读取、图层识别、墙 / 门窗 / 房间识别、导入预览）与本应用导出的 JSON / SVG / DXF 方案文件（读取内嵌的方案数据）。

## 公开入口

`DxfImportDialog`、`parseDesignFile`、`IMPORT_ACCEPT`、`DXF_TEMPLATE_ID`、类型 `DxfSource`。

## 目录

`components/`（导入弹窗与预览）、`model/design-import.ts`（文件 → 方案）、`model/external-dxf/`（DXF 读取与识别；`read-dxf.ts` 按需加载）。

## 规则

- 图层中文名的匹配规则与 `lib/drawing` 的导出图层名一致（`layer-names` 有守护测试，见 `lib/drawing/README.md`）。
