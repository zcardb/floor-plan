import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Protocol = 'anthropic' | 'chat' | 'responses';
/** 可选模型白名单（与前端 src/features/interior/ai/models.ts 保持一致）：协议决定接口与请求格式，vision 决定是否带参考图。 */
const MODELS: Record<string, { protocol: Protocol; vision: boolean }> = {
  'anthropic/claude-opus-5.5': { protocol: 'anthropic', vision: true },
  'anthropic/claude-sonnet-5.5': { protocol: 'anthropic', vision: true },
  'openai/gpt-6.1-sol': { protocol: 'responses', vision: true },
  'openai/gpt-6-astra': { protocol: 'responses', vision: true },
  'openai/gpt-6-luna': { protocol: 'responses', vision: true },
  'moonshotai/kimi-k3': { protocol: 'chat', vision: true },
  'alibaba/qwen-3.8-max': { protocol: 'chat', vision: true },
  'minimax/minimax-m3': { protocol: 'chat', vision: true },
};
const DEFAULT_MODEL = 'openai/gpt-6-luna';
const BASE = 'https://api.enter.pro/code/api/v1/ai';
const ENDPOINT: Record<Protocol, string> = { anthropic: `${BASE}/messages`, chat: `${BASE}/chat/completions`, responses: `${BASE}/responses` };
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

interface Entry { code: string; catalogId: string; name: string; category: string; type: string; w: number; d: number }
interface Placed { code: string; back: Side; along?: number; gap?: number }
interface Body {
  mode: 'plan' | 'room';
  generationId: string;
  index: number;
  description: string;
  images: string[];
  catalog: Entry[];
  projectId?: string;
  room?: { roomId: string; name: string; area: number; zone: [number, number, number, number]; openings: unknown[] };
  plan?: unknown;
  existing?: { name: string; w: number; d: number }[];
  required?: { code: string; count: number }[];
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
  if (!Array.isArray(b.catalog) || !b.catalog.length || b.catalog.length > 800) return '家具目录无效';
  for (const e of b.catalog)
    if (!e || !/^F\d{1,4}$/.test(e.code) || !str(e.catalogId, 250) || !str(e.name, 100) || typeof e.category !== 'string' || e.category.length > 30 || !str(e.type, 40) || !finite(e.w, 10, 30000) || !finite(e.d, 10, 30000)) return '家具目录条目无效';
  if (b.projectId !== undefined && (typeof b.projectId !== 'string' || !UUID.test(b.projectId))) return '项目编号无效';
  if (b.model !== undefined && (typeof b.model !== 'string' || !MODELS[b.model])) return '不支持的模型';
  if (b.assistantId !== undefined && (typeof b.assistantId !== 'string' || !UUID.test(b.assistantId))) return '小助手编号无效';
  if (b.mode === 'room') {
    const r = b.room;
    if (!r || !str(r.roomId, 100) || !str(r.name, 100) || !Array.isArray(r.zone) || r.zone.length !== 4 || !r.zone.every((n) => finite(n)) || !Array.isArray(r.openings)) return '房间信息无效';
    if (!b.plan || typeof b.plan !== 'object' || JSON.stringify(b.plan).length > 200_000) return '户型快照无效或过大';
    if (!Array.isArray(b.existing) || b.existing.length > 80) return '现有家具清单无效';
    const codes = new Set(b.catalog.map((e) => e.code));
    if (!Array.isArray(b.required) || b.required.length > 40 || !b.required.every((q) => q && codes.has(q.code) && Number.isInteger(q.count) && q.count >= 1 && q.count <= 20)) return '指定家具无效';
  }
  return b;
}

const catalogText = (catalog: Entry[]) =>
  catalog.map((e) => `${e.code} ${e.name} | ${e.category || '其他'} | ${e.type} | ${Math.round(e.w)}×${Math.round(e.d)}`).join(NL);

const DIRECTIONS = ['常规舒适：优先动线与使用习惯', '收纳优先：尽量多布置收纳', '开阔通透：留出更多活动空间', '功能分区：明确划分功能区域'];

