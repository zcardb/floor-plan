import { useContext, useState } from 'react';
import { notify } from '@/lib/notify';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { effectiveCostDesign, priceSource, restorePrice, type AccountCostSettings } from '../model/costDefaults';
import { priceOf, setPrice, type PriceGroup } from '../model/costs';
import type { Design } from '../model/types';
import { AccountCostSaveContext, CostDefaultsContext } from './CostDefaultsContext';
import { PriceInput } from './PriceInput';

/** 账号库里该价格是否已定价（null / 未设置都算未定价）。 */
const accountPriced = (defaults: AccountCostSettings, group: PriceGroup, key: string) =>
  defaults[group]?.[key] !== undefined && defaults[group]?.[key] !== null;

/**
 * 项目内统一改价入口：来源标签、恢复账号默认、同步到账号库（账号库未定价时默认勾选）。
 * 勾选同步时：账号默认价乐观更新、项目改为继承它，回车即见新价，云端在后台写入；
 * 云端没写成则账号默认价自动回滚，这次输入改为本项目单价保留下来，并提示同步失败。
 */
export function PriceField({ design, group, priceKey, name, unit, change }: {
  design: Design; group: PriceGroup; priceKey: string; name: string; unit: string;
  change: (fn: (d: Design) => Design) => void;
}) {
  const defaults = useContext(CostDefaultsContext), saveAccount = useContext(AccountCostSaveContext);
  const [sync, setSync] = useState(() => !accountPriced(defaults, group, priceKey));
  const value = priceOf(effectiveCostDesign(design, defaults), group, priceKey);
  const source = priceSource(design, defaults, group, priceKey);
  const syncing = !!saveAccount && sync;
  const apply = async (price: number | null) => {
    if (syncing) {
      const effective = effectiveCostDesign(design, defaults).costSettings;
      const next: AccountCostSettings = { ...defaults, [group]: { ...defaults[group], [priceKey]: price } };
      // 地面价格以采购单位计价，同步时一并写入采购规格，避免账号库单位与单价错配。
      if (group === 'floorPrices') next.procurement = { ...defaults.procurement, [priceKey]: effective?.procurement?.[priceKey] || { unit: 'm²', waste: 5 } };
      const saved = saveAccount(next);
      change(d => restorePrice(d, group, priceKey));
      if (await saved) return;
      change(d => setPrice(d, group, priceKey, price, defaults));
      notify.fail(`「${name}」同步到账号库失败，已只在本项目生效`);
      return false;
    }
    change(d => setPrice(d, group, priceKey, price, defaults));
  };
  return <div className="price-field">
    <div className="price-field-meta">
      <span>元 / {unit}</span>
      <span className="price-field-source">
        <span className={'price-source-tag' + (source === '项目覆盖' ? ' is-override' : '')}>{source}</span>
        {source === '项目覆盖' && saveAccount && <EditorTooltip label="删除本项目单价，改用账号默认价">
          <button type="button" className="price-restore" onClick={() => { change(d => restorePrice(d, group, priceKey)); notify.success(`「${name}」已恢复账号默认价`); }}>恢复账号默认</button>
        </EditorTooltip>}
      </span>
    </div>
    {saveAccount && <label className="price-sync-option">
      <input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)}/>
      同步到账号库{accountPriced(defaults, group, priceKey) ? '' : '（账号库未定价）'}
    </label>}
    <PriceInput key={group + priceKey + String(value)} value={value} label={name + '单价'} applyLabel={syncing ? '应用并同步' : '应用'} onApply={apply}/>
    <p className="footnote">{syncing ? '将同时更新账号默认价，所有未单独调价的项目随之变化。' : '仅修改当前项目，项目内同款 / 同材质对象联动。'}</p>
  </div>;
}
