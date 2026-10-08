import type { Design, MaterialProcurement } from "./types";
import { area } from "./geometry";
export const defaultProcurement = (key: string): MaterialProcurement => ({
  unit: "m²",
  waste: 5,
  ...(key === "tile800"
    ? { length: 800, width: 800 }
    : key === "tile600"
      ? { length: 600, width: 600 }
      : key === "antislip"
        ? { length: 300, width: 300 }
        : {}),
});
export function validateProcurement(p: MaterialProcurement) {
  if (
    !p ||
    !["m²", "张", "箱"].includes(p.unit) ||
    !Number.isFinite(p.waste) ||
    p.waste < 0 ||
    p.waste > 100
  )
    throw new Error("损耗率必须在 0～100%");
  for (const n of [p.length, p.width])
    if (n !== undefined && (!Number.isFinite(n) || n < 1 || n > 20000))
      throw new Error("材料长宽必须为有效正数");
  if (
    p.perBox !== undefined &&
    (!Number.isInteger(p.perBox) || p.perBox < 1 || p.perBox > 10000)
  )
    throw new Error("每箱张数必须为正整数");
  if ((p.length === undefined) !== (p.width === undefined))
    throw new Error("请同时填写材料长宽");
  if (p.unit !== "m²" && (!p.length || !p.width))
    throw new Error("按张或箱计价须填写材料长宽");
  if (p.unit === "箱" && !p.perBox) throw new Error("按箱计价须填写每箱张数");
}
export function procure(netArea: number, p: MaterialProcurement) {
  validateProcurement(p);
  const targetArea = netArea * (1 + p.waste / 100),
    sheetArea = p.length && p.width ? (p.length * p.width) / 1e6 : null,
    needed = sheetArea ? Math.ceil(targetArea / sheetArea - 1e-9) : null,
    boxes = needed !== null && p.perBox ? Math.ceil(needed / p.perBox) : null,
    sheets = boxes !== null ? boxes * p.perBox! : needed,
    purchasedArea =
      sheets !== null && sheetArea ? sheets * sheetArea : targetArea;
  return {
    netArea,
    targetArea,
    sheetArea,
    needed,
    boxes,
    sheets,
    purchasedArea,
    remainingArea: purchasedArea - netArea,
    quantity:
      p.unit === "箱" ? boxes! : p.unit === "张" ? sheets! : purchasedArea,
    unit: p.unit,
  };
}
export const projectProcurement = (d: Design, key: string) =>
  procure(
    d.rooms.filter((r) => r.mat === key).reduce((s, r) => s + area(r), 0),
    d.costSettings?.procurement?.[key] || { unit: "m²", waste: 5 },
  );
