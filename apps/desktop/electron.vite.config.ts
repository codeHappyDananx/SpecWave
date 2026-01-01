import path from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const external = ['fsevents'];

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
