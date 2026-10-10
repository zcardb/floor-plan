import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Protocol = 'anthropic' | 'chat' | 'responses';
/** 与前端 src/features/interior/ai/models.ts 保持一致；只用可读图的模型，才能照着效果图建模。 */
const MODELS: Record<string, { protocol: Protocol }> = {
  'anthropic/claude-opus-5.5': { protocol: 'anthropic' },
  'anthropic/claude-sonnet-5.5': { protocol: 'anthropic' },
  'openai/gpt-6.1-sol': { protocol: 'responses' },
  'openai/gpt-6-astra': { protocol: 'responses' },
  'openai/gpt-6-luna': { protocol: 'responses' },
  'moonshotai/kimi-k3': { protocol: 'chat' },
  'alibaba/qwen-3.8-max': { protocol: 'chat' },
  'minimax/minimax-m3': { protocol: 'chat' },
};
const DEFAULT_MODEL = 'openai/gpt-6-luna';
const BASE = 'https://api.enter.pro/code/api/v1/ai';
const ENDPOINT: Record<Protocol, string> = { anthropic: `${BASE}/messages`, chat: `${BASE}/chat/completions`, responses: `${BASE}/responses` };
const PROJECT_ID = 'eba6e37b0b3d4d608b63a3efedec61a3';
const MAX_TOKENS = 4000;
const MAX_PARTS = 40;
const NL = String.fromCharCode(10);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = [
  '你的任务：为一件家具输出一个**简易 3D 模型**——用少量基本体拼出它的整体外形与主要结构，供室内设计软件的 3D 场景实时渲染。',
  '只输出 JSON，不要任何解释、前后缀或 Markdown 代码块。格式：',
  '{"parts":[{"kind":"box|cylinder|sphere","x":0,"y":0,"z":0,"w":1,"h":1,"d":1,"color":"#aabbcc","axis":"x|y|z","round":true,"finish":"matte|gloss|metal"}]}',
  '坐标与尺寸都是相对家具外框的比例，不是毫米：',
  '- x：部件中心相对宽度中心的比例，-0.5 ~ 0.5；z：相对深度中心的比例，-0.5 ~ 0.5，+z 是家具正面（门、面板、把手一侧）。',
  '- y：部件底面相对总高的比例，0 ~ 1（0 是地面，模型不要悬空）。',
  '- w / h / d：部件占家具总宽 / 总高 / 总深的比例，0 ~ 1。',
  '要求：',
  '- 8 ~ 20 个部件，包含柜体、门 / 抽屉面、把手、台面 / 面板、支脚等主要结构，让人一眼看出这是什么家具，不要只输出一个大方块。',
  '- 尺寸要符合常识：例如微波炉的门占正面大部分面积、把手是细长条、柜体分成上下两段。',
  '- kind 用 box 最稳；圆柱用 cylinder（可选 axis，默认竖直）、圆球用 sphere；圆角方块加 "round": true。',
  '- color 必须是小写 #rrggbb，取自参考图里的真实家具颜色，同色系部件保持一致；玻璃 / 屏幕用深灰 #2b2f33 并加 "finish": "gloss"，金属件加 "finish": "metal"。',
  '- 不要输出家具之外的东西（房间、地面、阴影、文字、人）。',
  '- 用户可能附着参考图与已有模型：参考图决定外观、颜色与结构比例；若给出既有模型，就在它基础上按需求调整，保持整体识别度。',
].join(NL);

/** 从回复里取出第一个完整 JSON 对象：模型常带说明文字或代码块。 */
function jsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** 与前端 src/features/interior/model/furniture3d.ts 的 sanitizeModel3d 使用同一套规则。 */
const KINDS = ['box', 'cylinder', 'sphere'], FINISHES = ['matte', 'gloss', 'metal'], AXES = ['x', 'y', 'z'];
const MIN_SIZE = 0.01;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

interface Part { kind: string; x: number; y: number; z: number; w: number; h: number; d: number; color: string; axis?: string; round?: boolean; finish?: string }

function partOf(raw: unknown): Part | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const kind = KINDS.find((k) => k === p.kind);
  const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color.toLowerCase() : undefined;
  const [x, y, z, w, h, d] = [p.x, p.y, p.z, p.w, p.h, p.d].map(num);
  if (!kind || !color || [x, y, z, w, h, d].some((v) => v === undefined)) return null;
  const sw = clamp(w!, MIN_SIZE, 1), sh = clamp(h!, MIN_SIZE, 1), sd = clamp(d!, MIN_SIZE, 1);
  const axis = AXES.find((a) => a === p.axis), finish = FINISHES.find((f) => f === p.finish);
  return {
    kind,
    x: round3(clamp(x!, -0.5 + sw / 2, 0.5 - sw / 2)),
    y: round3(clamp(y!, 0, 1 - sh)),
    z: round3(clamp(z!, -0.5 + sd / 2, 0.5 - sd / 2)),
    w: round3(sw), h: round3(sh), d: round3(sd), color,
    ...(kind === 'cylinder' && axis && axis !== 'y' ? { axis } : {}),
    ...(kind === 'box' && p.round === true ? { round: true } : {}),
    ...(finish && finish !== 'matte' ? { finish } : {}),
  };
}

