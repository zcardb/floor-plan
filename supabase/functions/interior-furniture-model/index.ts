import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Protocol = 'anthropic' | 'chat' | 'responses' | 'gemini';
/** 与前端 src/features/interior/ai/models.ts 保持一致；只用可读图的模型，才能照着效果图建模。 */
const MODELS: Record<string, { protocol: Protocol }> = {
  'anthropic/claude-opus-5.5': { protocol: 'anthropic' },
  'anthropic/claude-sonnet-5.5': { protocol: 'anthropic' },
  'openai/gpt-6.1-sol': { protocol: 'responses' },
  'openai/gpt-6-astra': { protocol: 'responses' },
  'openai/gpt-6-luna': { protocol: 'responses' },
  'google/gemini-3.8-flash': { protocol: 'gemini' },
  'moonshotai/kimi-k3': { protocol: 'chat' },
  'alibaba/qwen-3.8-max': { protocol: 'chat' },
  'minimax/minimax-m3': { protocol: 'chat' },
};
const DEFAULT_MODEL = 'google/gemini-3.8-flash';
const BASE = 'https://api.enter.pro/code/api/v1/ai';
const ENDPOINT: Record<Exclude<Protocol, 'gemini'>, string> = { anthropic: `${BASE}/messages`, chat: `${BASE}/chat/completions`, responses: `${BASE}/responses` };
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
  '你的任务：为一件家具输出一个**最简 3D 色块模型**——只用几个方块概括它的形体，供室内设计软件的 3D 场景占位显示。',
  '只输出 JSON，不要任何解释、前后缀或 Markdown 代码块。格式：',
  '{"parts":[{"kind":"box","x":0,"y":0,"z":0,"w":1,"h":1,"d":1,"color":"#aabbcc"}]}',
  '坐标与尺寸都是相对家具外框的比例，不是毫米：',
  '- x：部件中心相对宽度中心的比例，-0.5 ~ 0.5；z：相对深度中心的比例，-0.5 ~ 0.5，+z 是家具正面。',
  '- y：部件底面相对总高的比例，0 ~ 1（0 是地面，模型不要悬空）。',
  '- w / h / d：部件占家具总宽 / 总高 / 总深的比例，0 ~ 1。',
  '要求：',
  '- 3 ~ 6 个色块就够，只概括形体：主体 + 明显的分区（上半 / 下半、前后面、桌面与支撑、底座）+ 支脚或台面。',
  '- 不要门缝、把手、旋钮、按钮、屏幕、格栅等细节，也不要装饰性薄片；一个色块能表达的就不要拆成两个。',
  '- kind 一律用 box；只有圆柱形的家具（圆桌、灯杆、桶体）才用 cylinder，圆球用 sphere，不用 axis / round / finish。',
  '- color 必须是小写 #rrggbb，取自参考图的真实颜色，同一件家具的色块保持同一色系、深浅略有区分即可。',
  '- 不要输出家具之外的东西（房间、地面、阴影、文字、人）。',
  '- 用户可能附着参考图与已有模型：参考图只用来判断形体比例与颜色，不要照着它还原细节；若给出既有模型，就在它基础上简化调整。',
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

/** Gemini 走自己的流式接口（只有 streamGenerateContent），鉴权用 x-goog-api-key。 */
const GEMINI_ENDPOINT = (model: string) => `https://api.enter.pro/code/api/ai/v1beta/models/${model}:streamGenerateContent`;
/** Gemini 的输出上限包含思考 token，给足余量，避免正文被截断。 */
const GEMINI_MAX_TOKENS = MAX_TOKENS * 3;
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
    console.error('model upstream error', model, response.status, (error ? JSON.stringify(error) : raw).slice(0, 1000));
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

/** 该类型家具的形体提示（只说分几块、什么关系，不描述细节）。 */
const STRUCTURE: Record<string, string> = {
  bed: '床架一块、床垫一块（床垫叠在床架上、略窄略短）、床头板一块',
  crib: '床体一块、四周床栏一块',
  nightstand: '柜体一块、台面一块、底座或支脚一块',
  wardrobe: '柜体一块（高）、上柜 / 下柜分层、踢脚一块',
  dresser: '柜体一块（分上下两段）、台面一块',
  desk: '台面一块、下方柜体或抽屉一块、支腿',
  chair: '座面一块、靠背一块、四条腿',
  officechair: '座面一块、靠背一块、下方支柱与底座一块',
  bookshelf: '侧板围成的柜体一块（高）、内部一两层可见层板',
  baycushion: '坐垫一块（扁）、靠背垫一块',
  sofa: '座体一块、坐垫一块（略窄）、靠背一块、扶手两块',
  cornersofa: '座体一块（L 形可拆成两块）、坐垫一块、靠背一块',
  armchair: '座体一块、坐垫一块、靠背一块、扶手两块',
  beanbag: '一个圆润的块（用 box 或 sphere 表示）',
  coffeetable: '台面一块（扁）、支腿或柜体一块',
  sidetable: '台面一块（扁）、支撑一块',
  tvstand: '柜体一块（扁长）、台面一块、支脚',
  table: '台面一块（扁）、桌腿',
  roundtable: '圆柱台面一块、桌腿',
  rug: '地面上一块很薄的块',
  shoecab: '柜体一块、踢脚一块',
  floorlamp: '底座一块（扁）、灯杆圆柱一根、灯罩一块（上大下小，可用 box）',
  plant: '花盆一块、上方枝叶一块（用 sphere 表示）',
  island: '台面一块、柜体一块、支脚',
  barstool: '座面一块、下方支腿一块',
  counter: '台面一块（扁）、柜体一块、踢脚一块',
  stove: '灶体一块、台面一块、下方柜体一块',
  ksink: '水槽一块（扁）、龙头一小块、下方柜体一块',
  fridge: '箱体一块（高，可分成上下两段）',
  cabinet: '柜体一块、台面一块',
  toilet: '水箱一块（靠墙、高）、马桶座一块、底座一块',
  vanity: '柜体一块、台面一块、镜面一块（薄）',
  shower: '底盘一块（扁）、两侧隔断两块（薄、高）',
  bathtub: '缸体一块',
  washer: '箱体一块、底部基座一块',
  dryer: '箱体一块、底部基座一块',
  dishwasher: '箱体一块（扁长）',
  waterheater: '圆柱桶体一块',
  tv: '屏幕一块（薄、大）、底座一块',
  aircon: '室内机箱体一块（扁长）',
  acwall: '室内机箱体一块（扁长）',
  ovencol: '高柜体一块（分上下两段）',
  purifier: '箱体一块（高）',
  piano: '琴体一块、键盘一块（薄长）、琴腿',
  treadmill: '底座一块（长、扁）、立柱一块、控制台一块',
  fireplace: '炉体一块、上方烟囱一块',
  generic: '主体一块、加一两个明显的分区（如底座、台面）',
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
    // 内置家具、楼梯常常没有存高度：缺省按 700mm 处理，只校验宽深。
    if (item.height === undefined || item.height === null) item.height = 700;
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
      `外框尺寸：宽 ${Math.round(num(item.w)!)} × 深 ${Math.round(num(item.d)!)} × 高 ${Math.round(num(item.height)!)} mm（按这个长宽高比例拼装）`,
      `主色：${item.color}`,
      `形体提示：${STRUCTURE[type]}。只做到这个程度即可，不要加细节。`,
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
