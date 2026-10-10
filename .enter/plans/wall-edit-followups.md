# 家具详情弹窗：放大布局 + 2D / 3D 视角切换 + AI 重新生成 + 素材附件

> 上一份计划（墙体编辑后续 5 项）已全部完成并提交，本文件改写为本轮计划。

## Context
用户反馈（截图 256 / 257）：
1. 家具详情弹窗（家具库里点开一件家具：左侧图片、底部「删除家具 / 完成」）太小，底部按钮要右对齐。
2. 增加家具的 3D 视角预览：左侧 2D 图的左上角放一个 2D / 3D 切换按钮。
3. 2D、3D 两张图都能用 AI 调整 / 重新生成，生成弹窗复用「AI 布局 / AI 创建」那套弹窗（输入框 + 参考附件 + 数量 + 候选结果网格）；不要名称输入框，标题直接用家具名称。
   - 补充：调整 = 默认把当前家具图片带进附件区；重新生成 = 不带原图。界面不区分两种，只有一个入口，默认调整模式（移除附件即重新生成）。
4. 所有 AI 弹窗的附件除图片外，还要能导入常用素材：DXF、PDF、ZIP 素材包。

用户没有回答追问，按推荐方案执行：
- 「3D 视角」= AI 生成的 3D 透视效果图，与现有 2D 俯视符号图一样由 AI 生成、可重新生成（沿用项目已在用的 Seedream 5 图片模型）。
- DXF / PDF / ZIP 在前端转换成参考图再上传，所有 AI 模型都能读取：DXF 画成线稿 PNG，PDF 渲染前几页，ZIP 解出其中的图片 / DXF / PDF 再按前两条处理。

## 方案

### 1. 弹窗布局（`components/AccountFurnitureDialog.tsx` + `index.css`）
- `DialogContent` 宽度从 `max-w-[640px]` 放大到约 880px，左侧图片区加大（约 360px 正方形），小屏仍单列。
- 底部 `.cms-detail-actions` 改为整体右对齐：`[删除家具] [完成]` 都在右侧，删除在前。

### 2. 左侧 2D / 3D 视觉区（新组件 `components/FurnitureVisual.tsx`）
- 左上角分段切换按钮「2D | 3D」（`role="radiogroup"`，lucide 图标 `Square` / `Box`）。
- 2D：沿用现有逻辑，`item.imageUrl` 或 `FurnitureShape` 参考符号。
- 3D：`item.image3dUrl`；没有时显示空状态「尚未生成 3D 视角图」。
- 右上角一个「AI 调整」按钮（`Sparkles`），只在自定义家具（`isCustom && saveGeometry`）时显示。点击打开第 3 节的 AI 弹窗，视角 = 当前选中的视角。不区分「调整 / 重新生成」两个入口，也不在界面上显示模式切换。

### 3. 家具 AI 生成弹窗（新组件 `components/FurnitureAiDialog.tsx`）
- 默认就是「调整」：打开时把当前家具图片作为第一张参考附件，直接显示在输入框的附件区（可点开放大，也可点 ✕ 移除）。
  - 当前视角有图就带当前视角的图；3D 还没生成时带 2D 图作为参考；两张都没有时附件区为空。
  - 用户移除这张附件后，就是不参考原图的重新生成；界面不额外区分。
- 复用 `.ai-dialog` 外壳、`AiComposer`、`AiResults`、`useAiBatch`，结构与 `AiCreateProjectForm` 一致：输入态 → 候选结果 → 选中一个「应用」；可「返回修改」，关闭即停止。
- 标题：`AI 调整 · {家具名} · 2D 俯视图 / 3D 视角图`；没有名称输入框。
- 描述默认填：`{名称}，宽 × 深 × 高 m，主色 {color}`，用户可改。
- `AiComposer` 新增可选 prop `showEngine?: boolean`（默认 true），这里传 false：图片生成不用对话模型 / 小助手选择器；保留数量 1–4。
- 每个格子 = 一次「提交 + 轮询」任务（各自独立 `request_id`），预览直接显示生成图。
- 应用：2D 写 `imageUrl`、3D 写 `image3dUrl`，经现有 `saveGeometry`（`catalog.save(furnitureGeometryPayload(...))`）保存后 `onChanged(next)`，详情弹窗左侧立即换图。

### 4. 图片生成调用（`cloud/useFurnitureImage.ts` + 后端函数 `interior-furniture-image-submit`）
- 把单次「提交 + 轮询」提成纯函数 `generateFurnitureImage(item, { view, description, images, requestId }, isCancelled)`；现有 `useFurnitureImage` hook 改为调用它，行为不变。
- 后端函数（重新生成分支，即带 `request_id` 时）新增可选参数：
  - `view: 'top' | 'perspective'`（默认 `top`，旧调用不受影响）；
  - `description`（≤ 2000 字，作为用户需求拼进提示词，仍保留固定画风约束）；
  - `images`（≤ 4 个 https 地址）。
- 提示词：`top` 维持现有俯视符号画风；`perspective` 为「单件家具 3/4 俯角透视产品渲染图、中性浅色背景、无文字水印」。
- 有参考图时用 `img_2_img`（第一张为 `resource_url`，即默认带上的当前家具图；其余为 `refer_image_urls`），提示词说明「在原图基础上按需求调整，保持家具主体与视角」；没有参考图时 `txt_2_img`。`perspective` 比例 4:3，`top` 仍 1:1。模型不变（Seedream 5）。
- 改完重新部署这个后端函数；状态查询函数不动。

