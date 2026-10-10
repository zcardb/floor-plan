/** 从 AI 效果图里取一个与背景反差最大的代表色，用来给实时 3D 模型上色。 */

/** 画布渲染用 8 位通道的十六进制，与家具颜色字段格式一致。 */
const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** 加载图片失败（跨域拒绝或网络错误）时返回 null，由调用方保留原色。 */
export async function dominantColorFromImage(url: string): Promise<string | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('图片加载失败'));
      el.src = url;
    });
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const total = size * size;
    const pixels = new Float32Array(total * 3);
    let sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0; i < total; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      pixels[i * 3] = r;
      pixels[i * 3 + 1] = g;
      pixels[i * 3 + 2] = b;
      // 四边一圈当作背景色：产品图的底色几乎总在边缘。
      const x = i % size, y = (i / size) | 0;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) { sumR += r; sumG += g; sumB += b; }
    }
    const edge = size * 4 - 4, bgR = sumR / edge, bgG = sumG / edge, bgB = sumB / edge;
    const clusters: { n: number; r: number; g: number; b: number }[] = [];
    let wr = 0, wg = 0, wb = 0, wn = 0;
    for (let i = 0; i < total; i++) {
      const r = pixels[i * 3], g = pixels[i * 3 + 1], b = pixels[i * 3 + 2];
      // 与背景距离太近的算底色，不参与代表色。
      if (Math.hypot(r - bgR, g - bgG, b - bgB) < 26) continue;
      const near = clusters.find(c => Math.hypot(c.r / c.n - r, c.g / c.n - g, c.b / c.n - b) < 42);
      if (near) { near.n++; near.r += r; near.g += g; near.b += b; } else clusters.push({ n: 1, r, g, b });
      wr += r; wg += g; wb += b; wn++;
    }
    // 前景太少（几乎纯色底）或没有明显主色时，宁可不改颜色。
    if (wn < total * 0.06) return null;
    const main = clusters.sort((a, b) => b.n - a.n)[0];
    const [r, g, b] = main && main.n >= wn * 0.25 ? [main.r / main.n, main.g / main.n, main.b / main.n] : [wr / wn, wg / wn, wb / wn];
    return hex(r, g, b);
  } catch {
    return null;
  }
}
