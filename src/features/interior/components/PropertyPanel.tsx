import { useState } from "react";
import { Input } from '@/components/ui/input';
import { EditorTooltip } from '@/components/ui/editor-tooltip';
import { formatMeters, meterDraft, parseMeterDraft, toMeters } from '../model/lengthUnits';
import { changeDoorOrientation } from '../model/doorOrientation';
import { DoorOrientationControls } from './DoorOrientationControls';
import {
  ArrowLeft,
  ArrowUpToLine,
  ArrowDownToLine,
  BrickWall,
  Copy,
  DoorOpen,
  Trash2,
  ChevronRight,
  LayoutGrid,
  Ruler,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { applyRoomFloor, floorMaterialOf, pickableFloors } from "../model/floorMaterials";
import { furnitureKey, priceOf } from "../model/costs";
import { PriceField } from "./PriceField";
import { selectionCost } from "../model/costBreakdown";
import { yuan } from "../model/money";
import { useCostDesign } from './CostDefaultsContext';
import { SizeFields } from './SizeFields';
import { WallOptionsMenu } from './WallOptionsMenu';
import { canEditWall, canResizeWall, wallKindName } from '../model/wallPolicy';
import { DimensionSettings } from './DimensionSettings';
import { NorthSettings } from './NorthSettings';
import type { SizeTransaction } from '../model/sizeTransaction';
import { area, bbox, inRoom, length, perim, resizeBlank } from "../model/geometry";
import type { CustomFloor, CustomOpening, CustomWall, Design, Selection } from "../model/types";
import { openingName, openingPriceKey } from "../model/hardMaterials";
import { OpeningVariantSelect } from "./OpeningVariantSelect";
import { RoomSurfacePanel } from "./RoomSurfacePanel";
import { RoomSidesDiagram } from "./RoomSidesDiagram";
import { roomSides } from "../model/roomSides";
import { cardPrice } from "../model/priceLabel";
import { ColorSwatches } from "./ColorSwatches";
import { PanelHint, ShortcutList } from "./PanelHint";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
interface Props {
  design: Design;
  selection: Selection;
  select: (s: Selection) => void;
  change: (fn: (d: Design) => Design) => void;
  duplicate: () => void;
  remove: () => void;
  rotate: () => void;
  showCosts: boolean;
  transaction: SizeTransaction;
  /** 账号地面库；未加入项目的地面也可直接选择，选中后自动加入项目。 */
  accountFloors?: CustomFloor[];
  accountOpenings?: CustomOpening[];
  /** 账号墙面库、屋面库、吊顶库；选用后自动加入项目。 */
  accountWalls?: CustomWall[];
  accountRoofs?: CustomWall[];
  accountCeilings?: CustomWall[];
  splitWall?: (wallId: string) => void;
  mergeWall?: (wallId: string) => void;
  /** 删除墙体（由外观层复用同一实现，见 WallOptionsMenu）。 */
  removeWall?: (wallId: string) => void;
  /** 切到成本页；成本页口径跟随当前选中对象。 */
  openCosts: () => void;
}
/**
 * 右侧属性面板。各对象统一骨架：标题区 → 尺寸 → 外观 / 材质 → 单价 → 操作。
 * 尺寸、名称、材质等只影响当前项目且可撤销，即时生效；单价可能同步账号库，需显式「应用」。
 */
export function PropertyPanel({
  design,
  showCosts,
  transaction,
  selection: s,
  select,
  change,
  duplicate,
  remove,
  splitWall,
  mergeWall,
  removeWall,
  openCosts,
  accountFloors = [],
  accountOpenings = [],
  accountWalls = [],
  accountRoofs = [],
  accountCeilings = [],
}: Props) {
  const d = useCostDesign(design);
  const confirm = useConfirm();
  const [tab, setTab] = useState("overview");
  const f =
      s?.kind === "furniture" ? d.furniture.find((f) => f.id === s.id) : null,
    r = s?.kind === "room" ? d.rooms.find((r) => r.id === s.id) : null,
    w = s?.kind === "wall" ? d.walls.find((w) => w.id === s.id) : null,
    o = s?.kind === "opening" ? d.openings.find((o) => o.id === s.id) : null;
  const blank = d.template === "blank";
  const input = (
    label: string,
    value: number,
    update: (v: number) => void | boolean | Promise<boolean>,
    min = -100000,
    max = 100000,
    disabled = false,
  ) => (
    <label className="property-field" key={label}>
      {label}
      <Input
        className="editor-control"
        aria-label={label}
        type="number"
        key={label + value}
        disabled={disabled}
        defaultValue={meterDraft(value)}
        min={toMeters(min)}
        max={toMeters(max)}
        step={0.01}
        onBlur={(e) => {
          const target = e.target;
          if (target.value === meterDraft(value)) return;
          const v = parseMeterDraft(target.value);
          const restore = () => { target.value = meterDraft(value); };
          if (target.value && Number.isFinite(v) && v >= min && v <= max) {
            try {
              const result = update(v);
              if (result === false) restore();
              else if (result instanceof Promise) void result.then(applied => { if (!applied) restore(); }).catch(error => {
                restore(); notify.fail(error instanceof Error ? error.message : '户型调整失败');
              });
            } catch (error) {
              restore(); notify.fail(error instanceof Error ? error.message : '户型调整失败');
            }
          } else {
            restore();
            notify.fail("请输入允许范围内的有效数值");
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
      <Input className="editor-control"
        key={value}
        defaultValue={value}
        maxLength={100}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next === value) return;
          if (!next) {
            e.target.value = value;
            notify.fail("名称不能为空，已恢复原名称");
            return;
          }
          update(next);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
    </label>
  );
  const matGrid = (value: string, update: (v: string) => void) => (
    <div className="material-grid">
      {pickableFloors(d, accountFloors).map(({ key, material: m, fromAccount }) => (
        <button
          key={key}
          className={"material-card " + (key === value ? "active" : "")}
          onClick={() => update(key)}
        >
          <span className="material-swatch" style={{ background: m.color }} />
          <span>
            {m.name}
            {fromAccount && <em className="material-source">账号库</em>}
            {showCosts && <small>
              {cardPrice(fromAccount ? m.price : priceOf(d, "floorPrices", key), d.costSettings?.procurement?.[key]?.unit || "m²")}
            </small>}
          </span>
        </button>
      ))}
    </div>
  );
  const back = (
    <EditorTooltip label="返回方案总览">
      <button className="back-link" onClick={() => select(null)}>
        <ArrowLeft size={14} />
        返回方案总览
      </button>
    </EditorTooltip>
  );
  const priceSection = (group: Parameters<typeof PriceField>[0]["group"], priceKey: string, name: string, unit: string) =>
    showCosts && <section>
      <h3 className="section-title">单价</h3>
      <PriceField key={group + priceKey} design={design} group={group} priceKey={priceKey} name={name} unit={unit} change={change} />
    </section>;
  const roomCost = r ? selectionCost(d, { kind: "room", id: r.id }) : null;
  const total = d.rooms
    .filter((r) => r.counted !== false)
    .reduce((a, r) => a + area(r), 0);
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
                {formatMeters(f.w)} × {formatMeters(f.d)} m · 占地 {((f.w * f.d) / 1e6).toFixed(2)} m²
              </small>
            </div>
          </div>
          {f.imageUrl && (
            <img
              className="furniture-exterior-preview"
              src={f.imageUrl}
              crossOrigin="anonymous"
              alt={f.name + "外观预览"}
            />
          )}
          <div className="property-form">
            {rename(f.name, (v) =>
              change((d) => ({
                ...d,
                furniture: d.furniture.map((g) =>
                  g.id === f.id ? { ...g, name: v } : g,
                ),
              })),
            )}
          </div>
          <h4 className="property-subtitle">尺寸与位置</h4>
          <SizeFields key={f.id} design={design} selection={s} transaction={transaction} />
          <h4 className="property-subtitle">颜色</h4>
          <ColorSwatches value={f.color} onPick={(color) =>
            change((d) => ({
              ...d,
              furniture: d.furniture.map((g) => (g.id === f.id ? { ...g, color } : g)),
            }))
          } />
        </section>
        {priceSection("furniturePrices", furnitureKey(f), f.name, "件")}
        <section>
          <div className="property-actions">
            <EditorTooltip label="复制" shortcut="Ctrl D">
              <Button size="sm" variant="outline" onClick={duplicate}>
                <Copy />
                复制
              </Button>
            </EditorTooltip>
            <EditorTooltip label="删除，可撤销">
              <Button size="sm" variant="outline" onClick={remove}>
                <Trash2 />
                删除
              </Button>
            </EditorTooltip>
            <EditorTooltip label="平面图中显示在最上层">
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
            </EditorTooltip>
            <EditorTooltip label="平面图中显示在最下层">
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
            </EditorTooltip>
          </div>
        </section>
        <PanelHint id="furniture-drag">
          <p>拖动家具移动；顶部圆点旋转，右下方块改变尺寸。</p>
        </PanelHint>
      </>
    );
  if (r) {
    const b = bbox(r.rings[0]),
      inside = d.furniture.filter((f) => inRoom([f.cx, f.cy], r));
    return (
      <>
        <div className="panel-heading">
          <span>房间属性</span>
          <span className="mini-label">材质与尺寸</span>
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
          <h4 className="property-subtitle">房间尺寸 <small>单位 m</small></h4>
          <RoomSidesDiagram sides={roomSides(d, r.id)} labels="length" className="is-summary" />
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
                {formatMeters(b.x2 - b.x)}
                <em>m</em>
              </b>
            </div>
            <div>
              <small>进深</small>
              <b>
                {formatMeters(b.y2 - b.y)}
                <em>m</em>
              </b>
            </div>
          </div>
        </section>
        <section>
          <h3 className="section-title">地面材质</h3>
          {matGrid(r.mat, (v) => {
            try {
              change((d) => applyRoomFloor(d, r.id, v, accountFloors));
            } catch (e) {
              notify.fail(e instanceof Error ? e.message : "地面材质设置失败");
            }
          })}
        </section>
        <RoomSurfacePanel design={d} room={r} change={change} accountWalls={accountWalls} accountRoofs={accountRoofs} accountCeilings={accountCeilings} showCosts={showCosts} />
        {showCosts && (
          <section>
            <EditorTooltip label="查看本间成本明细并改价">
              <button className="room-cost-link" onClick={openCosts}>
                <span>本间成本</span>
                <b>
                  {roomCost?.amount === null
                    ? "未定价"
                    : yuan(roomCost?.amount ?? 0)}
                </b>
                <ChevronRight size={13} />
              </button>
            </EditorTooltip>
          </section>
        )}
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
    const editable = canEditWall(design, w);
    const resizable = canResizeWall(design, w);
    const status = editable ? "可编辑" : resizable ? "可调尺寸" : "受保护";
    return (
      <>
        <div className="panel-heading">
          <span>墙体属性</span>
          <span className="mini-label">{wallKindName(w)}</span>
        </div>
        <section>
          {back}
          <div className="object-title">
            <span className="object-symbol">
              <BrickWall size={22} />
            </span>
            <div>
              <h3>
                {wallKindName(w)}
                <span className={"object-status" + (editable ? " is-editable" : "")}>{status}</span>
              </h3>
              <small>长 {formatMeters(length(w))} m · 厚 {formatMeters(w.thickness)} m</small>
            </div>
          </div>
          <WallOptionsMenu design={design} wall={w} change={change} splitWall={splitWall} mergeWall={mergeWall} removeWall={removeWall} />
          <h4 className="property-subtitle">尺寸</h4>
          <SizeFields key={w.id} design={design} selection={s} transaction={transaction}/>
          <p className="muted-note">
            {editable
              ? "拖动墙体移动，拖动两端圆点调整长度；封闭隔墙会自动划分房间。"
              : "此墙体尺寸已锁定；分割、承重标记与删除可在「墙选项」中操作。"}
          </p>
        </section>
        <div className="panel-note">
          <p>此工具仅用于设计示意，墙体拆改与承重性质须由专业人员评估。</p>
        </div>
      </>
    );
  }
  if (o) {
    const name = openingName(design, o);
    const kindName = o.kind === "door" ? "门" : "窗";
    return (
      <>
        <div className="panel-heading">
          <span>{kindName}属性</span>
          <span className="mini-label">选中对象</span>
        </div>
        <section>
          {back}
          <div className="object-title">
            <span className="object-symbol">
              <DoorOpen size={22} />
            </span>
            <div>
              <h3>{name}</h3>
              <small>
                宽 {formatMeters(o.width)} m · 高 {formatMeters(o.height ?? (o.kind === "door" ? 2100 : 1600))} m
              </small>
            </div>
          </div>
          <OpeningVariantSelect design={design} opening={o} accountOpenings={accountOpenings} change={change} />
          <h4 className="property-subtitle">尺寸与位置</h4>
          <SizeFields key={o.id} design={design} selection={s} transaction={transaction}/>
          {o.kind === 'door' && <>
            <h4 className="property-subtitle">开向</h4>
            <DoorOrientationControls door={o} onChange={patch => change(d => changeDoorOrientation(d, o.id, patch))} />
          </>}
        </section>
        {priceSection("openingPrices", openingPriceKey(o), name, "m²")}
        <section>
          <EditorTooltip label={`删除这${o.kind === "door" ? "扇门" : "扇窗"}，可撤销`}>
            <Button variant="outline" size="sm" onClick={remove}>
              <Trash2 />
              删除{kindName}
            </Button>
          </EditorTooltip>
        </section>
      </>
    );
  }
  return (
    <>
      <div className="panel-tabs">
        <EditorTooltip label="方案总览">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            方案总览
          </button>
        </EditorTooltip>
        <EditorTooltip label="户型设置">
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            户型设置
          </button>
        </EditorTooltip>
      </div>
      {tab === "settings" ? (
        <>
          <section>
            <h3 className="section-title">
              <Ruler size={15} />
              户型尺寸
            </h3>
            <p className="muted-note">
              {blank
                ? "尺寸为墙内净尺寸，外围墙随参数自动更新。"
                : "参考户型的外围尺寸已锁定；如需调整，请新建空白项目。层高仍可修改。"}
            </p>
            <div className="property-form">
              {input(
                "净宽 / m",
                d.width,
                async (v) => {
                  if (!blank) return false;
                  const outside =
                    d.furniture.some((f) => f.cx > v) ||
                    d.walls.some(
                      (w) =>
                        w.kind === "partition" && Math.max(w.a[0], w.b[0]) > v,
                    );
                  if (
                    outside &&
                    !(await confirm({
                      title: "部分对象将位于室外",
                      description:
                        "缩小净宽后，部分家具或隔墙会落在户型之外，仍保留这些对象并继续？",
                      confirmText: "保留并继续",
                    }))
                  )
                    return false;
                  change((d) => resizeBlank(d, v, d.depth, d.thickness));
                  return true;
                },
                500,
                50000,
                !blank,
              )}
              {input(
                "净深 / m",
                d.depth,
                async (v) => {
                  if (!blank) return false;
                  const outside =
                    d.furniture.some((f) => f.cy > v) ||
                    d.walls.some(
                      (w) =>
                        w.kind === "partition" && Math.max(w.a[1], w.b[1]) > v,
                    );
                  if (
                    outside &&
                    !(await confirm({
                      title: "部分对象将位于室外",
                      description:
                        "缩小净深后，部分家具或隔墙会落在户型之外，仍保留这些对象并继续？",
                      confirmText: "保留并继续",
                    }))
                  )
                    return false;
                  change((d) => resizeBlank(d, d.width, v, d.thickness));
                  return true;
                },
                500,
                50000,
                !blank,
              )}
              {input(
                "外围墙厚 / m",
                d.thickness,
                (v) => {
                  if (!blank) return false;
                  change((d) => resizeBlank(d, d.width, d.depth, v));
                },
                50,
                1000,
                !blank,
              )}
              {input(
                "层高 / m",
                d.height,
                (v) => change((d) => ({ ...d, height: v })),
                1000,
                8000,
              )}
            </div>
          </section>
          <DimensionSettings design={design} change={change} />
          <NorthSettings design={design} change={change} />
        </>
      ) : (
        <>
          <section>
            <div className="overview-top">
              <span>套内净使用面积</span>
              <LayoutGrid size={17} />
            </div>
            <div className="area-hero">
              <strong>{total.toFixed(2)}</strong>
              <span>m²</span>
            </div>
            <p className="area-description">
              {d.rooms.filter((r) => r.counted !== false).length} 个空间
            </p>
            <div className="small-stats">
              <span>
                家具 <b>{d.furniture.length} 件</b>
              </span>
              <span>
                层高 <b>{formatMeters(d.height)} m</b>
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
                    <i style={{ background: floorMaterialOf(d, r.mat).color }} />
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
          <PanelHint id="overview-intro">
            <p>选择房间更换材质，选择家具调整尺寸，设计与估算实时同步。</p>
            <details>
              <summary>查看快捷键</summary>
              <ShortcutList />
            </details>
          </PanelHint>
        </>
      )}
    </>
  );
}