### 5. 数据：3D 图地址
- 迁移：`interior_furniture_catalog` 增加可空列 `image_3d_url text`（同一家具库业务的兼容扩展，不改已有数据；现有 RLS 已按 owner 限定）。
- `model/types.ts`：`LibraryItem` 增加 `image3dUrl?: string`；`model/validation.ts` 与 `imageUrl` 同样校验必须是 https。
- `cloud/useFurnitureCatalog.ts`：读写映射 `image_3d_url ↔ image3dUrl`。

### 6. 附件支持 DXF / PDF / ZIP（`components/AiComposer.tsx` + 新模块 `ai/referenceFiles.ts`）
- 文件选择 `accept` 增加 `.dxf,.pdf,.zip`；拖入 / 选择时先经 `expandReferenceFiles(files, room)` 转成图片文件，再交给现有 `images.add` 上传（粘贴仍只取图片）。
  - 图片：原样。
  - DXF：复用 `model/externalDxf/dxfSource.ts` 的 `readDxfSource` 取线段，绘到画布（浅底深线、等比居中，长边 2048px）导出 PNG。
  - PDF：动态加载 `pdfjs-dist`，按剩余名额渲染前几页为 PNG。
  - ZIP：动态加载 `fflate` 解包，跳过 `__MACOSX` 与隐藏文件，按扩展名递归处理其中的图片 / DXF / PDF。
- 总数仍受 `AI_IMAGE_LIMIT`（4 张）限制，超出、无法识别或解析失败都用 `notify` 说明原因，不静默丢弃。
- 转换期间在缩略图区显示「正在解析素材…」，并把它算进「上传中」，发送按钮禁用。
- 提示文案：「添加参考图或素材（图片 / DXF / PDF / ZIP，也可粘贴或拖入）」；拖入提示「松开以添加参考素材」。
- 因为 `AiComposer` 是共用组件，AI 布局、AI 创建户型、家具 AI 生成三处同时生效。
- 新增依赖：`pdfjs-dist`、`fflate`（都按需动态加载，不进首屏包）。

## Implementation checklist
- [ ] `AccountFurnitureDialog.tsx`：弹窗放大到约 880px，左图区加大；底部按钮整体右对齐（删除在前、完成在后）
- [ ] 新增 `FurnitureVisual.tsx`：左上角 2D / 3D 切换；3D 无图时显示空状态；自定义家具显示一个「AI 调整」按钮（不区分调整 / 重新生成）
- [ ] `AiComposer.tsx`：新增 `showEngine` prop（默认 true）；false 时不渲染 `AiEnginePicker`
- [ ] 新增 `FurnitureAiDialog.tsx`：复用 `AiComposer` + `AiResults` + `useAiBatch`；标题带家具名与视角、无名称输入；默认描述含名称尺寸颜色
- [ ] `FurnitureAiDialog.tsx`：打开时把当前视角图片（3D 无图时用 2D 图）预置为已上传的参考附件并显示在附件区；可移除
- [ ] `useFurnitureImage.ts`：抽出 `generateFurnitureImage(item, options, isCancelled)`，hook 改为调用它且行为不变
- [ ] 后端函数 `interior-furniture-image-submit`：支持 `view` / `description` / `images`，有参考图走 `img_2_img`；参数校验；重新部署
- [ ] 迁移：`interior_furniture_catalog` 加可空列 `image_3d_url`
- [ ] `types.ts` / `validation.ts` / `useFurnitureCatalog.ts`：`image3dUrl` 字段、https 校验、读写映射
- [ ] 应用候选：2D 写 `imageUrl`、3D 写 `image3dUrl`，经 `saveGeometry` 保存并 `onChanged` 刷新详情左图
- [ ] 新增 `ai/referenceFiles.ts`：图片原样、DXF → PNG（复用 `readDxfSource`）、PDF → 前几页 PNG（`pdfjs-dist`）、ZIP 解包递归（`fflate`）；总数受 4 张限制，失败 / 超额有提示
- [ ] `AiComposer.tsx`：`accept` 加 `.dxf,.pdf,.zip`；选择 / 拖入走 `expandReferenceFiles`；解析中禁用发送并显示状态；提示文案更新
- [ ] `index.css`：`FurnitureVisual` 切换按钮、空状态、放大后的弹窗布局样式（使用设计令牌）

## Verification checklist
- [ ] 单测 `ai/referenceFiles.test.ts`：图片原样返回；简单 DXF（两条线）转出 1 张 PNG；ZIP 内含 1 图 + 1 DXF + 1 个 `.txt` → 得到 2 张、忽略 txt；超过剩余名额时只返回前 N 张
- [ ] 单测：`validateDesign` / 家具库校验拒绝非 https 的 `image3dUrl`，接受 https
- [ ] 组件测试：`FurnitureVisual` 默认 2D、切到 3D 无图时显示「尚未生成 3D 视角图」；内置家具不显示重新生成按钮
- [ ] 组件测试：`FurnitureAiDialog` 不渲染名称输入框与模型选择器，标题包含家具名；有 2D 图时附件区默认显示这张图；3D 无图时默认附件为 2D 图；两张都没有时附件区为空
- [ ] 组件测试：`AiComposer` 默认仍渲染模型选择器（`showEngine` 默认值不破坏 AI 布局 / AI 创建）；文件选择 `accept` 包含 `.dxf,.pdf,.zip`
- [ ] `pnpm exec vitest run src/features/interior` 全部通过（已知的 `dimensionWallEdit` 失败除外，属另一会话）
- [ ] `pnpm lint` 0 error；`pnpm run build` 通过，且 `pdfjs-dist` / `fflate` 为独立分包
- [ ] 后端函数部署后：不带 `view` 的旧请求仍生成俯视图；`images` 含非 https 地址返回 400
- [ ] desktop_1280 截图打开家具详情弹窗，确认尺寸放大、底部按钮右对齐、左上角 2D / 3D 切换可见
