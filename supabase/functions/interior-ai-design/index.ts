import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Protocol = 'anthropic' | 'chat' | 'responses' | 'gemini';
/** 可选模型白名单（与前端 src/features/interior/ai/models.ts 保持一致）：协议决定接口与请求格式，vision 决定是否带参考图。 */
const MODELS: Record<string, { protocol: Protocol; vision: boolean }> = {
  'anthropic/claude-opus-5.5': { protocol: 'anthropic', vision: true },
  'anthropic/claude-sonnet-5.5': { protocol: 'anthropic', vision: true },
  'openai/gpt-6.1-sol': { protocol: 'responses', vision: true },
  'openai/gpt-6-astra': { protocol: 'responses', vision: true },
  'openai/gpt-6-luna': { protocol: 'responses', vision: true },
  'google/gemini-3.8-flash': { protocol: 'gemini', vision: true },
  'moonshotai/kimi-k3': { protocol: 'chat', vision: true },
  'alibaba/qwen-3.8-max': { protocol: 'chat', vision: true },
  'minimax/minimax-m3': { protocol: 'chat', vision: true },
};
const DEFAULT_MODEL = 'openai/gpt-6-luna';
const BASE = 'https://api.enter.pro/code/api/v1/ai';
const ENDPOINT: Record<Exclude<Protocol, 'gemini'>, string> = { anthropic: `${BASE}/messages`, chat: `${BASE}/chat/completions`, responses: `${BASE}/responses` };
const PROJECT_ID = 'eba6e37b0b3d4d608b63a3efedec61a3';
/** 超过这个耗时就不再进入修复轮，避免整个请求超时。 */
const REPAIR_BUDGET_MS = 90_000;
const NL = String.fromCharCode(10);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Side = 'up' | 'down' | 'left' | 'right';
const SIDES: Side[] = ['up', 'down', 'left', 'right'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite = (v: unknown, min = -1e6, max = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

interface Entry { code: string; catalogId: string; name: string; category: string; type: string; w: number; d: number; height?: number }
interface Placed { code: string; back: Side; along?: number; gap?: number }

/** 用户上传的家装素材：只接受本项目素材桶里的公开文件。 */
interface Material { url: string; name: string; ext: string }
const MATERIAL_EXTS = ['dxf', 'dwg', 'pdf', 'zip', 'rar', '7z', 'obj', 'stl', 'fbx', 'glb', 'gltf', '3ds', 'skp', 'max', 'rvt', 'ifc', 'txt', 'csv', 'json', 'xlsx', 'docx'];
/** 文本格式的素材读取开头一段原文附给模型。 */
const TEXT_EXTS = ['dxf', 'obj', 'gltf', 'ifc', 'txt', 'csv', 'json'];
const TEXT_EXCERPT = 60_000;
const materialPrefix = () => `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/ai-materials/ai-all/`;
const validMaterial = (m: Material) => !!m && typeof m.url === 'string' && m.url.length <= 1000 && m.url.startsWith(materialPrefix())
  && typeof m.name === 'string' && !!m.name.trim() && m.name.length <= 200 && MATERIAL_EXTS.includes(m.ext);

/** 读取文本素材的开头一段；失败不阻断生成，只说明未能读取。 */
async function excerpt(m: Material): Promise<string> {
  try {
    const response = await fetch(m.url, { headers: { Range: `bytes=0-${TEXT_EXCERPT - 1}` } });
    if (!response.ok) return '（读取失败）';
    const text = (await response.text()).slice(0, TEXT_EXCERPT);
    return text + (text.length >= TEXT_EXCERPT ? NL + '…（后文省略）' : '');
  } catch {
    return '（读取失败）';
  }
}

/**
 * 素材说明：PDF 作为文档交给支持的模型；文本格式附上开头一段原文；其余（压缩包、专有 CAD / 3D 格式）只列名称与链接。
 * 由模型自行判断哪些与需求相关，读不了的不要臆测内容。
 */
async function materialsText(files: Material[] = []): Promise<string> {
  if (!files.length) return '';
  const blocks = await Promise.all(files.map(async (m) => {
    const head = `- ${m.name}（${m.ext.toUpperCase()}）：${m.url}`;
    if (TEXT_EXTS.includes(m.ext)) return `${head}${NL}\`\`\`${NL}${await excerpt(m)}${NL}\`\`\``;
    if (m.ext === 'pdf') return `${head}（已作为文档附上，若当前模型无法读取文档请忽略）`;
    return `${head}（此格式无法直接读取内容）`;
  }));
  return ['用户附带了以下家装素材，请自行判断哪些与需求相关并加以参考；无法读取的格式不要臆测其内容：', ...blocks].join(NL);
}
interface Body {
  mode: 'plan' | 'room';
  generationId: string;
  index: number;
  description: string;
  images: string[];
  /** 非图片素材（图纸、素材包、3D 模型等），由模型自行判断如何使用。 */
  files?: Material[];
  catalog: Entry[];
  projectId?: string;
  room?: { roomId: string; name: string; area: number; zone: [number, number, number, number]; openings: unknown[]; ring?: unknown; edges?: unknown; keepOuts?: unknown; doors?: unknown };
  plan?: unknown;
  existing?: { name: string; w: number; d: number }[];
  required?: { code: string; count: number }[];
  /** 模板标准答案范例（前端按本批目录序列化），只用来示范格式与摆法，不决定房间数量与尺寸。 */
  examples?: unknown[];
  /** 直接选择的模型；与 assistantId 二选一，都没有时用默认模型。 */
  model?: string;
  /** 用户自己的小助手：后端读取它的模型与 Prompt。 */
  assistantId?: string;
}

/** 入参守卫：类型、范围、长度都在这里挡掉，后面的逻辑只处理合法数据。 */
function guard(raw: unknown): Body | string {
  const b = raw as Body;
  if (!b || (b.mode !== 'plan' && b.mode !== 'room')) return '生成模式无效';
  if (typeof b.generationId !== 'string' || !UUID.test(b.generationId)) return '生成编号无效';
  if (!Number.isInteger(b.index) || b.index < 0 || b.index > 3) return '候选序号无效';
  if (!str(b.description, 2000)) return '请填写需求描述（2000 字以内）';
  if (!Array.isArray(b.images) || b.images.length > 4 || !b.images.every((u) => typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 1000)) return '参考图最多 4 张';
  if (b.files !== undefined && (!Array.isArray(b.files) || b.files.length > 6 || !b.files.every(validMaterial))) return '素材附件无效（最多 6 个）';
  if (!Array.isArray(b.catalog) || !b.catalog.length || b.catalog.length > 800) return '家具目录无效';
  for (const e of b.catalog)
    if (!e || !/^F\d{1,4}$/.test(e.code) || !str(e.catalogId, 250) || !str(e.name, 100) || typeof e.category !== 'string' || e.category.length > 30 || !str(e.type, 40) || !finite(e.w, 10, 30000) || !finite(e.d, 10, 30000) || (e.height !== undefined && !finite(e.height, 0, 6000))) return '家具目录条目无效';
  if (b.projectId !== undefined && (typeof b.projectId !== 'string' || !UUID.test(b.projectId))) return '项目编号无效';
  if (b.model !== undefined && (typeof b.model !== 'string' || !MODELS[b.model])) return '不支持的模型';
  if (b.assistantId !== undefined && (typeof b.assistantId !== 'string' || !UUID.test(b.assistantId))) return '小助手编号无效';
  if (b.examples !== undefined) {
    const max = b.mode === 'room' ? 4 : 6;
    if (!Array.isArray(b.examples) || b.examples.length > max || !b.examples.every((e) => !!e && typeof e === 'object' && JSON.stringify(e).length <= 20_000))
      return '范例数据无效（数量或体积超限）';
  }
  if (b.mode === 'room') {
    const r = b.room;
    if (!r || !str(r.roomId, 100) || !str(r.name, 100) || !Array.isArray(r.zone) || r.zone.length !== 4 || !r.zone.every((n) => finite(n)) || !Array.isArray(r.openings)) return '房间信息无效';
    if (JSON.stringify(r).length > 80_000) return '房间信息过大';
    if (!b.plan || typeof b.plan !== 'object' || JSON.stringify(b.plan).length > 200_000) return '户型快照无效或过大';
    if (!Array.isArray(b.existing) || b.existing.length > 80) return '现有家具清单无效';
    const codes = new Set(b.catalog.map((e) => e.code));
    if (!Array.isArray(b.required) || b.required.length > 40 || !b.required.every((q) => q && codes.has(q.code) && Number.isInteger(q.count) && q.count >= 1 && q.count <= 20)) return '指定家具无效';
  }
  return b;
}

const catalogText = (catalog: Entry[]) =>
  catalog.map((e) => `${e.code} ${e.name} | ${e.category || '其他'} | ${e.type} | ${Math.round(e.w)}×${Math.round(e.d)}×${Math.round(e.height ?? 700)}`).join(NL);

const DIRECTIONS = ['常规舒适：优先动线与使用习惯', '收纳优先：尽量多布置收纳', '开阔通透：留出更多活动空间', '功能分区：明确划分功能区域'];

/**
 * 两份协议共用的规划原则：只讲空间结构、尺寸、位置、朝向、功能关系与可行性，不讲风格与渲染。
 * 门窗不可挪动与用户硬性要求永远优先，任何其他优点都不能抵消堵门、穿墙、挡窗。
 */
const PLANNING_RULES = `你是住宅户型与家具布局规划助手，只处理空间结构、尺寸、位置、朝向、功能关系与可行性，不讨论装饰风格、配色、材质或渲染效果。
首要目标是空间真实可用：家具放得下、门窗能使用、人员能通行、设备能操作、几何关系正确。

一、约束分级
- 把条件分成三类：必须保留（固定墙体、柱、管井、门窗、固定设备、用户给定尺寸）、允许调整（可挪动的家具、用户允许改动的布局条件）、尚未确认（不得当作可自由改动）。
- 硬约束必须逐项满足，不能被其他优点抵消：收纳更多、布局更对称、房间更宽敞，都不能换取堵门、穿墙或挡窗。
- 区分物理约束（家具不得穿墙）、使用约束（柜门需要操作空间）与布局偏好（沙发靠墙、家具对称）。偏好不是普遍硬约束：「所有家具靠墙」「床必须居中」「所有窗前都不能放东西」都不是硬规则。
- 信息缺失时按常见住宅做法保守假设，不提问；带假设的方案不能当作已完全验证。

二、空间模型
- 统一单位 mm，坐标基准不得混用。墙体与房间沿墙中心线给，外墙在室内净轮廓之外另外生成，家具落在房间净空内，贴墙时 gap 为 0、不为墙厚留余量。
- 家具的正面方向、背靠边与旋转后的占地范围必须同步考虑；家具属于哪个房间按完整占地轮廓判断，不能只看中心点。
- 开放式客餐厅等连通区域按实际可用边界处理，不能把功能分区线当实体墙。

三、建筑边界与房间
- 房间必须在外轮廓内，不越界、不重叠；墙体、柱、管井占用的区域不是可放家具的净空间。
- 相邻房间共用同一面墙，位置一致，不重复、不错位、不留无意义夹缝。
- 每个独立使用的房间都要有入口并真正可达：卧室不能靠穿过另一间独立卧室进入；套内卫生间、衣帽间可以从所属卧室进入。
- 门窗必须落在实际存在的墙段上，不能悬空或与柱、管井冲突；不得为容纳家具挪动固定墙体、门窗、柱与设备；未确认结构性质的墙体不得默认可拆或可开洞。

四、家具碰撞
- 家具实体不能穿墙、穿柱、越出边界、跨越实体隔墙，也不能侵入另一个独立房间；可以靠墙，但不能嵌入墙体。
- 家具之间不能实体穿插，不得靠绘图层级隐藏碰撞；旋转家具后按旋转后的实际占地检查，不能沿用旋转前的长宽。
- 不得通过缩小家具、修改已知尺寸或忽略突出部件来制造「放得下」；已知尺寸一律不得改动，家具尺寸固定取目录值。
- 桌面物品必须落在对应承托面上，壁挂物品必须有明确安装面，落地家具必须有地面支撑。
- 背靠面必须真实存在：衣柜、书柜、鞋柜、餐边柜 / 储物柜、电视柜、电视、冰箱、蒸烤箱高柜、空调、热水器，背面必须紧贴连续的实墙（贴墙 gap 为 0），实墙至少覆盖背面宽度的 70%。房间的边不一定都是墙：通向阳台的开间、垭口、门洞、窗洞、矮墙 / 栏板、房间分隔线（开放式空间的分界）背后都没有可依靠的墙，不能当作背靠面。

五、允许的正常重叠（不要误判为碰撞）
- 地毯可以位于床、沙发、桌椅下方；椅子可以部分收进桌下（同时检查桌腿、扶手与实际容纳空间）；桌面物品可以落在桌面范围内；柜门、抽屉与其上方吊柜按支撑关系与垂直净空判断。
- 不能用二维投影重叠直接判定实体碰撞，也不能仅因高度不同就忽略支撑、操作与通行问题；缺高度信息时不得把相关检查当成已通过。

六、门、门洞与出入口（最高优先级）
- 户型中的门窗位置、宽度、开向是既定条件，不能挪动、不能当作可调整项；用户指定的门窗必须严格按原样还原，不得增删、合并或改尺寸。
- 平开门按铰链侧与开向检查门扇扫掠区；推拉门检查滑动路径与操作空间；折叠门等按实际展开方式检查，不能用平开门的扇形代替。
- 家具不能占用门洞通行开口，门洞前留出至少 800mm 通行空间；还要检查人能否接近门、操作门并通过门口，不能只看门能不能打开。
- 两扇门可能相互干扰时按实际使用情境检查并指出冲突；不得要求使用者搬动家具或跨越障碍才能开门；不得靠改变门的开启方向消除冲突。
- 门型或开启方向未知时，不得声称已完成门扇碰撞检查。

七、窗、采光开口与窗前区域
- 衣柜、书柜、冰箱等高柜不得布置在遮挡窗洞的位置，不得用柜体背板、侧板或其他实体面覆盖窗洞。
- 矮柜、书桌可以作为窗下候选，但必须同时满足：不遮挡需要保留的窗洞、不与窗扇开启路径冲突、可以接近并操作把手、不妨碍通风清洁与维护。
- 内开窗检查窗扇进入室内后的扫掠范围；外开窗与推拉窗仍要检查把手操作、接近路径与维护需求；不得封住唯一必要的开窗操作路径。
- 家具高度、窗台高度或窗型未知时，按家具类别保守判断（高柜默认避开窗前），不得编造高度数值，也不得宣称窗前布置已通过。
- 落地窗与可通行的玻璃门要区分，具有通行功能的玻璃门按出入口约束处理；不得妨碍已知的窗帘、百叶等遮阳设施。

八、柜体、抽屉与设备开启空间
- 柜体正面朝可接近的空间，不被墙体或其他家具封住；平开柜门检查开启范围与柜前站位，推拉柜门保留站立取物空间，抽屉检查完全拉出后的长度与操作位置。
- 转角附近的柜门、抽屉与把手，检查是否受相邻墙面或柜体限制。
- 冰箱、洗衣机、洗碗机等设备按实际门型检查开门与取物空间，只开一条缝不算可用。
- 不得遮挡必须操作的开关、控制面板、阀门、通风口或检修口；散热、安装与维护净空以已给定的产品要求为准，不编造统一数值。

九、家具的实际使用空间
- 桌椅组合要能拉出椅子、坐下、起身，并检查有人就座时周边是否仍满足必要通行；书桌下保留正常腿部空间。
- 床必须有正常上下床的路径：双人床两侧、单人床至少一侧留 500mm 以上；床与衣柜之间的距离同时考虑床占地、柜门或抽屉开启与操作。
- 沙发与座椅能从合理方向接近，并保留坐下、起身空间；餐桌按实际能拉出椅子的位置计算有效座位。
- 折叠床、沙发床、伸缩桌要分别检查收起、展开与转换过程，不能用收起时的尺寸证明展开后可用。
- 家具之间要有正常功能关系（椅子对应桌面、柜子从使用面取物）；只在不同时间使用的操作区可以部分重叠，但必须说明使用条件；必须同时进行的活动不能相互阻断；不得要求使用者每天搬动大型家具来满足基本功能。

十、通道与可达性
- 从入户门到每个独立房间、从房间门到主要家具使用面都要有连续路径；按人的通过宽度判断，不能只用一条没有宽度的线连通就算合格。
- 检查最窄处、转角与家具突出部件；主通道净宽至少 700mm。
- 不得要求人员跨越床、沙发、柜体，钻过桌子或穿过家具实体；必要通道不能依赖关闭另一处必须同时使用的设施才成立。
- 家具数量或位置变化后重新检查通道；有轮椅、助行器等明确使用条件时按对应要求判断，不套用普通步行空间。

十一、尺寸与净空
- 优先使用用户提供的实测尺寸、已确认规格与目录尺寸；每个净空参数都要说明适用对象与方向（柜前操作、床侧通道、椅后空间等），不能用一个数值替代全部要求。
- 区分家具实体范围、开启范围、使用范围与通行范围，分别检查后再判断能否按使用情境共享。
- 检查尺寸时必须连同相邻物体一起看，不能每件家具单独看都放得下、组合起来却互相冲突。
- 缺关键尺寸时按常见住宅做法保守假设，并明确哪些结论依赖该假设；没有依据的数值不得当作已核实标准。

十二、生成与校验流程
1. 先确认固定边界、障碍物、门窗与必须保留的物品。
2. 再整理家具尺寸、使用面、开启方式与必要净空。
3. 先预留出入口、门扇开启区域、必须保护的窗前区域和主要通行路线。
4. 先放尺寸大、位置受限或依赖固定设施的物品，再布置其他家具。
5. 每次移动、旋转、替换或新增物品后，重新检查受影响的约束；输出前做一次完整检查，不能只验最后修改的物品。

十三、冲突修正顺序
1. 在允许范围内移动家具；2. 调整朝向；3. 调整同一功能区内的家具组合；4. 改用满足功能需求的其他规格；5. 减少非必要物品；6. 改动用户允许调整的布局条件。
- 不得擅自删除必须保留的家具、缩小已知尺寸、移动固定门窗或忽略硬约束；每修正一处都要检查是否产生新的碰撞、遮挡、操作冲突或通道问题。
- 所有条件无法同时满足时，指出冲突对象、位置与需要调整的条件，优先保证门窗与用户硬性要求，给出最接近的可行方案；不要无休止重复尝试，也不要输出明知不成立的方案。

十四、自检状态
- 对每个适用检查项用 通过 / 冲突 / 信息不足 / 不适用 判断，作为内部自检：没有发现问题不等于已经通过，缺少门窗、家具高度或开启信息时，相关项目只能算信息不足。

十五、输出纪律
- 检查结论不写进输出，不新增字段，不输出解释文字；只按下面模式契约给出的 JSON 结构输出，结构里没有的信息不得编造或臆测。`;

/** 两份协议共用的生活常识：布局要像真实住得下去的家，而不只是几何上放得下。 */
const LIVING_SENSE = `生活常识（必须遵守，优先级仅次于门窗与用户硬性要求）：
- 家具放在符合用途的房间：床只在卧室，马桶、淋浴、洗手台只在卫生间，灶台、水槽、冰箱在厨房或紧邻厨房，鞋柜在玄关，洗衣机在阳台或卫生间。
- 卧室：床头靠实墙，不贴窗、不正对房门；床头柜紧挨床头两侧；衣柜前留 600mm 以上开门空间。
- 客厅：沙发与电视柜面对面，间距约 2500–4000mm；茶几放在沙发正前方，离沙发 300–450mm；电视不对着窗，避免逆光和反光；电视柜与电视必须背靠一面完整的实墙，不能放在通向阳台的开间、垭口、落地窗或矮墙一侧（那一侧背后没有墙）。
- 餐区：餐桌靠近厨房，餐椅围绕餐桌，桌边留 600mm 以上拉椅子的空间。
- 厨房：按「冰箱 → 水槽 → 灶台」顺序连续布置，三者之间走动距离合适；灶台不贴窗、不正对厨房门。
- 卫生间：马桶不正对卫生间门；干湿尽量分开，淋浴区在里侧，洗手台靠近门口。
- 书房 / 工作区：书桌靠窗或光线侧向照来，人坐着不背对房门。
- 动线：入户 → 玄关 → 客餐厅 → 各房间顺畅，日常走动不穿过家具、不绕远；卫生间门不正对入户门、餐桌和厨房。
- 采光通风：卧室、客厅优先朝南或有大窗。
- 户型层面：厨房靠近入户和餐区，便于买菜进门；卫生间不设在厨房里或只能穿过厨房进入；卧室门尽量不与卫生间门、入户门正对；阳台连着客厅或卧室。`;

const ROOM_CONTRACT = `你是资深室内设计师，为一套户型中的「目标房间」布置家具。只输出一个 JSON 对象，不要输出解释或 Markdown。

坐标约定：单位 mm；原点在户型室内净轮廓左上角；x 向右，y 向下（下方为南）。
目标房间的摆放分区 zone = [x1, y1, x2, y2]（绝对坐标）。每件家具用「背靠边 + 沿边位置 + 离边距离」描述，全部相对 zone：
- back：家具背面朝哪条边，取 up / down / left / right。
- along：家具中心沿这条边的位置；back 为 up/down 时从 zone 左边 x1 量起，back 为 left/right 时从 zone 上边 y1 量起。
- gap：家具背面到这条边的净距；贴墙为 0，放在房间中部的家具（床尾凳、茶几、餐桌、地毯、岛台）用较大的 gap。
- 家具宽 w 沿背靠边方向，深 d 垂直于背靠边，尺寸固定取目录值，不能改；目录里的高（第三个数）用来判断是否会遮挡窗洞。
家具只能使用目录里的代号 code，禁止编造代号。

目标房间数据里另有四项真实测量（全部相对 zone 左上角，与 along / gap 同一坐标）：
- ring：房间净空轮廓。L 形等不规则房间的轮廓小于 zone，家具占地必须整块落在 ring 内。
- edges：轮廓的每条边。side 是家具背靠这条边时的 back 取值；at 是边线坐标（side 为 up/down 时是 y，left/right 时是 x）；from / to 是沿边范围；spans 逐段标出这条边背后的构造：wall 实墙、low 矮墙或栏板、window 窗洞、door 门洞或垭口、open 开敞（没有墙，例如通向阳台的开间、与其他空间的分界线）。只有 wall 段能作为柜类、电视柜、电视、冰箱、空调、热水器的背靠面。不规则房间里贴着内凹那段墙摆放时，gap 要加上这条边 at 与 zone 边线之间的距离。
- keepOuts：保留区多边形。doorway 为门口通行区，任何家具都不能占；doorSweep 为门扇开启范围，除地毯外都不能占；window 为窗前区，高度 ≥ 1200 的家具不能占。
- doors：各门口内侧的位置，从每个门口都要能走进房间，门与门之间要留出至少 600 mm 宽的连续通道。

输出格式：
{"summary":"一句话方案说明，20 字以内","items":[{"code":"F3","back":"up","along":1800,"gap":0}]}

本房间要求：
1. 家具间不能实体穿插（地毯压在家具下、椅子部分收进桌下属于正常重叠，不算碰撞），也不能越过 zone 或压到墙体与其他房间的家具上。
2. 结合整套户型：门连通哪些房间、相邻房间的功能与现有家具；门窗的位置、宽度和开向是既定条件，家具要迁就门窗。
3. 台面类家具（橱柜台面）是操作面：灶台、水槽按实际做法嵌在台面里，占地完全落在台面范围内，不算重叠；台面长度不够时沿同一面墙连续排布多段台面。
4. 「指定家具」不为空时，只能使用指定的代号，且每个代号的件数必须与指定件数完全相同，不得增减或加入其他家具；为空时由你从目录中挑选适合该房间功能的家具。
5. 输出前按上面的规划原则与生活常识逐件核对位置、朝向和使用空间（上下床、开柜门、拉椅子、通行），问题在输出前改掉。
6. 自检结论不写进 JSON，不新增字段。`;

const PLAN_CONTRACT = `你是住宅空间规划与户型设计助手。根据用户的文字需求（可能附参考图），设计一套功能合理、连通顺畅、尺寸自洽的单层户型，包括外轮廓、内墙、房间、门窗与家具。只输出一个 JSON 对象，不要输出解释或 Markdown。

一、理解需求
- 从描述中提取：外轮廓形状与长宽或面积、朝向、居住人数、房间数量与用途、采光／隐私／收纳／办公等需求，以及用户指定的门窗位置。
- 外轮廓按用户给的来：用户描述或参考图是 L 形、凹凸、缺角等不规则外形时，保持原外形输出 outline，不要补成矩形；没有特别说明时可以用矩形。
- 门窗位置是最高优先级的硬性要求：用户在文字、参考图或附件户型图里给出的门窗（在哪面墙、离墙端多远、宽度、开向、数量），必须严格按原样还原，不得擅自挪动、增删、合并或改尺寸；房间分区和家具布置要迁就门窗，而不是反过来改门窗。
- 区分硬性要求（门窗、尺寸、房间数）和偏好（风格、氛围）。先满足硬性要求，偏好在不冲突时再满足。
- 信息不全时按常见住宅做法合理假设，不要提问。需求互相冲突时先保证空间能用，再尽量贴近偏好。
- 参考图：用户要求还原或照着做时，按图中的房间关系、形状和比例来；否则只当作风格参考，不照搬房间数量和布局。但只要参考图或附件里是户型图，图中门窗的位置、宽度和开向一律严格还原。

二、分区
1. 先定整体功能关系，再定各房间的形状和尺寸。
2. 公共区（玄关、客厅、餐厅）、休息区（卧室、书房）、服务区（厨房、卫生间、阳台）相对分开，减少噪声、气味和穿行干扰。
3. 按生活动线组织：入户和收纳相邻，厨房紧邻餐区，卧室靠近卫生间。
4. 需要采光的房间靠外墙。不要为了凑房间数做出没法用的房间。
5. 房间面积和长宽比要符合用途，避免过度狭长和零碎角落。
6. 控制无效走廊，但保留必要的通行和隐私空间。
7. 不必为了方正硬切墙或补齐矩形。剩余空间要有明确用途（过道、玄关、储物等），形状不规则时可以用 L 形。

三、连通与门窗
1. 从入户门出发，每个独立房间都能走到。卧室不能靠穿过另一间卧室进入；主卫、衣帽间可以从所属卧室进入。
2. 每个需要进入的房间都要有门。门开在相邻两个空间的共用墙上，不能对着墙体、柜体或走不到的地方。
3. 用户指定的门窗（文字描述、参考图或附件户型图中出现的）位置、宽度、开向严格还原，优先级最高，不得擅自修改；只有用户没有指定的门窗才由你决定，且要避开其他门和主通道。
4. 窗只开在外墙上。卧室、客厅、厨房要有窗，卫生间尽量有窗（用户已指定的窗以用户为准，不要为凑规则另加或挪动）。
5. 门上不放家具、窗前不放高柜：按上面的规划原则执行，放不下时调整家具，不要挪门窗。
6. 柜类与电视柜要靠实墙：房间之间没有墙（开放式客餐厅、客厅与阳台连通的开间）的那一侧，不能当作背靠面。

四、用家具验证房间
- 卧室：床、衣柜，以及上下床和开柜门的空间。
- 客厅：主要座位和通行路线。
- 餐区：餐桌、拉开椅子和经过的空间。
- 厨房：储存、清洗、备菜、烹饪的连续操作面。
- 卫生间：洁具、门扇开启和使用空间。
- 家具尺寸固定取目录值，不能靠缩小家具来「放得下」。放不下时调整房间。

五、几何
1. 所有房间都在外轮廓内，不重叠、不越界。
2. 相邻房间共用同一面墙，墙的位置一致，不重复、不错位、不留缝。
3. 房间是闭合轮廓；面积由系统按轮廓计算，不需要输出。

六、输出前自检
- 必要需求是否都满足；每个房间是否都能走到。
- 用户指定的门窗是否与需求 / 参考图逐一对应（墙、位置、宽度、开向、数量），有没有被挪动或增删。
- 是否缺门，门窗是否开在正确的墙上；每扇门的洞口和开启范围内是否压了家具。
- 房间是否重叠或越界，是否有没有用途的空间。
- 家具和操作空间是否合理，是否符合上面的生活常识（床、沙发、马桶、灶台等的朝向与位置）。
- 墙端点、房间边界、门窗坐标是否互相对得上。

—— 输出约定（系统解析用，必须遵守）——
坐标：单位 mm；原点在室内净轮廓外接矩形的左上角；x 向右，y 向下（下方为南）。
尺寸：在顶层输出 width（长，x 方向）和 depth（宽，y 方向），即室内净轮廓外接矩形的长宽，范围 3000–40000，取 100 的整数倍。用户写了长宽或面积就按用户的来。
外轮廓：外墙由系统生成，不要放进 walls。
- 矩形户型：不输出 outline，外墙名为 top / right / bottom / left。
- 不规则户型：输出 outline，为室内净轮廓的顶点数组（横平竖直、按顺序首尾相连、全部落在 0–width × 0–depth 内，每条边不短于 600）。外墙沿 outline 生成，第 k 条边（第 k 点 → 第 k+1 点，最后一点回到第 1 点）的外墙名为 ek，例如 e1、e2；此时不要再用 top / right / bottom / left。
  L 形示例（右上角缺 4000×3000）："outline":[[0,0],[8000,0],[8000,3000],[12000,3000],[12000,10000],[0,10000]]，其中 e2 是 x=8000 那段竖墙。

{
  "summary": "一句话方案说明，20 字以内",
  "width": 12000, "depth": 10000,
  "outline": [[0,0],[8000,0],[8000,3000],[12000,3000],[12000,10000],[0,10000]],
  "walls": [{"key":"a","dir":"h","at":6000,"from":0,"to":12000}],
  "rooms": [{"id":"living","name":"客厅","mat":"tile800","box":[0,6000,7000,10000]}],
  "openings": [{"wall":"e5","kind":"window","at":3500,"width":1800},{"wall":"a","kind":"door","at":1500,"width":900,"into":"up"}],
  "furniture": [{"room":"living","items":[{"code":"F12","back":"down","along":2000,"gap":0}]}]
}

- 墙：dir=h 为横墙（at 是 y，from/to 是 x 范围），dir=v 为竖墙（at 是 x，from/to 是 y 范围）。坐标取墙中心线，内墙厚 120。端点落在外轮廓内侧或另一面内墙的中心线上；key 唯一。
- 房间：沿墙中心线给轮廓，全部落在外轮廓内。矩形用 box:[x1,y1,x2,y2]，L 形用 poly（横平竖直的顶点数组）。id 唯一，name 用中文。mat 取 wood、walnut、tile800、tile600、antislip、marble、terrazzo、carpet 之一。
- 贴着外墙的房间：外轮廓就是室内净轮廓，外墙另外生成在外轮廓之外，所以贴着外墙的那条边要正好落在外轮廓坐标上（贴 top 的房间 y1=0，贴 left 的房间 x1=0，贴 bottom 的房间 y2=depth，贴 right 的房间 x2=width），不要再为外墙厚度留 120 / 240 的余量；内墙端点的道理相同，顶到外墙时填 0 或 width / depth。
- 门窗：kind 取 door 或 window；wall 引用内墙 key 或外墙名；at 是洞口中心沿墙的位置，width 是洞口宽。门的 into 是开向（横墙填 up/down，竖墙填 left/right）；用户明确给出开门侧或铰链位置时，再输出 hinge："start" 表示铰链在洞口沿墙 from→to 方向坐标较小的一端（横墙为 x 较小端、竖墙为 y 较小端），"end" 表示坐标较大端；用户没说就省略，不要臆测。同一面墙上的洞口互不重叠，离墙端至少 100。
- 家具：按房间分组，room 引用房间 id。每件家具用 back（背靠哪条边：up/down/left/right）、along（中心沿这条边的位置）、gap（背面到这条边的距离，贴墙为 0）描述，坐标相对该房间**净空矩形**（房间轮廓向内收半个墙厚后的可用范围）的左上角；贴墙摆放时 gap 必须为 0，不要为墙厚留空隙，也不要把家具压到墙上。只能用目录里的代号。`;

/** 与协议无关的对话消息；发送前再转成各协议的格式。documents 为 PDF 地址。 */
interface Msg { role: 'user' | 'assistant'; text: string; images?: string[]; documents?: string[] }

/** 把通用消息转成对应协议的请求体；不支持看图的模型不带图片；chat 协议不带文档（素材说明里已有链接）。 */
function requestBody(model: string, system: string, messages: Msg[]) {
  const { protocol, vision } = MODELS[model];
  const imagesOf = (m: Msg) => (vision && m.role === 'user' ? m.images ?? [] : []);
  const docsOf = (m: Msg) => (m.role === 'user' ? m.documents ?? [] : []);
  if (protocol === 'anthropic') return {
    model, system, stream: false, max_tokens: MAX_TOKENS,
    messages: messages.map((m) => ({ role: m.role, content: imagesOf(m).length || docsOf(m).length ? [
      { type: 'text', text: m.text },
      ...imagesOf(m).map((url) => ({ type: 'image', source: { type: 'url', url } })),
      ...docsOf(m).map((url) => ({ type: 'document', source: { type: 'url', url } })),
    ] : m.text })),
  };
  if (protocol === 'chat') return {
    model, stream: false, max_tokens: MAX_TOKENS,
    messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: imagesOf(m).length ? [{ type: 'text', text: m.text }, ...imagesOf(m).map((url) => ({ type: 'image_url', image_url: { url } }))] : m.text }))],
  };
  return {
    model, stream: false, max_output_tokens: MAX_TOKENS,
    input: [{ role: 'system', content: system }, ...messages.map((m) => ({
      role: m.role,
      content: m.role === 'assistant' ? m.text : [
        { type: 'input_text', text: m.text },
        ...imagesOf(m).map((url) => ({ type: 'input_image', image_url: url })),
        ...docsOf(m).map((url) => ({ type: 'input_file', file_url: url })),
      ],
    }))],
  };
}

