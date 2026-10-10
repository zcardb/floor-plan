/**
 * AI 生成的简易 3D 模型：由若干基本体（方块 / 圆柱 / 球）拼出家具外形。
 * 坐标与尺寸都是相对家具外框的比例，家具改尺寸时模型随之等比缩放：
 * x、z 为部件中心（-0.5 ~ 0.5，z 正方向为正面），y 为部件底面（0 ~ 1），w / h / d 为占外框宽 / 高 / 深的比例。
 * 后端函数 interior-furniture-model 与这里使用同一套规则。
 */
export type ModelPartKind = 'box' | 'cylinder' | 'sphere';
export type ModelPartFinish = 'matte' | 'gloss' | 'metal';

export interface ModelPart {
  kind: ModelPartKind;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  /** 圆柱的轴向，默认竖直（y）。 */
  axis?: 'x' | 'y' | 'z';
  /** 方块是否倒圆角。 */
  round?: boolean;
  finish?: ModelPartFinish;
}

export interface FurnitureModel3d {
  version: 1;
  parts: ModelPart[];
}

export const MAX_MODEL_PARTS = 40;
const KINDS: ModelPartKind[] = ['box', 'cylinder', 'sphere'];
const FINISHES: ModelPartFinish[] = ['matte', 'gloss', 'metal'];
const AXES = ['x', 'y', 'z'] as const;
/** 最小部件厚度（比例），避免出现看不见的薄片。 */
const MIN_SIZE = 0.01;

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function part(raw: unknown): ModelPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const kind = KINDS.find(k => k === p.kind);
  const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color.toLowerCase() : undefined;
  const [x, y, z, w, h, d] = [p.x, p.y, p.z, p.w, p.h, p.d].map(num);
  if (!kind || !color || [x, y, z, w, h, d].some(v => v === undefined)) return null;
  // 尺寸收进外框，再把中心 / 底面挪到部件不越出外框的位置。
  const sw = clamp(w!, MIN_SIZE, 1), sh = clamp(h!, MIN_SIZE, 1), sd = clamp(d!, MIN_SIZE, 1);
  const axis = AXES.find(a => a === p.axis);
  const finish = FINISHES.find(f => f === p.finish);
  return {
    kind,
    x: round3(clamp(x!, -0.5 + sw / 2, 0.5 - sw / 2)),
    y: round3(clamp(y!, 0, 1 - sh)),
    z: round3(clamp(z!, -0.5 + sd / 2, 0.5 - sd / 2)),
    w: round3(sw), h: round3(sh), d: round3(sd),
    color,
    ...(kind === 'cylinder' && axis && axis !== 'y' ? { axis } : {}),
    ...(kind === 'box' && p.round === true ? { round: true } : {}),
    ...(finish && finish !== 'matte' ? { finish } : {}),
  };
}

/** 把任意输入整理成合法模型；没有可用部件时返回 null。 */
export function sanitizeModel3d(raw: unknown): FurnitureModel3d | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as { parts?: unknown }).parts;
  if (!Array.isArray(list)) return null;
  const parts = list.slice(0, MAX_MODEL_PARTS).map(part).filter((p): p is ModelPart => !!p);
  return parts.length ? { version: 1, parts } : null;
}

/** 项目 / 目录里存着的模型是否完整合法（与整理后的结果一致）。 */
export const validModel3d = (value: unknown) => {
  const clean = sanitizeModel3d(value);
  return !!clean && JSON.stringify(clean) === JSON.stringify(value);
};
