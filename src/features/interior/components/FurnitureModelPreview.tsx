import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../model/types';
import { toFurnitureModel } from '../model/furnitureModel';

/**
 * 3D 视角的兜底：没有 AI 效果图时，直接按参考几何渲染画布里那套程序化模型，
 * 可以拖动旋转，让「项目里 3D 能看到」的家具在详情弹窗里也看得到。
 * three 只在真正需要时下载（和场景同一份模块）。
 */
export function FurnitureModelPreview({ item, onFail }: { item: LibraryItem; onFail?: () => void }) {
  const host = useRef<HTMLDivElement>(null), [failed, setFailed] = useState(false), fail = useRef(onFail), latest = useRef(item);
  fail.current = onFail;
  latest.current = item;
  /** 只在影响几何的字段变化时重建模型。 */
  const geometryKey = [item.type, item.shape, item.w, item.d, item.height, item.color].join('|');
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
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
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
        camera.position.set(radius * 1.65, radius * 1.3, radius * 2.3);
        orbit.update();
        const resize = () => {
          const w = el.clientWidth, h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        let raf = 0;
        const loop = () => { raf = requestAnimationFrame(loop); orbit.update(); renderer.render(scene, camera); };
        loop();
        cleanup = () => {
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
  }, [geometryKey]);
  if (failed) return null;
  return <div className="furniture-model-preview" ref={host} role="img" aria-label={`${item.name}实时 3D 模型预览`}>
    <span className="furniture-model-hint">参考几何实时 3D · 可拖动旋转</span>
  </div>;
}