/** 取出回复正文：三种协议的返回结构不同。 */
interface ReplyPart { type?: string; text?: string; content?: unknown }
interface ReplyData { content?: unknown; choices?: { message?: { content?: unknown } }[]; output_text?: unknown; output?: unknown }
const parts = (v: unknown): ReplyPart[] => (Array.isArray(v) ? v.filter((x): x is ReplyPart => !!x && typeof x === 'object') : []);
const joinText = (list: ReplyPart[]) => list.map((c) => c.text ?? '').join('');

function replyText(protocol: Protocol, data: ReplyData | null | undefined): string {
  if (protocol === 'anthropic') return joinText(parts(data?.content).filter((c) => c.type === 'text'));
  if (protocol === 'chat') {
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : joinText(parts(content));
  }
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  return joinText(parts(data?.output).filter((o) => o.type === 'message')
    .flatMap((o) => parts(o.content)).filter((c) => c.type === 'output_text'));
}

/** 放在每次请求末尾再强调一次：方案思路的差异不能落到门窗上，门上不放家具。 */
const DOOR_RULE = '【最高优先级】户型中的门窗位置、宽度、开向严格按需求还原，不得擅自修改；方案之间的差异只体现在分区和家具上。任何家具都不能压在门洞上或挡住门扇开启。';