const ROOM_CONTRACT = `你是资深室内设计师，为一套户型中的「目标房间」布置家具。只输出一个 JSON 对象，不要输出解释或 Markdown。

坐标约定：单位 mm；原点在户型室内净轮廓左上角；x 向右，y 向下（下方为南）。
目标房间的摆放分区 zone = [x1, y1, x2, y2]（绝对坐标）。每件家具用「背靠边 + 沿边位置 + 离边距离」描述，全部相对 zone：
- back：家具背面朝哪条边，取 up / down / left / right。
- along：家具中心沿这条边的位置；back 为 up/down 时从 zone 左边 x1 量起，back 为 left/right 时从 zone 上边 y1 量起。
- gap：家具背面到这条边的净距；贴墙为 0，放在房间中部的家具（床尾凳、茶几、餐桌、地毯、岛台）用较大的 gap。
- 家具宽 w 沿背靠边方向，深 d 垂直于背靠边，尺寸固定取目录值，不能改。
家具只能使用目录里的代号 code，禁止编造代号。

输出格式：
{"summary":"一句话方案说明，20 字以内","items":[{"code":"F3","back":"up","along":1800,"gap":0}]}

布置规则：
1. 家具之间互不重叠（地毯除外），全部落在 zone 内。
2. 不挡门：门洞前留出至少 800mm 通行空间；高家具（衣柜、书架、冰箱）不要挡窗。
3. 主通道净宽至少 700mm。
4. 结合整套户型：门连通哪些房间、相邻房间的功能与现有家具，保持风格一致、动线顺畅。
5. 「指定家具」不为空时，只能使用指定的代号，且每个代号的件数必须与指定件数完全相同，不得增减或加入其他家具；为空时由你从目录中挑选适合该房间功能的家具。`;

const PLAN_CONTRACT = `你是住宅空间规划与户型设计助手。根据用户的文字需求（可能附参考图），设计一套功能合理、连通顺畅、尺寸自洽的单层户型，包括外轮廓、内墙、房间、门窗与家具。只输出一个 JSON 对象，不要输出解释或 Markdown。

一、理解需求
- 从描述中提取：外轮廓形状与长宽或面积、朝向、居住人数、房间数量与用途、采光／隐私／收纳／办公等需求，以及用户指定的门窗位置。
- 外轮廓按用户给的来：用户描述或参考图是 L 形、凹凸、缺角等不规则外形时，保持原外形输出 outline，不要补成矩形；没有特别说明时可以用矩形。
- 区分硬性要求（尺寸、房间数、指定门窗）和偏好（风格、氛围）。先满足硬性要求，偏好在不冲突时再满足。
- 信息不全时按常见住宅做法合理假设，不要提问。需求互相冲突时先保证空间能用，再尽量贴近偏好。
- 参考图：用户要求还原或照着做时，按图中的房间关系、形状和比例来；否则只当作风格参考，不照搬房间数量和布局。

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
3. 门的位置和开向要避开其他门、家具和主通道。
4. 窗只开在外墙上。卧室、客厅、厨房要有窗，卫生间尽量有窗。
5. 用户指定的门窗位置保持不变。

四、用家具验证房间
- 卧室：床、衣柜，以及上下床和开柜门的空间。
- 客厅：主要座位和通行路线。
- 餐区：餐桌、拉开椅子和经过的空间。
- 厨房：储存、清洗、备菜、烹饪的连续操作面。
- 卫生间：洁具、门扇开启和使用空间。
家具尺寸固定取目录值，不能靠缩小家具来「放得下」。放不下时调整房间。

五、几何
1. 所有房间都在外轮廓内，不重叠、不越界。
2. 相邻房间共用同一面墙，墙的位置一致，不重复、不错位、不留缝。
3. 房间是闭合轮廓；面积由系统按轮廓计算，不需要输出。

六、输出前自检
- 必要需求是否都满足；每个房间是否都能走到。
- 是否缺门，门窗是否开在正确的墙上。
- 房间是否重叠或越界，是否有没有用途的空间。
- 家具和操作空间是否合理。
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
- 门窗：kind 取 door 或 window；wall 引用内墙 key 或外墙名；at 是洞口中心沿墙的位置，width 是洞口宽。门的 into 是开向（横墙填 up/down，竖墙填 left/right）。同一面墙上的洞口互不重叠，离墙端至少 100。
- 家具：按房间分组，room 引用房间 id。每件家具用 back（背靠哪条边：up/down/left/right）、along（中心沿这条边的位置）、gap（背面到这条边的距离，贴墙为 0）描述，坐标相对该房间外接矩形的左上角。只能用目录里的代号。`;

