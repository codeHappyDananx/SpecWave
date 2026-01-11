import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { CenterPanel } from '../panels/center/CenterPanel';
import { LeftPanel } from '../panels/left/LeftPanel';
import { RightPanel } from '../panels/right/RightPanel';
import { LayoutGrid } from './LayoutGrid';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import { WelcomePage } from './WelcomePage';
import styles from './SpecWaveApp.module.css';

export type SpecWaveAppProps = {
  vm: AppViewModel;
  dispatch: (intent: UIIntent) => void;
};

export function SpecWaveApp(props: SpecWaveAppProps) {
  const { vm, dispatch } = props;
  const rootClassName = vm.ui.theme === 'dark' ? `${styles.root} dark` : styles.root;

  // 主题/皮肤切换遮罩
  const [maskActive, setMaskActive] = React.useState(false);
  const [maskText, setMaskText] = React.useState('');

  // 包装 dispatch：拦截主题/皮肤切换，先显示遮罩再切换
  const wrappedDispatch = React.useCallback(
    (intent: UIIntent) => {
      if (intent.type === 'THEME_TOGGLE') {
        const nextTheme = vm.ui.theme === 'dark' ? 'light' : 'dark';
        setMaskText(nextTheme === 'dark' ? '切换到深色模式' : '切换到浅色模式');
        setMaskActive(true);
        // 等遮罩显示后再切换
        setTimeout(() => {
          dispatch(intent);
          // 切换完成后延迟隐藏遮罩
          setTimeout(() => setMaskActive(false), 150);
        }, 200);
        return;
      }
      if (intent.type === 'SKIN_CYCLE') {
        const skins = ['blue', 'purple', 'green', 'amber'] as const;
        const idx = skins.indexOf(vm.ui.skin);
        const nextSkin = skins[(idx < 0 ? 0 : idx + 1) % skins.length];
        const skinNames: Record<string, string> = { blue: '蓝色', purple: '紫色', green: '绿色', amber: '琥珀' };
        setMaskText(`切换到${skinNames[nextSkin]}主题`);
        setMaskActive(true);
        setTimeout(() => {
          dispatch(intent);
          setTimeout(() => setMaskActive(false), 150);
        }, 200);
        return;
      }
      dispatch(intent);
    },
    [dispatch, vm.ui.theme, vm.ui.skin]
  );

  const maskClassName = vm.ui.theme === 'dark'
    ? `${styles.themeMask} ${styles.themeMaskDark}`
    : `${styles.themeMask} ${styles.themeMaskLight}`;

  if (vm.app.mode === 'welcome') {
    return (
      <div className={rootClassName} data-skin={vm.ui.skin} data-theme={vm.ui.theme}>
        <div className={maskClassName} data-active={maskActive}>
          {maskText && <span className={styles.themeMaskText}>{maskText}</span>}
        </div>
        <WelcomePage
          recentProjects={vm.app.recentProjects}
          isLoading={vm.explorer.isLoading}
          error={vm.explorer.error}
          dispatch={wrappedDispatch}
        />
      </div>
    );
  }

  const activeProject = vm.projects.activeTabId ? vm.projects.openTabs.find((t) => t.id === vm.projects.activeTabId) : null;

  return (
    <div className={rootClassName} data-skin={vm.ui.skin} data-theme={vm.ui.theme}>
      <div className={maskClassName} data-active={maskActive}>
        {maskText && <span className={styles.themeMaskText}>{maskText}</span>}
      </div>
      <div className={styles.app} aria-label="工作区">
        <TopBar
          projects={vm.projects}
          globalSearchQuery={vm.globalSearchQuery}
          leftVisible={vm.leftVisible}
          centerVisible={vm.centerVisible}
          rightVisible={vm.rightVisible}
          rightMode={vm.rightMode}
          dispatch={wrappedDispatch}
        />

        <LayoutGrid
          layout={vm.layout}
          showLeft={vm.leftVisible}
          showCenter={vm.centerVisible}
          showRight={vm.rightVisible}
          dispatch={wrappedDispatch}
          left={<LeftPanel explorer={vm.explorer} globalSearchQuery={vm.globalSearchQuery} activeStoryId={vm.storyStepper.storyId} dispatch={wrappedDispatch} minwPx={vm.panelMinW.leftPx} />}
          center={<CenterPanel content={vm.content} phaseIndicator={vm.phaseIndicator} storyStepper={vm.storyStepper} dispatch={wrappedDispatch} minwPx={0} />}
          right={<RightPanel rightMode={vm.rightMode} terminal={vm.terminal} chat={vm.chat} dispatch={wrappedDispatch} minwPx={vm.panelMinW.rightPx} />}
        />

        <StatusBar
          projectPath={activeProject?.path ?? null}
          filePath={vm.content.file?.path ?? null}
          saveStatus={vm.content.saveStatus}
          saveError={vm.content.saveError}
          explorerError={vm.explorer.error}
          theme={vm.ui.theme}
        />
      </div>
    </div>
  );
}