/**
 * 范例段落：系统算法模板序列化出的标准答案，示范坐标约定与家具摆法。
 * 放在目录之后、用户需求之前；明确要求不照抄房间数量与尺寸。
 */
function examplesText(b: Body): string {
  if (!b.examples?.length) return '';
  const lead = b.mode === 'room'
    ? '参考范例（系统算法生成并通过校验的同类房间标准答案：room 是房间净空宽 width（x 方向）× 深 depth（y 方向）与门窗位置，output 是正确的家具输出）。学习它们的 back / along / gap 写法、贴墙方式、家具间距和避让门窗的做法；不要照抄，一切以下面的目标房间与用户需求为准：'
    : '参考范例（系统算法生成并通过校验的标准答案：坐标约定、墙中心线、房间轮廓、门窗、家具 back / along / gap 与代号用法都完全正确）。学习它们的输出格式、尺寸尺度、墙与房间的对齐方式和家具摆法；不要照抄范例的房间数量、尺寸和布局，一切以下面的用户需求为准：';
  return [lead, ...b.examples.map((e, i) => `范例 ${i + 1}：${JSON.stringify(e)}`)].join(NL);
}

function roomPrompt(b: Body) {
  const names = new Map(b.catalog.map((e) => [e.code, e.name]));
  const required = b.required!.length
    ? JSON.stringify(b.required!.map((q) => ({ code: q.code, name: names.get(q.code), count: q.count })))
    : '无（由你从目录中挑选）';
  return [
    `目标房间：${JSON.stringify(b.room)}`,
    `目标房间净空：宽 ${Math.round(b.room!.zone[2] - b.room!.zone[0])}（x 方向）× 深 ${Math.round(b.room!.zone[3] - b.room!.zone[1])}（y 方向）mm。back 为 up/down 时 along 取值 [w/2, 宽 − w/2]、gap ≤ 深 − d；back 为 left/right 时 along 取值 [w/2, 深 − w/2]、gap ≤ 宽 − d。输出前请逐件核对：占地落在 ring 内、彼此不重叠、不压 keepOuts、柜类与电视柜背靠 edges 里的 wall 段；空间实在不够时，宁可让家具贴墙紧凑排布，也不要越界或背靠开敞边。`,
    `目标房间现有家具：${b.existing!.length ? JSON.stringify(b.existing) : '无'}`,
    `指定家具：${required}`,
    `整套户型（墙 a→b、门窗中心 at 与连通房间 rooms、房间轮廓 ring、其他房间家具）：${JSON.stringify(b.plan)}`,
    `家具目录（代号 名称 | 分类 | 类型 | 宽×深×高 mm）：${NL}${catalogText(b.catalog)}`,
    examplesText(b),
    `用户需求：${b.description.trim()}`,
    b.images.length ? '附有参考图，请参考其中的风格与布局意图，但家具仍只能来自目录。' : '',
    `这是同一批里的第 ${b.index + 1} 个方案，思路：${DIRECTIONS[b.index % DIRECTIONS.length]}。`,
    DOOR_RULE,
  ].filter(Boolean).join(NL + NL);
}

