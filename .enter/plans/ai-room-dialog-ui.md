## Context

用户最新澄清：统一调整「AI 创建户型」和「AI 布局」弹窗及共用输入组件。弹窗可以整体舒展一些，但横向应比现在窄；不采用此前仅房间弹窗 560px 的方案。此次仅 UI 调整，不改数据库、AI 请求、模型/数量默认值或生成、创建、应用逻辑。

## 设计评审与依据

目标是改善阅读与操作，不假设特定用户画像，也不承诺转化率提升。依据已读取的 Growth.Design 心理学社区框架，不是官方认证；640px 是本项目的设计选择，不是心理学法则规定的数值。

### 已有优点
- 房间名称与尺寸自动带出，AI 创建保留可编辑的默认示例，降低输入负担（Cognitive Load）。
- 家具、模型与小助手按需展开（Progressive Disclosure / Hick’s Law）。
- 先预览再确认，房间布局可撤销；继续保留这些安全提示。

### 问题与修复优先级
| 优先级 | 定位与根因 | 对应原则 | 调整 |
| --- | --- | --- | --- |
| P1 | `src/index.css:3947` 两个弹窗共用 `.ai-dialog` 720px 宽度，截图中的单列阅读路径过宽 | Visual Hierarchy / Cognitive Load | 统一收窄到 640px，增大合理纵向间距，不把整体挤小 |
| P1 | `AiComposer.tsx:89–122` 只有长 placeholder 和箭头主按钮，底栏视觉权重接近 | Signifiers / Contrast / Law of Proximity | 常驻需求标签、简短示例与「生成方案」文字主按钮 |
| P2 | `AiRoomDialog.tsx:30,51–57`、`AiCreateProjectDialog.tsx:39,103–107` 信息较长，主次不够明确 | Visual Hierarchy / Cognitive Load | 缩短说明；房间面积优先；创建保留项目名称和默认需求，名称明确可选 |
| P2 | `src/index.css:3984–3993,4061–4067` 底栏不换行，按钮偏小 | Fitts’s Law / Law of Common Region | 共用底栏分组，窄屏两行、主要触控目标至少 44px |

### Growth Design 诊断摘要
- Psych：保留自动带出与真实预览，减少长阅读行、不清晰图标和竞争性设置造成的认知消耗；不新增虚构处理步骤。
- B.I.A.S.：Block 需优化视觉层级；Interpret 保留任务语义但缩短说明；Act 强化单一主操作；Store 保留真实结果与确认流程，不扩展应用后流程。
- C.L.E.A.R. 启发式评分（截图及代码，不是用户测试）：文案 3/5、布局 2/5、强调 2/5、可访问性 3/5、反馈 4/5，共 14/25；实际对比度与交互待执行验证。
- Web App 规则：减少边框噪声、保留真实状态；移动端适用大触控目标。本次继续使用现有 Dialog，不新增 Drawer 交互机制。
- 行为修复：保留现有模型与方案数量（Default Effect），设置仍可直接访问，只降低视觉权重。
- 暗黑模式风险：未见明显诱导；不增加假倒计时、虚构推荐或隐藏关键选项，不更改默认参数、不隐藏预览确认机制。

## 推荐 UI

沿用现有暖色编辑器风格、字体与语义 token。两处真正共用尺寸与输入区样式，不增加房间专属输入变体。

