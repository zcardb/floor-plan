import { Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DRAG_STEP_OPTIONS, changeDragStep, dragStep } from '../model/dragStep';
import type { Design } from '../model/types';

/** 户型设置：画布上拖动墙、墙端点、家具与门窗时的步进。 */
export function DragStepSettings({ design, change }: { design: Design; change: (fn: (d: Design) => Design) => void }) {
  const step = dragStep(design);
  return <section>
    <h3 className="section-title"><Move size={15} />拖动步进</h3>
    <div className="north-presets" role="group" aria-label="拖动步进">
      {DRAG_STEP_OPTIONS.map(mm => <Button key={mm} type="button" size="sm" variant={step === mm ? 'default' : 'outline'}
        className="editor-action" aria-pressed={step === mm}
        onClick={() => { if (step !== mm) change(d => changeDragStep(d, mm)); }}>{mm / 10} cm</Button>)}
    </div>
    <p className="muted-note">拖动墙体、墙端点、家具和门窗时，位置与尺寸按此步进变化；吸附到墙或其他对象时以吸附为准。</p>
  </section>;
}