/** 长宽由描述里的需求决定（用户把长宽写在描述里），模型必须在 JSON 顶层输出。 */
const SIZE_LINE = '室内净尺寸未固定：若用户需求里给出了长宽（如「长 12 m × 宽 10 m」）或面积，请严格按该数值换算成 mm 设计；否则按房间数量与面积确定合理尺寸。请在 JSON 顶层输出 "width" 与 "depth"（室内净轮廓外接矩形的长宽，3000–40000 mm，取 100 的整数倍）；外形不规则时另外输出 "outline"。';

function planPrompt(b: Body) {
  return [
    SIZE_LINE,
    `家具目录（代号 名称 | 分类 | 类型 | 宽×深×高 mm）：${NL}${catalogText(b.catalog)}`,
    examplesText(b),
    `用户需求：${b.description.trim()}`,
    b.images.length ? '附有参考图（可能是户型图或风格图），请参考其中的布局与风格意图。' : '',
    `这是同一批里的第 ${b.index + 1} 个方案，请给出与常见做法略有不同的分区思路：${DIRECTIONS[b.index % DIRECTIONS.length]}。`,
    DOOR_RULE,
  ].filter(Boolean).join(NL + NL);
}

/** 从模型回复里取出 JSON：去掉代码围栏，取第一个 { 到最后一个 }。 */
function extractJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('回复里没有 JSON 对象');
  return JSON.parse(text.slice(start, end + 1));
}

const footprint = (p: Placed, e: Entry, zone: [number, number, number, number]) => {
  const [x1, y1, x2, y2] = zone;
  const horizontal = p.back === 'up' || p.back === 'down';
  const along = p.along ?? (horizontal ? x2 - x1 : y2 - y1) / 2;
  const gap = p.gap ?? 0;
  const [w, d] = horizontal ? [e.w, e.d] : [e.d, e.w];
  const cx = horizontal ? x1 + along : p.back === 'left' ? x1 + gap + e.d / 2 : x2 - gap - e.d / 2;
  const cy = !horizontal ? y1 + along : p.back === 'up' ? y1 + gap + e.d / 2 : y2 - gap - e.d / 2;
  return { x1: cx - w / 2, y1: cy - d / 2, x2: cx + w / 2, y2: cy + d / 2 };
};

/**
 * 校验结果分两级：
 * - hard：方案无法落地（代号不存在、方向非法、指定家具件数不符、结构缺失），修不好就判失败；
 * - soft：能落地但不够好（出界、重叠；地毯压住家具与椅子部分收进桌下不算重叠），先让模型修，修不好也接受，前端会把家具夹回房间内并提示需微调。
 */
interface Issues { hard: string[]; soft: string[] }
const issues = (): Issues => ({ hard: [], soft: [] });

/** 椅类与桌类：椅子部分收进桌下是正常使用，不该报成碰撞。 */
const SEAT_TYPES = new Set(['chair', 'officechair', 'barstool']);
const TABLE_TYPES = new Set(['table', 'roundtable', 'coffeetable', 'desk', 'island', 'counter']);

/**
 * 椅类部分收进桌类：椅子没有被桌子轮廓完全包住、至少一个方向伸出 100mm 以上，就算正常使用
 * （能拉出、能坐下），不报重叠；完全被桌子包住或只略微波及仍照常报。
 */
function tuckedSeat(typeA: string, boxA: ReturnType<typeof footprint>, typeB: string, boxB: ReturnType<typeof footprint>) {
  const seat = SEAT_TYPES.has(typeA) && TABLE_TYPES.has(typeB) ? boxA
    : TABLE_TYPES.has(typeA) && SEAT_TYPES.has(typeB) ? boxB : null;
  if (!seat) return false;
  const table = seat === boxA ? boxB : boxA;
  return Math.max(table.x1 - seat.x1, seat.x2 - table.x2, table.y1 - seat.y1, seat.y2 - table.y2) >= 100;
}

