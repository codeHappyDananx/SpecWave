import React from 'react';
import styles from './Tab.module.css';

export type TabProps = {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

export function Tab(props: TabProps) {
  return (
    <button className={styles.tab} type="button" role="tab" aria-selected={props.selected} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
