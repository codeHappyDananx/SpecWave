import React from 'react';
import { Icon } from '../../primitives/Icons';
import { Panel, PanelHeaderIcon } from '../../primitives/Panel';
import styles from './LeftPanel.module.css';

export type LeftPanelProps = {
  minwPx: number;
};

export function LeftPanel(props: LeftPanelProps) {
  return (
    <Panel
      as="aside"
      ariaLabel="左区"
      headerAriaLabel="左区头部"
      bodyAriaLabel="左区滚动区"
      minwPx={props.minwPx}
      header={
        <PanelHeaderIcon ariaLabel="文件">
          <Icon name="folder" />
        </PanelHeaderIcon>
      }
    >
      <div className={styles.content}>
        <details className={styles.group} open>
          <summary className={styles.groupSummary}>SpecWave 工作区</summary>
          <ul className={styles.tree} aria-label="工作区树">
            <li>
              <button type="button" aria-current="true">
                <span className={styles.mark} />
                <span>stories</span>
                <span className={styles.meta}>12</span>
              </button>
            </li>
            <li>
              <button type="button">
                <span className={styles.mark} />
                <span>bugs</span>
                <span className={styles.meta}>3</span>
              </button>
            </li>
            <li>
              <button type="button">
                <span className={styles.mark} />
                <span>workspace</span>
                <span className={styles.meta}>—</span>
              </button>
            </li>
          </ul>
        </details>

        <details className={styles.group} open>
          <summary className={styles.groupSummary}>项目文件</summary>
          <ul className={styles.tree} aria-label="项目文件树">
            <li>
              <button type="button">
                <span className={styles.mark} />
                <span>src</span>
                <span className={styles.meta}>…</span>
              </button>
            </li>
            <li>
              <button type="button">
                <span className={styles.mark} />
                <span>packages</span>
                <span className={styles.meta}>…</span>
              </button>
            </li>
            <li>
              <button type="button">
                <span className={styles.mark} />
                <span>README.md</span>
                <span className={styles.meta}>md</span>
              </button>
            </li>
          </ul>
        </details>
      </div>
    </Panel>
  );
}