/** 灶台、水槽嵌在橱柜台面上是正常做法（完全落在台面占地内），不报重叠。 */
const COUNTER_INSETS = new Set(['stove', 'ksink']);
function insetOnCounter(typeA: string, boxA: ReturnType<typeof footprint>, typeB: string, boxB: ReturnType<typeof footprint>) {
  const [inset, counter] = COUNTER_INSETS.has(typeA) && typeB === 'counter' ? [boxA, boxB]
    : typeA === 'counter' && COUNTER_INSETS.has(typeB) ? [boxB, boxA] : [null, null];
  if (!inset || !counter) return false;
  const t = 30;
  return inset.x1 >= counter.x1 - t && inset.y1 >= counter.y1 - t && inset.x2 <= counter.x2 + t && inset.y2 <= counter.y2 + t;
}

/*
 * ———— 布局几何校验 ————
 * 同步点：src/features/interior/model/layoutRules.ts 里的 BACK_REQUIRED_TYPES、clipArea、backingOf、
 * passageBlocker 与这里是同一套定义（后端无法 import src/），改动时两边一起改。
 * 房间模式的 ring / edges / keepOuts / doors 由前端按真实户型算好随请求发来；
 * 整户模式由 planGeometry 按模型输出的墙、房间、门窗现算。
 */
type Pt = [number, number];
type Ring = Pt[];
type Box = ReturnType<typeof footprint>;
type SpanKind = 'wall' | 'low' | 'window' | 'door' | 'open';
interface Edge { side: Side; at: number; from: number; to: number; spans: { from: number; to: number; kind: SpanKind }[] }
interface KeepOut { kind: 'doorway' | 'doorSweep' | 'window'; poly: Ring }
interface Geometry { ring: Ring | null; edges: Edge[]; keepOuts: KeepOut[]; doors: Pt[] }

const BACK_REQUIRED = new Set(['wardrobe', 'bookshelf', 'shoecab', 'cabinet', 'tvstand', 'fridge', 'ovencol', 'tv', 'acwall', 'waterheater', 'aircon']);
const BACK_RATIO = 0.7, BACK_GAP = 100, BACK_TOLERANCE = 30, KEEP_OUT_AREA = 5000, TALL = 1200;
const SPAN_KINDS: SpanKind[] = ['wall', 'low', 'window', 'door', 'open'];
const SPAN_TEXT: Record<SpanKind | 'none', string> = { wall: '实墙', low: '矮墙 / 栏板', window: '窗洞', door: '门洞 / 垭口', open: '开敞边界（没有墙）', none: '空处（背面没有贴着任何边）' };
const KEEP_TEXT: Record<KeepOut['kind'], string> = { doorway: '门口通行区', doorSweep: '门扇开启范围', window: '窗前区' };

const point = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]);
const polygon = (v: unknown, min: number, max: number): Ring | null =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every(point) ? (v as Ring) : null;

function inRing(p: Pt, ring: Ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}

const ringArea = (ring: Ring) => Math.abs(ring.reduce((s, a, i) => { const c = ring[(i + 1) % ring.length]; return s + a[0] * c[1] - c[0] * a[1]; }, 0)) / 2;
const area = ringArea;

/** 多边形被轴对齐矩形裁剪后的面积（Sutherland–Hodgman）。 */
function clipArea(poly: Ring, box: Box): number {
  let out = poly;
  const cut = (inside: (p: Pt) => boolean, axis: 0 | 1, value: number) => {
    const next: Ring = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length];
      const ain = inside(a), bin = inside(b);
      if (ain) next.push(a);
      if (ain !== bin) {
        const k = (value - a[axis]) / (b[axis] - a[axis]);
        next.push(axis === 0 ? [value, a[1] + (b[1] - a[1]) * k] : [a[0] + (b[0] - a[0]) * k, value]);
      }
    });
    out = next;
  };
  cut((p) => p[0] >= box.x1, 0, box.x1);
  cut((p) => p[0] <= box.x2, 0, box.x2);
  cut((p) => p[1] >= box.y1, 1, box.y1);
  cut((p) => p[1] <= box.y2, 1, box.y2);
  return out.length < 3 ? 0 : ringArea(out);
}

/** 房间模式：前端发来的测量数据，逐项做形状与规模校验，不合法的项直接忽略（退回只按 zone 检查）。 */
function roomGeometry(room: Body['room']): Geometry {
  const ring = polygon(room?.ring, 3, 60);
  const edges = Array.isArray(room?.edges) ? (room!.edges as unknown[]).slice(0, 80).flatMap((raw) => {
    const e = raw as Partial<Edge>;
    if (!e || !SIDES.includes(e.side as Side) || !finite(e.at) || !finite(e.from) || !finite(e.to) || !Array.isArray(e.spans)) return [];
    const spans = e.spans.slice(0, 400).filter((s) => s && finite(s.from) && finite(s.to) && SPAN_KINDS.includes(s.kind));
    return [{ side: e.side as Side, at: e.at, from: e.from, to: e.to, spans }];
  }) : [];
  const keepOuts = Array.isArray(room?.keepOuts) ? (room!.keepOuts as unknown[]).slice(0, 40).flatMap((raw): KeepOut[] => {
    const k = raw as { kind?: unknown; poly?: unknown };
    const poly = polygon(k?.poly, 3, 20);
    return poly && (k.kind === 'doorway' || k.kind === 'doorSweep' || k.kind === 'window') ? [{ kind: k.kind, poly }] : [];
  }) : [];
  const doors = Array.isArray(room?.doors) ? (room!.doors as unknown[]).slice(0, 20).filter(point) : [];
  return { ring, edges, keepOuts, doors };
}

