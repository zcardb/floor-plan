import { Ruler } from "lucide-react";
import { Input } from '@/components/ui/input';
import { meterDraft, parseMeterDraft, toMeters } from '../model/lengthUnits';
import { notify } from "@/lib/notify";
import { syncStairsToHeight } from "../model/stairs";
import { DimensionSettings } from './DimensionSettings';
import { NorthSettings } from './NorthSettings';
import { DragStepSettings } from './DragStepSettings';
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BLANK_FRAME_CHANGED, blankFrameIntact, resizeBlank } from "../model/geometry";
import type { Design } from "../model/types";

/**
 * 侧栏「户型设置」：整栋户型的全局参数——净宽 / 净深 / 外围墙厚 / 层高，
 * 以及尺寸标注、指北针与拖动步进。原来在右侧属性面板的「户型设置」标签页里，内容原样搬过来。
 */
export function HouseSettingsPanel({ design, change }: {
  design: Design;
  change: (fn: (d: Design) => Design) => void;
}) {
  const confirm = useConfirm();
  const d = design;
  const blank = d.template === "blank";
  /** 空白户型外框未被单独调整时，才能整体重设净宽 / 净深 / 外围墙厚。 */
  const frameResizable = blank && blankFrameIntact(d);
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
  return (
    <>
      <section>
        <h3 className="section-title">
          <Ruler size={15} />
          户型尺寸
        </h3>
        <p className="muted-note">
          {frameResizable
            ? "尺寸为墙内净尺寸，外围墙随参数自动更新。"
            : blank
              ? `${BLANK_FRAME_CHANGED}；请直接拖动或选中外围墙调整。层高仍可修改。`
              : "参考户型的外围尺寸请直接拖动或选中外围墙调整；层高仍可在此修改。"}
        </p>
        <div className="property-form">
          {input(
            "净宽 / m",
            d.width,
            async (v) => {
              if (!frameResizable) return false;
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
            !frameResizable,
          )}
          {input(
            "净深 / m",
            d.depth,
            async (v) => {
              if (!frameResizable) return false;
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
            !frameResizable,
          )}
          {input(
            "外围墙厚 / m",
            d.thickness,
            (v) => {
              if (!frameResizable) return false;
              change((d) => resizeBlank(d, d.width, d.depth, v));
            },
            50,
            1000,
            !frameResizable,
          )}
          {input(
            "层高 / m",
            d.height,
            (v) => change((d) => syncStairsToHeight({ ...d, height: v })),
            1000,
            8000,
          )}
        </div>
      </section>
      <DimensionSettings design={design} change={change} />
      <NorthSettings design={design} change={change} />
      <DragStepSettings design={design} change={change} />
    </>
  );
}