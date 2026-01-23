import React from 'react';
import { Icon } from './Icons';
import { activateOnEnterOrSpace } from './keyboard';
import styles from './ClosableTab.module.css';

export type ClosableTabProps = {
  selected: boolean;
  title: string;
  variant?: 'default' | 'terminal';
  onSelect: () => void;
  onClose: () => void;
  rootProps?: React.HTMLAttributes<HTMLDivElement>;
};

export function ClosableTab(props: ClosableTabProps) {
  const variant = props.variant ?? 'default';
  const rootProps = props.rootProps ?? {};
  const className = [styles.root, rootProps.className].filter(Boolean).join(' ');
  return (
    <div
      {...rootProps}
      className={className}
      data-variant={variant}
      role="tab"
      tabIndex={0}
      aria-selected={props.selected}
      onClick={(e) => {
        rootProps.onClick?.(e);
        if (e.defaultPrevented) return;
        props.onSelect();
      }}
      onKeyDown={(e) => {
        rootProps.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        activateOnEnterOrSpace(e, props.onSelect);
      }}
      title={props.title}
    >
      <span className={styles.text}>{props.title}</span>
      <button
        className={styles.close}
        type="button"
        data-variant={variant}
        aria-label={`关闭 ${props.title}`}
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