/** 背靠面：背面线段所在的边、是否紧贴，以及实墙覆盖比例。 */
function backingOf(edges: Edge[], back: Side, box: Box): { ratio: number; other: SpanKind | 'none' } {
  const [at, from, to] = back === 'up' ? [box.y1, box.x1, box.x2] : back === 'down' ? [box.y2, box.x1, box.x2] : back === 'left' ? [box.x1, box.y1, box.y2] : [box.x2, box.y1, box.y2];
  const gapTo = (edge: number) => (back === 'up' || back === 'left' ? at - edge : edge - at);
  const n = Math.max(2, Math.ceil((to - from) / 50));
  const counts = new Map<SpanKind | 'none', number>();
  let wall = 0;
  for (let k = 0; k < n; k++) {
    const t = from + ((k + 0.5) * (to - from)) / n;
    let best: Edge | undefined, bestGap = Infinity;
    for (const e of edges) {
      if (e.side !== back || t < e.from || t > e.to) continue;
      const gap = gapTo(e.at);
      if (gap < -BACK_TOLERANCE || gap > BACK_GAP || gap >= bestGap) continue;
      best = e;
      bestGap = gap;
    }
    const kind = best?.spans.find((s) => t >= s.from && t <= s.to)?.kind ?? 'none';
    if (kind === 'wall') wall++;
    else counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return { ratio: wall / n, other: [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'wall' };
}

/**
 * 过道连通：100 mm 栅格，家具之外 5×5 格（约 600 mm 见方）全空才算能走人。
 * 门口本来就走不进去（过窄的房间）不算家具的问题；返回挡路家具的下标。
 */
function passageBlocker(boxes: { type: string; box: Box }[], geo: Geometry, W: number, H: number): number | null {
  const ring = geo.ring;
  if (!ring || !geo.doors.length) return null;
  const G = 100, R = 2;
  const cols = Math.ceil(W / G), rows = Math.ceil(H / G);
  if (!cols || !rows || cols * rows > 250_000) return null;
  const at = (c: number, r: number): Pt => [(c + 0.5) * G, (r + 0.5) * G];
  const inside = new Uint8Array(cols * rows), taken = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) inside[r * cols + c] = inRing(at(c, r), ring) ? 1 : 0;
  const blockers = boxes.map((b, i) => ({ ...b, i })).filter((b) => b.type !== 'rug');
  for (const { box } of blockers)
    for (let r = Math.max(0, Math.floor(box.y1 / G)); r <= Math.min(rows - 1, Math.floor(box.y2 / G)); r++)
      for (let c = Math.max(0, Math.floor(box.x1 / G)); c <= Math.min(cols - 1, Math.floor(box.x2 / G)); c++) {
        const [px, py] = at(c, r);
        if (px > box.x1 && px < box.x2 && py > box.y1 && py < box.y2) taken[r * cols + c] = 1;
      }
  const walkable = (withFurniture: boolean) => {
    const out = new Uint8Array(cols * rows);
    for (let r = R; r < rows - R; r++) for (let c = R; c < cols - R; c++) {
      let ok = true;
      for (let dr = -R; dr <= R && ok; dr++) for (let dc = -R; dc <= R && ok; dc++) {
        const id = (r + dr) * cols + c + dc;
        if (!inside[id] || (withFurniture && taken[id])) ok = false;
      }
      out[r * cols + c] = ok ? 1 : 0;
    }
    return out;
  };
  const empty = walkable(false), real = walkable(true);
  /** 从门口直线走过去不碰家具（地毯除外）。 */
  const clearLine = (p: Pt, q: Pt, withFurniture: boolean) => {
    if (!withFurniture) return true;
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 50));
    for (let k = 0; k <= steps; k++) {
      const x = p[0] + ((q[0] - p[0]) * k) / steps, y = p[1] + ((q[1] - p[1]) * k) / steps;
      const c = Math.floor(x / G), r = Math.floor(y / G);
      if (c >= 0 && r >= 0 && c < cols && r < rows && taken[r * cols + c]) return false;
    }
    return true;
  };
  /** 门口附近（约 700 mm 内）、能直线走到的最近可走格子。 */
  const seedOf = (grid: Uint8Array, p: Pt) => {
    const found: { id: number; dist: number; at: Pt }[] = [];
    const c0 = Math.floor(p[0] / G), r0 = Math.floor(p[1] / G);
    for (let r = r0 - 7; r <= r0 + 7; r++) for (let c = c0 - 7; c <= c0 + 7; c++) {
      if (r < 0 || c < 0 || r >= rows || c >= cols || !grid[r * cols + c]) continue;
      const q = at(c, r), dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dist <= 700) found.push({ id: r * cols + c, dist, at: q });
    }
    found.sort((m, n) => m.dist - n.dist);
    return found.find((f) => clearLine(p, f.at, grid === real))?.id ?? -1;
  };
  const nearest = (p: Pt) => blockers.reduce<{ i: number | null; dist: number }>((m, { box, i }) => {
    const dist = Math.hypot(Math.max(box.x1 - p[0], 0, p[0] - box.x2), Math.max(box.y1 - p[1], 0, p[1] - box.y2));
    return dist < m.dist ? { i, dist } : m;
  }, { i: null, dist: Infinity }).i;
  const doors = geo.doors.filter((p) => seedOf(empty, p) >= 0);
  const seeds: number[] = [];
  for (const p of doors) {
    const seed = seedOf(real, p);
    if (seed < 0) return nearest(p);
    seeds.push(seed);
  }
  if (seeds.length < 2) return null;
  const seen = new Uint8Array(cols * rows), queue = [seeds[0]];
  seen[seeds[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head], c = id % cols, r = (id - c) / cols;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const next = nr * cols + nc;
      if (seen[next] || !real[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  const cut = seeds.findIndex((s) => !seen[s]);
  if (cut < 0) return null;
  const a = doors[0], z = doors[cut];
  return nearest([(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]);
}

/** 占地是否整块落在轮廓内：四角（内收容差）都在轮廓里，且轮廓顶点没有戳进占地。 */
function insideRing(box: Box, ring: Ring, tolerance: number) {
  const x1 = box.x1 + tolerance, y1 = box.y1 + tolerance, x2 = box.x2 - tolerance, y2 = box.y2 - tolerance;
  if (x2 <= x1 || y2 <= y1) return true;
  if (![[x1, y1], [x2, y1], [x2, y2], [x1, y2]].every((p) => inRing(p as Pt, ring))) return false;
  return !ring.some(([x, y]) => x > x1 && x < x2 && y > y1 && y < y2);
}

/**
 * 一组家具的结构 + 几何校验：代号、方向（hard）；出界 / 出轮廓、互相重叠、压保留区、
 * 背靠面没有实墙、堵住门口通道（soft，回灌给模型修，修不掉由前端确定性校正兜底）。
 */
function checkItems(items: unknown, zone: [number, number, number, number], byCode: Map<string, Entry>, label: string, found: Issues, geo?: Geometry): Placed[] {
  const errors = found.hard;
  if (!Array.isArray(items) || !items.length) { errors.push(`${label}：items 必须是非空数组`); return []; }
  const placed: Placed[] = [];
  const boxes: { code: string; name: string; type: string; box: Box }[] = [];
  items.forEach((raw, i) => {
    const p = raw as Placed;
    const e = byCode.get(p?.code);
    if (!e) { errors.push(`${label} 第 ${i + 1} 件：代号 ${String(p?.code)} 不在目录中`); return; }
    if (!SIDES.includes(p.back)) { errors.push(`${label} ${p.code}：back 必须是 up/down/left/right`); return; }
    if ((p.along !== undefined && !finite(p.along)) || (p.gap !== undefined && !finite(p.gap, 0))) { errors.push(`${label} ${p.code}：along / gap 必须是数字且 gap ≥ 0`); return; }
    const box = footprint(p, e, zone);
    const tolerance = 30;
    const who = `${label} ${p.code}（${e.name}）`;
    if (box.x1 < zone[0] - tolerance || box.y1 < zone[1] - tolerance || box.x2 > zone[2] + tolerance || box.y2 > zone[3] + tolerance)
      found.soft.push(`${who}超出了房间范围（占地 x ${Math.round(box.x1)}–${Math.round(box.x2)}、y ${Math.round(box.y1)}–${Math.round(box.y2)}，房间 0–${Math.round(zone[2])} × 0–${Math.round(zone[3])}），请调整 along / gap`);
    else if (geo?.ring && !insideRing(box, geo.ring, tolerance))
      found.soft.push(`${who}越出了房间轮廓 ring（占地 x ${Math.round(box.x1)}–${Math.round(box.x2)}、y ${Math.round(box.y1)}–${Math.round(box.y2)}，跨到了不规则房间的缺口或隔壁房间），请调整 along / gap`);
    for (const other of boxes) {
      if (e.type === 'rug' || other.type === 'rug') continue;
      const overlap = Math.min(box.x2, other.box.x2) - Math.max(box.x1, other.box.x1);
      const overlapY = Math.min(box.y2, other.box.y2) - Math.max(box.y1, other.box.y1);
      if (overlap <= 50 || overlapY <= 50) continue;
      if (tuckedSeat(e.type, box, other.type, other.box)) continue;
      if (insetOnCounter(e.type, box, other.type, other.box)) continue;
      found.soft.push(`${who}与 ${other.name} 重叠 ${Math.round(overlap)}×${Math.round(overlapY)} mm`);
    }
    if (geo) {
      const tall = (e.height ?? 700) >= TALL;
      const hit = new Set<KeepOut['kind']>();
      for (const keep of geo.keepOuts) {
        if (hit.has(keep.kind) || (keep.kind === 'window' && !tall) || (keep.kind === 'doorSweep' && e.type === 'rug')) continue;
        const overlap = clipArea(keep.poly, box);
        if (overlap < KEEP_OUT_AREA) continue;
        hit.add(keep.kind);
        found.soft.push(`${who}压在了${KEEP_TEXT[keep.kind]}上（重叠约 ${(overlap / 1e6).toFixed(2)} m²${keep.kind === 'window' ? `，家具高 ${Math.round(e.height ?? 0)} mm 会挡住窗` : ''}），请沿边挪开或换到别的边`);
      }
      if (BACK_REQUIRED.has(e.type) && geo.edges.length) {
        const { ratio, other } = backingOf(geo.edges, p.back, box);
        if (ratio < BACK_RATIO)
          found.soft.push(`${who} back=${p.back}，背面后方是${SPAN_TEXT[other]}，实墙只覆盖背面的 ${Math.round(ratio * 100)}%；柜类与电视柜、电视、冰箱、空调、热水器必须紧贴 edges 里 kind=wall 的实墙段（gap 为 0），请换到有足够长 wall 段的边，或调整 along`);
      }
    }
    boxes.push({ code: p.code, name: e.name, type: e.type, box });
    placed.push({ code: p.code, back: p.back, ...(p.along !== undefined ? { along: p.along } : {}), ...(p.gap !== undefined ? { gap: p.gap } : {}) });
  });
  if (geo) {
    const blocker = passageBlocker(boxes, geo, zone[2] - zone[0], zone[3] - zone[1]);
    if (blocker !== null) found.soft.push(`${label}：${boxes[blocker].code}（${boxes[blocker].name}）挡住了门口到房间里的通道（门口内侧位置见 doors），请挪开，门口与门口之间要留出至少 600 mm 宽的连续通道`);
  }
  return placed;
}

function validateRoom(value: unknown, b: Body): Issues {
  const found = issues(), errors = found.hard;
  const byCode = new Map(b.catalog.map((e) => [e.code, e]));
  const v = value as { items?: unknown; summary?: unknown };
  const r = b.room!;
  const zone: [number, number, number, number] = [0, 0, r.zone[2] - r.zone[0], r.zone[3] - r.zone[1]];
  const placed = checkItems(v?.items, zone, byCode, '家具', found, roomGeometry(r));
  if (b.required!.length) {
    const counts = new Map<string, number>();
    for (const p of placed) counts.set(p.code, (counts.get(p.code) ?? 0) + 1);
    for (const q of b.required!) if ((counts.get(q.code) ?? 0) !== q.count) errors.push(`指定家具 ${q.code}（${byCode.get(q.code)?.name}）需要恰好 ${q.count} 件，当前 ${counts.get(q.code) ?? 0} 件`);
    const allowed = new Set(b.required!.map((q) => q.code));
    for (const code of counts.keys()) if (!allowed.has(code)) errors.push(`不允许使用未指定的家具 ${code}（${byCode.get(code)?.name}）`);
  }
  return found;
}

type Line = { key: string; dir: 'h' | 'v'; at: number; from: number; to: number };
type PlanOpening = { wall: string; kind: 'door' | 'window'; at: number; width: number; into?: Side; hinge?: 'start' | 'end' };

/**
 * 整户模式：按模型输出的墙（中心线）、房间轮廓与门窗现算每个房间的测量数据，
 * 坐标相对房间外接矩形左上角（与 checkItems 的分区一致）。墙线与房间边相距 30 mm 内视为贴合。
 */
function planGeometry(ring: Ring, lines: Line[], openings: PlanOpening[]): Geometry {
  const ox = Math.min(...ring.map((p) => p[0])), oy = Math.min(...ring.map((p) => p[1]));
  const edges: Edge[] = [], keepOuts: KeepOut[] = [], doors: Pt[] = [];
  const local = ([x, y]: Pt): Pt => [x - ox, y - oy];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    if (horizontal === vertical) return;
    const dir: 'h' | 'v' = horizontal ? 'h' : 'v';
    const at = horizontal ? a[1] : a[0];
    const from = Math.min(horizontal ? a[0] : a[1], horizontal ? b[0] : b[1]), to = Math.max(horizontal ? a[0] : a[1], horizontal ? b[0] : b[1]);
    if (to - from < 1) return;
    const mid = (from + to) / 2;
    const plus = inRing(horizontal ? [mid, at + 2] : [at + 2, mid], ring);
    const side: Side = horizontal ? (plus ? 'up' : 'down') : (plus ? 'left' : 'right');
    const sign = plus ? 1 : -1;
    const on = lines.filter((l) => l.dir === dir && Math.abs(l.at - at) <= 30);
    const n = Math.max(1, Math.ceil((to - from) / 50)), cell = (to - from) / n;
    const spans: Edge['spans'] = [];
    for (let k = 0; k < n; k++) {
      const t = from + (k + 0.5) * cell;
      const line = on.find((l) => t >= l.from - 1 && t <= l.to + 1);
      const hole = line && openings.find((o) => o.wall === line.key && Math.abs(t - o.at) < o.width / 2);
      const kind: SpanKind = !line ? 'open' : hole ? (hole.kind === 'window' ? 'window' : 'door') : 'wall';
      const last = spans[spans.length - 1];
      if (last && last.kind === kind) last.to = from + (k + 1) * cell;
      else spans.push({ from: from + k * cell, to: from + (k + 1) * cell, kind });
    }
    const shift = horizontal ? ox : oy, across = horizontal ? oy : ox;
    edges.push({ side, at: at - across, from: from - shift, to: to - shift, spans: spans.map((s) => ({ ...s, from: s.from - shift, to: s.to - shift })) });
    // 本条边上的门窗 → 室内一侧的保留区（墙中心线起算，先跨过半个内墙厚 60）。
    const inward: Side = side === 'up' ? 'down' : side === 'down' ? 'up' : side === 'left' ? 'right' : 'left';
    for (const o of openings) {
      const line = on.find((l) => l.key === o.wall);
      if (!line || o.at < from || o.at > to) continue;
      const half = o.width / 2;
      const pt = (along: number, depth: number): Pt => local(horizontal ? [along, at + sign * depth] : [at + sign * depth, along]);
      const band = (depth: number): Ring => [pt(o.at - half, 0), pt(o.at + half, 0), pt(o.at + half, 60 + depth), pt(o.at - half, 60 + depth)];
      if (o.kind === 'window') { keepOuts.push({ kind: 'window', poly: band(600) }); continue; }
      keepOuts.push({ kind: 'doorway', poly: band(300) });
      doors.push(pt(o.at, 60 + 150));
      if (o.into !== inward) continue;
      const hinge = o.hinge === 'end' ? o.at + half : o.at - half, u = o.hinge === 'end' ? -1 : 1;
      const sweep: Ring = [pt(hinge, 0)];
      for (let k = 0; k <= 12; k++) {
        const angle = (k * Math.PI) / 24;
        sweep.push(pt(hinge + u * o.width * Math.cos(angle), o.width * Math.sin(angle)));
      }
      keepOuts.push({ kind: 'doorSweep', poly: sweep });
    }
  });
  return { ring: ring.map(local), edges, keepOuts, doors };
}

function validatePlan(value: unknown, b: Body): Issues {
  const found = issues(), errors = found.hard;
  const v = value as { width?: unknown; depth?: unknown; outline?: unknown; walls?: unknown; rooms?: unknown; openings?: unknown; furniture?: unknown };
  const W = finite(v?.width, 3000, 40000) ? v.width : NaN, D = finite(v?.depth, 3000, 40000) ? v.depth : NaN;
  if (!Number.isFinite(W) || !Number.isFinite(D)) return { hard: ['顶层必须输出 width 与 depth（3000–40000 的数字，单位 mm）'], soft: [] };
  const byCode = new Map(b.catalog.map((e) => [e.code, e]));
  // 外墙：给了合法 outline 就沿它生成（外墙名 ek），否则按长宽生成矩形（top / right / bottom / left）。
  let outline: Ring | null = null;
  if (v?.outline !== undefined) {
    if (!Array.isArray(v.outline) || v.outline.length < 4 || v.outline.length > 40 || !v.outline.every((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1])))
      found.soft.push('outline 必须是 4–40 个 [x,y] 点的数组，例如 [[0,0],[8000,0],[8000,3000],[12000,3000],[12000,10000],[0,10000]]');
    else if (v.outline.some((p) => p[0] < -1 || p[1] < -1 || p[0] > W + 1 || p[1] > D + 1))
      found.soft.push(`outline 的顶点必须落在 0–${W} × 0–${D} 内`);
    else outline = v.outline as Ring;
    if (outline) for (let i = 0; i < outline.length; i++) {
      const p = outline[i], q = outline[(i + 1) % outline.length];
      if (p[0] !== q[0] && p[1] !== q[1]) { found.soft.push(`outline 第 ${i + 1} 条边不是横平竖直的：外墙只能沿 x 或 y 方向`); outline = null; break; }
      if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < 600) { found.soft.push(`outline 第 ${i + 1} 条边短于 600，请合并或去掉`); outline = null; break; }
    }
  }
  const outerEdges = new Map<string, { dir: 'h' | 'v'; at: number; from: number; to: number }>(outline
    ? outline.map((p, i) => {
        const q = outline![(i + 1) % outline!.length];
        const dir: 'h' | 'v' = p[1] === q[1] ? 'h' : 'v';
        const [a, z] = dir === 'h' ? [p[0], q[0]] : [p[1], q[1]];
        return [`e${i + 1}`, { dir, at: dir === 'h' ? p[1] : p[0], from: Math.min(a, z), to: Math.max(a, z) }];
      })
    : [['top', { dir: 'h' as const, at: 0, from: 0, to: W }], ['bottom', { dir: 'h' as const, at: D, from: 0, to: W }], ['left', { dir: 'v' as const, at: 0, from: 0, to: D }], ['right', { dir: 'v' as const, at: W, from: 0, to: D }]]);
  const isOuter = (name: string) => outerEdges.has(name);
  const walls = new Map<string, { dir: 'h' | 'v'; at: number; from: number; to: number }>();
  if (!Array.isArray(v?.walls)) errors.push('walls 必须是数组');
  else v.walls.forEach((raw, i) => {
    const w = raw as { key?: unknown; dir?: unknown; at?: unknown; from?: unknown; to?: unknown };
    const key = typeof w?.key === 'string' ? w.key : '';
    if (!key || walls.has(key) || ['top', 'right', 'bottom', 'left'].includes(key) || isOuter(key)) { found.soft.push(`第 ${i + 1} 面内墙：key 缺失、重复或与外墙同名`); return; }
    if (w.dir !== 'h' && w.dir !== 'v') { found.soft.push(`内墙 ${key}：dir 必须是 h 或 v`); return; }
    const [across, along] = w.dir === 'h' ? [D, W] : [W, D];
    if (!finite(w.at, 0, across) || !finite(w.from, 0, along) || !finite(w.to, 0, along) || w.to - w.from < 600) { found.soft.push(`内墙 ${key}：at/from/to 超出范围或长度不足 600`); return; }
    walls.set(key, { dir: w.dir, at: w.at, from: w.from, to: w.to });
  });
  const rooms = new Map<string, { box: [number, number, number, number]; ring: Ring }>();
  if (!Array.isArray(v?.rooms) || v.rooms.length < 2) errors.push('rooms 至少需要 2 个房间');
  else v.rooms.forEach((raw, i) => {
    const r = raw as { id?: unknown; name?: unknown; box?: unknown; poly?: unknown };
    const id = typeof r?.id === 'string' ? r.id : '';
    if (!id || rooms.has(id)) { errors.push(`第 ${i + 1} 个房间：id 缺失或重复`); return; }
    if (!str(r.name, 20)) found.soft.push(`房间 ${id}：name 必须是 20 字以内的中文名称`);
    const ring: Ring | null = Array.isArray(r.box) && r.box.length === 4 && r.box.every((n) => finite(n))
      ? [[r.box[0], r.box[1]], [r.box[2], r.box[1]], [r.box[2], r.box[3]], [r.box[0], r.box[3]]]
      : Array.isArray(r.poly) && r.poly.length >= 4 && r.poly.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => finite(n)))
        ? (r.poly as Ring)
        : null;
    if (!ring) { errors.push(`房间 ${id}：需要 box:[x1,y1,x2,y2] 或至少 4 个点的 poly`); return; }
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    if (Math.min(...xs) < -1 || Math.min(...ys) < -1 || Math.max(...xs) > W + 1 || Math.max(...ys) > D + 1) found.soft.push(`房间 ${id}：轮廓超出了 ${W}×${D} 的外轮廓`);
    const a = area(ring);
    if (a < 1.5e6) found.soft.push(`房间 ${id}：面积不足 1.5 m²`);
    rooms.set(id, { box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], ring });
  });
  // 房间不必铺满整个平面（留白交给模型按原户型关系决定），也不在这里按面积和反推重叠：L 形轮廓会误判。
  let entrance = false;
  const planOpenings: PlanOpening[] = [];
  if (!Array.isArray(v?.openings)) errors.push('openings 必须是数组');
  else v.openings.forEach((raw, i) => {
    const o = raw as { wall?: unknown; kind?: unknown; at?: unknown; width?: unknown; into?: unknown; hinge?: unknown };
    const wall = typeof o?.wall === 'string' ? o.wall : '';
    const outer = isOuter(wall);
    if (!outer && !walls.has(wall)) { found.soft.push(`第 ${i + 1} 个门窗：wall=${wall} 既不是外墙名（${[...outerEdges.keys()].join(' / ')}）也不是内墙 key`); return; }
    if (o.kind !== 'door' && o.kind !== 'window') { found.soft.push(`第 ${i + 1} 个门窗：kind 必须是 door 或 window`); return; }
    if (!finite(o.at) || !finite(o.width, 500, 4000)) { found.soft.push(`第 ${i + 1} 个门窗：at / width 无效`); return; }
    if (o.kind === 'window' && !outer) found.soft.push(`第 ${i + 1} 个门窗：窗只能开在外墙上`);
    const { from, to } = outer ? outerEdges.get(wall)! : walls.get(wall)!;
    if (o.at - o.width / 2 < from || o.at + o.width / 2 > to) found.soft.push(`第 ${i + 1} 个门窗：洞口超出了墙 ${wall} 的范围`);
    if (o.kind === 'door' && outer) entrance = true;
    planOpenings.push({
      wall, kind: o.kind, at: o.at, width: o.width,
      ...(SIDES.includes(o.into as Side) ? { into: o.into as Side } : {}),
      ...(o.hinge === 'start' || o.hinge === 'end' ? { hinge: o.hinge } : {}),
    });
  });
  const lines: Line[] = [
    ...[...outerEdges].map(([key, e]) => ({ key, ...e })),
    ...[...walls].map(([key, w]) => ({ key, ...w })),
  ];
  if (Array.isArray(v?.openings) && !entrance) found.soft.push('缺少开在外墙上的入户门');
  if (!Array.isArray(v?.furniture) || !v.furniture.length) errors.push('furniture 至少要为主要房间布置家具');
  else v.furniture.forEach((raw, i) => {
    const g = raw as { room?: unknown; items?: unknown };
    const room = typeof g?.room === 'string' ? rooms.get(g.room) : undefined;
    if (!room) { found.soft.push(`第 ${i + 1} 组家具：room 必须引用房间 id`); return; }
    const [x1, y1, x2, y2] = room.box;
    checkItems(g.items, [0, 0, x2 - x1, y2 - y1], byCode, `房间 ${g.room} 的家具`, found, planGeometry(room.ring, lines, planOpenings));
  });
  return found;
}

