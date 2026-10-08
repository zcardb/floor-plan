import { useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DXF_UNITS, type DxfSource, type DxfUnit } from '../model/externalDxf/dxfSource';
import { guessRoles, LAYER_ROLES, recognizeDxf, type LayerRole, type Recognition } from '../model/externalDxf/recognize';
import type { Design } from '../model/types';
import { DxfImportPreview } from './DxfImportPreview';

/** 外部 CAD 图纸的识别确认：指定图层角色与单位，预览识别结果后再生成项目。 */
export function DxfImportDialog({ source, defaultName, pending, onImport, onClose }: {
  source: DxfSource; defaultName: string; pending: boolean; onImport: (design: Design, name: string) => void; onClose: () => void;
}) {
  const [roles, setRoles] = useState(() => guessRoles(source.layers.map(l => l.name)));
  const [unit, setUnit] = useState<DxfUnit>(source.unit);
  const [name, setName] = useState(defaultName);
  const outcome = useMemo<{ result: Recognition | null; error: string }>(() => {
    try { return { result: recognizeDxf(source.segments, { roles, unit }), error: '' }; }
    catch (e) { return { result: null, error: e instanceof Error ? e.message : '图纸无法识别' }; }
  }, [source, roles, unit]);
  const { result, error } = outcome;
  const stats = result?.stats;
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="dxf-import-dialog">
      <DialogHeader>
        <DialogTitle>识别 CAD 图纸</DialogTitle>
        <DialogDescription>指定哪些图层是墙体和门窗，确认单位后生成可编辑的户型。家具、文字和标注不会导入。</DialogDescription>
      </DialogHeader>
      <div className="dxf-import-body">
        <section className="dxf-import-figure" aria-label="识别预览">
          <DxfImportPreview source={source} roles={roles} unit={unit} result={result} />
          <ul className="dxf-import-legend" aria-hidden="true">
            <li className="is-wall">墙体</li><li className="is-door">门</li><li className="is-window">窗</li><li className="is-source">图纸原线</li>
          </ul>
        </section>
        <fieldset className="dxf-import-form" disabled={pending}>
          <div className="cms-field"><Label htmlFor="dxf-import-name">项目名称</Label><Input id="dxf-import-name" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="cms-field">
            <Label htmlFor="dxf-import-unit">图纸单位</Label>
            <Select value={unit} onValueChange={v => setUnit(v as DxfUnit)} disabled={pending}>
              <SelectTrigger id="dxf-import-unit"><SelectValue /></SelectTrigger>
              <SelectContent>{DXF_UNITS.map(u => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="dxf-import-hint">{source.unitDetected ? '已按图纸里写明的单位设置。' : '图纸没有写明单位，已按尺寸范围推测，请核对。'}</p>
          </div>
          <div className="cms-field">
            <span className="dxf-import-label">图层（{source.layers.length}）</span>
            <ul className="dxf-import-layers">{source.layers.map((layer, i) => <li key={layer.name}>
              <span className="dxf-import-layer-name" title={layer.name}>{layer.name}<small>{layer.count} 条线</small></span>
              <Select value={roles[layer.name]} onValueChange={v => setRoles(r => ({ ...r, [layer.name]: v as LayerRole }))} disabled={pending}>
                <SelectTrigger aria-label={'图层 ' + layer.name + ' 的用途'} id={'dxf-import-layer-' + i}><SelectValue /></SelectTrigger>
                <SelectContent>{LAYER_ROLES.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </li>)}</ul>
          </div>
          {stats && <dl className="dxf-import-stats">
            <div><dt>墙体</dt><dd>{stats.walls}</dd></div><div><dt>门</dt><dd>{stats.doors}</dd></div>
            <div><dt>窗</dt><dd>{stats.windows}</dd></div><div><dt>房间</dt><dd>{stats.rooms}</dd></div>
          </dl>}
          {error && <p role="alert" className="dxf-import-error"><TriangleAlert size={14} />{error}</p>}
          {result?.warnings.map(w => <p key={w} className="dxf-import-warning"><TriangleAlert size={14} />{w}</p>)}
        </fieldset>
      </div>
      <DialogFooter className="dxf-import-footer">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button>
        <Button type="button" loading={pending} disabled={!result || !name.trim() || pending} onClick={() => { if (result) onImport(result.design, name.trim()); }}>{pending ? '正在导入…' : '导入户型'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
