import type { Furniture } from "../model/types";
export function FurnitureShape({
  f,
}: {
  f: Pick<Furniture, "type" | "w" | "d" | "color" | "shape">;
}) {
  const { type: t, w, d, color: c } = f,
    x = -w / 2,
    y = -d / 2;
  const r = (
    a: number,
    b: number,
    ww: number,
    dd: number,
    fill = c,
    rx = 20,
  ) => (
    <rect
      x={a}
      y={b}
      width={Math.max(1, ww)}
      height={Math.max(1, dd)}
      rx={rx}
      fill={fill}
    />
  );
  const e = (a: number, b: number, rx: number, ry: number, fill = c) => (
    <ellipse cx={a} cy={b} rx={rx} ry={ry} fill={fill} />
  );
  let shape;
  if (t === 'fireplace') {
    shape = <>{f.shape === 'circle' ? e(0,0,w/2,d/2,c) : r(x,y,w,d,c,35)}{e(0,-d*.15,w*.17,d*.17,'var(--plan-metal)')}{r(-w*.24,d*.12,w*.48,d*.15,'var(--plan-screen)',15)}</>;
  } else if (f.shape === 'circle') shape = e(0,0,w/2,d/2,c);
  else if (f.shape === 'rectangle') shape = r(x,y,w,d,c,0);
  else if (t === "bed" || t === "crib")
    shape = (
      <>
        {r(x, y, w, d, "var(--plan-porcelain)", 35)}
        {r(x, y, w, 90, "var(--plan-wood-dark)", 10)}
        {r(x + 20, y + d * 0.32, w - 40, d * 0.66, c, 45)}
        {w >= 1300 ? (
          <>
            {r(
              x + 80,
              y + 140,
              w / 2 - 120,
              d * 0.16,
              "var(--plan-porcelain)",
              70,
            )}
            {r(40, y + 140, w / 2 - 120, d * 0.16, "var(--plan-porcelain)", 70)}
          </>
        ) : (
          r(x + 80, y + 100, w - 160, d * 0.2, "var(--plan-porcelain)", 60)
        )}
        <path
          d={`M${x + 25} ${y + d * 0.52}H${w / 2 - 25}`}
          fill="none"
          strokeDasharray="3 3"
        />
      </>
    );
  else if (["sofa", "armchair", "cornersofa"].includes(t)) {
    const sd = t === "cornersofa" ? d * 0.55 : d;
    shape = (
      <>
        {r(x, y, w, sd, c, 65)}
        {r(x + 140, y + 190, w - 280, sd - 230, c, 35)}
        {r(x, y, w, 190, c, 45)}
        {r(x, y, 140, sd, c, 40)}
        {r(w / 2 - 140, y, 140, sd, c, 40)}
        {t === "cornersofa" && r(x, y + sd, w * 0.34, d - sd, c, 30)}
        {t === "sofa" && (
          <>
            <path
              d={`M${-w / 6} ${y + 200}V${y + sd - 40}M${w / 6} ${y + 200}V${y + sd - 40}`}
              fill="none"
            />
          </>
        )}
      </>
    );
  } else if (t === "plant")
    shape = (
      <>
        {e(0, 0, w / 2, d / 2, c)}
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse
            key={i}
            cx={0}
            cy={-d * 0.23}
            rx={w * 0.12}
            ry={d * 0.24}
            transform={`rotate(${i * 45})`}
            fill="var(--plan-leaf)"
          />
        ))}
        {e(0, 0, w * 0.1, d * 0.1, "var(--plan-wood-dark)")}
      </>
    );
  else if (
    ["roundtable", "sidetable", "barstool", "beanbag", "floorlamp"].includes(t)
  )
    shape = (
      <>
        {e(0, 0, w / 2, d / 2, c)}
        {e(
          0,
          0,
          w * 0.32,
          d * 0.32,
          t === "floorlamp" ? "var(--plan-porcelain)" : c,
        )}
      </>
    );
  else if (t === "toilet")
    shape = (
      <>
        {r(x, y, w, d * 0.25, "var(--plan-porcelain)", 30)}
        {e(0, d * 0.14, w * 0.47, d * 0.35, "var(--plan-porcelain)")}
        {e(0, d * 0.16, w * 0.3, d * 0.23, "var(--plan-glass)")}
      </>
    );
  else if (t === "vanity" || t === "ksink")
    shape = (
      <>
        {r(x, y, w, d, c)}
        {e(0, d * 0.06, w * 0.3, d * 0.3, "var(--plan-porcelain)")}
        {e(0, y + 40, 22, 22, "var(--plan-metal)")}
      </>
    );
  else if (t === "washer" || t === "dryer")
    shape = (
      <>
        {r(x, y, w, d, c)}
        {r(x, y, w, d * 0.16, c, 0)}
        {e(0, d * 0.05, w * 0.33, d * 0.33, "var(--plan-porcelain)")}
        {e(0, d * 0.05, w * 0.24, d * 0.24, "var(--plan-glass)")}
      </>
    );
  else if (t === "chair" || t === "officechair")
    shape = (
      <>
        {r(x + 20, y + 50, w - 40, d - 60, c, 65)}
        {r(x, y, w, d * 0.2, c, 40)}
      </>
    );
  else if (t === "bathtub")
    shape = (
      <>
        {r(x, y, w, d, c, 70)}
        {r(x + 70, y + 70, w - 140, d - 140, "var(--plan-porcelain)", d * 0.35)}
      </>
    );
  else if (t === "shower")
    shape = (
      <>
        {r(x, y, w, d, c, 0)}
        <path
          d={`M${x} ${y}L${w / 2} ${d / 2}M${w / 2} ${y}L${x} ${d / 2}`}
          fill="none"
          strokeDasharray="4 3"
        />
      </>
    );
  else if (t === "desk" || t === "dresser")
    shape = (
      <>
        {r(x, y, w, d, c)}
        {r(-w * 0.18, y + 45, w * 0.36, 50, "var(--plan-screen)", 0)}
        {r(-w * 0.15, 0, w * 0.3, d * 0.28, "var(--plan-porcelain)", 15)}
      </>
    );
  else if (t === "stove")
    shape = (
      <>
        {r(x, y, w, d, "var(--plan-screen)", 20)}
        {e(-w / 4, 0, d * 0.25, d * 0.25, "var(--plan-metal)")}
        {e(w / 4, 0, d * 0.25, d * 0.25, "var(--plan-metal)")}
      </>
    );
  else if (t === "rug")
    shape = (
      <>
        {r(x, y, w, d, c, 35)}
        <rect
          x={x + 90}
          y={y + 90}
          width={Math.max(1, w - 180)}
          height={Math.max(1, d - 180)}
          fill="none"
          rx={20}
          strokeDasharray="3 3"
        />
      </>
    );
  else
    shape = (
      <>
        {r(
          x,
          y,
          w,
          d,
          c,
          [
            "wardrobe",
            "counter",
            "tvstand",
            "bookshelf",
            "cabinet",
            "shoecab",
          ].includes(t)
            ? 0
            : 20,
        )}
        {["wardrobe", "bookshelf", "cabinet", "shoecab"].includes(t) && (
          <path
            d={`M${x} ${y + d * 0.5}H${w / 2}M0 ${y}V${d / 2}`}
            fill="none"
          />
        )}
        {t === "tvstand" &&
          r(x + w * 0.15, y + 20, w * 0.7, 65, "var(--plan-screen)", 0)}
      </>
    );
  return <g className="furniture-drawing">{shape}</g>;
}
