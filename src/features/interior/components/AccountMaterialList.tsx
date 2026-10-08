import { DoorOpen, PanelsTopLeft, Plus } from 'lucide-react';

type Item = { key: string; name: string; meta: string; color?: string; kind?: 'door' | 'window'; pick: () => void };

/** 项目内「账号家具库」标签中的账号墙面 / 门窗列表，点击即加入当前项目。 */
export function AccountMaterialList({ title, items, error }: { title: string; items: Item[]; error?: string }) {
  if (!items.length && !error) return null;
  return <>
    {items.length > 0 && <><p className="muted-note">{items.length} 款 · {title}</p><div className="account-floor-list">{items.map(item => {
      const Icon = item.kind === 'door' ? DoorOpen : PanelsTopLeft;
      return <button key={item.key} type="button" onClick={item.pick}>
        {item.color ? <span className="account-material-chip" style={{ background: item.color }} aria-hidden="true" /> : <span className="account-material-chip" aria-hidden="true"><Icon size={18} /></span>}
        <span>{item.name}<small>{item.meta}</small></span><Plus size={14} />
      </button>;
    })}</div></>}
    {error && <p className="form-error">{error}</p>}
  </>;
}
