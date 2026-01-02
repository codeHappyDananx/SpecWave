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

  if (vm.app.mode === 'welcome') {
    return (
      <div className={styles.root} data-skin={vm.ui.skin}>
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
    <div className={styles.root} data-skin={vm.ui.skin}>
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
          left={<LeftPanel explorer={vm.explorer} globalSearchQuery={vm.globalSearchQuery} dispatch={dispatch} minwPx={vm.panelMinW.leftPx} />}
          center={<CenterPanel content={vm.content} dispatch={dispatch} minwPx={vm.panelMinW.centerPx} />}
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
