# 家具详情弹窗：放大布局 + 2D / 3D 视角 + AI 调整 + 家装素材附件

> 上一份计划（墙体编辑后续 5 项）已全部完成并提交，本文件改写为本轮计划。

## Context
用户反馈（截图 256 / 257）与后续补充：
1. 家具详情弹窗（家具库里点开一件家具：左侧图片、底部「删除家具 / 完成」）太小；宽高都要调整，整体协调；底部按钮右对齐。
2. 增加家具的 3D 视角预览：左侧图片区左上角放 2D / 3D 切换。
3. 2D、3D 都能用 AI 调整 / 重新生成，复用「AI 布局 / AI 创建」的弹窗（输入框 + 附件 + 数量 + 候选网格）；不要名称输入框，名称默认就是家具名。
   - 调整 = 默认把当前家具图片带进附件区；重新生成 = 不带原图。界面不区分两种，只有一个入口，默认调整（移除附件即重新生成）。
4. 所有 AI 弹窗的附件，除图片外支持家装常用素材：DXF、PDF、ZIP 素材包及其它常见格式。不强制在前端转换，原文件交给 AI，由 AI 自己判断怎么用。
5. UI 按 Growth.Design 心理学法则设计（用户给的参考），具体落点见「设计原则」。

已定方案（用户未回答追问，按推荐执行）：「3D 视角」是 AI 生成的 3D 透视效果图，与现有 2D 俯视符号图一样由 AI 生成；图片模型沿用项目已在用的 Seedream 5。

## 设计原则（Growth.Design 法则 → 落点）
- **Visual Hierarchy / Fitts's Law**：图片区是视觉主角，占左侧大块；主操作「完成」放右下、尺寸最大；「删除家具」降为次级（文字按钮、与完成同在右侧但在前）。
- **Law of Proximity / Juxtaposition**：2D / 3D 切换与「AI 调整」都贴在图片区角上，表明它们只作用于这张图；右侧字段按「基本信息 / 单价 / 参考几何」分组。
- **Progressive Disclosure / Hick's Law**：「调整参考类型与外形」保持折叠；AI 弹窗只露出描述、附件、数量和发送，不放模型选择。
- **Nudge（不强迫）**：默认调整模式，预置当前图片为附件；随时可 ✕ 移除改为重新生成，不额外做模式切换。
- **Cognitive Load**：弹窗固定高度，左右两栏各自滚动，避免整窗跳动；空 3D 状态只给一句说明 + 一个按钮。
- **Feedback Loop**：附件上传中显示加载、非图片附件显示文件类型图标与名称；应用新图后左侧立即换图并 toast 提示，可再次调整。
- **Signifiers**：非图片附件卡片显示格式角标（DXF / PDF / ZIP…），hover 显示「AI 会按需读取」。

## 方案

### 1. 弹窗布局（`components/AccountFurnitureDialog.tsx` + `index.css`）
- 宽度 `max-w-[640px]` → 约 `880px`；高度固定 `min(680px, 100dvh - 2rem)`，内容区为左右两栏：左栏图片区（宽约 400px，图片区正方形，等高铺满），右栏字段区独立滚动。
- 页脚 `.cms-detail-actions` 固定在底部、整体右对齐：`[删除家具]（ghost）[完成]（主按钮）`。
- 小屏（≤ 700px）回到单列：图片在上（固定高度），字段在下，页脚不变。

### 2. 左侧视觉区（新组件 `components/FurnitureVisual.tsx`）
- 左上角分段切换「2D | 3D」（`role="radiogroup"`，lucide `Square` / `Box`），默认 2D。
- 2D：`item.imageUrl` 或 `FurnitureShape` 参考符号；3D：`item.image3dUrl`，没有时空状态「尚未生成 3D 视角图」+「AI 生成」按钮。
- 右上角一个「AI 调整」按钮（`Sparkles`），只在自定义家具（`isCustom && saveGeometry`）时显示；打开第 3 节弹窗，视角 = 当前视角。

