import type { AppViewModel, UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';

/**
 * Theme handler（主题与皮肤持久化）
 *
 * - 处理 intent：THEME_TOGGLE / SKIN_CYCLE
 * - 读写的 VM 字段：ui.theme / ui.skin
 * - 副作用：写入 localStorage（specwave_theme / specwave_skin）
 * - 边界：localStorage 写入失败时静默兜底，不影响状态切换
 */
export function handleThemeIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { state, intent } = args;
  const vm = state.vm;

  switch (intent.type) {
    case 'THEME_TOGGLE': {
      const nextTheme: AppViewModel['ui']['theme'] = vm.ui.theme === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem('specwave_theme', nextTheme);
      } catch {}
      return { vm: { ...vm, ui: { ...vm.ui, theme: nextTheme } } };
    }
    case 'SKIN_CYCLE': {
      const skins: AppViewModel['ui']['skin'][] = ['blue', 'purple', 'green', 'amber'];
      const idx = skins.indexOf(vm.ui.skin);
      const nextSkin = skins[(idx < 0 ? 0 : idx + 1) % skins.length] ?? 'blue';
      try {
        window.localStorage.setItem('specwave_skin', nextSkin);
      } catch {}
      return { vm: { ...vm, ui: { ...vm.ui, skin: nextSkin } } };
    }
    default:
      return null;
  }
}

