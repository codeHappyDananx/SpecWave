import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Icon } from '../../primitives/Icons';
import { Badge } from '../../primitives/Badge';
import { Panel, PanelHeaderIcon } from '../../primitives/Panel';
import { Tab } from '../../primitives/Tab';
import styles from './CenterPanel.module.css';

type CenterIntent = Extract<UIIntent, { type: 'CENTER_MODE_SET' }>;

export type CenterPanelProps = {
  centerMode: AppViewModel['ui']['centerMode'];
  dispatch: (intent: CenterIntent) => void;
  minwPx: number;
};

export function CenterPanel(props: CenterPanelProps) {
  return (
    <Panel
      as="section"
      ariaLabel="中区"
      headerAriaLabel="中区头部"
      bodyAriaLabel="中区滚动区"
      minwPx={props.minwPx}
      header={
        <PanelHeaderIcon ariaLabel="任务">
          <Icon name="tasks" />
        </PanelHeaderIcon>
      }
    >
      <div className={styles.content}>
        <div className={styles.topBlock}>
          <div className={styles.badgeRow}>
            <Badge mono>STORY-000023</Badge>
            <Badge mono>intent.md</Badge>
            <Badge tone="accent">Source/Preview</Badge>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="视图切换">
            <Tab selected={props.centerMode === 'work'} onClick={() => props.dispatch({ type: 'CENTER_MODE_SET', mode: 'work' })}>
              分屏
            </Tab>
            <Tab selected={props.centerMode === 'tasks'} onClick={() => props.dispatch({ type: 'CENTER_MODE_SET', mode: 'tasks' })}>
              任务看板
            </Tab>
          </div>
        </div>

        {props.centerMode === 'tasks' ? (
          <div className={styles.preview} aria-label="任务看板（示意）">
            <h4 className={styles.tasksTitle}>任务看板</h4>
            <p className={styles.muted}>这里先放占位：后续会接真实任务数据与状态流转。</p>
          </div>
        ) : (
          <div className={styles.split} aria-label="编辑器与预览">
            <div className={styles.editor} aria-label="编辑器">
              <div className={styles.editorTitle}># intent.md（片段示意）</div>
              <div className={styles.editorBody}>
                {'## 目标\\n- 交互结果一致\\n- UI 可彻底重构\\n\\n## 关键约束\\n- UI 只发 UIIntent\\n- UI 只读 ViewModel'}
              </div>
            </div>
            <div className={styles.preview} aria-label="渲染预览">
              <h4 className={styles.previewTitle}>STORY-000023 源码梳理与解耦架构规划</h4>
              <p className={styles.p}>这是“复刻级规格包”：你可以彻底重做 UI，但交互语义必须一致。</p>
              <p className={`${styles.p} ${styles.muted}`}>这里故意不靠阴影：层级只来自字号/字重/色块/留白。</p>
              <div className={styles.bottomBadges}>
                <Badge>UIIntent</Badge>
                <Badge tone="primary">Flat</Badge>
                <Badge tone="secondary">可扩展</Badge>
                <Badge tone="accent">Light</Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