function sanitize(raw: unknown): { version: 1; parts: Part[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as { parts?: unknown }).parts;
  if (!Array.isArray(list)) return null;
  const parts = list.slice(0, MAX_PARTS).map(partOf).filter((p): p is Part => !!p);
  return parts.length ? { version: 1, parts } : null;
}

/** 与协议无关的消息；发送前再转成各协议的格式。 */
interface Msg { role: 'user' | 'assistant'; text: string; images?: string[] }

function requestBody(model: string, system: string, messages: Msg[]) {
  const { protocol } = MODELS[model];
  if (protocol === 'anthropic') return {
    model, system, stream: false, max_tokens: MAX_TOKENS,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.images?.length
        ? [{ type: 'text', text: m.text }, ...m.images.map((url) => ({ type: 'image', source: { type: 'url', url } }))]
        : m.text,
    })),
  };
  if (protocol === 'chat') return {
    model, stream: false, max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({
        role: m.role,
        content: m.images?.length
          ? [{ type: 'text', text: m.text }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))]
          : m.text,
      })),
    ],
  };
  return {
    model, stream: false, max_output_tokens: MAX_TOKENS,
    input: [
      { role: 'system', content: system },
      ...messages.map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? m.text : [
          { type: 'input_text', text: m.text },
          ...(m.images ?? []).map((url) => ({ type: 'input_image', image_url: url })),
        ],
      })),
    ],
  };
}

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
  return joinText(parts(data?.output).filter((o) => o.type === 'message').flatMap((o) => parts(o.content)).filter((c) => c.type === 'output_text'));
}

const friendly = (status: number) =>
  status === 402 ? 'AI 额度已用完，请联系管理员'
  : status === 403 ? 'AI 能力已被站点关闭，请联系管理员'
  : status === 429 ? '请求太频繁，请稍等片刻再试'
  : status === 503 || status === 529 ? 'AI 服务繁忙，请稍后重试'
  : 'AI 服务暂时不可用，请稍后重试';

class UpstreamError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = 'UpstreamError'; } }

async function requestModel(token: string, session: string, model: string, system: string, messages: Msg[]) {
  const { protocol } = MODELS[model];
  const response = await fetch(ENDPOINT[protocol], {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Session-ID': session, 'X-Enter-Project-ID': PROJECT_ID },
    body: JSON.stringify(requestBody(model, system, messages)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.type === 'error' || data?.error) {
    console.error('model upstream error', model, response.status, JSON.stringify(data?.error ?? data).slice(0, 1000));
    throw new UpstreamError(friendly(response.ok ? 502 : response.status), response.ok ? 502 : response.status);
  }
  const text = replyText(protocol, data);
  if (!text) console.error('empty model output', model, JSON.stringify({ stop: data?.stop_reason ?? data?.status }).slice(0, 300));
  return text;
}

/** 模型偶尔把 JSON 写坏或只回思考块：解析失败或为空时再请求一次。 */
async function callModel(token: string, session: string, model: string, system: string, messages: Msg[]) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await requestModel(token, session, model, system, messages);
    const parsed = jsonObject(text);
    const model3d = sanitize(parsed);
    if (model3d) return model3d;
    if (attempt === 0) console.error('retrying invalid model json', text.slice(0, 300));
  }
  return null;
}

