/** Geometry and persisted projects remain in millimeters; UI lengths use meters. */
export const toMeters = (millimeters: number) => millimeters / 1000;
export const toMillimeters = (meters: number) => Number((meters * 1000).toPrecision(15));
export const formatMeters = (millimeters: number) => String(Number(toMeters(millimeters).toFixed(3)));
export const meterDraft = (millimeters: number) => String(toMeters(millimeters));
export const parseMeterDraft = (text: string) => text.trim() === '' ? NaN : toMillimeters(Number(text));
export function sizeDraftToModel(draft: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key,
    key === 'rot' || value.trim() === '' ? value : String(parseMeterDraft(value)),
  ]));
}
