/** Geometry and persisted projects remain in millimeters; UI lengths use meters with two decimals. */
export const toMeters = (millimeters: number) => millimeters / 1000;
export const toMillimeters = (meters: number) => Number((meters * 1000).toPrecision(15));
export const formatMeters = (millimeters: number) => toMeters(millimeters).toFixed(2);
/** Input drafts show the same two decimals as read-only labels. */
export const meterDraft = formatMeters;
/** Parses a meter draft into millimeters rounded to whole centimeters (two decimals). */
export const parseMeterDraft = (text: string) => {
  if (text.trim() === '') return NaN;
  const millimeters = toMillimeters(Number(text));
  return Number.isFinite(millimeters) ? Math.round(millimeters / 10) * 10 + 0 : NaN;
};
/** Keeps the exact model value when the user left the rounded draft untouched. */
export const resolveMeterDraft = (text: string, original: number) =>
  text === meterDraft(original) ? original : parseMeterDraft(text);
export function sizeDraftToModel(draft: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key,
    key === 'rot' || value.trim() === '' ? value : String(parseMeterDraft(value)),
  ]));
}
