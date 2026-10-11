import { DRAG_STEP_OPTIONS, changeDragStep, dragStep } from '../model/dragStep';
import type { Design } from '../model/types';
import { PanelSegmented } from './PanelSegmented';

/** 户型设置：画布上拖动墙、墙端点、家具与门窗时的步进。 */
export function DragStepSettings({ design, change }: { design: Design; change: (fn: (d: Design) => Design) => void }) {
  const step = dragStep(design);
  return <section>
    <h3 className="section-title">拖动步进</h3>
    <PanelSegmented label="拖动步进" value={step} onChange={mm => change(d => changeDragStep(d, mm))}
      options={DRAG_STEP_OPTIONS.map(mm => ({ value: mm, label: `${mm / 10} cm` }))} />
    <p className="muted-note">拖动墙体、墙端点、家具和门窗时，位置与尺寸按此步进变化；吸附到墙或其他对象时以吸附为准。</p>
  </section>;
}