1. **统一尺寸**：`.ai-dialog` 最大宽度从 720px 改为 640px，输入态与结果态一致；宽度不超过视口减 24px。桌面内边距 24px，窄屏 16px，分组间距约 16–20px，最大高度不超过视口，内容可滚动。通过纵向呼吸感保持整体舒展，不设置无意义固定高度。
2. **顶部**：两种弹窗标题和说明统一左对齐，预留关闭按钮位置。AI 布局说明为「结合整套户型生成家具布局，先预览再应用，可撤销。」AI 创建说明为「描述户型需求，生成带门窗与家具的方案，预览后创建项目。」
3. **业务信息**：房间面积为主、长宽为次，家具标为可选，清单说明紧贴清单。AI 创建保留项目名称输入和留空使用方案名行为，标签标为可选；默认需求 `DEFAULT_PLAN_PROMPT` 原样保留。
4. **共用输入区**：AiComposer 接收需求标签与简短示例，通过稳定 id 建立 label/帮助文本与 textarea 的关联；房间显示「布局需求」，创建显示「户型需求」。placeholder 简短，示例常驻且次级。默认文字区约 88px，高度仍随输入增长，上限保留 200px；保留柔和圆角、细边框和清晰聚焦态，减弱多重阴影。
5. **共用底栏**：保留参考图入口、模型/小助手、方案数量；两处生成按钮统一显示箭头及「生成方案」。模型与数量作为次级操作分组，长名称可省略但有完整可访问名称。窄屏采用两行布局，设置与生成不挤压，主要触控目标至少 44px。
6. **结果态**：复用 AiResults 与 PlanThumbnail，640px 内桌面最多两列、窄屏单列；进度、提醒与操作可换行。房间主按钮文案为「应用方案」，创建保留「确认创建」；不改默认选择、后台生成、返回修改、重试与重新生成行为。

## 关键文件与复用

- `src/index.css`：修改共用 `.ai-dialog`、`.ai-composer` 与 AI 结果区样式；新增局部尺寸/间距 token，颜色使用现有 HSL 语义 token，字号使用 `--fs-*`；其他弹窗样式不变。
- `src/features/interior/components/AiComposer.tsx`：共用标签、提示、文字化主按钮及底栏分组，保留 `reason`、`send`、自动高度与全部键盘/图片事件。
- `src/features/interior/components/AiRoomDialog.tsx`：说明、房间信息层级、需求标签参数与应用文案。
- `src/features/interior/components/AiCreateProjectDialog.tsx`：说明、可选名称标签、需求标签参数；保留 `DEFAULT_PLAN_PROMPT` 与所有创建行为。
- `src/features/interior/components/aiComponents.test.tsx`：复用现有 Vitest + `renderToStaticMarkup` 方式，补充标签/主按钮和禁用规则断言，强化默认示例与默认设置的回归断言。
- 复用现有 Dialog 焦点管理、FurnitureChips、AiEnginePicker、EditorTooltip、AiResults、PlanThumbnail、roomZone、area、formatMeters，不复制实现，不改全局 Dialog。

## Implementation checklist

- [x] 共用 `.ai-dialog` 输入态及结果态上限改为 640px，桌面/窄屏间距和视口内滚动完成。
- [x] 两种标题说明统一层级，关闭按钮位置保留；房间面积/尺寸与可选家具标签完成。
- [x] AI 创建名称标为可选，`DEFAULT_PLAN_PROMPT`、名称留空行为与默认模型/数量保持不变。
- [x] AiComposer 共用需求 label、示例提示和 textarea 关联，两种调用方提供各自文案。
- [x] 共用输入区默认高度约 88px、上限仍 200px，边框/聚焦态使用语义 token。
- [x] 两处共用「生成方案」文字主按钮与底栏分组，模型/数量/参考图回调不变。
- [ ] 窄屏底栏两行、主要触控目标至少 44px、长名称不导致溢出，键盘焦点可见。
- [x] 两处结果态使用最多两列/窄屏单列网格，进度与操作可换行；全部原回调保持。
- [x] 组件测试覆盖常驻标签、主按钮、默认设置和空描述禁用，不弱化原有断言。
- [x] 改动仅涉及上述共用 AI UI、测试与本计划，其他弹窗及后端不变。

## Verification checklist

