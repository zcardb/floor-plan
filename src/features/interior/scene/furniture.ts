import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Furniture } from "../model/types";
const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, roughness = 0.7) {
  const key = color + roughness;
  if (!cache.has(key))
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return cache.get(key)!;
}
export function disposeMaterials() {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
function box(
  g: THREE.Group,
  w: number,
  h: number,
  d: number,
  c: string,
  x = 0,
  y = 0,
  z = 0,
  round = false,
) {
  const geo = round
    ? new RoundedBoxGeometry(
        Math.max(0.01, w),
        Math.max(0.01, h),
        Math.max(0.01, d),
        2,
        Math.max(0.001, Math.min(0.04, w / 4, h / 4, d / 4)),
      )
    : new THREE.BoxGeometry(w, h, d);
  const o = new THREE.Mesh(geo, mat(c));
  o.position.set(x, y + h / 2, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function cylinder(
  g: THREE.Group,
  r: number,
  h: number,
  c: string,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat(c));
  o.position.set(x, y + h / 2, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function sphere(
  g: THREE.Group,
  rx: number,
  ry: number,
  rz: number,
  c: string,
  x: number,
  y: number,
  z: number,
) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat(c));
  o.scale.set(rx, ry, rz);
  o.position.set(x, y, z);
  o.castShadow = true;
  g.add(o);
  return o;
}
function legs(g: THREE.Group, w: number, d: number, h: number) {
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      box(
        g,
        0.025,
        h,
        0.025,
        "#5c4834",
        a * (w / 2 - 0.06),
        0,
        b * (d / 2 - 0.06),
      );
}
function fronts(
  g: THREE.Group,
  w: number,
  h: number,
  d: number,
  c: string,
  base = 0,
  n = 2,
) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    box(g, w / n - 0.005, h - 0.02, 0.02, c, x, base + 0.01, d / 2 + 0.005);
    box(
      g,
      0.01,
      Math.min(0.3, h / 3),
      0.025,
      "#867c6b",
      x + (w / n) * 0.3,
      base + h * 0.45,
      d / 2 + 0.025,
    );
  }
}
export function buildFurniture(f: Furniture): THREE.Group {
  const g = new THREE.Group(),
    w = f.w / 1000,
    d = f.d / 1000,
    c = f.color,
    bz = -d / 2;
  switch (f.type) {
    case "bed": {
      box(g, w, 0.28, d, "#9c8264", 0, 0.05, 0, true);
      box(g, w, 0.2, d - 0.08, "#f8f5ef", 0, 0.33, 0.03, true);
      box(g, w + 0.01, 0.12, d * 0.65, c, 0, 0.48, d * 0.17, true);
      box(g, w, 1.05, 0.07, "#9c8264", 0, 0, bz, true);
      box(g, w - 0.07, 0.5, 0.06, c, 0, 0.48, bz + 0.06, true);
      const np = w > 1.3 ? 2 : 1;
      for (let i = 0; i < np; i++) {
        const pw = (w - 0.2) / np;
        box(
          g,
          pw - 0.05,
          0.14,
          0.38,
          "#fffdf8",
          -w / 2 + 0.1 + pw * (i + 0.5),
          0.54,
          bz + 0.32,
          true,
        );
      }
      box(g, w + 0.025, 0.035, 0.35, "#708998", 0, 0.6, d / 2 - 0.3, true);
      break;
    }
    case "sofa":
    case "armchair":
    case "cornersofa": {
      const sd = f.type === "cornersofa" ? Math.min(d * 0.55, 0.95) : d;
      legs(g, w, sd, 0.12);
      box(g, w, 0.22, sd, c, 0, 0.12, bz + sd / 2, true);
      box(g, w, 0.66, 0.17, c, 0, 0.2, bz + 0.08, true);
      for (const s of [-1, 1])
        box(g, 0.14, 0.47, sd, c, s * (w / 2 - 0.07), 0.17, bz + sd / 2, true);
      const n = f.type === "armchair" ? 1 : w > 2.2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const cw = (w - 0.3) / n,
          x = -w / 2 + 0.15 + cw * (i + 0.5);
        box(
          g,
          cw - 0.015,
          0.13,
          sd - 0.22,
          c,
          x,
          0.34,
          bz + 0.19 + (sd - 0.22) / 2,
          true,
        );
        box(g, cw - 0.025, 0.37, 0.14, c, x, 0.46, bz + 0.18, true);
      }
      if (f.type === "cornersofa") {
        box(
          g,
          w * 0.33,
          0.36,
          d - sd,
          c,
          -w / 2 + w * 0.165,
          0.1,
          bz + sd + (d - sd) / 2,
          true,
        );
        box(
          g,
          0.14,
          0.66,
          d - sd,
          c,
          -w / 2 + 0.07,
          0.2,
          bz + sd + (d - sd) / 2,
          true,
        );
      }
      box(g, 0.35, 0.32, 0.1, "#e9e1d4", -w / 2 + 0.38, 0.48, bz + 0.3, true);
      break;
    }
    case "nightstand": {
      legs(g, w, d, 0.1);
      box(g, w, 0.4, d, c, 0, 0.1);
      fronts(g, w, 0.4, d, c, 0.1, 1);
      cylinder(g, 0.07, 0.02, "#6c5946", -0.07, 0.5, 0);
      cylinder(g, 0.012, 0.2, "#6c5946", -0.07, 0.52, 0);
      cylinder(g, 0.11, 0.14, "#f4e7d0", -0.07, 0.7, 0);
      break;
    }
    case "wardrobe":
    case "cabinet":
    case "shoecab":
    case "ovencol": {
      const h =
        f.type === "wardrobe"
          ? 2.2
          : f.type === "ovencol"
            ? 2.1
            : f.type === "shoecab"
              ? 1
              : 0.85;
      box(g, w, h, d, c);
      fronts(g, w, h, d, c, 0, Math.max(1, Math.round(w / 0.5)));
      if (f.type === "ovencol")
        for (const y of [0.65, 1.25]) {
          box(g, w - 0.03, 0.46, 0.035, "#222426", 0, y, d / 2 + 0.02);
          box(g, w - 0.1, 0.3, 0.004, "#121922", 0, y + 0.05, d / 2 + 0.04);
        }
      if (h < 1.2) {
        cylinder(g, 0.055, 0.18, "#c9bca7", w * 0.25, h, 0);
        sphere(g, 0.07, 0.1, 0.07, "#6d9257", w * 0.25, h + 0.28, 0);
      }
      break;
    }
    case "desk":
    case "dresser":
      {
        legs(g, w, d, 0.72);
        box(g, w, 0.035, d, c, 0, 0.72);
        if (f.type === "desk") {
          box(g, 0.17, 0.012, 0.12, "#42474b", 0, 0.755, bz + 0.14);
          box(g, 0.025, 0.19, 0.025, "#42474b", 0, 0.76, bz + 0.14);
          box(g, 0.52, 0.32, 0.025, "#24272c", 0, 0.9, bz + 0.14, true);
          box(g, 0.49, 0.28, 0.003, "#273f53", 0, 0.92, bz + 0.155);
          box(g, 0.35, 0.015, 0.12, "#e3e3df", 0, 0.755, 0.1);
        } else {
          const m = cylinder(g, 0.29, 0.012, "#bbd3dc", 0, 1.03, bz + 0.04);
          m.rotation.x = Math.PI / 2;
        }
      }
      break;
    case "chair":
    case "officechair": {
      legs(g, w - 0.06, d - 0.06, 0.43);
      box(g, w, 0.06, d, c, 0, 0.43, 0, true);
      box(g, w - 0.05, 0.35, 0.045, c, 0, 0.48, bz + 0.035, true);
      if (f.type === "officechair")
        for (const s of [-1, 1])
          box(g, 0.06, 0.025, d * 0.6, "#303439", s * w * 0.43, 0.66, 0, true);
      break;
    }
    case "bookshelf": {
      const h = 1.8;
      box(g, w, h, 0.02, c, 0, 0, bz);
      for (const s of [-1, 1]) box(g, 0.022, h, d, c, s * (w / 2 - 0.011));
      for (let j = 0; j < 6; j++) {
        const y = j * 0.35;
        box(g, w, 0.02, d, c, 0, y);
        if (j < 5)
          for (let i = 0; i < Math.floor(w / 0.05) - 2; i++)
            box(
              g,
              0.025,
              0.19 + (i % 4) * 0.025,
              d * 0.7,
              ["#ac7c60", "#829788", "#d3b788", "#687f96"][i % 4],
              -w / 2 + 0.05 + i * 0.045,
              y + 0.02,
              d * 0.1,
            );
      }
      break;
    }
    case "rug":
      box(g, w, 0.009, d, c, 0, 0.003);
      break;
    case "plant": {
      const r = Math.min(w, d) * 0.22;
      cylinder(g, r, 0.32, "#d4c6b5");
      cylinder(g, 0.012, 0.75, "#726044", 0, 0.3);
      for (let i = 0; i < 15; i++) {
        const a = i * 2.4,
          s = 0.08 + (i % 4) * 0.025,
          y = 0.55 + i * 0.035;
        sphere(
          g,
          0.15,
          0.025,
          0.075,
          i % 2 ? "#71975a" : "#527848",
          Math.cos(a) * s,
          y,
          Math.sin(a) * s,
        ).rotation.y = -a;
      }
      break;
    }
    case "table":
    case "coffeetable":
    case "tvstand":
    case "island":
    case "counter": {
      const h =
        f.type === "table"
          ? 0.75
          : f.type === "coffeetable"
            ? 0.4
            : f.type === "tvstand"
              ? 0.5
              : 0.86;
      if (["counter", "island", "tvstand"].includes(f.type)) {
        box(g, w, h - 0.04, d, c);
        fronts(g, w, h - 0.04, d, c, 0, Math.max(1, Math.round(w / 0.6)));
      } else legs(g, w, d, h - 0.04);
      box(g, w, 0.04, d, c, 0, h - 0.04, 0, true);
      if (f.type === "tvstand") {
        box(g, 1.45, 0.82, 0.025, "#202327", 0, 1, bz + 0.03);
        box(g, 1.42, 0.78, 0.003, "#1b2c3d", 0, 1.02, bz + 0.045);
      }
      if (f.type === "counter") {
        box(g, w, 0.65, 0.03, "#efece6", 0, 0.86, bz);
        box(g, w, 0.7, 0.3, c, 0, 1.5, bz + 0.15);
        fronts(g, w, 0.7, 0.3, c, 1.5, Math.max(1, Math.round(w / 0.6)));
      }
      if (f.type === "coffeetable" || f.type === "table") {
        cylinder(g, 0.05, 0.18, "#d7cdbb", 0, h, 0);
        sphere(g, 0.065, 0.055, 0.065, "#8eaa75", 0, h + 0.22, 0);
      }
      break;
    }
    case "roundtable":
    case "sidetable":
    case "barstool":
    case "floorlamp": {
      const h =
        f.type === "floorlamp" ? 1.35 : f.type === "sidetable" ? 0.55 : 0.75;
      cylinder(g, Math.min(w, d) * 0.3, 0.025, "#675747");
      cylinder(g, 0.02, h, "#675747");
      cylinder(g, w / 2, 0.035, c, 0, h);
      if (f.type === "floorlamp") cylinder(g, w * 0.4, 0.28, "#f0e4cd", 0, h);
      break;
    }
    case "beanbag":
      sphere(g, w / 2, 0.32, d / 2, c, 0, 0.32, 0);
      break;
    case "toilet": {
      box(g, w * 0.85, 0.7, d * 0.24, "#fafaf6", 0, 0, bz + d * 0.12, true);
      sphere(g, w * 0.44, 0.19, d * 0.35, "#fafaf6", 0, 0.28, d * 0.1);
      const lid = cylinder(g, w * 0.43, 0.025, "#fafaf6", 0, 0.45, d * 0.1);
      lid.scale.z = (d * 0.7) / w;
      break;
    }
    case "vanity": {
      box(g, w, 0.45, d, c, 0, 0.33);
      fronts(g, w, 0.45, d, c, 0.33, 2);
      box(g, w, 0.03, d, "#fafaf8", 0, 0.78);
      sphere(
        g,
        Math.min(0.2, w * 0.3),
        0.07,
        d * 0.3,
        "#fafaf8",
        0,
        0.83,
        0.03,
      );
      cylinder(g, 0.012, 0.22, "#a4adb2", 0, 0.81, bz + 0.05);
      box(g, w * 0.9, 0.8, 0.015, "#b7d0d6", 0, 1.15, bz + 0.03);
      break;
    }
    case "shower": {
      box(g, w, 0.04, d, "#f2f2ec");
      const glass = new THREE.MeshStandardMaterial({
        color: "#c7e3ee",
        transparent: true,
        opacity: 0.23,
        roughness: 0.1,
        side: THREE.DoubleSide,
      });
      glass.userData.transient = true;
      for (const [ww, dd, x, z] of [
        [w, 0.012, 0, d / 2],
        [0.012, d, w / 2, 0],
      ]) {
        const o = box(g, ww, 2, dd, "#c7e3ee", x, 0.04, z);
        o.material = glass;
        o.castShadow = false;
      }
      box(g, 0.02, 2, 0.02, "#687176", w / 2, 0.04, d / 2);
      box(g, 0.014, 1, 0.014, "#a4adb2", 0, 1, bz + 0.04);
      box(g, 0.2, 0.015, 0.2, "#a4adb2", 0, 2, bz + 0.13);
      break;
    }
    case "bathtub": {
      box(g, w, 0.52, d, "#fafaf6", 0, 0, 0, true);
      box(g, w - 0.12, 0.04, d - 0.12, "#c6e1e7", 0, 0.52, 0, true);
      break;
    }
    case "washer":
    case "dryer":
    case "dishwasher":
    case "fridge":
    case "purifier":
    case "aircon": {
      const h =
        f.type === "fridge"
          ? 1.8
          : f.type === "aircon"
            ? 1.8
            : f.type === "purifier"
              ? 0.72
              : 0.85;
      box(g, w, h, d, c, 0, 0, 0, true);
      if (f.type === "washer" || f.type === "dryer") {
        const drum = cylinder(
          g,
          w * 0.28,
          0.025,
          "#374b55",
          0,
          0.43,
          d / 2 + 0.008,
        );
        drum.rotation.x = Math.PI / 2;
      } else if (f.type === "fridge") {
        fronts(g, w, h, d, c, 0, w > 0.85 ? 2 : 1);
      } else
        box(g, w * 0.6, 0.09, 0.007, "#35464d", 0, h * 0.75, d / 2 + 0.005);
      break;
    }
    case "stove":
      box(g, w, 0.02, d, "#24282b", 0, 0.87);
      for (const x of [-w / 4, w / 4])
        cylinder(g, d * 0.23, 0.015, "#596067", x, 0.89);
      box(g, w, 0.08, d, "#bac0c4", 0, 1.65);
      break;
    case "ksink":
      box(g, w, 0.015, d, "#b1bdc4", 0, 0.865);
      box(g, w * 0.85, 0.006, d * 0.7, "#8598a2", 0, 0.88);
      cylinder(g, 0.015, 0.25, "#b1bdc4", 0, 0.87, bz + 0.05);
      break;
    case "baycushion":
      box(g, w, 0.08, d, c, 0, 0.45, 0, true);
      for (const z of [bz + 0.15, d / 2 - 0.15])
        box(g, w * 0.8, 0.14, 0.25, "#f4ede2", 0, 0.53, z, true);
      break;
    case "crib": {
      legs(g, w, d, 0.3);
      box(g, w, 0.06, d, c, 0, 0.3);
      box(g, w - 0.1, 0.12, d - 0.1, "#f5eee3", 0, 0.36, 0, true);
      for (const s of [-1, 1]) {
        box(g, w, 0.03, 0.03, c, 0, 0.9, s * (d / 2));
        for (let i = 0; i < w / 0.08; i++)
          box(g, 0.012, 0.6, 0.012, c, -w / 2 + i * 0.08, 0.3, (s * d) / 2);
      }
      break;
    }
    case "tv":
      box(g, w, w * 0.5625, 0.025, "#202327", 0, 1.1 - w * 0.28, 0);
      box(g, w - 0.02, w * 0.54, 0.003, "#243646", 0, 1.1 - w * 0.27, 0.016);
      break;
    case "acwall":
      box(g, w, 0.3, d, c, 0, 2.2, 0, true);
      box(g, w * 0.8, 0.025, 0.01, "#606e74", 0, 2.24, d / 2);
      break;
    case "waterheater": {
      const tank = cylinder(g, d / 2, w, c, 0, 1.7, 0);
      tank.rotation.z = Math.PI / 2;
      break;
    }
    case "piano":
      box(g, w, 1.2, d * 0.6, c, 0, 0, bz + d * 0.3);
      box(g, w, 0.08, d * 0.4, c, 0, 0.65, d * 0.3);
      for (let i = 0; i < 35; i++)
        box(
          g,
          w / 35 - 0.002,
          0.018,
          d * 0.25,
          i % 7 === 1 || i % 7 === 3 ? "#292725" : "#faf7ef",
          -w / 2 + (w / 35) * (i + 0.5),
          0.73,
          d * 0.3,
        );
      break;
    case "treadmill":
      box(g, w, 0.15, d, "#353c40");
      box(g, w - 0.15, 0.01, d - 0.3, "#1f2224", 0, 0.15, 0.05);
      for (const s of [-1, 1])
        box(g, 0.03, 1.15, 0.03, "#474e53", s * (w / 2 - 0.05), 0, bz + 0.2);
      box(g, w * 0.8, 0.14, 0.15, "#343b41", 0, 1.15, bz + 0.2, true);
      break;
    default:
      box(g, w, 0.7, d, c);
  }
  if (f.height) {
    g.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(g),
      modelHeight = bounds.max.y - bounds.min.y;
    if (modelHeight > 0) g.scale.y = f.height / 1000 / modelHeight;
  }
  g.position.set(f.cx / 1000, 0, f.cy / 1000);
  g.rotation.y = (-f.rot * Math.PI) / 180;
  g.userData.fid = f.id;
  return g;
}
