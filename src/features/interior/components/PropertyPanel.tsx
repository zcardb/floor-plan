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
  Copy,
  Trash2,
  ChevronRight,
  Info,
  LayoutGrid,
  Ruler,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { applyRoomFloor, floorMaterialOf, pickableFloors } from "../model/floorMaterials";
import {
  furnitureKey,
  priceOf,
  setPrice,
} from "../model/costs";
import { PriceInput } from "./PriceInput";
import { selectionCost } from "../model/costBreakdown";
import { yuan } from "../model/money";
import { editSelection } from "../model/selectionEdits";
import { useCostDesign } from './CostDefaultsContext';
import { SizeFields } from './SizeFields';
import { WallOptionsMenu } from './WallOptionsMenu';
import { canEditWall, canResizeWall, openingIsLocked, wallKindName } from '../model/wallPolicy';
import { RotationControls } from './RotationControls';
import { DimensionSettings } from './DimensionSettings';
import type { SizeTransaction } from '../model/sizeTransaction';
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
import type { CustomFloor, Design, Selection } from "../model/types";
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
  splitWall?: (wallId: string) => void;
  mergeWall?: (wallId: string) => void;
  /** 切到成本页；成本页口径跟随当前选中对象。 */
  openCosts: () => void;
}
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
  openCosts,
  accountFloors = [],
}: Props) {
  const d = useCostDesign(design);
  const confirm = useConfirm();
  const [tab, setTab] = useState("overview");
  const f =
      s?.kind === "furniture" ? d.furniture.find((f) => f.id === s.id) : null,
    r = s?.kind === "room" ? d.rooms.find((r) => r.id === s.id) : null,
    w = s?.kind === "wall" ? d.walls.find((w) => w.id === s.id) : null,
    o = s?.kind === "opening" ? d.openings.find((o) => o.id === s.id) : null;
  const applyEdit = (values: Record<string, number>) => {
    try {
      change((d) => editSelection(d, s, values));
    } catch (e) {
      notify.fail(e instanceof Error ? e.message : "尺寸无效");
    }
  };
  const input = (
    label: string,
    value: number,
    update: (v: number) => void | Promise<boolean>,
    min = -100000,
    max = 100000,
    isLength = true,
  ) => (
    <label className="property-field" key={label}>
      {label}
      <Input
        className="editor-control"
        aria-label={label}
        type="number"
        key={label + value}
        defaultValue={isLength ? meterDraft(value) : String(value)}
        min={isLength ? toMeters(min) : min}
        max={isLength ? toMeters(max) : max}
        step={isLength ? 0.01 : 1}
        onBlur={(e) => {
          const target = e.target;
          if (target.value === (isLength ? meterDraft(value) : String(value))) return;
          const v = isLength ? parseMeterDraft(target.value) : Number(target.value);
          const restore = () => { target.value = isLength ? meterDraft(value) : String(value); };
          if (target.value && Number.isFinite(v) && v >= min && v <= max) {
            try {
              const result = update(v);
              if (result instanceof Promise) void result.then(applied => { if (!applied) restore(); }).catch(error => {
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
          if (e.target.value.trim()) update(e.target.value.trim());
        }}
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
              ¥{(fromAccount ? m.price : priceOf(d, "floorPrices", key)) ?? "未定价"} /{" "}
              {d.costSettings?.procurement?.[key]?.unit || "m²"}
            </small>}
          </span>
        </button>
      ))}
    </div>
  );
  const back = (
    <EditorTooltip label="返回方案总览" description="取消选中，回到整个户型的统计视图">
      <button className="back-link" onClick={() => select(null)}>
        <ArrowLeft size={14} />
        返回方案总览
      </button>
    </EditorTooltip>
  );
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
                {formatMeters(f.w)} × {formatMeters(f.d)} m
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
            {(["w", "d", "cx", "cy"] as const).map((key, i) =>
              input(
                [
                  "宽度 / m",
                  f.type === 'stairs' ? "长度 / m" : "深度 / m",
                  "中心 X / m",
                  "中心 Y / m",
                ][i],
                f[key],
                (v) => applyEdit({ [key]: v }),
                key === "w" || key === "d" ? 50 : -100000,
                key === "w" || key === "d" ? 20000 : 100000,
                true,
              ),
            )}
            <RotationControls key={f.id} id={f.id} value={f.rot} transaction={transaction} />
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
          {showCosts && <div className="furniture-price-field">
            <h3 className="section-title">
              家具单价 <small>元 / 件 · 同款联动</small>
            </h3>
            <PriceInput
              key={
                furnitureKey(f) + priceOf(d, "furniturePrices", furnitureKey(f))
              }
              value={priceOf(d, "furniturePrices", furnitureKey(f))}
              label={f.name + "单价"}
              onApply={(v) =>
                change((d) =>
                  setPrice(d, "furniturePrices", furnitureKey(f), v),
                )
              }
            />
            <p className="footnote">
              修改仅影响当前项目的同款家具，自动计入软装总成本。
            </p>
          </div>}
          <div className="property-actions">
            <EditorTooltip label="复制" description="在旁边复制一件同款家具">
              <Button size="sm" variant="outline" onClick={duplicate}>
                <Copy />
                复制
              </Button>
            </EditorTooltip>
            <EditorTooltip label="删除" description="移除这件家具，可撤销">
              <Button size="sm" variant="outline" onClick={remove}>
                <Trash2 />
                删除
              </Button>
            </EditorTooltip>
            <EditorTooltip label="置顶" description="让这件家具盖在其他家具之上显示">
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
            <EditorTooltip label="置底" description="让这件家具被其他家具盖住显示">
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
          {showCosts && (
            <EditorTooltip label="本间成本" description="查看这间房的硬装与软装费用明细">
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
          )}
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
    const editable = canEditWall(design, w);
    const resizable = canResizeWall(design, w);
    return (
      <>
        <div className="panel-heading">
          <span>墙体属性</span>
          <span className="mini-label">
            {wallKindName(w)}
          </span>
        </div>
        <section>
          {back}
          <h3 className="section-title">
            {editable ? "可编辑内部墙体" : resizable ? "可调整尺寸的墙体" : "受保护墙体"}
          </h3>
          <WallOptionsMenu design={design} wall={w} change={change} splitWall={splitWall} mergeWall={mergeWall} />
          <p className="muted-note">分割与承重标记独立；取消分割不会解除承重保护。实际承重性质须专业确认。</p>
          {design.demolished.includes(w.id) && <p className="muted-note">请先撤销拆除，再分割墙段。</p>}
          <SizeFields key={w.id} design={design} selection={s} transaction={transaction}/>
          {editable && (
            <EditorTooltip label="删除隔墙" description="删除这面隔墙及墙上门窗，可撤销">
              <Button variant="outline" size="sm" onClick={remove}>
                <Trash2 />
                删除隔墙
              </Button>
            </EditorTooltip>
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
    return (
      <>
        <div className="panel-heading">
          <span>{o.kind === "door" ? "门" : "窗"}属性</span>
        </div>
        <section>
          {back}
          <SizeFields key={o.id} design={design} selection={s} transaction={transaction}/>
          {o.kind === 'door' && <DoorOrientationControls door={o} onChange={patch => change(d => changeDoorOrientation(d, o.id, patch))} />}
          <EditorTooltip
            label="删除开口"
            description={openingIsLocked(design, o.wallId) ? "承重墙上的门窗洞口不可删除" : "删除这个门窗洞口，可撤销"}
            disabled={openingIsLocked(design, o.wallId)}
          >
            <Button variant="outline" size="sm" disabled={openingIsLocked(design, o.wallId)} onClick={remove}>
              <Trash2 />
              删除开口
            </Button>
          </EditorTooltip>
        </section>
      </>
    );
  }
  return (
    <>
      <div className="panel-tabs">
        <EditorTooltip label="方案总览" description="总面积、各房间面积与费用概览">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            方案总览
          </button>
        </EditorTooltip>
        <EditorTooltip label="户型设置" description="户型净尺寸、层高、尺寸标注与快捷键说明">
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
              {d.template === "blank"
                ? "尺寸为墙内净尺寸，外围墙随参数自动更新。"
                : "参考户型保留原始几何。如需绘制户型，请新建空白项目。"}
            </p>
            <div className="property-form">
              {input(
                "净宽 / m",
                d.width,
                async (v) => {
                  if (d.template !== "blank") return false;
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
              )}
              {input(
                "净深 / m",
                d.depth,
                async (v) => {
                  if (d.template !== "blank") return false;
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
              )}
              {input(
                "外围墙厚 / m",
                d.thickness,
                (v) => {
                  if (d.template === "blank")
                    change((d) => resizeBlank(d, d.width, d.depth, v));
                },
                50,
                1000,
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
          <div className="panel-note">
            <Info size={15} />
            <p>选择房间更换地面材质，选择家具调整尺寸，设计与估算实时同步。</p>
          </div>
        </>
      )}
    </>
  );
}