- [ ] 正向：分别打开 AI 创建与 AI 布局，确认均使用 640px 上限；标题、业务信息、常驻标签和生成操作层级一致。
- [ ] 默认：AI 创建示例需求仍可直接生成，数量仍默认 2、模型仍默认 DeepSeek V4 Flash，名称留空仍使用方案名。
- [ ] 负向：空白/仅空格描述仍禁用发送；参考图上传中及缺失小助手的禁用规则不变；房间空家具清单说明正确。
- [ ] 边界：长房间/模型/小助手名称、多家具、参考图和 2000 字描述不撑破容器；超过 200px 的输入区滚动。
- [ ] 交互：模型与数量菜单、家具尺寸编辑、图片选择/粘贴/拖入、Enter、Shift+Enter 与中文组字保留原行为。
- [ ] 结果：核验两处生成中/成功/失败、选择/放大/重试/重新生成/返回修改；房间后台生成与应用、创建确认与 pending 状态仍连接原流程。不为验证新增线上假数据，无法覆盖的真实状态标未验证。
- [ ] 在同一受影响工作台路由分别打开两种弹窗，以 `desktop_1280` 和 `mobile_390` 作为设备假设截图验证宽度、输入比例、换行、溢出及关闭/底部操作可达性；不检查无关路由，不能打开的状态标未验证。
- [ ] 检查文字与按钮对比度、Tab 焦点、Esc 关闭及焦点恢复；不能仅凭截图宣称可访问性通过。
- [x] 执行定向测试 `pnpm exec vitest run src/features/interior/components/aiComponents.test.tsx src/features/interior/components/toolbarMenus.test.tsx`：25/25 通过。
- [x] 执行 `pnpm test`（全部 interior 测试）、`pnpm lint`、`pnpm exec tsc --noEmit` 与 `pnpm run build`；结果见下，diff 无业务逻辑或其他弹窗改动。

## 执行与验证结果

- UI 代码已完成。640px 共用上限、88px 输入最小高度、窄屏两行底栏/44px 主操作及结果网格已落实；这些响应式样式尚未取得弹窗打开状态的视口证据，因此相关视觉/交互验收项保持未勾选。
- 功能回归：定向 25 项通过；全量 603 项中 601 项通过、2 项失败，定位为未改动的 `model/wallRemoval.test.ts` 和 `model/dimensionWallEdit.test.ts`，分别涉及参考户型删除墙后的校验和移墙后的房间名单。未越界改墙体逻辑。
- lint 0 错误、3 个未改动文件的 Hook 依赖警告（PlanCanvas 的 fit；Scene3D 的 pose/fly）；TypeScript、开发构建、生产构建及 `git diff --check` 通过。
- 构建审计：未验证。已执行生产构建（manifest 存在）与 `--profile app --strict`，审计器缺少 parse5；独立依赖安装因 skill 目录无 pnpm 锁文件失败。没有修改应用依赖或审计配置来规避问题。
- 性能基线：当前 `/` 是交互编辑器 app（支持游客和登录），保留 CSR；本次不变更首屏依赖、路由、i18n、analytics 或请求。改前生产入口 JS 约 1462.53 kB raw / 463.63 kB gzip、CSS 188.57 kB raw / 32.71 kB gzip；这些是本地构建估算，不是实际传输或浏览器性能结果。生产构建保留既有大 chunk、混合导入与第三方 use-client 告警。
- 浏览器性能：未验证，无可用 Playwright/Puppeteer 或交互工具，不能控制冷缓存、CPU/网络及采集长任务。
- 视觉：对 `/` 已捕获 desktop_1280 与 mobile_390，但截图只展示默认工作台，无法通过现有工具打开两种 AI 弹窗；不把工作台截图当作弹窗响应式通过证据。
- 部署 HTTP：未验证，本次无发布 URL/部署头验收。
- 平台待支持：弹窗状态的浏览器交互验证、性能审计器 parse5 运行依赖，以及生产浏览器/部署 HTTP 的测量证据。整体性能验收保持未验证；本次 UI 相关测试与构建已通过。

