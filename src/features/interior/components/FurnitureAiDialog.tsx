import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { AiComposer, type AiComposerValue } from './AiComposer';
import { AiResults } from './AiResults';
import { VIEW_LABEL } from './FurnitureVisual';
import { readyFiles, readyImageUrls, uploadedImage, type AiFileRef, type AiImageDraft } from '../ai/referenceImages';
import { uploadReferenceImage } from '../ai/client';
import { useAiBatch } from '../ai/useAiBatch';
import { DEFAULT_AI_COUNT } from '../ai/useRoomAi';
import { DEFAULT_AI_ENGINE } from '../ai/models';
import { generateFurnitureImage, generateFurnitureModel, type FurnitureView } from '../cloud/useFurnitureImage';
import type { FurnitureModel3d } from '../model/furniture3d';
import { FurnitureModelPreview } from './FurnitureModelPreview';
import { formatMeters } from '../model/lengthUnits';
import type { LibraryItem } from '../model/types';

interface Request { description: string; images: string[]; files: AiFileRef[] }
/** 一个候选：2D 是一张图片；3D 是 AI 拼出的简易 3D 模型（url 仅作参考，可为空）。 */
export interface FurnitureAiResult { url: string; model3d?: FurnitureModel3d }

/** 默认需求：名称、尺寸与主色，用户可直接改。 */
export const defaultFurniturePrompt = (item: LibraryItem) =>
  `${item.name}，${formatMeters(item.w)} × ${formatMeters(item.d)}${item.height ? ` × ${formatMeters(item.height)}` : ''} m，主色 ${item.color}`;

/**
 * 默认带上的参考图：2D 用 2D 俯视图本身；3D 建模优先用已有的 3D 效果图，
 * 没有时退回 2D 俯视图（外形轮廓比参考几何的方块更有参考价值），不跨视角混用。
 */
export const defaultAdjustImage = (item: LibraryItem, view: FurnitureView) =>
  view === 'top' ? item.imageUrl : item.image3dUrl ?? item.imageUrl;

/**
 * 家具图片「AI 调整」：复用 AI 布局 / AI 创建的输入框与候选网格。
 * 默认把当前图片放进附件区（调整）；移除后即不参考原图（重新生成），界面不区分两种。
 */
