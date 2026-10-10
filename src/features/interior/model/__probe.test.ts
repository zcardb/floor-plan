import { it } from 'vitest';
import { TEMPLATE_PRESETS, referenceDesign } from '../data/templates';
import { mergeAllSplits } from './wallBulk';
import { area } from './geometry';
it('probe', () => {
  const raw = mergeAllSplits(referenceDesign()).design;
  const t0 = performance.now();
  for (const p of TEMPLATE_PRESETS) {
    const s = performance.now();
    const d = p.build();
    const before = p.id === 'reference' ? raw.rooms : [];
    console.log(p.id, Math.round(performance.now() - s) + 'ms', 'seps', d.separators?.length,
      d.rooms.map(r => `${r.name}:${area(r).toFixed(2)}`).join(' | '));
    if (before.length) console.log('OLD', before.map(r => `${r.name}:${area(r).toFixed(2)}`).join(' | '));
    if (p.id === 'reference') console.log(JSON.stringify(d.separators?.map(s => [s.a, s.b])));
  }
  console.log('total', performance.now() - t0);
});