### 3. 家具 AI 弹窗（新组件 `components/FurnitureAiDialog.tsx`）
- 复用 `.ai-dialog` 外壳、`AiComposer`、`AiResults`、`useAiBatch`，结构同 `AiCreateProjectForm`：输入态 → 候选结果 → 选中「应用」；可「返回修改」；关闭即停止。
- 标题 `AI 调整 · {家具名} · 2D 俯视图 / 3D 视角图`；无名称输入框。
- 默认描述：`{名称}，宽 × 深 × 高 m，主色 {color}`，可改。
- 默认附件：当前视角的图；3D 无图时用 2D 图；都没有则为空。以「已上传」状态预置（无需再次上传），可放大、可移除。
- `AiComposer` 新增 `showEngine?: boolean`（默认 true），此处传 false；保留数量 1–4。
- 每个候选格子 = 一次「提交 + 轮询」任务（独立 `request_id`），预览直接显示生成图。
- 应用：2D 写 `imageUrl`、3D 写 `image3dUrl`，经现有 `saveGeometry`（`catalog.save(furnitureGeometryPayload(...))`）保存后 `onChanged(next)`。

### 4. 附件：图片 + 家装素材，原文件交给 AI（`ai/referenceImages.ts` → 通用附件、`ai/client.ts`、`AiComposer.tsx`）
- 附件草稿从「只有图片」扩为通用附件：`{ id, name, kind: 'image' | 'file', ext, preview?, url?, uploading }`。
- 支持类型（`accept`）：图片 jpg / png / webp / gif；图纸 `.dxf` `.dwg` `.pdf`；素材包 `.zip`；3D 模型 `.obj` `.stl` `.fbx` `.glb` `.gltf` `.3ds` `.skp` `.max` `.rvt` `.ifc`；其它 `.txt` `.csv` `.json`。
- 上传：原文件直传现有参考素材存储桶（`ai-all/` 路径），图片 ≤ 10 MB、其它 ≤ 50 MB；不在前端解析或转换。
- 数量：附件总数最多 6 个，其中图片最多 4 张（与后端模型输入上限一致）；超出、类型不支持、上传失败都 `notify` 说明原因。
- 显示：图片仍是缩略图；文件显示格式角标 + 文件名（`FileText` / `FileArchive` / `Box` 图标），上传中显示加载；提示文案「添加图片或素材（DXF / PDF / ZIP / 3D 模型等，也可粘贴或拖入）」。
- 请求：现有 `images: string[]` 不变，新增 `files: { url, name, ext }[]`（`readyImageUrls` 旁新增 `readyFiles`）。AI 布局、AI 创建户型、家具 AI 三处共用。

### 5. 后端：把素材交给模型，由模型判断（`interior-ai-design`、`interior-furniture-image-submit`）
- `interior-ai-design`（AI 布局 / AI 创建）：
  - 守卫新增 `files`（≤ 6 个、https、名称 ≤ 200、扩展名白名单）。
  - 图片照旧作为图像输入；PDF 按协议作为文档输入（anthropic `document` URL、responses `input_file`），不支持的协议列为链接；文本类（`.dxf` `.obj` `.gltf` `.ifc` `.txt` `.csv` `.json`）读取前 60 KB 文本附在消息里；其余（zip、dwg、skp 等）只列出文件名与链接。
  - 提示词说明：附件是用户的家装素材，请自行判断哪些与需求相关，无法读取的格式不要臆测内容。
- `interior-furniture-image-submit`（家具图片，重新生成分支）：
  - 新增可选 `view: 'top' | 'perspective'`（默认 top，旧调用不变）、`description`（≤ 2000）、`images`（≤ 4 个 https）、`files`（同上，仅作为文字说明列入提示词——图片模型只能读图）。
  - 有图片附件 → `img_2_img`（第一张为 `resource_url`，即默认带上的当前家具图），提示词「在原图基础上按需求调整，保持家具主体与视角」；无图 → `txt_2_img`。`perspective` 比例 4:3，`top` 1:1。
- 两个后端函数改完重新部署；状态查询函数不动。