/** 与协议无关的对话消息；发送前再转成各协议的格式。 */
interface Msg { role: 'user' | 'assistant'; text: string; images?: string[] }

/** 把通用消息转成对应协议的请求体；不支持看图的模型不带图片。 */
function requestBody(model: string, system: string, messages: Msg[]) {
  const { protocol, vision } = MODELS[model];
  const imagesOf = (m: Msg) => (vision && m.role === 'user' ? m.images ?? [] : []);
  if (protocol === 'anthropic') return {
    model, system, stream: false, max_tokens: MAX_TOKENS,
    messages: messages.map((m) => ({ role: m.role, content: imagesOf(m).length ? [{ type: 'text', text: m.text }, ...imagesOf(m).map((url) => ({ type: 'image', source: { type: 'url', url } }))] : m.text })),
  };
  if (protocol === 'chat') return {
    model, stream: false, max_tokens: MAX_TOKENS,
    messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: imagesOf(m).length ? [{ type: 'text', text: m.text }, ...imagesOf(m).map((url) => ({ type: 'image_url', image_url: { url } }))] : m.text }))],
  };
  return {
    model, stream: false, max_output_tokens: MAX_TOKENS,
    input: [{ role: 'system', content: system }, ...messages.map((m) => ({
      role: m.role,
      content: m.role === 'assistant' ? m.text : [{ type: 'input_text', text: m.text }, ...imagesOf(m).map((url) => ({ type: 'input_image', image_url: url }))],
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

function roomPrompt(b: Body) {
  const names = new Map(b.catalog.map((e) => [e.code, e.name]));
  const required = b.required!.length
    ? JSON.stringify(b.required!.map((q) => ({ code: q.code, name: names.get(q.code), count: q.count })))
    : '无（由你从目录中挑选）';
  return [
    `目标房间：${JSON.stringify(b.room)}`,
    `目标房间净空：宽 ${Math.round(b.room!.zone[2] - b.room!.zone[0])}（x 方向）× 深 ${Math.round(b.room!.zone[3] - b.room!.zone[1])}（y 方向）mm。back 为 up/down 时 along 取值 [w/2, 宽 − w/2]、gap ≤ 深 − d；back 为 left/right 时 along 取值 [w/2, 深 − w/2]、gap ≤ 宽 − d。输出前请逐件核对占地范围不越界、彼此不重叠；空间实在不够时，宁可让家具贴墙紧凑排布，也不要越界。`,
    `目标房间现有家具：${b.existing!.length ? JSON.stringify(b.existing) : '无'}`,
    `指定家具：${required}`,
    `整套户型（墙 a→b、门窗中心 at 与连通房间 rooms、房间轮廓 ring、其他房间家具）：${JSON.stringify(b.plan)}`,
    `家具目录（代号 名称 | 分类 | 类型 | 宽×深 mm）：${NL}${catalogText(b.catalog)}`,
    `用户需求：${b.description.trim()}`,
    b.images.length ? '附有参考图，请参考其中的风格与布局意图，但家具仍只能来自目录。' : '',
    `这是同一批里的第 ${b.index + 1} 个方案，思路：${DIRECTIONS[b.index % DIRECTIONS.length]}。`,
  ].filter(Boolean).join(NL + NL);
}

/** 长宽由描述里的需求决定（用户把长宽写在描述里），模型必须在 JSON 顶层输出。 */
const SIZE_LINE = '室内净尺寸未固定：若用户需求里给出了长宽（如「长 12 m × 宽 10 m」）或面积，请严格按该数值换算成 mm 设计；否则按房间数量与面积确定合理尺寸。请在 JSON 顶层输出 "width" 与 "depth"（室内净轮廓外接矩形的长宽，3000–40000 mm，取 100 的整数倍）；外形不规则时另外输出 "outline"。';

function planPrompt(b: Body) {
  return [
    SIZE_LINE,
    `家具目录（代号 名称 | 分类 | 类型 | 宽×深 mm）：${NL}${catalogText(b.catalog)}`,
    `用户需求：${b.description.trim()}`,
    b.images.length ? '附有参考图（可能是户型图或风格图），请参考其中的布局与风格意图。' : '',
    `这是同一批里的第 ${b.index + 1} 个方案，请给出与常见做法略有不同的分区思路：${DIRECTIONS[b.index % DIRECTIONS.length]}。`,
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
 * - soft：能落地但不够好（出界、重叠），先让模型修，修不好也接受，前端会把家具夹回房间内并提示需微调。
 */
interface Issues { hard: string[]; soft: string[] }
const issues = (): Issues => ({ hard: [], soft: [] });

/** 一组家具的结构 + 几何校验：代号、方向（hard），是否出界、是否互相重叠（soft）。 */
function checkItems(items: unknown, zone: [number, number, number, number], byCode: Map<string, Entry>, label: string, found: Issues): Placed[] {
  const errors = found.hard;
  if (!Array.isArray(items) || !items.length) { errors.push(`${label}：items 必须是非空数组`); return []; }
  const placed: Placed[] = [];
  const boxes: { name: string; type: string; box: ReturnType<typeof footprint> }[] = [];
  items.forEach((raw, i) => {
    const p = raw as Placed;
    const e = byCode.get(p?.code);
    if (!e) { errors.push(`${label} 第 ${i + 1} 件：代号 ${String(p?.code)} 不在目录中`); return; }
    if (!SIDES.includes(p.back)) { errors.push(`${label} ${p.code}：back 必须是 up/down/left/right`); return; }
    if ((p.along !== undefined && !finite(p.along)) || (p.gap !== undefined && !finite(p.gap, 0))) { errors.push(`${label} ${p.code}：along / gap 必须是数字且 gap ≥ 0`); return; }
    const box = footprint(p, e, zone);
    const tolerance = 30;
    if (box.x1 < zone[0] - tolerance || box.y1 < zone[1] - tolerance || box.x2 > zone[2] + tolerance || box.y2 > zone[3] + tolerance)
      found.soft.push(`${label} ${p.code}（${e.name}）超出了房间范围（占地 x ${Math.round(box.x1)}–${Math.round(box.x2)}、y ${Math.round(box.y1)}–${Math.round(box.y2)}，房间 0–${Math.round(zone[2])} × 0–${Math.round(zone[3])}），请调整 along / gap`);
    for (const other of boxes) {
      if (e.type === 'rug' || other.type === 'rug') continue;
      const overlap = Math.min(box.x2, other.box.x2) - Math.max(box.x1, other.box.x1);
      const overlapY = Math.min(box.y2, other.box.y2) - Math.max(box.y1, other.box.y1);
      if (overlap > 50 && overlapY > 50) found.soft.push(`${label} ${p.code}（${e.name}）与 ${other.name} 重叠 ${Math.round(overlap)}×${Math.round(overlapY)} mm`);
    }
    boxes.push({ name: e.name, type: e.type, box });
    placed.push({ code: p.code, back: p.back, ...(p.along !== undefined ? { along: p.along } : {}), ...(p.gap !== undefined ? { gap: p.gap } : {}) });
  });
  return placed;
}

function validateRoom(value: unknown, b: Body): Issues {
  const found = issues(), errors = found.hard;
  const byCode = new Map(b.catalog.map((e) => [e.code, e]));
  const v = value as { items?: unknown; summary?: unknown };
  const r = b.room!;
  const zone: [number, number, number, number] = [0, 0, r.zone[2] - r.zone[0], r.zone[3] - r.zone[1]];
  const placed = checkItems(v?.items, zone, byCode, '家具', found);
  if (b.required!.length) {
    const counts = new Map<string, number>();
    for (const p of placed) counts.set(p.code, (counts.get(p.code) ?? 0) + 1);
    for (const q of b.required!) if ((counts.get(q.code) ?? 0) !== q.count) errors.push(`指定家具 ${q.code}（${byCode.get(q.code)?.name}）需要恰好 ${q.count} 件，当前 ${counts.get(q.code) ?? 0} 件`);
    const allowed = new Set(b.required!.map((q) => q.code));
    for (const code of counts.keys()) if (!allowed.has(code)) errors.push(`不允许使用未指定的家具 ${code}（${byCode.get(code)?.name}）`);
  }
  return found;
}

type Ring = [number, number][];
const area = (ring: Ring) => Math.abs(ring.reduce((s, a, i) => { const c = ring[(i + 1) % ring.length]; return s + a[0] * c[1] - c[0] * a[1]; }, 0)) / 2;

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
  const outerEdges = new Map<string, { dir: 'h' | 'v'; from: number; to: number }>(outline
    ? outline.map((p, i) => {
        const q = outline![(i + 1) % outline!.length];
        const dir: 'h' | 'v' = p[1] === q[1] ? 'h' : 'v';
        const [a, z] = dir === 'h' ? [p[0], q[0]] : [p[1], q[1]];
        return [`e${i + 1}`, { dir, from: Math.min(a, z), to: Math.max(a, z) }];
      })
    : [['top', { dir: 'h' as const, from: 0, to: W }], ['bottom', { dir: 'h' as const, from: 0, to: W }], ['left', { dir: 'v' as const, from: 0, to: D }], ['right', { dir: 'v' as const, from: 0, to: D }]]);
  const isOuter = (name: string) => outerEdges.has(name);
  const walls = new Map<string, { dir: string; at: number; from: number; to: number }>();
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
  const rooms = new Map<string, [number, number, number, number]>();
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
    rooms.set(id, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  });
  // 房间不必铺满整个平面（留白交给模型按原户型关系决定），也不在这里按面积和反推重叠：L 形轮廓会误判。
  let entrance = false;
  if (!Array.isArray(v?.openings)) errors.push('openings 必须是数组');
  else v.openings.forEach((raw, i) => {
    const o = raw as { wall?: unknown; kind?: unknown; at?: unknown; width?: unknown };
    const wall = typeof o?.wall === 'string' ? o.wall : '';
    const outer = isOuter(wall);
    if (!outer && !walls.has(wall)) { found.soft.push(`第 ${i + 1} 个门窗：wall=${wall} 既不是外墙名（${[...outerEdges.keys()].join(' / ')}）也不是内墙 key`); return; }
    if (o.kind !== 'door' && o.kind !== 'window') { found.soft.push(`第 ${i + 1} 个门窗：kind 必须是 door 或 window`); return; }
    if (!finite(o.at) || !finite(o.width, 500, 4000)) { found.soft.push(`第 ${i + 1} 个门窗：at / width 无效`); return; }
    if (o.kind === 'window' && !outer) found.soft.push(`第 ${i + 1} 个门窗：窗只能开在外墙上`);
    const { from, to } = outer ? outerEdges.get(wall)! : walls.get(wall)!;
    if (o.at - o.width / 2 < from || o.at + o.width / 2 > to) found.soft.push(`第 ${i + 1} 个门窗：洞口超出了墙 ${wall} 的范围`);
    if (o.kind === 'door' && outer) entrance = true;
  });
  if (Array.isArray(v?.openings) && !entrance) found.soft.push('缺少开在外墙上的入户门');
  if (!Array.isArray(v?.furniture) || !v.furniture.length) errors.push('furniture 至少要为主要房间布置家具');
  else v.furniture.forEach((raw, i) => {
    const g = raw as { room?: unknown; items?: unknown };
    const box = typeof g?.room === 'string' ? rooms.get(g.room) : undefined;
    if (!box) { found.soft.push(`第 ${i + 1} 组家具：room 必须引用房间 id`); return; }
    checkItems(g.items, [0, 0, box[2] - box[0], box[3] - box[1]], byCode, `房间 ${g.room} 的家具`, found);
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

async function requestModel(token: string, session: string, model: string, system: string, messages: Msg[]) {
  const { protocol } = MODELS[model];
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

    const system = [
      body.mode === 'room' ? ROOM_CONTRACT : PLAN_CONTRACT,
      agent?.instructions ? `补充要求：${agent.instructions}` : '',
      assistant?.prompt.trim() ? `小助手要求（在不违反上述输出格式与规则的前提下遵循）：${NL}${assistant.prompt.trim()}` : '',
    ].filter(Boolean).join(NL + NL);
    const messages: Msg[] = [{ role: 'user', text: body.mode === 'room' ? roomPrompt(body) : planPrompt(body), images: body.images }];
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
