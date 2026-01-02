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

  const saveBadge = (() => {
    if (props.saveStatus === 'saving') return <Badge tone="accent">保存中</Badge>;
    if (props.saveStatus === 'saved') return <Badge tone="secondary">已保存</Badge>;
    if (props.saveStatus === 'conflict') return <Badge tone="accent">冲突</Badge>;
    if (props.saveStatus === 'error') return <Badge tone="accent">错误</Badge>;
    return <Badge>就绪</Badge>;
  })();

  return (
    <footer className={styles.statusBar} aria-label="StatusBar">
      <div className={styles.left}>
        <span className={styles.path} title={props.projectPath ?? '未打开项目'}>
          {props.projectPath ? `项目：${props.projectPath}` : '未打开项目'}
        </span>
        {fileLabel ? <Badge mono>文件：{fileLabel}</Badge> : null}
      </div>
      <div className={styles.right}>
        {saveBadge}
        {props.saveError ? <Badge tone="accent">{props.saveError}</Badge> : null}
        {props.explorerError ? <Badge tone="accent">{props.explorerError}</Badge> : null}
        <Badge tone="primary">{props.theme === 'light' ? 'Light' : props.theme}</Badge>
      </div>
    </footer>
  );
}
