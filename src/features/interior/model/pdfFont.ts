/**
 * PDF 嵌入前的 TrueType 字体修正：把 glyf 里每个字形记录补齐到偶数字节，loca 改写为长格式。
 *
 * pdf-lib 用 fontkit 做字体子集时原样拷贝每个字形的字节，子集小于 64 KB 时改用短 loca（存「偏移 ÷ 2」）。
 * 项目用的 NotoSansSC 是长 loca，约一半字形是奇数长度；偏移除 2 后错位，阅读器里这些字直接不显示
 * （FreeType 报 invalid outline）。补齐后偏移都是偶数，子集用哪种 loca 都正确；字形轮廓不变。
 * 已经对齐的字体原样返回（同一个对象），可以重复调用。
 */

const tagAt = (view: DataView, at: number) =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
const pad4 = (n: number) => (n + 3) & ~3;

/** 表校验和：按大端 uint32 累加，尾部不足 4 字节按 0 补。 */
function checksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    let word = 0;
    if (i + 4 <= bytes.length) word = view.getUint32(i);
    else for (let k = 0; k < 4; k++) word = (word << 8) | (i + k < bytes.length ? bytes[i + k] : 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

export function alignGlyphs(input: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tables = Array.from({ length: count }, (_, i) => {
    const record = 12 + i * 16;
    return { tag: tagAt(view, record), offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
  });
  const find = (tag: string) => tables.find((t) => t.tag === tag);
  const head = find("head"), loca = find("loca"), glyf = find("glyf"), maxp = find("maxp");
  if (!head || !loca || !glyf || !maxp) return bytes;
  const glyphs = view.getUint16(maxp.offset + 4), long = view.getInt16(head.offset + 50) === 1;
  const offsets = Array.from({ length: glyphs + 1 }, (_, i) =>
    long ? view.getUint32(loca.offset + i * 4) : view.getUint16(loca.offset + i * 2) * 2);
  if (offsets.every((o) => o % 2 === 0)) return bytes;

  const sizes = offsets.slice(1).map((o, i) => o - offsets[i]);
  const nextGlyf = new Uint8Array(sizes.reduce((s, n) => s + n + (n % 2), 0));
  const nextLoca = new Uint8Array((glyphs + 1) * 4), locaView = new DataView(nextLoca.buffer);
  let at = 0;
  sizes.forEach((size, i) => {
    locaView.setUint32(i * 4, at);
    nextGlyf.set(bytes.subarray(glyf.offset + offsets[i], glyf.offset + offsets[i] + size), at);
    at += size + (size % 2);
  });
  locaView.setUint32(glyphs * 4, at);
  const nextHead = bytes.slice(head.offset, head.offset + head.length), headView = new DataView(nextHead.buffer);
  headView.setInt16(50, 1); // indexToLocFormat：长格式
  headView.setUint32(8, 0); // checkSumAdjustment 先清零，整文件写完再算

  const data = tables.map((t) =>
    t === glyf ? nextGlyf : t === loca ? nextLoca : t === head ? nextHead : bytes.subarray(t.offset, t.offset + t.length));
  const directory = 12 + count * 16;
  const out = new Uint8Array(directory + data.reduce((s, d) => s + pad4(d.length), 0)), outView = new DataView(out.buffer);
  out.set(bytes.subarray(0, 12));
  let offset = directory, headAt = 0;
  tables.forEach((t, i) => {
    const record = 12 + i * 16;
    out.set(bytes.subarray(record, record + 4), record);
    outView.setUint32(record + 4, checksum(data[i]));
    outView.setUint32(record + 8, offset);
    outView.setUint32(record + 12, data[i].length);
    out.set(data[i], offset);
    if (t === head) headAt = offset;
    offset += pad4(data[i].length);
  });
  outView.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}
