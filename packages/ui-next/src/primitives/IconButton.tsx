import React from 'react';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'solid' | 'soft';

export type IconButtonProps = {
  active?: boolean;
  variant?: IconButtonVariant;
  title: string;
  ariaLabel?: string;
  className?: string;
  onClick: () => void;
  icon: React.ReactNode;
};

export function IconButton(props: IconButtonProps) {
  const ariaLabel = props.ariaLabel ?? props.title;
  const className = props.className ? `${styles.button} ${props.className}` : styles.button;
  const variant: IconButtonVariant = props.variant ?? 'solid';

  return (
    <button
      className={className}
      type="button"
      data-variant={variant}
      data-active={props.active ? 'true' : 'false'}
      aria-label={ariaLabel}
      title={props.title}
      onClick={props.onClick}
    >
      {props.icon}
    </button>
  );
}
