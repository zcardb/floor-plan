import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpToLine,
  ArrowDownToLine,
  RotateCw,
  Copy,
  Trash2,
  ChevronRight,
  Info,
  LayoutGrid,
  Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { materials } from "../data/catalog";
import {
  area,
  bbox,
  inRoom,
  length,
  norm,
  perim,
  rebuildRooms,
  resizeBlank,
} from "../model/geometry";
import type { Design, Selection } from "../model/types";
import { Button } from "@/components/ui/button";
interface Props {
  design: Design;
  selection: Selection;
  select: (s: Selection) => void;
  change: (fn: (d: Design) => Design) => void;
  duplicate: () => void;
  remove: () => void;
  rotate: () => void;
}
export function PropertyPanel({
  design: d,
  selection: s,
  select,
  change,
  duplicate,
  remove,
  rotate,
}: Props) {
  const [tab, setTab] = useState("overview");
  const f =
      s?.kind === "furniture" ? d.furniture.find((f) => f.id === s.id) : null,
    r = s?.kind === "room" ? d.rooms.find((r) => r.id === s.id) : null,
    w = s?.kind === "wall" ? d.walls.find((w) => w.id === s.id) : null,
    o = s?.kind === "opening" ? d.openings.find((o) => o.id === s.id) : null;
  const input = (
    label: string,
    value: number,
    update: (v: number) => void,
    min = -100000,
    max = 100000,
  ) => (
    <label className="property-field">
      {label}
      <input
        type="number"
        key={label + value}
        defaultValue={Math.round(value)}
        min={min}
        max={max}
        step={10}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (e.target.value && Number.isFinite(v) && v >= min && v <= max)
            update(v);
          else {
            e.target.value = String(value);
            toast.error("请输入允许范围内的有效数值");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
  const rename = (value: string, update: (v: string) => void) => (
    <label className="property-field full">
      名称
      <input
        key={value}
        defaultValue={value}
        maxLength={100}
        onBlur={(e) => {
          if (e.target.value.trim()) update(e.target.value.trim());
        }}
      />
    </label>
  );
  const matGrid = (value: string, update: (v: string) => void) => (
    <div className="material-grid">
      {Object.entries(materials).map(([key, m]) => (
        <button
          key={key}
          className={"material-card " + (key === value ? "active" : "")}
          onClick={() => update(key)}
        >
          <span className="material-swatch" style={{ background: m.color }} />
          <span>
            {m.name}
            <small>¥{m.price} / m²</small>
          </span>
        </button>
      ))}
    </div>
  );
  const back = (
    <button className="back-link" onClick={() => select(null)}>
      <ArrowLeft size={14} />
      返回方案总览
    </button>
  );
  const total = d.rooms
      .filter((r) => r.counted !== false)
      .reduce((a, r) => a + area(r), 0),
    cost = d.rooms.reduce(
      (sum, r) => sum + area(r) * materials[r.mat].price * 1.05,
      0,
    );
  if (f)
    return (
      <>
        <div className="panel-heading">
          <span>家具属性</span>
          <span className="mini-label">选中对象</span>
        </div>
        <section>
          {back}
          <div className="object-title">
            <span className="object-symbol">
              <LayoutGrid size={22} />
            </span>
            <div>
              <h3>{f.name}</h3>
              <small>
                {f.w} × {f.d} mm
              </small>
            </div>
          </div>
          <div className="property-form">
            {rename(f.name, (v) =>
              change((d) => ({
                ...d,
                furniture: d.furniture.map((g) =>
                  g.id === f.id ? { ...g, name: v } : g,
                ),
              })),
            )}
            {(["w", "d", "cx", "cy", "rot"] as const).map((key, i) =>
              input(
                [
                  "宽度 / mm",
                  "深度 / mm",
                  "中心 X / mm",
                  "中心 Y / mm",
                  "旋转 / °",
                ][i],
                f[key],
                (v) =>
                  change((d) => ({
                    ...d,
                    furniture: d.furniture.map((g) =>
                      g.id === f.id
                        ? { ...g, [key]: key === "rot" ? norm(v) : v }
                        : g,
                    ),
                  })),
                key === "w" || key === "d" ? 50 : -100000,
                key === "w" || key === "d" ? 20000 : 100000,
              ),
            )}
            <label className="property-field">
              家具颜色
              <input
                type="color"
                value={f.color}
                onChange={(e) =>
                  change((d) => ({
                    ...d,
                    furniture: d.furniture.map((g) =>
                      g.id === f.id ? { ...g, color: e.target.value } : g,
                    ),
                  }))
                }
              />
            </label>
          </div>
          <div className="property-actions">
            <Button size="sm" variant="outline" onClick={rotate}>
              <RotateCw />
              旋转
            </Button>
            <Button size="sm" variant="outline" onClick={duplicate}>
              <Copy />
              复制
            </Button>
            <Button size="sm" variant="outline" onClick={remove}>
              <Trash2 />
              删除
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                change((d) => ({
                  ...d,
                  furniture: [...d.furniture.filter((g) => g.id !== f.id), f],
                }))
              }
            >
              <ArrowUpToLine />
              置顶
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                change((d) => ({
                  ...d,
                  furniture: [f, ...d.furniture.filter((g) => g.id !== f.id)],
                }))
              }
            >
              <ArrowDownToLine />
              置底
            </Button>
          </div>
        </section>
        <div className="panel-note">
          <Info size={15} />
          <p>
            拖动家具移动；顶部圆点旋转，右下方块改变尺寸。
            <br />
            占地面积 {((f.w * f.d) / 1e6).toFixed(2)} m²
          </p>
        </div>
      </>
    );
  if (r) {
    const b = bbox(r.rings[0]),
      inside = d.furniture.filter((f) => inRoom([f.cx, f.cy], r));
    return (
      <>
        <div className="panel-heading">
          <span>房间属性</span>
          <span className="mini-label">地面与尺寸</span>
        </div>
        <section>
          {back}
          <h3 className="section-title">{r.name}</h3>
          <div className="property-form">
            {rename(r.name, (v) =>
              change((d) => ({
                ...d,
                rooms: d.rooms.map((g) =>
                  g.id === r.id ? { ...g, name: v } : g,
                ),
              })),
            )}
          </div>
          <div className="stat-grid">
            <div>
              <small>净使用面积</small>
              <b>
                {area(r).toFixed(2)}
                <em>m²</em>
              </b>
            </div>
            <div>
              <small>房间周长</small>
              <b>
                {perim(r).toFixed(1)}
                <em>m</em>
              </b>
            </div>
            <div>
              <small>开间</small>
              <b>
                {Math.round(b.x2 - b.x)}
                <em>mm</em>
              </b>
            </div>
            <div>
              <small>进深</small>
              <b>
                {Math.round(b.y2 - b.y)}
                <em>mm</em>
              </b>
            </div>
          </div>
        </section>
        <section>
          <h3 className="section-title">地面材质</h3>
          {matGrid(r.mat, (v) =>
            change((d) => ({
              ...d,
              rooms: d.rooms.map((g) => (g.id === r.id ? { ...g, mat: v } : g)),
            })),
          )}
          <div className="estimate-line">
            <span>含 5% 损耗</span>
            <b>
              ¥
              {Math.round(
                area(r) * materials[r.mat].price * 1.05,
              ).toLocaleString()}
            </b>
          </div>
        </section>
        <section>
          <h3 className="section-title">
            房间内家具 <small>{inside.length} 件</small>
          </h3>
          {inside.map((f) => (
            <button
              key={f.id}
              className="room-row"
              onClick={() => select({ kind: "furniture", id: f.id })}
            >
              {f.name}
              <ChevronRight size={14} />
            </button>
          ))}
          {!inside.length && (
            <p className="muted-note">从左侧家具库为房间添加家具。</p>
          )}
        </section>
      </>
    );
  }
  if (w) {
    const editable = d.template === "blank" && w.kind === "partition";
    return (
      <>
        <div className="panel-heading">
          <span>墙体属性</span>
          <span className="mini-label">
            {w.kind === "bearing"
              ? "承重墙"
              : w.kind === "exterior"
                ? "外围墙"
                : "隔墙"}
          </span>
        </div>
        <section>
          {back}
          <h3 className="section-title">
            {editable ? "可编辑内部墙体" : "原始建筑墙体"}
          </h3>
          <div className="property-form">
            {input(
              "长度 / mm",
              length(w),
              (v) =>
                change((d) => {
                  const wall = d.walls.find((g) => g.id === w.id)!,
                    L = length(wall),
                    next = {
                      ...wall,
                      b: [
                        wall.a[0] + ((wall.b[0] - wall.a[0]) * v) / L,
                        wall.a[1] + ((wall.b[1] - wall.a[1]) * v) / L,
                      ] as [number, number],
                    };
                  if (!editable) return d;
                  if (
                    d.openings.some(
                      (o) => o.wallId === w.id && o.offset + o.width / 2 > v,
                    )
                  ) {
                    toast.error("墙体缩短后无法容纳已有门窗");
                    return d;
                  }
                  return rebuildRooms({
                    ...d,
                    walls: d.walls.map((g) => (g.id === w.id ? next : g)),
                  });
                }),
              100,
              50000,
            )}
            {input(
              "墙厚 / mm",
              w.thickness,
              (v) =>
                change((d) =>
                  editable
                    ? rebuildRooms({
                        ...d,
                        walls: d.walls.map((g) =>
                          g.id === w.id ? { ...g, thickness: v } : g,
                        ),
                      })
                    : d,
                ),
              50,
              1000,
            )}
          </div>
          {editable && (
            <Button variant="outline" size="sm" onClick={remove}>
              <Trash2 />
              删除隔墙
            </Button>
          )}
          <p className="muted-note">
            {editable
              ? "拖动墙体移动，拖动两端圆点调整长度。封闭隔墙将自动划分房间。"
              : "参考户型原始外墙和承重结构不支持编辑。空白户型的外围尺寸可在户型设置中调整。"}
          </p>
        </section>
        <div className="panel-note">
          <Info size={15} />
          <p>此工具仅用于设计示意，实际墙体拆改须由专业人员评估。</p>
        </div>
      </>
    );
  }
  if (o) {
    const wall = d.walls.find((w) => w.id === o.wallId)!;
    const upd = (key: "offset" | "width", v: number) =>
      change((d) => {
        const next = { ...o, [key]: v };
        if (
          next.offset - next.width / 2 < 0 ||
          next.offset + next.width / 2 > length(wall) ||
          d.openings.some(
            (g) =>
              g.id !== o.id &&
              g.wallId === o.wallId &&
              Math.abs(g.offset - next.offset) < (g.width + next.width) / 2,
          )
        ) {
          toast.error("开口超出墙段范围或与其它门窗重叠");
          return d;
        }
        return {
          ...d,
          openings: d.openings.map((g) => (g.id === o.id ? next : g)),
        };
      });
    return (
      <>
        <div className="panel-heading">
          <span>{o.kind === "door" ? "门" : "窗"}属性</span>
        </div>
        <section>
          {back}
          <div className="property-form">
            {input("宽度 / mm", o.width, (v) => upd("width", v), 100, 10000)}
            {input(
              "沿墙位置 / mm",
              o.offset,
              (v) => upd("offset", v),
              0,
              50000,
            )}
          </div>
          <Button variant="outline" size="sm" onClick={remove}>
            <Trash2 />
            删除开口
          </Button>
        </section>
      </>
    );
  }
  return (
    <>
      <div className="panel-tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          方案总览
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          户型设置
        </button>
      </div>
      {tab === "settings" ? (
        <>
          <section>
            <h3 className="section-title">
              <Ruler size={15} />
              户型尺寸
            </h3>
            <p className="muted-note">
              {d.template === "blank"
                ? "尺寸为墙内净尺寸，外围墙随参数自动更新。"
                : "参考户型保留原始几何。如需绘制户型，请新建空白项目。"}
            </p>
            <div className="property-form">
              {input(
                "净宽 / mm",
                d.width,
                (v) => {
                  if (d.template !== "blank") return;
                  const outside =
                    d.furniture.some((f) => f.cx > v) ||
                    d.walls.some(
                      (w) =>
                        w.kind === "partition" && Math.max(w.a[0], w.b[0]) > v,
                    );
                  if (
                    outside &&
                    !window.confirm(
                      "缩小后部分对象将位于室外，仍保留这些对象并继续？",
                    )
                  )
                    return;
                  change((d) => resizeBlank(d, v, d.depth, d.thickness));
                },
                500,
                50000,
              )}
              {input(
                "净深 / mm",
                d.depth,
                (v) => {
                  if (d.template !== "blank") return;
                  const outside =
                    d.furniture.some((f) => f.cy > v) ||
                    d.walls.some(
                      (w) =>
                        w.kind === "partition" && Math.max(w.a[1], w.b[1]) > v,
                    );
                  if (
                    outside &&
                    !window.confirm(
                      "缩小后部分对象将位于室外，仍保留这些对象并继续？",
                    )
                  )
                    return;
                  change((d) => resizeBlank(d, d.width, v, d.thickness));
                },
                500,
                50000,
              )}
              {input(
                "外围墙厚 / mm",
                d.thickness,
                (v) => {
                  if (d.template === "blank")
                    change((d) => resizeBlank(d, d.width, d.depth, v));
                },
                50,
                1000,
              )}
              {input(
                "层高 / mm",
                d.height,
                (v) => change((d) => ({ ...d, height: v })),
                1000,
                8000,
              )}
            </div>
          </section>
          <section>
            <h3 className="section-title">操作说明</h3>
            <div className="shortcut-list">
              <kbd>V</kbd>
              <span>选择 / 移动</span>
              <kbd>M</kbd>
              <span>测量距离</span>
              <kbd>R</kbd>
              <span>旋转家具 90°</span>
              <kbd>Ctrl Z</kbd>
              <span>撤销更改</span>
              <kbd>Ctrl D</kbd>
              <span>复制家具</span>
              <kbd>T</kbd>
              <span>2D / 3D 切换</span>
              <kbd>F</kbd>
              <span>适应窗口</span>
            </div>
          </section>
        </>
      ) : (
        <>
          <section>
            <div className="overview-top">
              <span>空间，恰到好处。</span>
              <LayoutGrid size={17} />
            </div>
            <div className="area-hero">
              <strong>{total.toFixed(2)}</strong>
              <span>m²</span>
            </div>
            <p className="area-description">
              套内净使用面积{" "}
              <span>
                · {d.rooms.filter((r) => r.counted !== false).length} 个空间
              </span>
            </p>
            <div className="small-stats">
              <span>
                家具 <b>{d.furniture.length} 件</b>
              </span>
              <span>
                层高 <b>{(d.height / 1000).toFixed(1)} m</b>
              </span>
            </div>
          </section>
          <section>
            <h3 className="section-title">
              房间面积 <small>点击编辑</small>
            </h3>
            <div className="room-table">
              {d.rooms.map((r) => (
                <button
                  key={r.id}
                  className="room-row"
                  onClick={() => select({ kind: "room", id: r.id })}
                >
                  <span>
                    <i style={{ background: materials[r.mat].color }} />
                    {r.name}
                    {r.counted === false ? " *" : ""}
                  </span>
                  <span>
                    {area(r).toFixed(2)}
                    <small> m²</small>
                    <ChevronRight size={13} />
                  </span>
                </button>
              ))}
            </div>
            <p className="footnote">按墙内净尺寸计算；* 飘窗不计入使用面积。</p>
          </section>
          <section>
            <h3 className="section-title">
              地面材料估算<span className="soft-badge">含 5% 损耗</span>
            </h3>
            <div className="cost-list">
              {Object.entries(materials).map(([key, m]) => {
                const a = d.rooms
                  .filter((r) => r.mat === key)
                  .reduce((s, r) => s + area(r), 0);
                return (
                  a > 0 && (
                    <div key={key}>
                      <span>
                        <i style={{ background: m.color }} />
                        {m.name}
                        <small>{a.toFixed(1)} m²</small>
                      </span>
                      <b>¥{Math.round(a * m.price * 1.05).toLocaleString()}</b>
                    </div>
                  )
                );
              })}
            </div>
            <div className="budget-total">
              <small>地面材料参考合计</small>
              <strong>
                <span>¥</span>
                {Math.round(cost).toLocaleString()}
              </strong>
            </div>
            <p className="footnote">仅包含地面材料，不含人工及其他装修费用。</p>
          </section>
          <div className="panel-note">
            <Info size={15} />
            <p>选择房间更换地面材质，选择家具调整尺寸，设计与估算实时同步。</p>
          </div>
        </>
      )}
    </>
  );
}
