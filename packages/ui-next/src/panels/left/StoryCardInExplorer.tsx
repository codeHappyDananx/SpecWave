import React from 'react';
import type { StoryCardVM, StoryPhase } from '@specwave/contracts';
import styles from './StoryCardInExplorer.module.css';

export type StoryCardInExplorerProps = {
  story: StoryCardVM;
  isActive: boolean;
  isArchived: boolean;
  onClick: () => void;
};

const phaseLabels: Record<StoryPhase, string> = {
  appeal: '诉求',
  requirement: '需求',
  design: '设计',
  task: '任务',
  executing: '执行中',
  completed: '已完成'
};

export function StoryCardInExplorer(props: StoryCardInExplorerProps) {
  const { story, isActive, isArchived, onClick } = props;

  return (
    <button
      type="button"
      className={`${styles.card} ${isActive ? styles.active : ''} ${isArchived ? styles.archived : ''}`}
      onClick={onClick}
      data-story-id={story.id}
    >
      <div className={styles.header}>
        <span className={styles.storyId}>{story.id.split('(')[0]}</span>
        {isArchived && <span className={styles.archivedBadge}>已归档</span>}
      </div>
      <div className={styles.title}>{story.title}</div>
      <div className={styles.footer}>
        <span className={`${styles.phaseBadge} ${styles[`phase-${story.phase}`]}`}>
          {phaseLabels[story.phase]}
        </span>
        {story.taskProgress && (
          <span className={styles.progress}>
            {story.taskProgress.completed}/{story.taskProgress.total}
          </span>
        )}
      </div>
    </button>
  );
}
