import path from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// native 模块必须 external，避免被 rollup 打包后导致 .node 动态加载路径失效
// （Windows 下常见症状：conpty.node 加载失败 / 需要 dynamicRequireTargets）
const external = ['fsevents', 'node-pty'];
const stableDev = process.env.SPECWAVE_DEV_STABLE === '1';

const normalizePath = (p: string) => p.replaceAll('\\', '/');
const repoRoot = path.resolve(process.cwd(), '../..');

const watchRoots = {
  main: [path.resolve(process.cwd(), 'src/main'), path.resolve(repoRoot, 'packages')],
  preload: [path.resolve(process.cwd(), 'src/preload'), path.resolve(repoRoot, 'packages')],
  renderer: [path.resolve(process.cwd(), 'src/renderer'), path.resolve(repoRoot, 'packages')]
} as const;

const normalizedWatchRoots = {
  main: watchRoots.main.map((p) => `${normalizePath(p)}/`),
  preload: watchRoots.preload.map((p) => `${normalizePath(p)}/`),
  renderer: watchRoots.renderer.map((p) => `${normalizePath(p)}/`)
} as const;

const shouldIgnore = (p: unknown, allowed: readonly string[]) => {
  const n = normalizePath(String(p));
  if (n.includes('/.specwave/')) return true;
  if (n.includes('/node_modules/')) return true;
  return !allowed.some((root) => n.startsWith(root));
};

const buildWatch = (allowed: readonly string[]) => ({
  // 关键处理节点：electron-vite dev 下 main/preload 通过 `vite.build({ watch })` 实现热构建；
  // 如果 watch 范围过大，会被“项目文件变动”误触发重编译，进而导致 Electron 重启/renderer full-reload → 视觉闪烁。
  include: allowed.map((root) => `${root}**`),
  exclude: ['**/.specwave/**', '**/.git/**', '**/node_modules/**']
});

export default defineConfig({
  main: {
    server: {
      watch: {
        ignored: (p) => shouldIgnore(p, normalizedWatchRoots.main)
      }
    },
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: 'src/main/index.ts'
      },
      watch: stableDev ? null : { ...buildWatch(normalizedWatchRoots.main) },
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
    server: {
      watch: {
        ignored: (p) => shouldIgnore(p, normalizedWatchRoots.preload)
      }
    },
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: 'src/preload/index.ts'
      },
      watch: stableDev ? null : { ...buildWatch(normalizedWatchRoots.preload) },
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
    server: {
      hmr: stableDev ? false : undefined,
      watch: {
        ignored: (p) => shouldIgnore(p, normalizedWatchRoots.renderer)
      }
    },
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
