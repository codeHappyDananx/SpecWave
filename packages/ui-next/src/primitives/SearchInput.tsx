import React from 'react';
import { Icon } from './Icons';
import styles from './SearchInput.module.css';

export type SearchInputProps = {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
};

export function SearchInput(props: SearchInputProps) {
  const showClear = Boolean(props.value);

  return (
    <div className={styles.root} aria-label={props.ariaLabel}>
      <div className={styles.icon} aria-hidden="true">
        <Icon name="search" size={18} />
      </div>
      <input
        className={styles.input}
        type="search"
        aria-label={props.ariaLabel}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChangeText(e.currentTarget.value)}
      />
      {showClear ? (
        <button
          className={styles.clear}
          type="button"
          aria-label="清空"
          title="清空"
          onClick={() => {
            props.onChangeText('');
            props.onClear?.();
          }}
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
