import { buildPlan, net, type PlanSpec, type Box } from './floorplan-builder';
import { balconyFurniture, bathroomFurniture, bedroomFurniture, kitchenFurniture, livingFurniture } from './template-furniture';
import { finalizeTemplate } from '@/lib/floor-plan/templates';
import type { Design } from '@/lib/floor-plan/types';

/**
 * AI 的整户 / 单房间范例（few-shot）所用的算法户型。
 * 它们不是用户可选的模板（模板只保留「原木之家」一套），只用来给模型示范输出格式与常见尺度。
 */
export interface ExamplePlan {
  id: string;
  name: string;
  layout: string;
  description: string;
  spec: () => PlanSpec;
  /** 按模板同一套收尾（清空分割、补分隔线）建成的方案，供单房间范例取门窗上下文。 */
  design: () => Design;
}

/** A circulation spine joins the bedrooms, bathroom, kitchen and south-facing living space. */
function apartment(id: string, beds: number, width: number, depth: number, serviceWidth: number, bedroomDepth: number, balconyDepth: number): PlanSpec {
  const serviceX = width - serviceWidth;
  const bedroomWidth = serviceX / beds;
  const hallBottom = bedroomDepth + 1100;
  const balconyY = depth - balconyDepth;
  const bedroomBoxes = Array.from({ length: beds }, (_, i) => net(i * bedroomWidth, 0, (i + 1) * bedroomWidth, bedroomDepth, `${i ? 'l' : ''}rb`));
  const bath = net(serviceX, 0, width, bedroomDepth, 'lb');
  const kitchen = net(serviceX, hallBottom, width, balconyY, 'ltb');
  const living = net(0, hallBottom, serviceX, balconyY, 'trb');
  const balcony = net(0, balconyY, width, depth, 't');
  const hall: Box = [0, bedroomDepth + 60, width, hallBottom - 60];
  return {
    id, width, depth,
    walls: [
      { key: 'bedrooms', dir: 'h', at: bedroomDepth, from: 0, to: width },
      { key: 'living-entry', dir: 'h', at: hallBottom, from: 0, to: width },
      ...Array.from({ length: beds }, (_, i) => ({ key: `bed-divider-${i}`, dir: 'v' as const, at: (i + 1) * bedroomWidth, from: 0, to: bedroomDepth })),
      { key: 'kitchen-divider', dir: 'v', at: serviceX, from: hallBottom, to: balconyY },
      { key: 'balcony', dir: 'h', at: balconyY, from: 0, to: width },
    ],
    openings: [
      ...Array.from({ length: beds }, (_, i) => ({ wall: 'bedrooms', kind: 'door' as const, at: (i + 1) * bedroomWidth - 600, width: 850, into: 'up' as const, hinge: 'end' as const })),
      { wall: 'bedrooms', kind: 'door', at: width - 600, width: 800, into: 'up', hinge: 'end' },
      { wall: 'living-entry', kind: 'door', at: serviceX - 750, width: 1200, into: 'up' },
      { wall: 'living-entry', kind: 'door', at: width - 600, width: 850, into: 'down', hinge: 'end' },
      { wall: 'right', kind: 'door', at: bedroomDepth + 550, width: 950, into: 'left' },
      { wall: 'balcony', kind: 'door', at: serviceX - 1100, width: 1600, into: 'down' },
      ...Array.from({ length: beds }, (_, i) => ({ wall: 'top', kind: 'window' as const, at: bedroomWidth * (i + 0.5), width: Math.min(1800, bedroomWidth - 1000) })),
      { wall: 'right', kind: 'window', at: 1500, width: 800 },
      { wall: 'right', kind: 'window', at: (hallBottom + balconyY) / 2, width: 1200 },
      { wall: 'bottom', kind: 'window', at: width / 2, width: Math.min(width - 1600, 6000) },
    ],
    rooms: [
      ...bedroomBoxes.map((box, i) => ({ id: `bedroom-${i}`, name: i === 0 ? '主卧' : i === 1 ? '次卧' : `卧室 ${i + 1}`, box, mat: 'wood' })),
      { id: 'bathroom', name: '卫生间', box: bath, mat: 'antislip' },
      { id: 'hall', name: '玄关过道', box: hall, mat: 'tile800' },
      { id: 'living', name: beds === 1 ? '客厅' : '客餐厅', box: living, mat: 'tile800' },
      { id: 'kitchen', name: '厨房', box: kitchen, mat: 'antislip' },
      { id: 'balcony', name: '南向阳台', box: balcony, mat: 'antislip' },
    ],
    furniture: [
      ...bedroomBoxes.map((box, i) => bedroomFurniture(box, i === 0)),
      bathroomFurniture(bath), kitchenFurniture(kitchen), livingFurniture(living, beds === 4), balconyFurniture(balcony),
      { zone: hall, items: [{ type: 'shoecab', back: 'left', along: 500, w: 900 }] },
    ],
  };
}

const definitions = [
  { id: 'studio', name: '阳光小筑', layout: '一室一厅一卫', description: '紧凑首置 · 独立卧室 · 南向阳台', width: 6600, depth: 7500, beds: 1, service: 2600, bedroomDepth: 3000, balcony: 1100 },
  { id: 'two-bed', name: '悦居两房', layout: '两室两厅一卫', description: '家庭刚需 · 客餐一体 · 独立厨房', width: 9600, depth: 9300, beds: 2, service: 2600, bedroomDepth: 3600, balcony: 1200 },
  { id: 'three-bed', name: '温暖三房', layout: '三室两厅一卫', description: '三代同住 · 动静分区 · 南向客厅', width: 11400, depth: 9300, beds: 3, service: 2400, bedroomDepth: 3600, balcony: 1200 },
  { id: 'four-bed', name: '阔境四房', layout: '四室两厅一卫', description: '改善家庭 · 六人餐桌 · 大面宽', width: 15000, depth: 9600, beds: 4, service: 2600, bedroomDepth: 3700, balcony: 1200 },
  { id: 'wide-hall', name: '通透横厅', layout: '三室两厅一卫', description: '宽厅改善 · 餐客贯通 · 宽景阳台', width: 13900, depth: 10000, beds: 3, service: 2800, bedroomDepth: 3800, balcony: 1400 },
];

export const AI_EXAMPLE_PLANS: ExamplePlan[] = definitions.map((d) => {
  const spec = () => apartment(d.id, d.beds, d.width, d.depth, d.service, d.bedroomDepth, d.balcony);
  return {
    id: d.id, name: `${d.layout} · ${d.name}`, layout: d.layout, description: d.description,
    spec,
    design: () => finalizeTemplate(buildPlan(spec())),
  };
});
