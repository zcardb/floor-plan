import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LibraryItem } from '../model/types';
import { toFurnitureModel } from '../model/furnitureModel';

/**
 * 家具的 3D 呈现：按参考几何渲染画布 3D 场景里那套程序化模型，可以拖动旋转，
 * 详情弹窗的 3D 视角与「AI 调整」的 3D 候选都用它，和项目里看到的是同一件 3D 家具。
 * three 只在真正需要时下载（和场景同一份模块）。
 * snapshotRef：截取当前视角为 PNG，供「AI 调整」作为 3D 的默认素材。
 */
export type ModelSnapshot = () => Promise<File | null>;

export function FurnitureModelPreview({ item, onFail, snapshotRef, compact = false }: {
  item: LibraryItem; onFail?: () => void; snapshotRef?: MutableRefObject<ModelSnapshot | null>;
  /** 候选卡片等小尺寸场景：不显示操作提示、不投影，降低多个画布同时渲染的开销。 */
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), [failed, setFailed] = useState(false), fail = useRef(onFail), latest = useRef(item);
  fail.current = onFail;
  latest.current = item;
  /** 只在影响几何的字段变化时重建模型。 */
  const geometryKey = [item.type, item.shape, item.w, item.d, item.height, item.color, item.model3d ? JSON.stringify(item.model3d.parts) : ''].join('|');
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stopped = false, cleanup = () => {};
    void (async () => {
      try {
        const THREE = await import('three');
        const [{ OrbitControls }, { buildFurniture }] = await Promise.all([
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('../scene/furniture'),
        ]);
        if (stopped) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
        catch { setFailed(true); fail.current?.(); return; }
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.02, 200);
        const group = buildFurniture(toFurnitureModel(latest.current));
        // 材质来自与场景共用的缓存，这里只释放几何，不释放材质。
        const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3()), radius = Math.max(size.length() / 2, 0.15);
        group.position.sub(center);
        scene.add(group);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(radius * 3, 48), new THREE.ShadowMaterial({ opacity: 0.16 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = box.min.y - center.y;
        ground.receiveShadow = true;
        scene.add(ground);
        const sun = new THREE.DirectionalLight('#fff2dc', 3);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -radius * 3, right: radius * 3, top: radius * 3, bottom: -radius * 3, near: 0.1, far: radius * 12 });
        sun.position.set(radius * 2.2, radius * 3.4, radius * 2.6);
        scene.add(sun, sun.target, new THREE.HemisphereLight('#fff9ec', '#b4a58e', 1.6));
        renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.25 : 1.5));
        renderer.shadowMap.enabled = !compact;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.domElement.className = 'furniture-model-canvas';
        el.prepend(renderer.domElement);
        const orbit = new OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.enablePan = false;
        orbit.minDistance = radius * 1.3;
        orbit.maxDistance = radius * 6;
        orbit.minPolarAngle = 0.15;
        orbit.maxPolarAngle = Math.PI * 0.49;
        orbit.target.set(0, 0, 0);
        // 小卡片里是静态预览：不接管指针（点击用于选中），只在尺寸变化时重绘。
        orbit.enabled = !compact;
        camera.position.set(radius * 1.65, radius * 1.3, radius * 2.3);
        orbit.update();
        const resize = () => {
          const w = el.clientWidth, h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          if (compact) renderer.render(scene, camera);
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        let raf = 0;
        const loop = () => { raf = requestAnimationFrame(loop); orbit.update(); renderer.render(scene, camera); };
        if (!compact) loop();
        if (snapshotRef) snapshotRef.current = () => {
          // 截图用弹窗视觉区的底色，避免透明背景；同一任务内渲染后立即读取画面。
          scene.background = new THREE.Color(getComputedStyle(el.parentElement ?? el).backgroundColor);
          renderer.render(scene, camera);
          const canvas = renderer.domElement;
          scene.background = null;
          return new Promise(resolve => canvas.toBlob(blob => resolve(blob ? new File([blob], `${latest.current.name}-3d.png`, { type: 'image/png' }) : null), 'image/png'));
        };
        cleanup = () => {
          if (snapshotRef) snapshotRef.current = null;
          cancelAnimationFrame(raf);
          observer.disconnect();
          orbit.dispose();
          group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
          group.clear();
          ground.geometry.dispose();
          (ground.material as InstanceType<typeof THREE.Material>).dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch { if (!stopped) { setFailed(true); fail.current?.(); } }
    })();
    return () => { stopped = true; cleanup(); };
  }, [geometryKey, snapshotRef, compact]);
  if (failed) return null;
  return <div className={'furniture-model-preview' + (compact ? ' is-compact' : '')} ref={host} role="img" aria-label={`${item.name}实时 3D 模型预览`}>
    {!compact && <span className="furniture-model-hint">{item.model3d ? 'AI 3D 模型' : '参考几何 3D'} · 可拖动旋转</span>}
  </div>;
}