/** 落库前把代号换成 catalogId：代号只在单次请求内有效。 */
function resolveCodes(value: unknown, byCode: Map<string, Entry>): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveCodes(v, byCode));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'code' && typeof v === 'string' && byCode.has(v)) out.catalogId = byCode.get(v)!.catalogId;
    else out[k] = resolveCodes(v, byCode);
  }
  return out;
}

const friendly = (status: number) =>
  status === 402 ? 'AI 额度已用完，请联系网站管理员'
  : status === 403 ? 'AI 功能已被网站管理员关闭'
  : status === 429 ? '请求太频繁，请稍等片刻再试'
  : status === 503 || status === 529 ? 'AI 服务繁忙，请稍后重试'
  : 'AI 服务暂时不可用，请稍后重试';

class UpstreamError extends Error { constructor(message: string, readonly status: number) { super(message); } }

/** 整户方案 JSON 较长，给足输出长度，避免被截断成不完整的 JSON。 */
const MAX_TOKENS = 16000;

/** Gemini 走自己的流式接口（只有 streamGenerateContent），鉴权用 x-goog-api-key。 */
const GEMINI_ENDPOINT = (model: string) => `https://api.enter.pro/code/api/ai/v1beta/models/${model}:streamGenerateContent`;
/** Gemini 的输出上限包含思考 token，给足余量，避免正文被截断。 */
const GEMINI_MAX_TOKENS = MAX_TOKENS * 2;
/** Gemini 只收 base64 内联文件：单个文件上限，超出或下载失败就跳过该文件，不让整次生成失败。 */
const INLINE_MAX_BYTES = 7 * 1024 * 1024;

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function inlinePart(url: string, fallbackType: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > INLINE_MAX_BYTES) throw new Error(`too large: ${bytes.length}`);
    const type = res.headers.get('content-type')?.split(';')[0].trim();
    return { inlineData: { mimeType: type && type !== 'application/octet-stream' ? type : fallbackType, data: toBase64(bytes) } };
  } catch (e) {
    console.error('inline file skipped', url.slice(0, 200), e instanceof Error ? e.message : e);
    return null;
  }
}

