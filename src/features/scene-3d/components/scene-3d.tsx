import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { notify } from "@/lib/notify";
import { floorMaterialOf } from "@/lib/floor-plan/floor-materials";
import { floorSurface, floorTexture } from "../model/floor-texture";
import { isCoarsePointer, releasePointerLock, tryPointerLock } from "@/lib/platform";
import { createListenerRegistry } from "../model/listeners";
import { doorOrientation } from '@/lib/floor-plan/door-orientation';
import { doorSymbol, doorType } from '@/lib/floor-plan/door-type';
import {
  area,
  bbox,
  center,
  length,
  snapMove,
  blockFurnitureMove,
} from "@/lib/floor-plan/geometry";
import type {
  Design,
  Layers,
  LibraryItem,
  Point,
  Room,
  Selection,
} from "@/lib/floor-plan/types";
import { buildFurniture, disposeMaterials, mat } from "../model/furniture";
import { createEnvironment, createSceneMaterials, type SceneMaterials } from "../model/scene-materials";
import { applyLighting, buildRoomLamps, createGround, roomLamps } from "../model/lighting";
import { designStyle, furnitureLook, METAL_FINISH } from "@/lib/floor-plan/decor-styles";
import { CEILING, WALL_CAP, WINDOW_FRAME, doorColor, isEntryDoor, wallColor } from "../model/arch-look";
import { openingDimensions } from "@/lib/floor-plan/costs";
import { connectedWallPoly, wallSectionPolygons } from '@/lib/floor-plan/wall-connections';
import type { ScreenRect } from "@/lib/floor-plan/selection-anchor";
/** 3D 失败的来源：模块下载、渲染器创建、运行中崩溃、图形资源被系统回收。 */
export type SceneFailure = "module" | "renderer" | "crash" | "context-lost";
export interface SceneHandle {
  /** 生成当前视角 PNG；保存与提示由调用方统一处理。 */
  shot: () => Promise<Blob>;
  top: () => void;
  iso: () => void;
  /** 鸟瞰时平滑飞到房间（"all" 为全屋）；漫游时传送到房间中心。 */
  flyTo: (id: string) => void;
  zoom: (k: number) => void;
  ground: () => Point | null;
}
export interface SceneOptions {
  cut: boolean;
  night: boolean;
  hour: number;
  mode: "orbit" | "walk";
}
interface Props {
  readOnly?: boolean;
  design: Design;
  selection: Selection;
  select: (s: Selection) => void;
  options: SceneOptions;
  layers: Layers;
  commit: (d: Design, before?: Design) => void;
  add: (it: LibraryItem, p: Point) => void;
  /** 3D 无法继续运行时上报原因，由生命周期状态机决定恢复或切回 2D。 */
  onError: (reason: SceneFailure) => void;
  /** 首次构建完成、着色器编译完毕后触发。 */
  onReady: () => void;
  exitWalk: () => void;
  onAnchor: (r: ScreenRect | null) => void;
}
interface Fly {
  t0: number;
  from: [THREE.Vector3, THREE.Vector3];
  to: [THREE.Vector3, THREE.Vector3];
}
const FLY_MS = 900,
  EYE = 1.6,
  WALK_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** 漫游起点：面积最大的计入房间（通常是客厅）中心，朝向房间较长的方向。 */
function walkStart(d: Design, roomId?: string) {
  const rooms = d.rooms.filter((r) => r.counted !== false);
  const room =
    d.rooms.find((r) => r.id === roomId) ||
    [...(rooms.length ? rooms : d.rooms)].sort((a, b) => area(b) - area(a))[0];
  if (!room) return null;
  const p = center(room),
    b = bbox(room.rings[0]),
    wide = b.x2 - b.x >= b.y2 - b.y;
  return {
    pos: new THREE.Vector3(p[0] / 1000, EYE, p[1] / 1000),
    look: new THREE.Vector3(p[0] / 1000 + (wide ? 2 : 0), EYE, p[1] / 1000 + (wide ? 0 : 2)),
  };
}
interface Runtime {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  walk: PointerLockControls;
  arch: THREE.Group;
  furn: THREE.Group;
  labelGroup: THREE.Group;
  /** 吸顶灯盘与房间点光源；不参与点选。 */
  lamps: THREE.Group;
  /** 场景外的大地面。 */
  ground: ReturnType<typeof createGround>;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** RoomEnvironment 预滤波出的环境贴图，只挂给金属 / 光滑材质。 */
  env: THREE.WebGLRenderTarget | null;
  /** 本场景的材质副本：挂环境反射的、会发光的，昼夜切换只改它们。 */
  materials: SceneMaterials;
  doors: {
    group: THREE.Group;
    id: string;
    angle: number;
    open: boolean;
    rotationSign: number;
    width: number;
  }[];
  ray: THREE.Raycaster;
  pointer: THREE.Vector2;
  helper: THREE.BoxHelper | null;
  textures: THREE.Texture[];
  fly: Fly | null;
  ready: boolean;
  /** 有变化待绘制：静止时不渲染，省电、不发热。 */
  needsRender: boolean;
}
function clear(g: THREE.Group) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const material of materials)
        if (material.userData.transient) material.dispose();
    }
    if (o instanceof CSS2DObject) o.element.remove();
  });
  g.clear();
}
/** 房间轮廓（含内洞）；flip 时不翻转 y，旋转后法线朝下，用来做天花。 */
function roomShape(room: Room, flip = false) {
  const ring = (points: Point[]) => points.map((p) => new THREE.Vector2(p[0] / 1000, (flip ? p[1] : -p[1]) / 1000));
  const shape = new THREE.Shape(ring(room.rings[0]));
  shape.holes = room.rings.slice(1).map((hole) => new THREE.Path(ring(hole)));
  return shape;
}
/**
 * 墙顶压顶：拉伸墙体的顶面换成第二个材质。ExtrudeGeometry 的第 0 组先底面、后顶面（各占一半），
 * 第 1 组是侧面；拆开后底面、侧面用墙色（门洞过梁的底面也是墙色），只有顶面用压顶色。
 */
