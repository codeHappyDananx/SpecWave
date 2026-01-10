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

  // 主题切换遮罩：检测 theme 变化时短暂显示遮罩
  const [maskActive, setMaskActive] = React.useState(false);
  const prevThemeRef = React.useRef(vm.ui.theme);

  React.useEffect(() => {
    if (prevThemeRef.current !== vm.ui.theme) {
      prevThemeRef.current = vm.ui.theme;
      setMaskActive(true);
      const timer = setTimeout(() => setMaskActive(false), 200);
      return () => clearTimeout(timer);
    }
  }, [vm.ui.theme]);

  const maskClassName = vm.ui.theme === 'dark'
    ? `${styles.themeMask} ${styles.themeMaskDark}`
    : `${styles.themeMask} ${styles.themeMaskLight}`;

  if (vm.app.mode === 'welcome') {
    return (
      <div className={rootClassName} data-skin={vm.ui.skin} data-theme={vm.ui.theme}>
        <div className={maskClassName} data-active={maskActive} />
        <WelcomePage
          recentProjects={vm.app.recentProjects}
          isLoading={vm.explorer.isLoading}
          error={vm.explorer.error}
          dispatch={dispatch}
        />
      </div>
    );
  }

  const activeProject = vm.projects.activeTabId ? vm.projects.openTabs.find((t) => t.id === vm.projects.activeTabId) : null;

  return (
    <div className={rootClassName} data-skin={vm.ui.skin} data-theme={vm.ui.theme}>
      <div className={maskClassName} data-active={maskActive} />
      <div className={styles.app} aria-label="工作区">
        <TopBar
          projects={vm.projects}
          globalSearchQuery={vm.globalSearchQuery}
          leftVisible={vm.leftVisible}
          centerVisible={vm.centerVisible}
          rightVisible={vm.rightVisible}
          rightMode={vm.rightMode}
          dispatch={dispatch}
        />

        <LayoutGrid
          layout={vm.layout}
          showLeft={vm.leftVisible}
          showCenter={vm.centerVisible}
          showRight={vm.rightVisible}
          dispatch={dispatch}
          left={<LeftPanel explorer={vm.explorer} globalSearchQuery={vm.globalSearchQuery} activeStoryId={vm.storyStepper.storyId} dispatch={dispatch} minwPx={vm.panelMinW.leftPx} />}
          // 中区不再用“内容最小宽度”强行撑开：避免出现必须横向拖拽才能读任务/markdown 的体验。
          // 需要横向滚动的场景（如 code/pre）由内容自身的样式决定。
          center={<CenterPanel content={vm.content} phaseIndicator={vm.phaseIndicator} storyStepper={vm.storyStepper} dispatch={dispatch} minwPx={0} />}
          right={<RightPanel rightMode={vm.rightMode} terminal={vm.terminal} chat={vm.chat} dispatch={dispatch} minwPx={vm.panelMinW.rightPx} />}
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
