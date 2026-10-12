import { describe, expect, it } from "vitest";
import { mergePresence, type Presence } from "../model/list-presence";

const keyOf = (s: string) => s;
const shown = (list: Presence<string>[]) => list.map((p) => `${p.key}${p.leaving ? "-" : ""}`);

describe("列表离场合并", () => {
  it("仍存在的项按新顺序排列，消失的项留在原位置并标记离场", () => {
    const first = mergePresence<string>([], ["a", "b", "c", "d"], keyOf);
    expect(shown(first)).toEqual(["a", "b", "c", "d"]);
    expect(shown(mergePresence(first, ["a", "d"], keyOf))).toEqual(["a", "b-", "c-", "d"]);
  });

  it("开头的项消失时放在最前面；重新出现的项恢复为普通项", () => {
    const first = mergePresence<string>([], ["a", "b"], keyOf);
    const gone = mergePresence(first, ["b"], keyOf);
    expect(shown(gone)).toEqual(["a-", "b"]);
    expect(shown(mergePresence(gone, ["a", "b"], keyOf))).toEqual(["a", "b"]);
  });

  it("新增的项直接出现，不带离场标记", () => {
    expect(shown(mergePresence(mergePresence<string>([], ["a"], keyOf), ["a", "e"], keyOf))).toEqual(["a", "e"]);
  });
});
