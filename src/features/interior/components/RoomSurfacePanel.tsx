import { pickableSurfaces, applyRoomCeiling, applyRoomRoof, applyRoomWall } from '../model/hardMaterials';
import { priceOf, type PriceGroup } from '../model/costs';
import type { CustomWall, Design } from '../model/types';
import { RoofSlopeInput, type RoomSurfaceProps } from './RoomSurfaceFields';
import { runSurfaceChange } from './runSurfaceChange';
import { cardPrice } from '../model/priceLabel';

type Props = RoomSurfaceProps & { showCosts: boolean; accountWalls: CustomWall[] };
type Card = { key: string | null; name: string; color?: string; fromAccount?: boolean; price?: number | null };

function SurfaceGrid({ cards, value, showCosts, onPick }: { cards: Card[]; value: string | null; showCosts: boolean; onPick: (key: string | null) => void }) {
  return <div className="material-grid">
    {cards.map(card => (
      <button key={card.key ?? 'none'} className={'material-card ' + (card.key === value ? 'active' : '')} onClick={() => onPick(card.key)}>
        <span className={'material-swatch' + (card.color ? '' : ' material-swatch-empty')} style={card.color ? { background: card.color } : undefined} />
        <span>
          {card.name}
          {card.fromAccount && <em className="material-source">账号库</em>}
          {showCosts && card.key && <small>{cardPrice(card.price, 'm²')}</small>}
        </span>
      </button>
    ))}
  </div>;
}

/** 右侧房间属性里的墙面 / 屋面 / 吊顶卡片，与「地面材质」同样的选择方式；没有屋面时不展示吊顶。 */
export function RoomSurfacePanel({ design, room, change, accountWalls, accountRoofs, accountCeilings, showCosts }: Props) {
  const cards = (kind: 'wall' | 'roof' | 'ceiling', group: PriceGroup, account: CustomWall[]): Card[] =>
    pickableSurfaces(design, kind, account).map(({ key, name, material, fromAccount }) => ({
      key, name, color: material.color, fromAccount, price: fromAccount ? material.price : priceOf(design as Design, group, key),
    }));
  return <>
    <section>
      <h3 className="section-title">墙面材质</h3>
      <SurfaceGrid cards={cards('wall', 'wallPrices', accountWalls)} value={room.wallMat || 'paint'} showCosts={showCosts}
        onPick={key => key && runSurfaceChange(change, d => applyRoomWall(d, room.id, key, accountWalls), '墙面设置失败')} />
    </section>
    <section>
      <h3 className="section-title">屋面</h3>
      <SurfaceGrid cards={[{ key: null, name: '无屋面' }, ...cards('roof', 'roofPrices', accountRoofs)]} value={room.roofMat ?? null} showCosts={showCosts}
        onPick={key => runSurfaceChange(change, d => applyRoomRoof(d, room.id, key, accountRoofs), '屋面设置失败')} />
      {room.roofMat && <RoofSlopeInput key={room.id + ':' + (room.roofSlope ?? 0)} className="editor-field room-roof-slope" room={room} change={change} />}
    </section>
    {room.roofMat && <section>
      <h3 className="section-title">吊顶</h3>
      <SurfaceGrid cards={[{ key: null, name: '原顶（无吊顶）' }, ...cards('ceiling', 'ceilingPrices', accountCeilings)]} value={room.ceilingMat ?? null} showCosts={showCosts}
        onPick={key => runSurfaceChange(change, d => applyRoomCeiling(d, room.id, key, accountCeilings), '吊顶设置失败')} />
    </section>}
  </>;
}
