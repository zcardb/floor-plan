## Context
用户最新要求将楼梯简化为普通家具：点击名为“楼梯”的家具添加，再设置长和宽。此要求取代此前的台阶数设置和独立构件工具方案。
现有家具库未提供内置楼梯，但添加、选中、尺寸编辑、移动、旋转、复制、删除和保存链路已经存在，可直接复用。
此前确认“标记线”指户型外围尺寸标注。`PlanCanvas.tsx` 的 `Dimensions` 使用 SVG 绘制且禁止点击；空白户型读取宽深，参考户型分段写在代码里。外围标注的具体设置范围尚未确认，因此仍保留最小推荐范围供本次审批：显示开关和四边距离，不做自由分段编辑。

## 推荐实现
### 楼梯：普通家具，不新增专门工具
在现有家具库增加名称为“楼梯”的内置素材，归入现有分类，支持搜索及点击添加。使用现有 Furniture 的 w、d 字段表示宽和长，默认 1 m × 3 m；选中后直接通过现有尺寸编辑入口修改。楼梯的尺寸入口将 d 显示为“长 / m”，其他家具仍显示“深 / m”。
在 FurnitureShape 增加直跑楼梯 SVG 示意，轮廓和固定踏步线随宽长缩放。无台阶数参数、无新增数据结构、无三维楼梯功能、无独立添加弹窗。沿用现有家具的移动、旋转和保存功能。
### 外围标注：最小设置范围（推荐，尚未经单独确认）
在户型设置增加标注显示及上、下、左、右距离（米）。以 Design 可选配置保存，缺省保持旧项目行为；与现有尺寸图层菜单共用显示状态。数字继续按原有几何计算，参考分段保持不变，不允许手动覆盖数字。
不修改数据库结构，不清空任何项目。

## 关键文件与复用
- `src/features/interior/data/catalog.ts`：增加普通“楼梯”家具素材；复用现有 library 和分类。
- `src/features/interior/components/FurnitureShape.tsx`：楼梯 SVG 分支。
- `src/features/interior/components/SizeFields.tsx`、`SelectionEditor.tsx`、`PropertyPanel.tsx`：仅楼梯把深度标签改为长度；PropertyPanel 同时接入标注设置。
- `src/features/interior/model/types.ts`、`validation.ts`：仅新增可选标注配置与兼容校验，不新增楼梯参数。
- `src/features/interior/components/Workbench.tsx`、`PlanCanvas.tsx`：尺寸图层状态接线及 Dimensions 读取标注配置。
复用 Library 的点击添加、Workbench 的 add/duplicate/remove、editSelection、SizeFields、sizeTransaction、lengthUnits 的米/毫米换算及 useDesign 的撤销/重做。validFurnitureType 已从 library 派生，加入素材后复用现有校验，不另建楼梯类型系统。保存仍走现有项目 Design 通道。

## Implementation checklist
- [ ] 在现有家具分类中增加名称“楼梯”、默认宽 1 m 长 3 m 的内置素材；搜索“楼梯”可以找到并点击添加。
- [ ] FurnitureShape 为楼梯绘制轮廓和固定踏步线，使用现有 w、d，不增加台阶数或高度设置。
- [ ] 楼梯的现有尺寸入口显示“宽 / m”“长 / m”；修改这两个字段更新轮廓；其他家具的深度标签不变。
- [ ] 添加的楼梯沿用普通家具选中、移动、旋转、复制、删除、撤销/重做及保存通道，不增加独立构件入口或弹窗。
- [ ] 增加可选标注配置及校验，旧项目缺省保持原有显示和距离。
- [ ] 户型设置接入显示开关和四边距离输入（0–10 m），与尺寸图层菜单同步。
- [ ] Dimensions 读取四边距离；数字仍来源于宽深和参考分段，导出 SVG 与当前渲染一致。
- [ ] 标注配置通过现有项目保存及 JSON 导出/导入保留，不修改现有表和生成的客户端文件。

## Verification checklist
- [ ] 正向：搜索并点击“楼梯”后出现可选家具；设置宽 1.2 m、长 4 m 后平面尺寸同步，其他普通家具不受影响。
- [ ] 回归：楼梯拖动、旋转、复制、删除及撤销/重做按现有家具行为工作；复制与重载保留长宽。
- [ ] 边界：长宽沿用 0.05–20 m 校验；空值、非法值及超范围输入不提交；米/毫米转换保持一致。
- [ ] 默认/兼容：旧项目无新增标注配置仍可加载，原家具、墙体、门窗、测量和参考分段不变。
- [ ] 标注：两个显示入口同步；四边距离分别生效；0、10 m 可用，负值、非有限值及超过 10 m 拒绝；空白户型宽深改变后数字同步。
- [ ] 保存：JSON 导出/导入及项目重载保留楼梯宽长和标注配置；SVG 包含楼梯和设置后的标注。
- [ ] 增加楼梯素材/渲染/长宽编辑与标注配置的针对性测试；运行 `pnpm test`（全部 src/features/interior）、`pnpm lint`、`pnpm exec tsc -p tsconfig.app.json --noEmit`、`pnpm run build`。
- [ ] 若验证新增设置入口的视觉与响应式表现，检查同一工作台路由的 mobile_390 与 desktop_1280；无浏览器证据则注明未验证。
