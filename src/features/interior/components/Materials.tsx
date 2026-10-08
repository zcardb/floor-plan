import { materials } from "../data/catalog";
export function MaterialDefs() {
  return (
    <defs>
      {Object.entries(materials).map(([key, m]) => {
        const wood = ["wood", "walnut"].includes(key),
          size =
            key === "tile800"
              ? 800
              : key === "tile600"
                ? 600
                : key === "antislip"
                  ? 300
                  : 1200;
        return (
          <pattern
            key={key}
            id={"mat-" + key}
            patternUnits="userSpaceOnUse"
            width={wood ? 1800 : size}
            height={wood ? 360 : size}
          >
            <rect width="100%" height="100%" fill={m.color} />
            {wood ? (
              <>
                <path
                  d="M0 0H1800M0 180H1800M1200 0V180M600 180V360"
                  stroke="var(--plan-grout)"
                  strokeWidth={7}
                />
                <path
                  d="M100 70Q500 60 900 85T1700 75M200 260Q700 250 1100 275T1750 262"
                  fill="none"
                  stroke="var(--plan-grout)"
                  strokeWidth={3}
                  opacity={0.35}
                />
              </>
            ) : (
              <path
                d={`M0 0H${size}M0 0V${size}`}
                stroke="var(--plan-grout)"
                strokeWidth={8}
              />
            )}
          </pattern>
        );
      })}
      <pattern
        id="plan-grid"
        width={500}
        height={500}
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M500 0H0V500"
          fill="none"
          stroke="var(--plan-grid)"
          strokeWidth={10}
        />
      </pattern>
    </defs>
  );
}
