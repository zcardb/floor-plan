# 3D 家具与场景渲染（SCENE）— 强制

3D 场景里的家具模型、地面贴图、墙门窗配色、环境反射与昼夜灯光都按这份规则实现。观感以参考实现（先住 `view3d.js`）为准。相关文件：

| 文件 | 职责 |
| --- | --- |
| `model/decorStyles.ts` | 装修风格、家具配色角色、`furnitureLook(style, f)` 解析出的 `FurnitureLook` |
| `scene/furniture.ts` | `buildFurniture(f, look)`：45 种家具的精修模型、几何小工具、材质缓存 `mat()`、合批、环境反射副本 |
| `scene/floorTexture.ts` | 地面贴图：`floorSurface(m)` 决定画法，`floorTexture(m)` 绘制 |
| `scene/archLook.ts` | 墙面、天花、压顶、门扇、入户门、窗框的配色 |
| `scene/sceneMaterials.ts` | 一个渲染器一份环境贴图，以及本场景的材质副本（反射 + 发光件） |
| `scene/lighting.ts` | 昼夜参数、吸顶灯、大地面，以及 `applyLighting(rig, night)` |
| `scene/Scene3D.tsx` | 解析风格、搭建墙门窗地面天花、挂环境贴图、昼夜灯光、按需重建 |

## 1. 家具模型

- 家具库 `data/catalog.ts` 里的每个类型（楼梯除外）都要在 `buildFurniture` 里有专门的模型；新增类型时同时补模型，`scene/furniture.test.ts` 会检查一一对应。
- 分支优先级不变：`model3d`（AI 部件）→ `fireplace` → `shape` 圆形 / 矩形 → 按 `type` 的精修模型 → 通用方块。之后统一 `mergeParts` 合批、按 `f.height` 等比缩放、写入位置 / 旋转 / `userData.fid`。
- 构建器**不解析风格**：调用方传 `furnitureLook(decorStyleById(design.styleId), f)`；不属于某个方案的展示（例如家具库）用默认风格。
- 有配色角色的家具用 look：主色 `main`、木色 `wood`、深色收边 `legs`（踢脚、深色腿、画框）、点缀 `accent`（浅色抱枕、搭毯、毛巾）、五金 `metal`（拉手、柜钮、浴室柜龙头）、腿型 `legsKind`（木腿收分 / 金属细腿；书桌、吧椅这类本来就是金属框的，木腿风格保留黑铁）、圆角 `softness`（`rbox` 半径乘以它）。
- 没有配色角色的家具（家电、洁具、电视、绿植、钢琴、跑步机、壁炉）保持参考实现的固有样子，**颜色和圆角都不随风格变化**。陶瓷、玻璃、屏幕、镜面的材质属性与颜色固定。
- 嵌套小组（拉手、叶片、岛台柜体等）由 `mergeParts` 拍平合批，构建结果只剩按「材质 + 是否投影」分好的网格。
- 书架上的书、花枝、叶片用以家具 id 为种子的伪随机，挪动位置不会变样。

## 2. 材质与环境反射

- `mat(color, roughness, metalness, finish?)` 是共享缓存（墙、门也在用），`finish` 只放透明、双面、自发光这类附加属性。
- `mat()` 只打标记，不改材质：金属或光滑材质（`metalness > 0` 或 `roughness < 0.4`）在 `userData.env` 记下反射强度（金属 1、其余 0.5）；用 emissive 的发光件在 `userData.glow` 记下白天的自发光强度。
- 缓存里的原件是所有场景共用的，改动会串味（还会串到预览图），所以采样时由 `createSceneMaterials(envMap)` 把带标记的材质换成**本场景的副本**：`adopt(root)` 递归换、`setNight(night)` 只改副本、`dispose()` 释放。墙面等哑光材质继续共用原件。
- 环境贴图属于生成它的渲染器，不能跨 WebGL 上下文共用：`createEnvironment(renderer)` 用 `PMREMGenerator` + `RoomEnvironment` 生成一次（`sigma 0.04`），只给本场景的副本挂上；色调映射 ACES。

## 3. 地面贴图

- UV 单位是米，贴图按真实尺寸平铺（`repeat = 1 / 尺寸`）。
- 内置地面沿用参考实现的尺寸、勾缝与粗糙度：木地板 / 胡桃木 1.8 × 0.36 m 两排错缝木纹，800 / 600 / 300 地砖勾缝，大理石纹理线，水磨石颗粒，地毯细噪点；底色取地面自身颜色，与 2D 一致。
- 自定义地面按铺贴样式：木地板纹按板长 × 1.5、板宽 × 2 平铺；方砖按单块尺寸画勾缝；无缝地面只画细噪点。

