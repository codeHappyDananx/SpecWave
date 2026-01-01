import React from 'react';
import { Icon } from './Icons';
import { activateOnEnterOrSpace } from './keyboard';
import styles from './ProjectTab.module.css';

export type ProjectTabProps = {
  selected: boolean;
  title: string;
  onSelect: () => void;
  onClose: () => void;
};

export function ProjectTab(props: ProjectTabProps) {
  return (
    <div
      className={styles.root}
      role="tab"
      tabIndex={0}
      aria-selected={props.selected}
      onClick={props.onSelect}
      onKeyDown={(e) => activateOnEnterOrSpace(e, props.onSelect)}
    >
      <span className={styles.text}>{props.title}</span>
      <button
        className={styles.close}
        type="button"
        aria-label={`关闭项目 ${props.title}`}
        title="关闭"
        onClick={(e) => {
          e.stopPropagation();
          props.onClose();
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
