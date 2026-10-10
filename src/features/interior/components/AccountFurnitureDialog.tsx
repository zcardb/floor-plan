import { useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import type { LibraryItem } from '../model/types';
import { categories } from '../data/catalog';
import { FurnitureVisual, hasViews } from './FurnitureVisual';
import { FurnitureAiDialog, defaultAdjustImage, type FurnitureAiResult } from './FurnitureAiDialog';
import { FurnitureFormFields } from './FurnitureFormFields';
import type { ModelSnapshot } from './FurnitureModelPreview';
import type { FurnitureView } from '../cloud/useFurnitureImage';
import { furnitureDraftOf, parseFurnitureDraft, previewFurnitureDraft, FURNITURE_DRAFT_ERROR, type FurnitureDraft } from '../model/furnitureDraft';
import { notify } from '@/lib/notify';

/** 表单里除单价外的字段是否改过（单价走账号默认价，单独比较）。 */
const fieldsChanged = (item: LibraryItem, next: Omit<LibraryItem, 'price'>) =>
  (['name', 'category', 'type', 'w', 'd', 'height', 'color'] as const).some(key => item[key] !== next[key]) || (item.shape || 'reference') !== (next.shape || 'reference')
  || JSON.stringify(item.model3d ?? null) !== JSON.stringify(next.model3d ?? null);

/**
 * 家具详情：表单项与「新建你的家具」一致。自定义家具所有项都可改，内置家具只能改账号默认单价。
 * 修改同步到使用该家具的项目；项目里单独改过的单价仍以项目为准。
 */
export function AccountFurnitureDialog({ item, isCustom, referencePrice, onOpenChange, onChanged, applyDefaultPrice, remove, saveGeometry, commitBusy = false, commitError = '', retryPrice, saved = false }: {
  commitBusy?: boolean; commitError?: string; retryPrice?: () => Promise<boolean>; saved?: boolean;
  saveGeometry?: (item: LibraryItem) => Promise<boolean>;
  applyDefaultPrice: (price: number | null) => Promise<boolean>;
  item: LibraryItem; isCustom: boolean; referencePrice: number | null;
  onOpenChange: (v: boolean) => void; onChanged: (next: LibraryItem | null) => void;
  remove: (catalogId: string) => Promise<boolean>;
}) {
  const initialPrice = item.price ?? referencePrice ?? null;
  const [draft, setDraft] = useState<FurnitureDraft>(() => furnitureDraftOf({ ...item, price: initialPrice }));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<FurnitureView>('top'), [adjusting, setAdjusting] = useState<{ seed: File | null } | null>(null);
  const snapshot = useRef<ModelSnapshot | null>(null);
  const editable = isCustom && !!saveGeometry;
  /** 视觉区跟随表单实时预览：参考符号与 3D 模型按当前草稿绘制，图片沿用已保存的。 */
  const display: LibraryItem = editable ? { ...item, ...previewFurnitureDraft(draft, { w: item.w, d: item.d, height: item.height || 700 }), name: draft.name.trim() || item.name } : item;
  /** 硬装只有 2D，一律按俯视图处理。 */
  const activeView: FurnitureView = hasViews(display) ? view : 'top';
  const canAdjust = editable && !retryPrice;
  const working = busy || commitBusy;
  const failure = commitError || error;
  const patch = (next: Partial<FurnitureDraft>) => { setError(''); setDraft(current => ({ ...current, ...next })); };

  /**
   * 应用 AI 结果：2D 写俯视图 imageUrl；3D 写 model3d（简易 3D 模型），
   * 画布 3D 场景与详情预览用的都是它，家具主色仍按表单里的颜色。不提交表单里其它未保存的修改。
   */
  const applyImage = async ({ url, model3d }: FurnitureAiResult) => {
    if (!saveGeometry) return false;
    const next: LibraryItem = activeView === 'top'
      ? { ...item, imageUrl: url }
      : { ...item, ...(model3d ? { model3d } : {}) };
    if (!(await saveGeometry(next))) return false;
    onChanged(next);
    return true;
  };
  /** 3D 既无 3D 效果图也无 2D 图时，用实时模型当前视角的截图作默认参考图。 */
  const openAdjust = async () => {
    const seed = activeView === 'perspective' && !defaultAdjustImage(item, 'perspective') ? await snapshot.current?.().catch(() => null) ?? null : null;
    setAdjusting({ seed });
  };

  const finish = async () => {
    if (working) return;
    const parsed = parseFurnitureDraft(draft);
    if (!parsed) { setError(FURNITURE_DRAFT_ERROR); notify.fail(FURNITURE_DRAFT_ERROR); return; }
    const { price, ...fields } = parsed;
    const next: LibraryItem = { ...item, ...fields };
    const changedFields = editable && fieldsChanged(item, next), changedPrice = price !== initialPrice;
    if (!changedFields && !changedPrice) { onOpenChange(false); return; }
    setBusy(true); setError('');
    try {
      if (changedFields && !(await saveGeometry!(next))) { setError('未能保存，本次修改已保留，请重试。'); return; }
      if (changedPrice && !retryPrice && !(await applyDefaultPrice(price))) { setError('单价未能保存，本次修改已保留，请重试。'); onChanged(next); return; }
      onChanged({ ...next, price });
      notify.success(`「${next.name}」已保存，使用它的项目会同步更新`);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
      notify.error(`「${next.name}」保存失败`, cause);
    } finally { setBusy(false); }
  };
  const retry = async () => {
    if (working || !retryPrice) return;
    setBusy(true); setError('');
    try { if (await retryPrice()) notify.success('「' + item.name + '」账号默认单价已保存'); else setError('未能保存，请重试。'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };
  const drop = async () => {
    if (working || retryPrice) return; setBusy(true); setError('');
    try { await remove(item.catalogId!); setConfirming(false); onChanged(null); onOpenChange(false); notify.success('已删除家具「' + item.name + '」'); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败，请重试'); setConfirming(false); notify.error('删除家具「' + item.name + '」失败', e); }
    finally { setBusy(false); }
  };

  const categoryField = <div className="custom-field">
    <Label htmlFor="furniture-category">分类</Label>
    <Select value={draft.category} onValueChange={category => patch({ category })} disabled={!editable || working}>
      <SelectTrigger id="furniture-category" className="h-9 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent position="popper" className="category-select-content">
        {[...new Set([draft.category, ...categories])].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;

  return <>
    <Dialog open onOpenChange={v => { if (!working) onOpenChange(v); }}>
      <DialogContent className="cms-detail-dialog furniture-detail-dialog" onEscapeKeyDown={event => { if (working) event.preventDefault(); }} onInteractOutside={event => { if (working) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{item.category} · {isCustom ? '自定义家具，所有项都可修改' : '内置家具，可设置账号默认单价'}。修改会同步到使用它的项目；项目里单独改过的单价以项目为准。</DialogDescription>
        </DialogHeader>
        <div className="furniture-detail-body">
          <FurnitureVisual item={display} view={view} onView={setView} snapshotRef={snapshot} onAdjust={canAdjust ? () => void openAdjust() : undefined} />
          <form id="furniture-detail-form" className="furniture-detail-side" onSubmit={e => { e.preventDefault(); void finish(); }}>
            <FurnitureFormFields draft={draft} onChange={patch} categoryField={categoryField} priceOnly={!editable} disabled={working || !!retryPrice}
              priceLabel="账号默认单价 · 元 / 件" priceHint="仅影响未单独调价的项目；项目内改价仍以项目为准。" />
            {failure && <div className="cost-save-error" role="alert"><span>{failure}</span>{retryPrice && <Button type="button" variant="outline" disabled={working} onClick={() => void retry()}>重试保存</Button>}</div>}
          </form>
        </div>
        <div className="cms-detail-actions furniture-detail-actions">
          <p className="cost-sync" role="status">{working ? '正在保存…' : saved && !failure ? '已保存并生效' : '点击完成即保存所有修改'}</p>
          {isCustom && <Button type="button" variant="ghost" className="cms-detail-action text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={working || !!retryPrice} onClick={() => setConfirming(true)}><Trash2 size={14} />删除家具</Button>}
          <Button type="button" variant="outline" className="cms-detail-action" disabled={working} onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" form="furniture-detail-form" className="cms-detail-action" disabled={working}>{working ? <><Loader2 size={14} className="animate-spin" />正在保存…</> : '完成'}</Button>
        </div>
      </DialogContent>
    </Dialog>
    {adjusting && saveGeometry && <FurnitureAiDialog item={display} view={activeView} seed={adjusting.seed} onClose={() => setAdjusting(null)} onApply={applyImage} />}
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{item.name}」？</AlertDialogTitle>
          <AlertDialogDescription>账号家具库中的该款式会被移除；已放置到项目中的家具不受影响。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={working} onClick={e => { e.preventDefault(); void drop(); }}>删除家具</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
