/** 可复现的伪随机（mulberry32）：同样的种子每次重建都得到同样的书本、花枝、木纹。 */
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把文本折进种子（id、名称等），seed 为初始值。 */
export function hashSeed(text: string, seed = 0) {
  let s = seed | 0;
  for (let i = 0; i < text.length; i++) s = (Math.imul(s, 31) + text.charCodeAt(i)) | 0;
  return s;
}
