import path from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// native 模块必须 external，避免被 rollup 打包后导致 .node 动态加载路径失效
// （Windows 下常见症状：conpty.node 加载失败 / 需要 dynamicRequireTargets）
const external = ['fsevents', 'node-pty'];

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: 'src/main/index.ts'
      },
      rollupOptions: {
        external,
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
        }
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: 'src/preload/index.ts'
      },
      rollupOptions: {
        external,
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': path.resolve(process.cwd(), 'src/renderer/src')
      }
    },
    build: {
      outDir: 'dist-electron/renderer'
    }
  }
});
