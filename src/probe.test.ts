import { describe, expect, it } from 'vitest';
import { blankDesign } from '/workspace/thread/src/features/interior/data/templates';
import { createExportDocument } from '/workspace/thread/src/features/interior/model/drawingDocument';
describe('probe', () => {
  it('probe', () => {
    const d = blankDesign();
    d.furniture.push({ id: 's', type: 'stairs', name: '直跑楼梯', w: 1000, d: 4480, cx: 2000, cy: 2000, rot: 0, color: '#e6dccc', stair: { form: 'straight', flightWidth: 1000, steps: 16, flightLengths: [4480] } });
    const doc = createExportDocument(d);
    console.log('entities', doc.entities.map(e => `${e.kind}:${e.layer}:${e.group?.id}`).slice(0, 6));
    console.log('inserts', doc.inserts);
    expect(true).toBe(true);
  });
});
