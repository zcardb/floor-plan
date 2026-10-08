import { area } from "../model/geometry";
import type { Room } from "../model/types";

/** 房间快捷切换：点击后 3D 飞到该房间、2D 选中该房间。"all" 代表全屋。 */
export function RoomList({
  rooms,
  active,
  onPick,
}: {
  rooms: Room[];
  active: string | null;
  onPick: (id: string) => void;
}) {
  const counted = rooms.filter((r) => r.counted !== false && area(r) > 0);
  if (!counted.length) return null;
  const total = counted.reduce((s, r) => s + area(r), 0);
  const items = [
    ...counted.map((r) => ({ id: r.id, name: r.name, size: area(r) })),
    { id: "all", name: "全屋", size: total },
  ];
  return (
    <div className="room-list">
      <div className="room-list-heading">房间 · 点击飞到该房间</div>
      <div className="room-list-grid">
        {items.map((it) => (
          <button
            key={it.id}
            className={active === it.id ? "active" : ""}
            onClick={() => onPick(it.id)}
            aria-label={"切换到" + it.name}
          >
            <b>{it.name}</b>
            <small>{it.size.toFixed(2)} m²</small>
          </button>
        ))}
      </div>
    </div>
  );
}
