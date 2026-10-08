## Context
用户最终要求：楼梯作为普通家具，点击添加并设置长宽；工作台素材分类新增带独立图标的“硬装”，集中墙、门、窗和楼梯。外围标记线指自动尺寸标注，本次已批准显示及四边距离设置。
执行时发现外围标注已由其他改动升级为墙体自动分段，因此保留 `perimeterDimensions` / `PerimeterDimensions`，只接入配置，不恢复固定数字。

## 实现范围
楼梯使用 Furniture 的 w、d、cx、cy、rot；固定踏步示意，无台阶数或三维楼梯设置。工作台硬装分类用 BrickWall 图标，墙、门、窗沿用原工具和空白户型限制，楼梯沿用家具添加。账号库和成本分类不在本次改动范围，保留现有分类数据。
标注显示由 Design.dimensionSettings.visible 派生，图层菜单与户型设置共用此来源；四边距离为毫米存储、米制输入，允许 0–10 m。旧项目默认上650、下750、左800、右900 mm。数字继续由墙体计算，fit 与图片导出使用包含标注的边界。

## 关键文件与复用
- `src/features/interior/data/catalog.ts`、`components/FurnitureShape.tsx`：普通楼梯素材及SVG示意。
- `src/features/interior/components/Library.tsx`：硬装分类、图标和既有墙门窗工具入口。
- `src/features/interior/components/SizeFields.tsx`、`SelectionEditor.tsx`、`PropertyPanel.tsx`：楼梯长度标签及配置入口。
- `src/features/interior/components/DimensionSettings.tsx`、`model/dimensionSettings.ts`：显示和距离设置。
- `src/features/interior/model/types.ts`、`validation.ts`、`perimeterDimensions.ts`、`components/PlanCanvas.tsx`、`Workbench.tsx`：配置保存、校验、派生标注和图层接线。
复用 add、duplicate、remove、editSelection、sizeTransaction、lengthUnits、useDesign 和现有项目JSON保存通道。不修改数据库表或生成客户端，不清理数据。

## Implementation checklist
- [x] 内置“楼梯”默认宽1 m、长3 m，可以搜索和点击添加。
- [x] 楼梯SVG轮廓、固定踏步与箭头随w、d缩放，无新增楼梯参数。
- [x] 楼梯尺寸入口显示长宽，其他家具继续使用深度标签。
- [x] 楼梯沿用现有家具选中、移动、旋转、复制、删除、事务和保存通道。
- [x] 工作台新增独立BrickWall图标的“硬装”分类，软装列表不再包含楼梯；空白户型墙门窗入口集中到硬装。
- [x] 可选标注配置与导入校验实现，缺省保留旧行为。
- [x] 户型设置有标注显示与四边距离，图层菜单使用相同显示来源。
- [x] 墙体自动分段读取四边距离，fit/导出边界同步；不覆盖并行的墙体连接算法。
- [x] 使用现有Design保存和JSON导入导出，不改数据库结构。

## Verification checklist
- [x] 新增Library测试验证独立图标、分类切换、点击楼梯及墙门窗工具派发；参考项目保留原工具限制。
- [x] 楼梯SVG测试验证尺寸和踏步；尺寸事务测试验证1.2 m×4 m即时模型、提交、取消及米/毫米换算。
- [ ] 浏览器实际拖动、旋转、复制、删除楼梯，并重新打开云端项目验证保存；目前仅复用既有链路和自动测试，未做完整浏览器验收。
- [x] 长宽0.05–20 m边界、空值和超范围拒绝有测试。
- [x] 旧项目无标注配置可加载；JSON校验保留楼梯宽长与配置。
- [x] 标注四边位置、默认值、0/10 m边界、负值/NaN/Infinity/超范围拒绝、数字不受距离影响有测试。
- [x] 自动测试验证SVG位置和共享边界包含标注；实际PNG下载尚未验收。
- [x] `pnpm test`全部src/features/interior：31文件166项通过；`pnpm lint`无错误但有既有fit依赖警告；`pnpm exec tsc -p tsconfig.app.json --noEmit`通过；`pnpm run build`及`pnpm run build:prod`通过。
- [x] 同一工作台`/`在desktop_1280和mobile_390截图显示正常。桌面可见新增硬装图标；手机抽屉内分类和户型设置未展开验收，不宣称全面响应式完成。
- [ ] 构建性能审计未完成：技能审计器缺parse5，技能挂载目录无法创建node_modules；未修改业务依赖绕过。生产构建存在既有大包警告。浏览器性能指标和部署HTTP未验证。

## 验证记录
应用类型app，入口`/`支持游客工作台、登录后云项目；3D仍仅切换时动态加载。本次不改变入口、analytics、i18n、授权和云数据链路。
生产入口JS基线1028.49 kB raw /319.72 kB gzip，末次1035.58 kB raw /321.97 kB gzip；期间其他会话同时修改墙连接与界面，不能将整体差值归因于本任务。构建通过；构建审计、浏览器性能和部署HTTP未验证；功能自动回归通过，完整浏览器回归未验证。无已证实的平台实现缺陷，仅审计环境依赖阻塞。