function capTop(geometry: THREE.ExtrudeGeometry) {
  const [lids, sides] = geometry.groups;
  if (!lids || !sides) return;
  const half = lids.count / 2;
  geometry.clearGroups();
  geometry.addGroup(lids.start, half, 0);
  geometry.addGroup(lids.start + half, half, 1);
  geometry.addGroup(sides.start, sides.count, 0);
}
/** 窗框：约每 0.9 m 一根竖梃（含两端）加上下两道横框，合成一个网格；沿局部 x 轴（墙方向）展开。 */
function windowFrame(width: number, sill: number, top: number, material: THREE.Material) {
  const h = top - sill;
  if (h <= 0 || width <= 0) return null;
  const n = Math.max(1, Math.round(width / 0.9)),
    parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k <= n; k++) parts.push(new THREE.BoxGeometry(0.04, h, 0.06).translate(-width / 2 + (k * width) / n, sill + h / 2, 0));
  for (const y of [sill + 0.02, top - 0.02]) parts.push(new THREE.BoxGeometry(width, 0.04, 0.06).translate(0, y, 0));
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!geometry) return null;
  const frame = new THREE.Mesh(geometry, material);
  frame.castShadow = frame.receiveShadow = true;
  return frame;
}
export const Scene3D = forwardRef<SceneHandle, Props>(
  function Scene3D(props, ref) {
    const host = useRef<HTMLDivElement>(null),
      runtime = useRef<Runtime | null>(null),
      latest = useRef(props);
    latest.current = props;
    /** 方案当前的装修风格。内置风格与方案里存的自定义风格都是稳定引用，可以直接做 effect 依赖。 */
    const decor = designStyle(props.design);
    const [paused, setPaused] = useState(true),
      /** 指针锁定不可用（iframe 沙箱、触屏）时改为按住拖动转向。 */
      [free, setFree] = useState(false),
      joy = useRef({ x: 0, y: 0 }),
      knob = useRef<HTMLElement>(null),
      keys = useRef(new Set<string>()),
      activeLook = useRef<{ id: number; x: number; y: number } | null>(null),
      freeRef = useRef(false);
    freeRef.current = free;
    /** 鸟瞰机位：[target, position]，方向沿用当前视角方位。 */
    const viewOf = (top = false, roomId?: string): [THREE.Vector3, THREE.Vector3] | null => {
      const r = runtime.current;
      if (!r) return null;
      const d = latest.current.design,
        room = d.rooms.find((r) => r.id === roomId),
        points = room ? room.rings[0] : d.walls.flatMap((w) => [w.a, w.b]);
      if (!points.length) return null;
      const b = bbox(points),
        x = (b.x + b.x2) / 2000,
        z = (b.y + b.y2) / 2000,
        size = Math.max(b.x2 - b.x, b.y2 - b.y) / 1000,
        dist = size * (room ? 1.4 : 1.15) + 3,
        target = new THREE.Vector3(x, 0, z);
      if (top) return [target, new THREE.Vector3(x, dist, z + 0.001)];
      const dir = room
        ? r.camera.position.clone().sub(r.orbit.target).setY(0)
        : new THREE.Vector3(0.35, 0, 0.6);
      if (dir.lengthSq() < 0.01) dir.set(0.35, 0, 0.6);
      dir.normalize().multiplyScalar(dist * 0.7);
      return [target, new THREE.Vector3(x + dir.x, dist, z + dir.z)];
    };
    const pose = (top = false, roomId?: string) => {
      const r = runtime.current,
        view = viewOf(top, roomId);
      if (!r || !view) return;
      r.fly = null;
      r.orbit.target.copy(view[0]);
      r.camera.position.copy(view[1]);
      r.camera.lookAt(r.orbit.target);
      r.needsRender = true;
    };
    const fly = (top = false, roomId?: string) => {
      const r = runtime.current,
        view = viewOf(top, roomId);
      if (!r || !view) return;
      r.fly = {
        t0: performance.now(),
        from: [r.orbit.target.clone(), r.camera.position.clone()],
        to: view,
      };
    };
    const teleport = (roomId?: string) => {
      const r = runtime.current,
        start = walkStart(latest.current.design, roomId);
      if (!r || !start) return;
      r.camera.position.copy(start.pos);
      r.camera.lookAt(start.look);
      r.needsRender = true;
    };
    const ground = (x?: number, y?: number): Point | null => {
      const r = runtime.current;
      if (!r) return null;
      const rect = r.renderer.domElement.getBoundingClientRect();
      r.pointer.set(
        x === undefined ? 0 : ((x - rect.left) / rect.width) * 2 - 1,
        y === undefined ? 0 : (-(y - rect.top) / rect.height) * 2 + 1,
      );
      r.ray.setFromCamera(r.pointer, r.camera);
      const hit = new THREE.Vector3();
      if (
        !r.ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
          hit,
        ) ||
        hit.distanceTo(r.camera.position) > 100
      )
        return null;
      return [hit.x * 1000, hit.z * 1000];
    };
    useImperativeHandle(ref, () => ({
      shot: () =>
        new Promise<Blob>((resolve, reject) => {
          const r = runtime.current;
          if (!r) return reject(new Error("3D 场景尚未就绪，请稍后重试"));
          const helper = r.helper;
          if (helper) helper.visible = false;
          r.renderer.render(r.scene, r.camera);
          r.labels.render(r.scene, r.camera);
          if (helper) helper.visible = true;
          r.needsRender = true;
          const c = document.createElement("canvas");
          c.width = r.renderer.domElement.width;
          c.height = r.renderer.domElement.height;
          const ctx = c.getContext("2d");
          if (!ctx) return reject(new Error("设备画布内存不足，无法生成图片"));
          ctx.drawImage(r.renderer.domElement, 0, 0);
          if (
            latest.current.layers.labels &&
            latest.current.options.mode === "orbit"
          ) {
            const factor = c.width / host.current!.clientWidth;
            ctx.font = `${Math.round(12 * factor)}px sans-serif`;
            ctx.textAlign = "center";
            for (const room of latest.current.design.rooms.filter(
              (r) => r.counted !== false,
            )) {
              const p = center(room),
                q = new THREE.Vector3(
                  p[0] / 1000,
                  latest.current.options.cut
                    ? 1.35
                    : latest.current.design.height / 1000 + 0.15,
                  p[1] / 1000,
                ).project(r.camera);
              if (q.z > 1 || q.z < -1) continue;
              const x = ((q.x + 1) / 2) * c.width,
                y = ((1 - q.y) / 2) * c.height,
                text = room.name + " " + area(room).toFixed(1) + "m²",
                w = ctx.measureText(text).width;
              ctx.fillStyle = "#fffdf9";
              ctx.fillRect(
                x - w / 2 - 8 * factor,
                y - 12 * factor,
                w + 16 * factor,
                20 * factor,
              );
              ctx.fillStyle = "#2b2824";
              ctx.fillText(text, x, y + 2 * factor);
            }
          }
          c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("浏览器未能生成图片，请重试"))), "image/png");
        }),
      top: () => fly(true),
      iso: () => fly(),
      flyTo: (id) => {
        if (latest.current.options.mode === "walk") teleport(id === "all" ? undefined : id);
        else fly(false, id === "all" ? undefined : id);
      },
      zoom: (k) => {
        const r = runtime.current;
        if (r) {
          r.camera.position
            .sub(r.orbit.target)
            .multiplyScalar(1 / k)
            .add(r.orbit.target);
          r.needsRender = true;
        }
      },
      ground: () => ground(),
    }));
    useEffect(() => {
      const el = host.current!;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
      } catch {
        latest.current.onError("renderer");
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      // 阴影只在场景、光照或门变化时重算，避免每帧多渲染一遍整个场景
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      el.prepend(renderer.domElement);
      const labels = new CSS2DRenderer();
      labels.setSize(el.clientWidth, el.clientHeight);
      labels.domElement.className = "scene-labels";
      el.append(labels.domElement);
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(
          45,
          el.clientWidth / el.clientHeight,
          0.05,
          300,
        ),
        orbit = new OrbitControls(camera, renderer.domElement),
        walk = new PointerLockControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.minDistance = 2;
      orbit.maxDistance = 100;
      orbit.maxPolarAngle = Math.PI * 0.49;
      const sun = new THREE.DirectionalLight("#fff2dc", 3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, {
        left: -20,
        right: 20,
        top: 20,
        bottom: -20,
        near: 1,
        far: 80,
      });
      sun.shadow.normalBias = 0.02;
      const hemi = new THREE.HemisphereLight("#fff9ec", "#b4a58e", 1.5);
      scene.add(sun, sun.target, hemi);
      // 环境贴图只生成一次，由 materials 挂到本场景的金属 / 光滑材质副本上
      const env = createEnvironment(renderer),
        materials = createSceneMaterials(env?.texture ?? null);
      const arch = new THREE.Group(),
        furn = new THREE.Group(),
        labelGroup = new THREE.Group(),
        lamps = new THREE.Group(),
        groundMesh = createGround();
      scene.add(arch, furn, labelGroup, lamps, groundMesh);
      const r: Runtime = {
        renderer,
        labels,
        scene,
        camera,
        orbit,
        walk,
        arch,
        furn,
        labelGroup,
        lamps,
        ground: groundMesh,
        sun,
        hemi,
        env,
        materials,
        doors: [],
        ray: new THREE.Raycaster(),
        pointer: new THREE.Vector2(),
        helper: null,
        textures: [],
        fly: null,
        ready: false,
        needsRender: true,
      };
      runtime.current = r;
      pose();
      let raf = 0,
        stopped = false;
      /** 3D 无法继续：停止循环，交给生命周期决定恢复还是切回 2D。只上报一次。 */
      const fatal = (reason: SceneFailure) => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(raf);
        latest.current.onError(reason);
      };
      // 所有事件都经过登记表：出错统一走 fatal，cleanup 一次 disposeAll() 全部解绑
      const events = createListenerRegistry(fatal);
      const invalidate = () => {
        r.needsRender = true;
      };
      const observer = new ResizeObserver(
        events.guard(() => {
          const w = el.clientWidth,
            h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h);
          labels.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          invalidate();
        }),
      );
      observer.observe(el);
      const pick = (e?: PointerEvent) => {
        const rc = renderer.domElement.getBoundingClientRect();
        r.pointer.set(
          e ? ((e.clientX - rc.left) / rc.width) * 2 - 1 : 0,
          e ? (-(e.clientY - rc.top) / rc.height) * 2 + 1 : 0,
        );
        r.ray.setFromCamera(r.pointer, camera);
        const hits = r.ray.intersectObjects(
          [arch, ...(latest.current.layers.furn ? [furn] : [])],
          true,
        );
        for (const hit of hits) {
          let object = hit.object;
          if (object.userData.glass && latest.current.options.mode === 'walk') continue;
          while (
            object.parent &&
            !object.userData.fid &&
            !object.userData.room &&
            !object.userData.door &&
            !object.userData.opening &&
            !object.userData.wall &&
            object.parent !== scene
          )
            object = object.parent;
          return { object, distance: hit.distance, point:hit.point };
        }
        return null;
      };
      let wallClick:{id:string;fraction:number}|null=null;
      let down: Point | null = null,
        fdrag: {
          id: string;
          pid: number;
          before: Design;
          offset: Point;
          moved: boolean;
          start: Point;
        } | null = null;
      const capture = (e: PointerEvent) => {
        if (latest.current.readOnly) return;
        if (
          latest.current.options.mode !== "orbit" ||
          e.target !== renderer.domElement
        )
          return;
        const hit = pick(e),
          id = hit?.object.userData.fid;
        if (
          id &&
          latest.current.selection?.kind === "furniture" &&
          id === latest.current.selection.id
        ) {
          const p = ground(e.clientX, e.clientY),
            f = latest.current.design.furniture.find((f) => f.id === id);
          if (p && f) {
            fdrag = {
              id,
              pid: e.pointerId,
              before: structuredClone(latest.current.design),
              offset: [p[0] - f.cx, p[1] - f.cy],
              moved: false,
              start: [e.clientX, e.clientY],
            };
            orbit.enabled = false;
            renderer.domElement.setPointerCapture(e.pointerId);
          }
        }
      };
      const pd = (e: PointerEvent) => {
        down = [e.clientX, e.clientY];
        r.fly = null;
        if (latest.current.options.mode === "walk" && freeRef.current) {
          activeLook.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          renderer.domElement.setPointerCapture(e.pointerId);
        }
      };
      const pm = (e: PointerEvent) => {
        const look = activeLook.current;
        if (look && look.id === e.pointerId) {
          const angles = new THREE.Euler().setFromQuaternion(
            camera.quaternion,
            "YXZ",
          );
          angles.y -= (e.clientX - look.x) * 0.005;
          angles.x = Math.max(
            -1.35,
            Math.min(1.35, angles.x - (e.clientY - look.y) * 0.005),
          );
          camera.quaternion.setFromEuler(angles);
          look.x = e.clientX;
          look.y = e.clientY;
          invalidate();
          return;
        }
        if (fdrag && e.pointerId === fdrag.pid) {
          if (
            Math.hypot(e.clientX - fdrag.start[0], e.clientY - fdrag.start[1]) <
            5
          )
            return;
          const p = ground(e.clientX, e.clientY),
            f = fdrag.before.furniture.find((f) => f.id === fdrag!.id);
          if (p && f) {
            fdrag.moved = true;
            const obj = furn.children.find((o) => o.userData.fid === f.id);
            const snapped = snapMove(
              f,
              [p[0] - fdrag.offset[0], p[1] - fdrag.offset[1]],
              fdrag.before,
              latest.current.layers.snap,
            );
            // 与 2D 一致：吸附后的位置再裁到墙面内侧，不嵌进墙里。
            const q = blockFurnitureMove(f, obj ? [obj.position.x * 1000, obj.position.z * 1000] : [f.cx, f.cy], snapped, fdrag.before);
            obj?.position.set(q[0] / 1000, 0, q[1] / 1000);
            renderer.shadowMap.needsUpdate = true;
            invalidate();
          }
        }
      };
      const pu = (e: PointerEvent) => {
        const tap =
          down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6;
        activeLook.current = null;
        if (fdrag) {
          const dr = fdrag;
          fdrag = null;
          orbit.enabled = true;
          if (dr.moved) {
            const obj = furn.children.find((o) => o.userData.fid === dr.id);
            if (obj) {
              const next = {
                ...dr.before,
                furniture: dr.before.furniture.map((f) =>
                  f.id === dr.id
                    ? {
                        ...f,
                        cx: Math.round(obj.position.x * 1000),
                        cy: Math.round(obj.position.z * 1000),
                      }
                    : f,
                ),
              };
              latest.current.commit(next, dr.before);
            }
            return;
          }
        }
        if (!tap) return;
        const hit = pick(e);
        if (hit?.object.userData.door) {
          // 双开门的两扇一起开合
          const leaves = r.doors.filter((d) => d.id === hit.object.userData.door);
          const open = !leaves[0]?.open;
          for (const leaf of leaves) leaf.open = open;
          if(latest.current.options.mode==='orbit')latest.current.select({kind:'opening',id:hit.object.userData.door});
        } else if (latest.current.options.mode === "orbit") {
          if(hit?.object.userData.wall){const w=latest.current.design.walls.find(w=>w.id===hit.object.userData.wall);if(w){const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1];wallClick={id:w.id,fraction:Math.max(0,Math.min(1,((hit.point.x*1000-w.a[0])*dx+(hit.point.z*1000-w.a[1])*dy)/(dx*dx+dy*dy)))};}}
          latest.current.select(
            hit?.object.userData.fid
              ? { kind: "furniture", id: hit.object.userData.fid }
              : hit?.object.userData.opening
                ? {kind:'opening',id:hit.object.userData.opening}
              : hit?.object.userData.room
                ? { kind: "room", id: hit.object.userData.room }
                : hit?.object.userData.wall
                  ? { kind: "wall", id: hit.object.userData.wall }
                  : null,
          );
        }
      };
      const cancel = () => {
        activeLook.current = null;
        fdrag = null;
        orbit.enabled = latest.current.options.mode === "orbit";
      };
      const keydown = (e: KeyboardEvent) => {
        if (
          (e.target as HTMLElement).matches("input,select,textarea") ||
          latest.current.options.mode !== "walk"
        )
          return;
        if (WALK_KEYS.has(e.code)) e.preventDefault();
        keys.current.add(e.code);
        if (e.code === "KeyE") {
          const hit = pick();
          if (hit && hit.distance < 3 && hit.object.userData.door) {
            const leaves = r.doors.filter((d) => d.id === hit.object.userData.door);
            const open = !leaves[0]?.open;
            for (const leaf of leaves) leaf.open = open;
          }
        }
      };
      const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
      const blur = () => keys.current.clear();
      const lock = () => setPaused(false),
        unlock = () => setPaused(true),
        lockError = () => {
          setFree(true);
          setPaused(false);
        };
      const contextLost = (e: Event) => {
        // 阻止默认行为才可能恢复；这里直接交给生命周期换代重建，更可靠
        e.preventDefault();
        fatal("context-lost");
      };
      events.on(el, "pointerdown", capture, true);
      events.on(renderer.domElement, "pointerdown", pd);
      events.on(renderer.domElement, "pointermove", pm);
      events.on(renderer.domElement, "pointerup", pu);
      events.on(renderer.domElement, "pointercancel", cancel);
      events.on(renderer.domElement, "webglcontextlost", contextLost);
      events.on(window, "keydown", keydown);
      events.on(window, "keyup", keyup);
      events.on(window, "blur", blur);
      events.on(document, "pointerlockerror", lockError);
      events.on(document, "visibilitychange", invalidate);
      events.on(walk, "lock", lock);
      events.on(walk, "unlock", unlock);
      events.on(walk, "change", invalidate);
      events.on(orbit, "change", invalidate);
      const blocked = (x: number, z: number) => {
        const p: Point = [x * 1000, z * 1000],
          d = latest.current.design;
        for (const w of d.walls.filter((w) => !d.demolished.includes(w.id))) {
          const L = length(w);
          if (!L) continue;
          const raw =
              ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) +
                (p[1] - w.a[1]) * (w.b[1] - w.a[1])) /
              (L * L),
            t = Math.max(0, Math.min(1, raw)),
            dist = Math.hypot(
              p[0] - (w.a[0] + (w.b[0] - w.a[0]) * t),
              p[1] - (w.a[1] + (w.b[1] - w.a[1]) * t),
            );
          if (dist < w.thickness / 2 + 180) {
            // 墙端、墙角没有门洞，直接挡住
            const opening =
              raw > 0 && raw < 1
                ? d.openings.find(
                    (o) =>
                      o.wallId === w.id &&
                      raw * L > o.offset - o.width / 2 + 180 &&
                      raw * L < o.offset + o.width / 2 - 180,
                  )
                : undefined;
            if (!opening || opening.kind === "window") return true;
            // 推拉门不在 r.doors 里（没有开合），视为可通行；平开 / 双开关着时挡路。
            const door = r.doors.find((o) => o.id === opening.id);
            if (door && !door.open) return true;
          }
        }
        return false;
      };
      // 循环外预先分配，渲染时不再每帧新建对象
      const box = new THREE.Box3(),
        part = new THREE.Box3(),
        corner = new THREE.Vector3(),
        dir = new THREE.Vector3(),
        right = new THREE.Vector3(),
        move = new THREE.Vector3();
      const held = (...codes: string[]) => codes.some((c) => keys.current.has(c));
      /** 选中物体在屏幕上的包围框，交给浮动编辑条定位。只在本帧确实渲染时计算。 */
      const updateAnchor = () => {
        const selected = latest.current.selection;
        const objects =
          selected?.kind === "furniture"
            ? furn.children.filter((o) => o.userData.fid === selected.id)
            : selected?.kind === "wall"
              ? arch.children.filter((o) => o.userData.wall === selected.id)
              : selected?.kind === "room"
                ? arch.children.filter((o) => o.userData.room === selected.id)
                : selected?.kind === "opening"
                  ? arch.children.filter((o) => o.userData.opening === selected.id)
                  : [];
        if (!objects.length || (selected?.kind === "furniture" && !latest.current.layers.furn))
          return latest.current.onAnchor(null);
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        box.makeEmpty();
        for (const object of objects) box.union(part.setFromObject(object));
        const w = el.clientWidth,
          h = el.clientHeight;
        let left = Infinity,
          rightEdge = -Infinity,
          top = Infinity,
          bottom = -Infinity;
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              corner.set(x, y, z).project(camera);
              if (corner.z < -1 || corner.z > 1) continue;
              const sx = ((corner.x + 1) / 2) * w,
                sy = ((1 - corner.y) / 2) * h;
              left = Math.min(left, sx);
              rightEdge = Math.max(rightEdge, sx);
              top = Math.min(top, sy);
              bottom = Math.max(bottom, sy);
            }
        if (left === Infinity) return latest.current.onAnchor(null);
        const stageRect = el.closest(".stage")!.getBoundingClientRect(),
          elRect = el.getBoundingClientRect();
        const ox = elRect.left - stageRect.left,
          oy = elRect.top - stageRect.top;
        let local: ScreenRect["local"];
        if (selected?.kind === "wall") {
          const wall = latest.current.design.walls.find((x) => x.id === selected.id);
          if (wall) {
            const t = wallClick?.id === wall.id ? wallClick.fraction : 0.5;
            corner
              .set(
                (wall.a[0] + (wall.b[0] - wall.a[0]) * t) / 1000,
                Math.min(latest.current.design.height / 2000, 1.2),
                (wall.a[1] + (wall.b[1] - wall.a[1]) * t) / 1000,
              )
              .project(camera);
            local = {
              x: ox + Math.max(0, Math.min(w, ((corner.x + 1) / 2) * w)),
              y: oy + Math.max(0, Math.min(h, ((1 - corner.y) / 2) * h)),
            };
          }
        }
        latest.current.onAnchor({ local, left: ox + left, right: ox + rightEdge, top: oy + top, bottom: oy + bottom });
      };
      let last = performance.now();
      const frame = events.guard((time: number) => {
        const dt = Math.min((time - last) / 1000, 0.05);
        last = time;
        if (document.hidden || !r.ready) return;
        // 只有有变化（invalidate）或正在动画时才渲染，静止时 GPU 空闲
        let animating = false;
        if (r.fly) {
          const t = Math.min(1, (time - r.fly.t0) / FLY_MS),
            k = ease(t);
          orbit.target.lerpVectors(r.fly.from[0], r.fly.to[0], k);
          camera.position.lerpVectors(r.fly.from[1], r.fly.to[1], k);
          camera.lookAt(orbit.target);
          if (t >= 1) r.fly = null;
          animating = true;
        } else if (latest.current.options.mode === "orbit") {
          if (orbit.update()) animating = true;
        } else if (walk.isLocked || freeRef.current) {
          camera.getWorldDirection(dir);
          dir.y = 0;
          dir.normalize();
          right.set(-dir.z, 0, dir.x);
          move.set(0, 0, 0);
          if (held("KeyW", "ArrowUp")) move.add(dir);
          if (held("KeyS", "ArrowDown")) move.sub(dir);
          if (held("KeyA", "ArrowLeft")) move.sub(right);
          if (held("KeyD", "ArrowRight")) move.add(right);
          move
            .addScaledVector(dir, -joy.current.y)
            .addScaledVector(right, joy.current.x);
          if (move.lengthSq() > 0) {
            animating = true;
            if (move.length() > 1) move.normalize();
            move.multiplyScalar(dt * (held("ShiftLeft", "ShiftRight") ? 2.5 : 1.4));
            if (!blocked(camera.position.x + move.x, camera.position.z))
              camera.position.x += move.x;
            if (!blocked(camera.position.x, camera.position.z + move.z))
              camera.position.z += move.z;
          }
        }
        for (const door of r.doors) {
          const delta =
            door.angle +
            (door.open ? door.rotationSign * Math.PI / 2 : 0) -
            door.group.rotation.y;
          if (Math.abs(delta) < 1e-4) continue;
          door.group.rotation.y += delta * Math.min(1, dt * 8);
          renderer.shadowMap.needsUpdate = true;
          animating = true;
        }
        if (!animating && !r.needsRender) return;
        r.needsRender = false;
        r.helper?.update();
        updateAnchor();
        renderer.render(scene, camera);
        labels.render(scene, camera);
      });
      const loop = (time: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        frame(time);
      };
      raf = requestAnimationFrame(loop);
      return () => {
        // 顺序：先解绑事件 → 释放场景资源 → 释放渲染器 → 主动交还 GPU 上下文
        stopped = true;
        cancelAnimationFrame(raf);
        events.disposeAll();
        observer.disconnect();
        releasePointerLock(walk);
        walk.dispose();
        orbit.dispose();
        clear(arch);
        clear(furn);
        clear(labelGroup);
        clear(lamps);
        groundMesh.geometry.dispose();
        r.textures.forEach((t) => t.dispose());
        r.helper?.geometry.dispose();
        r.helper?.material.dispose();
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach((m) => m.dispose());
          }
        });
        materials.dispose();
        r.env?.dispose();
        disposeMaterials();
        renderer.dispose();
        // 不主动交还，iOS 上反复进出 3D 会累积上下文，最终无法再创建
        if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
        renderer.domElement.remove();
        labels.domElement.remove();
        runtime.current = null;
      };
    }, []);
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      clear(r.arch);
      clear(r.labelGroup);
      clear(r.lamps);
      r.textures.forEach((t) => t.dispose());
      r.textures = [];
      r.doors = [];
      const d = latest.current.design,
        ceiling = d.height / 1000,
        H = props.options.cut ? 1.2 : ceiling,
        style = decor,
        finish = METAL_FINISH[style.metal],
        cap = mat(WALL_CAP, 0.9),
        knobMat = mat(finish.color, finish.roughness, finish.metalness),
        frameMat = mat(WINDOW_FRAME.color, WINDOW_FRAME.roughness, WINDOW_FRAME.metalness);
      const addBox = (
        w: number,
        h: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        color: string,
      ) => {
        if (h < 0.001) return null;
        const o = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, depth),
          mat(color),
        );
        o.position.set(x, y + h / 2, z);
        o.castShadow = o.receiveShadow = true;
        r.arch.add(o);
        return o;
      };
      for (const room of d.rooms) {
        const geo = new THREE.ShapeGeometry(roomShape(room));
        geo.rotateX(-Math.PI / 2);
        const floorMat = floorMaterialOf(d, room.mat),
          texture = floorTexture(floorMat);
        texture.anisotropy = r.renderer.capabilities.getMaxAnisotropy();
        r.textures.push(texture);
        const floor = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ map: texture, roughness: floorSurface(floorMat).roughness }),
        );
        floor.material.userData.transient = true;
        floor.userData.room = room.id;
        floor.receiveShadow = true;
        floor.position.y = room.counted === false ? 0.45 : 0;
        r.arch.add(floor);
        // 天花：法线朝下，鸟瞰时背面被剔除，只有在室内仰视时看得到；剖切时不建。不投影，阳光照常进屋
        if (H >= ceiling) {
          const lid = new THREE.Mesh(new THREE.ShapeGeometry(roomShape(room, true)).rotateX(Math.PI / 2), mat(CEILING, 1));
          lid.position.y = ceiling;
          r.arch.add(lid);
        }
        const p = center(room),
          label = document.createElement("div");
        label.className = "scene-room-label";
        label.textContent = room.name + " " + area(room).toFixed(1) + "m²";
        const lo = new CSS2DObject(label);
        lo.position.set(p[0] / 1000, H + 0.15, p[1] / 1000);
        lo.visible =
          latest.current.layers.labels &&
          latest.current.options.mode === "orbit" &&
          room.counted !== false;
        r.labelGroup.add(lo);
      }
      // 吸顶灯：灯一直在场景里，昼夜切换只改强度（见 applyLighting），所以这里不依赖 night
      r.lamps.add(...buildRoomLamps(roomLamps(d.rooms, ceiling, H), latest.current.options.night));
      // 大地面跟着户型走，画得离原点再远也铺得满
      const outline = d.walls.flatMap((w) => [w.a, w.b]);
      if (outline.length) {
        const b = bbox(outline);
        r.ground.position.set((b.x + b.x2) / 2000, r.ground.position.y, (b.y + b.y2) / 2000);
      }
      for (const w of d.walls.filter((w) => !d.demolished.includes(w.id))) {
        const L = length(w) / 1000,
          angle = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]),
          openings = d.openings
            .filter((o) => o.wallId === w.id)
            .sort((a, b) => a.offset - b.offset),
          wallMat = mat(wallColor(w, style), 0.92);
        const footprint = connectedWallPoly(w, d.walls, d.demolished);
        const part = (start: number, end: number, y: number, h: number) => {
          if (end - start < 0.001 || h < 0.001) return;
          for (const polygon of wallSectionPolygons(w, footprint, start * 1000, end * 1000)) {
            const shape = new THREE.Shape(polygon.map(p => new THREE.Vector2(p[0] / 1000, -p[1] / 1000)));
            const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 });
            geometry.rotateX(-Math.PI / 2);
            capTop(geometry);
            const mesh = new THREE.Mesh(geometry, [wallMat, cap]);
            mesh.position.y = y;
            mesh.castShadow = mesh.receiveShadow = true;
            mesh.userData.wall = w.id;
            r.arch.add(mesh);
          }
        };
        let cursor = 0;
        for (const o of openings) {
          const a = (o.offset - o.width / 2) / 1000,
            b = (o.offset + o.width / 2) / 1000;
          part(cursor, a, 0, H);
          const dims = openingDimensions(o, d),
            sill = dims.sill / 1000,
            head = (dims.sill + dims.height) / 1000;
          if (sill) part(a, b, 0, Math.min(sill, H));
          if (H > head) part(a, b, head, H - head);
          const t = o.offset / 1000 / L,
            x = w.a[0] / 1000 + ((w.b[0] - w.a[0]) / 1000) * t,
            z = w.a[1] / 1000 + ((w.b[1] - w.a[1]) / 1000) * t;
          if (o.kind === "window" && H > sill) {
            const glass = addBox(
              b - a,
              Math.min(H, head) - sill,
              0.014,
              x,
              sill,
              z,
              "#c6e0e8",
            );
            if (glass) {
              glass.material = new THREE.MeshStandardMaterial({
                color: "#b8d8e4",
                transparent: true,
                opacity: 0.3,
                roughness: 0.1,
              });
              glass.material.userData.transient = true;
              glass.userData.glass = true;
              glass.userData.opening = o.id;
              glass.rotation.y = angle;
              glass.castShadow = false;
            }
            const frame = windowFrame(b - a, sill, Math.min(H, head), frameMat);
            if (frame) {
              frame.position.set(x, 0, z);
              frame.rotation.y = angle;
              frame.userData.opening = o.id;
              r.arch.add(frame);
            }
          } else if (o.kind === "door") {
            const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]),
              ww = o.width / 1000,
              leafH = Math.min(H, dims.height / 1000),
              ux = Math.cos(ang),
              uz = Math.sin(ang);
            const type = doorType(o),
              leafMat = mat(doorColor(style, isEntryDoor(w, o, d.rooms)), 0.5);
            if (type === "sliding") {
              // 推拉：两扇沿墙一前一后叠放（与平面符号一致），不做开合动画。
              for (const panel of doorSymbol(o).panels) {
                const along = (panel.x + panel.width / 2) / 1000,
                  across = (panel.y + panel.depth / 2) / 1000;
                const leaf = new THREE.Mesh(new THREE.BoxGeometry(panel.width / 1000, leafH, panel.depth / 1000), leafMat);
                leaf.position.set(x + ux * along - uz * across, leafH / 2, z + uz * along + ux * across);
                leaf.rotation.y = angle;
                leaf.castShadow = true;
                leaf.userData.opening = o.id;
                r.arch.add(leaf);
              }
            } else {
              // 单开一扇；双开两扇各半宽，分别铰接在两侧门框，开向与平面图开启弧一致。
              const leaves = type === "double"
                ? (["start", "end"] as const).map((hinge) => ({ hinge, width: ww / 2 }))
                : [{ hinge: o.hinge ?? "start", width: ww }];
              for (const { hinge, width } of leaves) {
                const { mirrorX, rotationSign } = doorOrientation({ hinge, swingSide: o.swingSide });
                const pivot = new THREE.Group();
                pivot.position.set(x - (mirrorX * ux * ww) / 2, 0, z - (mirrorX * uz * ww) / 2);
                pivot.rotation.y = angle + rotationSign * Math.PI / 2;
                const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, leafH, 0.04), leafMat);
                leaf.position.set((mirrorX * width) / 2, leafH / 2, 0);
                leaf.castShadow = true;
                // 球形把手压扁后两面都露出门扇，靠近开启边
                const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), knobMat);
                knob.position.set(mirrorX * (width - 0.07), Math.min(1, leafH - 0.05), 0);
                knob.scale.z = 2.2;
                knob.castShadow = true;
                pivot.add(leaf, knob);
                pivot.userData.door = o.id;
                pivot.userData.opening = o.id;
                r.arch.add(pivot);
                r.doors.push({ group: pivot, id: o.id, angle, open: true, rotationSign, width });
              }
            }
          }
          cursor = b;
        }
        part(cursor, L, 0, w.kind === "low" ? Math.min(1, H) : H);
      }
      r.materials.adopt(r.arch);
      r.materials.adopt(r.lamps);
      r.renderer.shadowMap.needsUpdate = true;
      r.needsRender = true;
    }, [
      props.design.walls,
      props.design.rooms,
      props.design.openings,
      props.design.demolished,
      props.design.height,
      decor,
      props.options.cut,
    ]);
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      clear(r.furn);
      // 风格在这里解析成每件家具的配色，构建器只认 look
      props.design.furniture.forEach((f) => r.furn.add(buildFurniture(f, furnitureLook(decor, f))));
      r.materials.adopt(r.furn);
      r.renderer.shadowMap.needsUpdate = true;
      r.needsRender = true;
    }, [props.design.furniture, decor]);
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      r.furn.visible = props.layers.furn;
      r.renderer.shadowMap.needsUpdate = true;
      r.needsRender = true;
      r.labelGroup.children.forEach(
        (o) =>
          (o.visible = props.layers.labels && props.options.mode === "orbit"),
      );
      r.helper?.geometry.dispose();
      if (r.helper) {
        r.scene.remove(r.helper);
        r.helper.material.dispose();
        r.helper = null;
      }
      const selected = props.selection;
      const obj =
        selected?.kind === "furniture"
          ? r.furn.children.find((o) => o.userData.fid === selected.id)
          : null;
      if (obj && props.layers.furn) {
        r.helper = new THREE.BoxHelper(obj, "#b5653a");
        r.scene.add(r.helper);
      }
    }, [
      props.selection,
      props.layers,
      props.design.furniture,
      decor,
      props.options.mode,
      props.design.rooms,
    ]);
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      const { night, hour } = props.options;
      // 昼夜只改灯光强度、背景与地面颜色、曝光和本场景的材质副本，不重建任何几何
      applyLighting(r, night);
      const t = (hour - 6) / 12;
      r.sun.position.set(
        15 * Math.cos(t * Math.PI),
        15 * Math.sin(t * Math.PI) + 4,
        15,
      );
      r.sun.target.position.copy(r.orbit.target);
      r.renderer.shadowMap.needsUpdate = true;
      r.needsRender = true;
    }, [props.options]);
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      keys.current.clear();
      joy.current = { x: 0, y: 0 };
      setFree(false);
      setPaused(true);
      if (props.options.mode === "walk") {
        r.orbit.enabled = false;
        r.fly = null;
        teleport();
      } else {
        releasePointerLock(r.walk);
        r.orbit.enabled = true;
        fly();
      }
      r.needsRender = true;
    }, [props.options.mode]);
    // 必须放在所有构建 effect 之后：首帧前异步编译着色器，避免切到 3D 时主线程长时间卡死
    useEffect(() => {
      const r = runtime.current;
      if (!r) return;
      let alive = true;
      const done = () => {
        if (!alive || r.ready) return;
        r.ready = true;
        r.needsRender = true;
        latest.current.onReady();
      };
      r.scene.updateMatrixWorld(true);
      r.renderer.compileAsync(r.scene, r.camera).then(done, done);
      // 个别驱动不回报并行编译状态时，兜底直接开始渲染
      const timer = setTimeout(done, 4000);
      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }, []);
    /** 开始漫游：触屏或浏览器不给指针锁定（iOS、iframe 沙箱）时改为拖动转向。 */
    const start = async () => {
      const r = runtime.current;
      if (!r) return;
      if (isCoarsePointer() || !(await tryPointerLock(r.walk.domElement))) {
        setFree(true);
        setPaused(false);
      }
    };
    return (
      <div
        ref={host}
        className="scene-host"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (props.readOnly) return;
          const p = ground(e.clientX, e.clientY);
          if (!p) return;
          try {
            props.add(
              JSON.parse(e.dataTransfer.getData("application/interior-item")),
              p,
            );
          } catch {
            notify.fail("无法放置家具");
          }
        }}
      >
        {props.options.mode === "walk" && paused && !free && (
          <div className="walk-overlay" onClick={() => void start()}>
            <div>
              <h3>走进你的设计</h3>
              <p>WASD / 方向键移动 · 鼠标转向 · Shift 加速 · E 开关门</p>
              <p>触屏使用摇杆移动 · 拖动屏幕转向</p>
              <button className="walk-start">点击开始漫游</button>
            </div>
          </div>
        )}
        {props.options.mode === "walk" && !paused && (
          <>
            <div className="crosshair" />
            {free && !isCoarsePointer() && (
              <div className="walk-hint">按住鼠标拖动转向 · WASD / 方向键移动 · 点门开关</div>
            )}
            {free && isCoarsePointer() && (
              <div
                className="joystick"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const b = e.currentTarget.getBoundingClientRect(),
                    dx = e.clientX - b.left - b.width / 2,
                    dy = e.clientY - b.top - b.height / 2,
                    L = Math.max(45, Math.hypot(dx, dy));
                  joy.current = { x: dx / L, y: dy / L };
                  if (knob.current)
                    knob.current.style.transform = `translate(${(dx / L) * 45}px,${(dy / L) * 45}px)`;
                }}
                onPointerUp={() => {
                  joy.current = { x: 0, y: 0 };
                  if (knob.current) knob.current.style.transform = "";
                }}
                onPointerCancel={() => {
                  joy.current = { x: 0, y: 0 };
                }}
              >
                <i ref={knob} />
              </div>
            )}
            <button className="exit-walk" onClick={props.exitWalk}>
              退出漫游
            </button>
          </>
        )}
      </div>
    );
  },
);
