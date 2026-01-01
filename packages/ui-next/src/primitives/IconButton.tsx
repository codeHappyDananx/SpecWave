import React from 'react';
import styles from './IconButton.module.css';

export type IconButtonProps = {
  active?: boolean;
  title: string;
  ariaLabel?: string;
  className?: string;
  onClick: () => void;
  icon: React.ReactNode;
};

export function IconButton(props: IconButtonProps) {
  const ariaLabel = props.ariaLabel ?? props.title;
  const className = props.className ? `${styles.button} ${props.className}` : styles.button;

  return (
    <button
      className={className}
      type="button"
      data-active={props.active ? 'true' : 'false'}
      aria-label={ariaLabel}
      title={props.title}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
}
