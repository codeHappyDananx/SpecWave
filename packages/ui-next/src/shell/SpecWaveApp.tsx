import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { CenterPanel } from '../panels/center/CenterPanel';
import { LeftPanel } from '../panels/left/LeftPanel';
import { RightPanel } from '../panels/right/RightPanel';
import { LayoutGrid } from './LayoutGrid';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import styles from './SpecWaveApp.module.css';

export type SpecWaveAppProps = {
  vm: AppViewModel;
  dispatch: (intent: UIIntent) => void;
};

export function SpecWaveApp(props: SpecWaveAppProps) {
  const { vm, dispatch } = props;

  const panelMinW = {
    left: 240,
    // 中区内容宽度：按窗口宽度的 70% 计算；小于此宽度则中区内部横向滚动查看（内容不被挤压）。
    center: Math.max(320, Math.round(vm.layout.containerWidthPx * 0.7)),
    right: 320
  };

  return (
    <div className={styles.root}>
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
          left={<LeftPanel minwPx={panelMinW.left} />}
          center={<CenterPanel centerMode={vm.ui.centerMode} dispatch={dispatch} minwPx={panelMinW.center} />}
          right={<RightPanel rightMode={vm.rightMode} terminal={vm.terminal} chat={vm.chat} dispatch={dispatch} minwPx={panelMinW.right} />}
        />

        <StatusBar />
      </div>
    </div>
  );
}
