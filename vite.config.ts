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
      rollupOptions: {
        output: {
          // 首屏必需的第三方库拆成几个稳定分包：并行下载，业务代码更新时仍可命中缓存。
          // three 不在此列，随 3D 场景按需加载。
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](\.pnpm[\\/])?(react|react-dom|scheduler|react-router|react-router-dom)[@\\/]/.test(id)) return 'vendor-react';
            if (/[\\/]node_modules[\\/](\.pnpm[\\/])?@supabase[+\\/]/.test(id)) return 'vendor-supabase';
            if (/[\\/]node_modules[\\/](\.pnpm[\\/])?@(radix-ui|floating-ui)[+\\/]/.test(id)) return 'vendor-ui';
            return undefined;
          },
        },
      },
    }
  };
});