/** 按参考类型提示该有的结构，避免出现「只有一个大方块」。 */
const STRUCTURE: Record<string, string> = {
  bed: '床垫、床架、床头板、床脚', crib: '床栏、床板、轮子',
  nightstand: '柜体、抽屉面、把手、支脚', wardrobe: '柜体、对开门、把手、踢脚', dresser: '柜体、抽屉面、把手、镜面',
  desk: '台面、柜体 / 抽屉、支脚', chair: '座面、靠背、四条腿', officechair: '座面、靠背、扶手、气压杆、轮子',
  bookshelf: '侧板、层板、背板', baycushion: '坐垫、靠背垫', sofa: '座体、坐垫、靠背、扶手、支脚',
  cornersofa: '座体、两段坐垫、靠背、扶手', armchair: '座体、坐垫、靠背、扶手、支脚', beanbag: '坐垫主体、皱褶',
  coffeetable: '台面、支腿或柜体', sidetable: '台面、支撑', tvstand: '柜体、门 / 抽屉、台面、支脚',
  table: '台面、桌腿', roundtable: '圆台面、桌腿', rug: '矩形地毯、边缘包边', shoecab: '柜体、柜门、把手、踢脚',
  floorlamp: '底座、灯杆、灯罩', plant: '花盆、枝叶', island: '台面、柜体、支脚', barstool: '座面、支腿、脚踏',
  counter: '台面、柜体 / 抽屉、踢脚', stove: '灶体、灶眼、面板、旋钮', ksink: '水槽、龙头、柜体',
  fridge: '箱体、对开门、门把手、面板', cabinet: '柜体、柜门、把手', toilet: '水箱、马桶座、底座',
  vanity: '台面、盆、镜、柜体', shower: '底盘、玻璃隔断、花洒', bathtub: '缸体、缸沿',
  washer: '箱体、门、控制面板、旋钮', dryer: '箱体、门、控制面板', dishwasher: '箱体、门、控制面板、把手',
  waterheater: '圆柱桶体、管路', tv: '屏幕、边框、底座', aircon: '室内机箱体、出风口、叶片',
  acwall: '室内机箱体、出风口', ovencol: '高柜体、烤箱面板、门、把手',
  purifier: '箱体、进风面板、出风口', piano: '琴体、键盘、琴盖、琴腿', treadmill: '跑带底座、立柱、控制台',
  fireplace: '炉体、炉膛、烟囱', generic: '主体、面板、细节件',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { success: false, message: '仅支持 POST' });
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json(401, { success: false, message: '请登录后生成 3D 模型' });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json(400, { success: false, message: '请求格式无效' });
    const item = (body as { item?: Record<string, unknown> }).item;
    if (!item || typeof item !== 'object') return json(400, { success: false, message: '缺少家具参数' });
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) return json(400, { success: false, message: '家具名称无效' });
    if (![item.w, item.d, item.height].every((n) => num(n) !== undefined && num(n)! >= 50 && num(n)! <= 20000)) return json(400, { success: false, message: '家具尺寸无效' });
    if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) return json(400, { success: false, message: '家具颜色无效' });
    const description = (body as { description?: unknown }).description;
    if (description !== undefined && (typeof description !== 'string' || description.length > 2000)) return json(400, { success: false, message: '需求须在 2000 字以内' });
    const images = Array.isArray((body as { images?: unknown }).images) ? (body as { images: unknown[] }).images : [];
    if (images.length > 4 || !images.every((u) => typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 1000)) return json(400, { success: false, message: '参考图最多 4 张' });
    const files = Array.isArray((body as { files?: unknown }).files) ? (body as { files: { name?: unknown; ext?: unknown }[] }).files : [];
    if (files.length > 6 || !files.every((m) => m && typeof m.name === 'string' && !!m.name.trim() && m.name.length <= 200 && typeof m.ext === 'string')) return json(400, { success: false, message: '素材附件无效（最多 6 个）' });
    const model3d = sanitizeModel3dInput((body as { model3d?: unknown }).model3d);
    const token = Deno.env.get('AI_API_TOKEN_eba6e37b0b3d');
    if (!token) return json(500, { success: false, message: 'AI 服务尚未配置' });
    const model = MODELS[(body as { model?: string }).model ?? ''] ? (body as { model: string }).model : DEFAULT_MODEL;
    const session = req.headers.get('x-session-id')?.slice(0, 80) || crypto.randomUUID();

    const type = typeof item.type === 'string' && STRUCTURE[item.type] ? item.type : 'generic';
    const text = [
      `家具：${item.name}（分类：${typeof item.category === 'string' ? item.category : '未标注'}，参考类型：${type}）`,
      `外框尺寸：宽 ${Math.round(num(item.w)!)} × 深 ${Math.round(num(item.d)!)} × 高 ${Math.round(num(item.height)!)} mm（模型要按这个长宽高比例拼装，形状要真正像这件家具）`,
      `主色：${item.color}`,
      `这件家具通常包含：${STRUCTURE[type]}。请按参考图的实际结构建模，不要退化成一个大方块。`,
      model3d ? `用户已有的简易 3D 模型（在此基础上调整，保持整体识别度）：${JSON.stringify(model3d)}` : '',
      description?.trim() ? `用户需求（只影响外观与结构细节）：${JSON.stringify(description.trim())}` : '',
      files.length ? `用户还附了打不开的素材（仅文件名，可作线索）：${JSON.stringify(files.map((m) => m.name))}` : '',
      images.length ? '参考图：请照着它的形状、颜色与结构比例建模。' : '',
      '只输出 JSON。',
    ].filter(Boolean).join(NL);

    const result = await callModel(token, session, model, SYSTEM, [{ role: 'user', text, images }]);
    if (!result) return json(502, { success: false, message: 'AI 这次没有给出可用的 3D 模型，请重试' });
    return json(200, { success: true, model3d: result });
  } catch (error) {
    console.error('furniture model error', error instanceof Error ? error.message : error);
    if (error instanceof UpstreamError) return json([402, 403, 429].includes(error.status) ? error.status : 502, { success: false, message: error.message });
    return json(500, { success: false, message: '生成服务出错，请重试' });
  }
});

/** 既有模型只用来当参考，不做校验：不合法就当没给。 */
function sanitizeModel3dInput(raw: unknown) {
  const clean = sanitize(raw);
  return clean && clean.parts.length ? clean : null;
}
