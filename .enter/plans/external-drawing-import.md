# 外部 DXF 图纸识别导入

## Context
现在的导入只认本应用导出的文件（读取 DXF 里 `999` 注释嵌入的方案数据）。外部 CAD 画的 DXF 没有这份数据，所以报「暂不支持识别外部图纸」。

参考酷家乐、三维家等软件的「CAD 识别」流程：上传 DXF，选哪个图层是墙、哪个是门窗，确认单位，预览识别结果，再生成户型。墙通常画成双线，两条平行线配成一面墙，线距就是墙厚。DWG 是私有二进制格式，浏览器读不了，一般让用户在 CAD 里另存为 DXF。

**范围**：只做 DXF。导入入口只保留「导入 DXF 图纸」，JSON/SVG 入口直接去掉（底层解析暂时保留）。
- 外部 DXF：走「识别 → 预览 → 确认」流程。
- 本应用导出的 DXF：仍然无损还原。

## 方案
1. `model/externalDxf/dxfSource.ts`：用 `dxf-parser` 提取线段。
   - 支持 `LINE`、`LWPOLYLINE`/`POLYLINE`（闭合时补上最后一段）、`ARC`（折线近似）。
   - `INSERT`：按插入点、缩放、旋转展开块，最多嵌套 4 层；块内 `0` 图层继承插入它的图层；同一个块的线段共用 `group`。
   - 单位：读取 `$INSUNITS`；没有单位时按图纸范围猜测。
2. `model/externalDxf/recognize.ts`：线段转成 Design，输出墙、门窗、房间和提示信息。
   - 双线配对成墙；配不上对的长单线按 120 mm 厚的墙处理。
   - 端点吸附，L 形和 T 形接头延伸到相交处。
   - 门窗簇落在墙缺口时先把两侧墙合并，再生成开口。
   - Y 轴翻转并平移坐标。
   - 用 polygon-clipping 求房间，并区分外墙和隔墙。
   - 设计模板用 `template: 'reference'`，最后经过 `validateDesign` 校验。
3. `model/designImport.ts`：`parseDesignFile` 返回 `kind: 'design' | 'dxf'`，`.dwg` 文件提示另存为 DXF，删除 `FOREIGN_DRAWING_ERROR`。
4. `components/DxfImportDialog.tsx`：
   - 左侧预览识别结果。
   - 右侧设置每个图层的角色（墙/门/窗/忽略）和单位，显示统计、提示信息和项目名称。
   - 「导入」按钮：识别失败时禁用；确认后创建项目。
5. `components/ProjectManager.tsx`：入口改成单项「导入 DXF 图纸」；`kind === 'dxf'` 时打开预览弹窗。

## Implementation checklist
- [x] `dxfSource.ts`：LINE/POLYLINE/ARC/INSERT 解析和单位识别
- [x] `recognize.ts`：双线配对成墙、单线墙兜底、端点吸附
- [x] `recognize.ts`：门窗识别、Y 轴翻转、房间、外墙/隔墙区分，生成合法的 Design
- [x] `designImport.ts`：返回联合类型，删除 FOREIGN_DRAWING_ERROR
- [x] `DxfImportDialog.tsx` 和 `index.css` 样式
- [x] `ProjectManager.tsx`：入口只保留 DXF，dxf 分支打开弹窗

## Verification checklist
- [x] 往返用例仍通过；外部 DXF 返回 `kind: 'dxf'`
- [x] `recognize.test.ts`：双线矩形加一道隔墙 → 5 面墙、厚度 240、2 个房间
- [x] 门块落在墙缺口里 → 生成 1 个门，宽度约等于缺口宽度
- [x] 改单位后尺寸按比例变化；墙图层全部忽略时报错
- [x] `pnpm vitest run src/features/interior` 和 `pnpm run build` 都通过（弹窗界面未在浏览器中截图验证：预览环境未能加载）