export function FurnitureAiDialog({ item, view, seed, onClose, onApply }: {
  item: LibraryItem;
  view: FurnitureView;
  /** 当前视角没有图片时的默认素材（3D 为实时模型截图），打开后自动上传。 */
  seed?: File | null;
  onClose: () => void;
  /** 保存选中的结果（3D 存模型）；成功返回 true。 */
  onApply: (result: FurnitureAiResult) => Promise<boolean>;
}) {
  const [seedDraft] = useState<AiImageDraft | null>(() => !defaultAdjustImage(item, view) && seed
    ? { id: crypto.randomUUID(), preview: URL.createObjectURL(seed), uploading: true, kind: 'image', name: seed.name, ext: 'png' } : null);
  const [composer, setComposer] = useState<AiComposerValue>(() => {
    const original = defaultAdjustImage(item, view);
    const images = original ? [uploadedImage(original)] : seedDraft ? [seedDraft] : [];
    return { description: defaultFurniturePrompt(item), images, count: DEFAULT_AI_COUNT, engine: DEFAULT_AI_ENGINE };
  });
  useEffect(() => {
    if (!seedDraft || !seed) return;
    let alive = true;
    uploadReferenceImage(seed).then(
      url => { if (alive) setComposer(c => ({ ...c, images: c.images.map(image => image.id === seedDraft.id ? { ...image, url, uploading: false } : image) })); },
      cause => {
        if (!alive) return;
        setComposer(c => ({ ...c, images: c.images.filter(image => image.id !== seedDraft.id) }));
        notify.error('3D 模型截图上传失败，可手动添加参考图', cause);
      },
    );
    return () => { alive = false; };
  }, [seedDraft, seed]);
  const [mode, setMode] = useState<'input' | 'results'>('input'), [picked, setPicked] = useState<number | null>(null), [applying, setApplying] = useState(false);
  const ai = useAiBatch<Request, FurnitureAiResult>();
  const is3d = view === 'perspective';
  /** 每次发送 / 返回 / 关闭都换代：旧任务停止轮询，迟到结果丢弃。 */
  const generation = useRef(0), relaunch = useRef<(() => void) | null>(null);
  useEffect(() => () => { generation.current++; }, []);

  const send = () => {
    const description = composer.description.trim();
    if (!description) return;
    const request: Request = { description, images: readyImageUrls(composer.images), files: readyFiles(composer.images) };
    const count = composer.count;
    const launch = () => {
      const run = ++generation.current;
      ai.start(request, count, async (index) => {
        const requestId = crypto.randomUUID();
        // 3D 视角直接建模：AI 用基本体拼出家具外形，产物本身就是 3D 模型，不再是平面图。
        if (is3d) {
          const model3d = await generateFurnitureModel(item, {
            description: request.description, images: request.images, files: request.files,
            ...(composer.engine.kind === 'model' ? { model: composer.engine.id } : {}),
          });
          if (run !== generation.current) throw new Error('已停止生成');
          return { id: requestId, index, summary: `方案 ${index + 1}`, result: { url: '', model3d } };
        }
        const url = await generateFurnitureImage(item, { requestId, view, ...request }, () => run !== generation.current);
        if (!url) throw new Error('已停止生成');
        return { id: requestId, index, summary: `方案 ${index + 1}`, result: { url } };
      });
    };
    relaunch.current = launch;
    launch();
    setPicked(null);
    setMode('results');
  };
  const back = () => { if (ai.running) { generation.current++; ai.clear(); } setMode('input'); };
  const close = () => { generation.current++; onClose(); };
  const slots = ai.batch?.slots ?? [];
  const firstReady = slots.findIndex(slot => slot.status === 'ready');
  const selected = picked !== null && slots[picked]?.status === 'ready' ? picked : firstReady >= 0 ? firstReady : null;
  const chosen = selected === null ? undefined : slots[selected];
  const apply = async () => {
    if (chosen?.status !== 'ready' || applying) return;
    setApplying(true);
    try {
      if (await onApply(chosen.candidate.result)) { notify.success(`「${item.name}」${is3d ? '3D 模型' : VIEW_LABEL[view]}已更新`); close(); }
    } catch (cause) {
      notify.error(`「${item.name}」图片保存失败`, cause);
    } finally {
      setApplying(false);
    }
  };

  return <Dialog open onOpenChange={next => { if (!next && !applying) close(); }}>
    <DialogContent className="ai-dialog">
      <DialogHeader>
        <DialogTitle>AI 调整 · {item.name} · {VIEW_LABEL[view]}</DialogTitle>
        <DialogDescription>{is3d
          ? 'AI 用基本体拼出这件家具的简易 3D 模型：附上效果图或参考图能建模更准，应用后写入项目并同步到 3D 场景。'
          : '默认在当前 2D 俯视图基础上调整；移除附件中的原图即重新生成。预览后选择一张应用。'}</DialogDescription>
      </DialogHeader>
      {mode === 'results' && ai.batch
        ? <div className="ai-create-results">
          <AiResults
            echo={{ description: ai.batch.request.description, images: ai.batch.request.images, details: ai.batch.request.files.length ? `素材：${ai.batch.request.files.map(f => f.name).join('、')}` : undefined }}
            slots={slots}
            selected={selected}
            onSelect={setPicked}
            onRegenerate={() => { relaunch.current?.(); setPicked(null); }}
            onRetry={ai.retry}
            preview={candidate => is3d ? <Candidate3d item={item} model3d={candidate.result.model3d} compact /> : <img className="furniture-ai-candidate" src={candidate.result.url} crossOrigin="anonymous" alt={`${item.name}${candidate.summary}`} />}
            zoomPreview={is3d ? candidate => <Candidate3d item={item} model3d={candidate.result.model3d} /> : undefined}
            zoomLabel={is3d ? '3D 模型' : '图片'}
          />
          <div className="ai-dialog-actions">
            <Button type="button" variant="ghost" disabled={applying} onClick={back}><ArrowLeft />{ai.running ? '停止并返回修改' : '返回修改'}</Button>
            <span />
            <Button type="button" variant="outline" disabled={applying} onClick={close}>取消</Button>
            <Button type="button" loading={applying} disabled={chosen?.status !== 'ready'} onClick={() => void apply()}>{applying ? '正在保存…' : is3d ? '应用到 3D 模型' : '应用图片'}</Button>
          </div>
        </div>
        : <div className="ai-create-form">
          {ai.batch && <button type="button" className="ai-link" onClick={() => setMode('results')}>查看上一次的 {ai.batch.slots.length} 张图片</button>}
          <AiComposer
            value={composer}
            label="调整需求"
            hint="例如：换成胡桃木色、扶手改圆角；也可附上参考图或图纸、素材包。"
            placeholder={is3d ? '描述这件家具的造型细节，例如：白色面板、右侧旋钮、底部四个小支脚…' : '描述想怎么调整这件家具的外观…'}
            sendLabel={is3d ? '生成 3D 模型' : '生成图片'}
            showEngine={false}
            onDescription={description => setComposer(c => ({ ...c, description }))}
            onImages={fn => setComposer(c => ({ ...c, images: fn(c.images) }))}
            onCount={count => setComposer(c => ({ ...c, count }))}
            onEngine={engine => setComposer(c => ({ ...c, engine }))}
            onSend={send}
          />
        </div>}
    </DialogContent>
  </Dialog>;
}

/** 3D 候选：直接渲染 AI 拼好的 3D 模型，与项目 3D 场景是同一套几何。 */
function Candidate3d({ item, model3d, compact = false }: { item: LibraryItem; model3d?: FurnitureModel3d; compact?: boolean }) {
  return <div className="furniture-ai-candidate-3d">
    <FurnitureModelPreview item={{ ...item, model3d }} compact={compact} />
  </div>;
}
