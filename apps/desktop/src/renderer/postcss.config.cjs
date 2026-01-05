const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');

module.exports = {
  plugins: {
    '@tailwindcss/postcss': {
      // Tailwind v4 的 PostCSS 插件不再支持通过 options 指定 config；它会从 base 往上找配置并扫描源码。
      // 这里把 base 指到仓库根目录，确保能扫到 `packages/ui-next` 里的 class（否则会出现“样式没生效、ul 仍有圆点”的假象）。
      base: repoRoot,
    },
    autoprefixer: {},
  },
};
