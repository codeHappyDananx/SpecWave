import React from 'react';
import { Badge } from '../primitives/Badge';
import styles from './StatusBar.module.css';

export type StatusBarProps = {
  projectPath: string | null;
  filePath: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
  saveError: string | null;
  explorerError: string | null;
  theme: 'light';
};

export function StatusBar(props: StatusBarProps) {
  const fileLabel = props.filePath ? props.filePath.split(/[/\\]/).pop() ?? props.filePath : null;

  return (
    <footer className={styles.statusBar} aria-label="StatusBar">
      <div className={styles.left}>
        <span className={styles.path} title={props.projectPath ?? '未打开项目'}>
          {props.projectPath ? `项目：${props.projectPath}` : '未打开项目'}
        </span>
        {fileLabel ? <Badge>文件：{fileLabel}</Badge> : null}
      </div>
      <div className={styles.right}>
        {props.saveError ? <Badge tone="accent">{props.saveError}</Badge> : null}
        {props.explorerError ? <Badge tone="accent">{props.explorerError}</Badge> : null}
      </div>
    </footer>
  );
}