async function geminiBody(system: string, messages: Msg[]) {
  const contents = await Promise.all(messages.map(async (m) => {
    const files = m.role === 'user' ? await Promise.all([
      ...(m.images ?? []).map((url) => inlinePart(url, 'image/jpeg')),
      ...(m.documents ?? []).map((url) => inlinePart(url, 'application/pdf')),
    ]) : [];
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }, ...files.filter((f) => f !== null)] };
  }));
  return { contents, systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: GEMINI_MAX_TOKENS } };
}

/** 把 Gemini 的 SSE 读完拼成正文（跳过思考片段）；流里的 error 事件按上游错误处理。 */
function geminiReply(raw: string) {
  let text = '', finish = '';
  let error: unknown = null;
  for (const line of raw.split(NL)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const data = JSON.parse(payload);
      if (data?.error) { error = data.error; continue; }
      const candidate = data?.candidates?.[0];
      for (const p of candidate?.content?.parts ?? []) if (typeof p?.text === 'string' && !p.thought) text += p.text;
      if (candidate?.finishReason) finish = candidate.finishReason;
    } catch { /* 忽略残缺的数据行 */ }
  }
  return { text, error, finish };
}

async function requestGemini(token: string, session: string, model: string, system: string, messages: Msg[]) {
  const response = await fetch(GEMINI_ENDPOINT(model), {
    method: 'POST',
    headers: { 'x-goog-api-key': token, 'Content-Type': 'application/json', 'X-Session-ID': session, 'X-Enter-Project-ID': PROJECT_ID },
    body: JSON.stringify(await geminiBody(system, messages)),
  });
  const raw = await response.text().catch(() => '');
  const { text, error, finish } = geminiReply(raw);
  if (!response.ok || error) {
    console.error('upstream error', model, response.status, (error ? JSON.stringify(error) : raw).slice(0, 1000));
    const status = response.ok ? 502 : response.status;
    throw new UpstreamError(friendly(status), status);
  }
  if (!text) console.error('empty model output', model, JSON.stringify({ finish }));
  return text;
}

async function requestModel(token: string, session: string, model: string, system: string, messages: Msg[]) {
  const { protocol } = MODELS[model];
  if (protocol === 'gemini') return requestGemini(token, session, model, system, messages);
  const response = await fetch(ENDPOINT[protocol], {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Session-ID': session, 'X-Enter-Project-ID': PROJECT_ID },
    body: JSON.stringify(requestBody(model, system, messages)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.type === 'error' || data?.error) {
    // 上游原文（英文、带 request id）只记日志，给用户的是可操作的中文说明。
    console.error('upstream error', model, response.status, JSON.stringify(data?.error ?? data).slice(0, 1000));
    const status = response.ok ? 502 : response.status;
    throw new UpstreamError(friendly(status), status);
  }
  const text = replyText(protocol, data);
  if (!text) console.error('empty model output', model, JSON.stringify({ stop_reason: data?.stop_reason ?? data?.choices?.[0]?.finish_reason ?? data?.status }).slice(0, 300));
  return text;
}

/** 偶发的空回复（只有思考块、或网关返回空内容）直接再请求一次，仍为空才算失败。 */
async function callModel(token: string, session: string, model: string, system: string, messages: Msg[]): Promise<string> {
  const text = await requestModel(token, session, model, system, messages) || await requestModel(token, session, model, system, messages);
  if (!text) throw new UpstreamError('AI 这次没有给出方案，请重试', 502);
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { success: false, message: '仅支持 POST' });
  const started = Date.now();
  let generationId = '';
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  /** detail 是给排查用的技术原因，只写进生成记录，不返回给界面。 */
  const fail = async (status: number, message: string, detail?: string) => {
    if (generationId) await admin.from('interior_ai_generations').update({ status: 'failed', error: (detail ? `${message}｜${detail}` : message).slice(0, 1000) }).eq('id', generationId).eq('status', 'running');
    return json(status, { success: false, message });
  };
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json(401, { success: false, message: '请登录后使用 AI 设计' });
    const body = guard(await req.json().catch(() => null));
    if (typeof body === 'string') return json(400, { success: false, message: body });
    const token = Deno.env.get('AI_API_TOKEN_eba6e37b0b3d');
    if (!token) return json(500, { success: false, message: 'AI 服务尚未配置' });

    const { data: agents, error: agentError } = await admin.from('interior_ai_agents')
      .select('owner_id,instructions,repair_rounds')
      .eq('kind', body.mode).eq('enabled', true).or(`owner_id.eq.${user.id},owner_id.is.null`);
    if (agentError) throw agentError;
    const agent = agents?.find((a) => a.owner_id === user.id) ?? agents?.find((a) => a.owner_id === null);
    const repairRounds = Math.min(3, Math.max(0, agent?.repair_rounds ?? 1));

    // 小助手只能是自己的：读不到（不存在或属于别人）一律 404。
    let assistant: { model: string; prompt: string } | null = null;
    if (body.assistantId) {
      const { data, error } = await admin.from('interior_ai_assistants').select('model,prompt').eq('id', body.assistantId).eq('owner_id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { success: false, message: '小助手不存在或已被删除' });
      assistant = data;
    }
    const model = [assistant?.model, body.model].find((m): m is string => !!m && !!MODELS[m]) ?? DEFAULT_MODEL;

    const { data: existing, error: readError } = await admin.from('interior_ai_generations').select('owner_id').eq('id', body.generationId).maybeSingle();
    if (readError) throw readError;
    if (existing && existing.owner_id !== user.id) return json(403, { success: false, message: '生成编号不可用' });
    if (!existing) {
      const { error } = await admin.from('interior_ai_generations').upsert({
        id: body.generationId, owner_id: user.id, kind: body.mode, project_id: body.projectId ?? null,
        room_id: body.room?.roomId ?? null, prompt: body.description.trim().slice(0, 2000), images: body.images,
        required: body.required ?? [], model, status: 'running',
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    generationId = body.generationId;

    // 共用规划原则与生活常识在前，模式契约（含输出格式）在后，再叠加站点补充要求与用户的小助手要求。
    const system = [
      PLANNING_RULES,
      LIVING_SENSE,
      body.mode === 'room' ? ROOM_CONTRACT : PLAN_CONTRACT,
      agent?.instructions ? `补充要求：${agent.instructions}` : '',
      assistant?.prompt.trim() ? `小助手要求（在不违反上述输出格式与规则的前提下遵循）：${NL}${assistant.prompt.trim()}` : '',
    ].filter(Boolean).join(NL + NL);
    const materials = await materialsText(body.files);
    const prompt = body.mode === 'room' ? roomPrompt(body) : planPrompt(body);
    const messages: Msg[] = [{
      role: 'user',
      text: materials ? prompt + NL + NL + materials : prompt,
      images: body.images,
      documents: (body.files ?? []).filter((m) => m.ext === 'pdf').map((m) => m.url),
    }];
    const session = req.headers.get('x-session-id')?.trim() || body.generationId;
    // 每轮保留「hard 最少、其次 soft 最少」的那一版：修复轮偶尔会改坏，不能被最后一轮覆盖。
    let best: { result: unknown; found: Issues } | null = null;
    for (let round = 0; round <= repairRounds; round++) {
      if (round > 0 && Date.now() - started > REPAIR_BUDGET_MS) break;
      const text = await callModel(token, session, model, system, messages);
      let result: unknown = null, found: Issues;
      try {
        result = extractJson(text);
        found = body.mode === 'room' ? validateRoom(result, body) : validatePlan(result, body);
      } catch (e) {
        found = { hard: [`输出不是合法 JSON：${e instanceof Error ? e.message : String(e)}`], soft: [] };
      }
      console.log(JSON.stringify({ generationId, index: body.index, mode: body.mode, round, ms: Date.now() - started, hard: found.hard.slice(0, 6), soft: found.soft.slice(0, 6) }));
      if (result !== null && (!best || found.hard.length < best.found.hard.length || (found.hard.length === best.found.hard.length && found.soft.length < best.found.soft.length))) best = { result, found };
      if (!found.hard.length && !found.soft.length) break;
      messages.push({ role: 'assistant', text });
      messages.push({ role: 'user', text: `上面的输出没有通过校验，请逐条修正后重新输出完整的 JSON（只输出 JSON）：${NL}${[...found.hard, ...found.soft].slice(0, 20).map((e, i) => `${i + 1}. ${e}`).join(NL)}` });
    }
    if (!best || best.found.hard.length) {
      const detail = best?.found.hard ?? ['模型没有输出可解析的 JSON'];
      console.error('validation failed', JSON.stringify(detail.slice(0, 10)));
      return await fail(422, best && detail.some((e) => e.startsWith('指定家具') || e.startsWith('不允许使用'))
        ? '这个方案没有按指定的家具清单布置，请重新生成'
        : '这个方案没有通过布局检查，请重新生成或把描述写得更具体', detail.slice(0, 5).join('；'));
    }
    const result = best.result;
    const warnings = best.found.soft.length;

    const summary = typeof (result as { summary?: unknown }).summary === 'string' ? String((result as { summary: string }).summary).slice(0, 60) : '';
    const byCode = new Map(body.catalog.map((e) => [e.code, e]));
    const { data: row, error: insertError } = await admin.from('interior_ai_candidates').upsert({
      generation_id: generationId, owner_id: user.id, idx: body.index, payload: resolveCodes(result, byCode), summary,
    }, { onConflict: 'generation_id,idx' }).select('id').single();
    if (insertError) throw insertError;
    await admin.from('interior_ai_generations').update({ status: 'succeeded', error: null }).eq('id', generationId);
    return json(200, { success: true, model, candidate: { candidateId: row.id, index: body.index, summary, result, warnings } });
  } catch (e) {
    console.error('interior-ai-design error', e);
    if (e instanceof UpstreamError) return await fail([402, 403, 429].includes(e.status) ? e.status : 502, e.message);
    return await fail(500, 'AI 设计服务出错，请重试');
  }
});
