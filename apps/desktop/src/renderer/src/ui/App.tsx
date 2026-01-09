import React from 'react';
import { SpecWaveApp } from '@specwave/ui-next';
import { useAppStore } from '../store';

export function App() {
  const vm = useAppStore((s) => s.vm);
  const dispatch = useAppStore((s) => s.dispatch);

  React.useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = vm.ui.theme;
    el.dataset.skin = vm.ui.skin;
    if (vm.ui.theme === 'dark') el.classList.add('dark');
    else el.classList.remove('dark');
  }, [vm.ui.skin, vm.ui.theme]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        dispatch({ type: 'SHORTCUT_SAVE' });
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        dispatch({ type: 'SHORTCUT_FIND' });
        return;
      }

      if (e.ctrlKey && e.altKey && e.key === '1') {
        e.preventDefault();
        if (!vm.rightVisible) dispatch({ type: 'PANEL_TOGGLE_RIGHT' });
        dispatch({ type: 'RIGHT_MODE_SET', mode: 'terminal' });
        return;
      }

      if (e.ctrlKey && e.altKey && e.key === '2') {
        e.preventDefault();
        if (!vm.rightVisible) dispatch({ type: 'PANEL_TOGGLE_RIGHT' });
        dispatch({ type: 'RIGHT_MODE_SET', mode: 'chat' });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, vm.rightVisible]);

  return <SpecWaveApp vm={vm} dispatch={dispatch} />;
}
