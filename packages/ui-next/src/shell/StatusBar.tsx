import React from 'react';
import { Badge } from '../primitives/Badge';
import styles from './StatusBar.module.css';

export function StatusBar() {
  return (
    <footer className={styles.statusBar} aria-label="StatusBar">
      <div className={styles.left}>
        <span className={styles.path}>F:AI:SpecWave</span>
        <Badge>索引：进行中</Badge>
      </div>
      <div className={styles.right}>
        <Badge tone="primary">Light</Badge>
        <Badge>FPS: 60</Badge>
        <Badge>IPC: mock</Badge>
      </div>
    </footer>
  );
}
