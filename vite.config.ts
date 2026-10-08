import { defineConfig, PluginOption } from "vite";
import { enterDevPlugin, enterProdPlugin } from 'vite-plugin-enter-dev';
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const plugins = [
    ...enterProdPlugin(),
  ];
  if (mode === 'development') {
    plugins.push(...enterDevPlugin());
  }
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: plugins.filter(Boolean) as PluginOption[],
    // 3D 模块是按需动态导入的；预先打包 three，避免开发环境首次进入 3D 时重新优化依赖并整页刷新
    optimizeDeps: {
      include: [
        "three",
        "three/examples/jsm/controls/OrbitControls.js",
        "three/examples/jsm/controls/PointerLockControls.js",
        "three/examples/jsm/renderers/CSS2DRenderer.js",
        "three/examples/jsm/geometries/RoundedBoxGeometry.js",
        "three/examples/jsm/utils/BufferGeometryUtils.js",
      ],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: '/',
    build: {
      outDir: 'dist',
      manifest: true,
    }
  };
});