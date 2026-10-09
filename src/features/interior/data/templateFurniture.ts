import { type Box, type FurnitureZone, type FurnitureSpec } from './floorplanBuilder';

const item = (type: string, back: FurnitureSpec['back'], along?: number, gap?: number, extra: Partial<FurnitureSpec> = {}): FurnitureSpec => ({ type, back, along, gap, ...extra });

/** All dimensions are millimetres. Doors enter bedrooms at the lower-right corner. */
export function bedroomFurniture(zone: Box, master = false): FurnitureZone {
  const width = zone[2] - zone[0], depth = zone[3] - zone[1];
  const bedWidth = master && width >= 3500 ? 1800 : 1500;
  const center = Math.min(width / 2, 1800);
  return { zone, items: [
    item('bed', 'up', center, 0, { name: bedWidth === 1800 ? '双人床 1.8m' : '双人床 1.5m' }),
    item('nightstand', 'up', center - bedWidth / 2 - 250),
    item('nightstand', 'up', center + bedWidth / 2 + 250),
    item('wardrobe', 'down', 650, 0, { name: '小衣柜' }),
    ...(depth >= 3700 ? [item('desk', 'left', 2600, 0, { w: 1000 }), item('chair', 'right', 2600, width - 1180)] : []),
  ] };
}

/** Shower and WC on the north side; basin by the south-west wall, door south-east. */
export function bathroomFurniture(zone: Box): FurnitureZone {
  const width = zone[2] - zone[0];
  return { zone, items: [item('shower', 'up', 450), item('toilet', 'up', width - 450), item('vanity', 'down', 450)] };
}

/** An L-shaped worktop. Sink/stove are deliberately inset into the worktop, not freestanding obstacles. */
export function kitchenFurniture(zone: Box): FurnitureZone {
  const width = zone[2] - zone[0], depth = zone[3] - zone[1];
  return { zone, items: [
    item('counter', 'left', depth / 2, 0, { w: depth, d: 600 }),
    item('counter', 'down', (width + 600) / 2, 0, { w: width - 600, d: 600 }),
    item('stove', 'left', 850, 75),
    item('ksink', 'down', width - 650, 75),
    item('fridge', 'up', 950),
  ] };
}

export function livingFurniture(zone: Box, large = false): FurnitureZone {
  const width = zone[2] - zone[0], depth = zone[3] - zone[1];
  const loungeWidth = Math.min(width, 4400), center = loungeWidth / 2;
  const items: FurnitureSpec[] = [
    item('sofa', 'left', depth / 2, 0, { name: depth < 2400 ? '双人沙发' : '三人沙发' }),
    item('tvstand', 'right', depth / 2, width - loungeWidth, { w: Math.min(2200, depth - 200) }),
    item('coffeetable', 'left', depth / 2, loungeWidth / 2 - 325, { w: 1100 }),
    item('rug', 'left', depth / 2, center - 800, { w: Math.min(2300, depth - 100), d: 1600 }),
  ];
  if (width >= 6200) {
    const diningX = loungeWidth + (width - loungeWidth) / 2;
    const tableWidth = large ? 1600 : 1400;
    items.push(item('table', 'up', diningX, depth / 2 - 400, { w: tableWidth, d: 800 }));
    for (const dx of [-450, 450]) {
      items.push(item('chair', 'up', diningX + dx, depth / 2 - 950, { name: '餐椅' }));
      items.push(item('chair', 'down', diningX + dx, depth / 2 - 950, { name: '餐椅' }));
    }
    if (large) {
      items.push(item('chair', 'left', depth / 2, diningX - tableWidth / 2 - 530, { name: '餐椅' }));
      items.push(item('chair', 'right', depth / 2, width - diningX - tableWidth / 2 - 530, { name: '餐椅' }));
    }
    items.push(item('cabinet', 'right', depth / 2, 0, { w: 1400 }));
  }
  return { zone, items };
}

export function balconyFurniture(zone: Box): FurnitureZone {
  const width = zone[2] - zone[0];
  return { zone, items: [item('washer', 'left', 350), item('vanity', 'up', 1000, 0, { name: '洗衣池' }), item('plant', 'right', 350), item('armchair', 'down', width - 1400, 0, { w: 700, d: 700 })] };
}
