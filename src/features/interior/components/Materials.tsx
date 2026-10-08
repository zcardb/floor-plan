import type { Design } from "../model/types";
import { floorMaterialsOf, type FloorMaterial } from "../model/floorMaterials";

export function FloorPattern({ id, m }: { id: string; m: FloorMaterial }) {
  if (m.pattern === "seamless")
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={1000} height={1000}>
        <rect width="100%" height="100%" fill={m.color} />
      </pattern>
    );
  if (m.pattern === "plank") {
    const w = m.length || 1200, h = m.width || 180;
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={w * 1.5} height={h * 2}>
        <rect width="100%" height="100%" fill={m.color} />
        <path
          d={`M0 0H${w * 1.5}M0 ${h}H${w * 1.5}M${w} 0V${h}M${w / 2} ${h}V${h * 2}`}
          stroke="var(--plan-grout)"
          strokeWidth={7}
        />
        <path
          d={`M${w * 0.06} ${h * 0.4}Q${w * 0.4} ${h * 0.33} ${w * 0.75} ${h * 0.47}T${w * 1.4} ${h * 0.42}M${w * 0.12} ${h * 1.45}Q${w * 0.6} ${h * 1.39} ${w * 0.9} ${h * 1.53}T${w * 1.45} ${h * 1.46}`}
          fill="none"
          stroke="var(--plan-grout)"
          strokeWidth={3}
          opacity={0.35}
        />
      </pattern>
    );
  }
  const w = m.length || 600, h = m.width || 600;
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={w} height={h}>
      <rect width="100%" height="100%" fill={m.color} />
      <path d={`M0 0H${w}M0 0V${h}`} stroke="var(--plan-grout)" strokeWidth={8} />
    </pattern>
  );
}

export function MaterialDefs({ design }: { design: Pick<Design, "customFloors"> }) {
  return (
    <defs>
      {Object.entries(floorMaterialsOf(design)).map(([key, m]) => (
        <FloorPattern key={key} id={"mat-" + key} m={m} />
      ))}
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