## 4. 天花与昼夜灯光

- 天花：法线朝下、只有 `!options.cut` 时搭建，鸟瞰时背面被剔除、只有在室内仰视才看得到；不投影，白天阳光照常进屋。颜色固定 `#fbfaf7`。
- 吸顶灯（`lighting.ts`）：每个**计入面积的**房间一盏，`CylinderGeometry(.22, .22, .02, 32)` 的白盘贴在天花下 1.2 cm，`emissive #fff2d6`、白天 0.3 / 夜里 2；下方 0.25 m 处一个 `PointLight(#ffd9a8, …, 7, 1.6)`，白天 0 / 夜里 6。
- 灯盘只在「剖切高度达到层高」时显示（`roomLamps(...).visible`），剖切后从上往下看时不显示；点光源始终留在场景里，白天强度 0——**灯的数量写在着色器里**，昼夜切换增删灯会让所有材质重新编译。
- 房间多时只给面积最大的 `MAX_ROOM_LAMPS = 16` 间开灯：前向渲染里每盏点光源都要在每个受光像素上算一遍，手机还可能超出片元 uniform 上限。灯装在离墙最远的点上（L 形、带内洞的房间不至于把灯嵌进墙里）。
- 昼夜参数 `nightLighting(night)`：曝光 1.05 / 1.25，背景 `#f3efe7` / `#1c2130`，大地面 `#f2eee7` / `#2a2e38`，日光 2.5 / 0.05，半球光 1.4 / 0.12，反射系数 1 / 0.15，点光源 0 / 6。发光件夜里至少提到 `NIGHT_GLOW = 2`（本来更亮的不压暗）。
- `applyLighting(rig, night)` 只管灯光、颜色、曝光与材质副本，不碰几何：切昼夜只触发一次重绘与一次阴影重算，家具不用重建。白天太阳的方向仍按 `options.hour` 计算，在 Scene3D 里。
- 大地面 `createGround()`：800 × 800 的平面，跟着户型中心走，压在房间地面下 1.5 cm 并加深度偏移；白天接住房子的影子，夜里映出屋里漏出来的灯光。

## 5. 墙门窗

- 墙面：用户单独刷过的墙（`wall.color`）优先，否则用风格墙色；墙顶压顶 `#34312d`，门洞过梁的底面仍是墙色。
- 门扇：普通门用风格门色；入户门用 `#6b4f3a`。入户门 = 外围墙上的平开 / 双开门，且门一侧在房间里、另一侧不属于任何房间；通阳台的门和推拉门不算。平开门带风格五金的球形把手。
- 窗框：`#5d6166`、金属度 0.4，约每 0.9 m 一根竖梃加上下横框，合成一个网格。

## 6. 性能与清理

- 阴影保持 `PCFShadowMap` + `autoUpdate = false`，只在场景、光照或门变化时置 `needsUpdate`；`shadow.mapSize` 1024、`normalBias` 0.02，**不要动 `shadow.radius`**：取景 40 m、1024 时一个像素约 4 cm，半径一放大（≥ 2）采样范围就到了 ±8 cm，柜顶、桌面这类平面会出现自阴影条纹——衣柜顶线最明显。真要柔化阴影，得同时把贴图提到 2048 并加深深度偏移，那是另一处性能取舍，先别顺手改。
- 风格切换走现有重建路径：墙门窗与家具的 effect 都依赖 `design.styleId`；昼夜切换不在这条路径上，只走 `applyLighting`。
- 几何随 `clear()` 释放，缓存材质在场景卸载时由 `disposeMaterials()` 释放，材质副本由 `createSceneMaterials().dispose()` 释放，环境贴图由 Scene3D 释放 `r.env`。

## 7. 必备测试

- `scene/furniture.test.ts`：家具库全部类型在三套风格下都能构建（三角形数 > 0、无 NaN、`fid` 正确、已合批），`f.height` 缩放，AI 分支不随风格变色，沙发跟风格变色、冰箱等无角色家具颜色与形状不变，腿型 / 五金 / 圆角跟风格，环境反射只挂光滑材质。
- `scene/archLook.test.ts`：墙色优先级、门色、入户门识别。
- `scene/floorTexture.test.ts`：内置与自定义地面的画法、尺寸、勾缝与粗糙度。
- `scene/sceneMaterials.test.ts`：反射只挂光滑材质、原件不动、场景之间互不影响；发光件昼夜取值；环境贴图缺失时退化。
- `scene/lighting.test.ts`：昼夜参数取值；吸顶灯位置、数量上限、随剖切高度显示 / 隐藏；`applyLighting` 前后曝光 / 背景 / 地面 / 日光 / 点光源 / 发光件的取值，以及「不重建几何、不换材质」。