### 6. 数据：3D 图地址
- 迁移：`interior_furniture_catalog` 增加可空列 `image_3d_url text`（同一家具库业务的兼容扩展，不动已有数据；现有 RLS 已按 owner 限定）。
- `LibraryItem` 增加 `image3dUrl?: string`；`validation.ts` 与 `imageUrl` 同样要求 https；`useFurnitureCatalog.ts` 读写映射。

## Implementation checklist
- [ ] `AccountFurnitureDialog.tsx` + `index.css`：宽约 880px、高 `min(680px, 100dvh-2rem)`，左图右字段两栏、右栏独立滚动；页脚固定且右对齐（删除在前、完成在后）；≤700px 单列
- [ ] 新增 `FurnitureVisual.tsx`：左上 2D / 3D 切换（默认 2D）；3D 无图空状态；自定义家具右上「AI 调整」
- [ ] `AiComposer.tsx`：新增 `showEngine`（默认 true），false 时不渲染 `AiEnginePicker`
- [ ] 新增 `FurnitureAiDialog.tsx`：复用 `AiComposer` + `AiResults` + `useAiBatch`；标题带家具名与视角；无名称输入；默认描述
- [ ] `FurnitureAiDialog.tsx`：当前视角图（3D 无图用 2D 图）预置为已上传附件，可移除
- [ ] 应用候选：2D 写 `imageUrl` / 3D 写 `image3dUrl`，经 `saveGeometry` 保存并 `onChanged`，左图立即更新
- [ ] `useFurnitureImage.ts`：抽出 `generateFurnitureImage(item, { view, description, images, files, requestId }, isCancelled)`，原 hook 改为调用、行为不变
- [ ] 附件通用化：`referenceImages.ts` 草稿类型加 `name/kind/ext`；`uploadReferenceFile` 支持白名单扩展名与大小上限；总数 6 / 图片 4 限制与提示
- [ ] `AiComposer.tsx`：`accept` 扩展；选择 / 拖入接受文件；文件附件显示格式角标与文件名；提示文案更新
- [ ] `ai/client.ts` 与三处调用（AI 布局、AI 创建、家具 AI）：请求带 `files`
- [ ] `interior-ai-design`：`files` 守卫；PDF 文档输入 / 文本类摘录 / 其余列链接；提示词说明由模型自行判断；部署
- [ ] `interior-furniture-image-submit`：`view` / `description` / `images` / `files`；`img_2_img` 调整；部署
- [ ] 迁移加 `image_3d_url`；`types.ts` / `validation.ts` / `useFurnitureCatalog.ts` 接入 `image3dUrl`

## Verification checklist
- [ ] 单测：附件校验——`.dxf` / `.pdf` / `.zip` / `.skp` 接受，`.exe` 拒绝；第 5 张图片被拒并提示；第 7 个附件被拒；超大小被拒
- [ ] 单测：`validateDesign` / 家具库校验拒绝非 https 的 `image3dUrl`，接受 https
- [ ] 组件测试：`FurnitureVisual` 默认 2D；切 3D 无图显示「尚未生成 3D 视角图」；内置家具不显示「AI 调整」
- [ ] 组件测试：`FurnitureAiDialog` 无名称输入、无模型选择器、标题含家具名；有 2D 图时默认附件为该图；3D 无图时默认附件为 2D 图；都没有时附件为空
- [ ] 组件测试：`AiComposer` 默认仍渲染模型选择器；`accept` 含 `.dxf` `.pdf` `.zip` `.obj` `.dwg`；文件附件显示文件名与格式角标；上传中发送禁用
- [ ] `pnpm exec vitest run src/features/interior` 通过（已知 `dimensionWallEdit` 失败除外，属另一会话）
- [ ] `pnpm lint` 0 error；`pnpm run build` 通过
- [ ] 后端：家具图片不带 `view` 的旧请求仍生成俯视图；`files` 含非 https 或非白名单扩展名返回 400；AI 布局带一个 PDF 附件能正常出方案
- [ ] desktop_1280 截图家具详情弹窗：尺寸协调、页脚右对齐、2D / 3D 切换与「AI 调整」可见
