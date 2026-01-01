import React from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'default' | 'primary' | 'secondary' | 'accent';

export type BadgeProps = {
  tone?: BadgeTone;
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Badge(props: BadgeProps) {
  const tone = props.tone ?? 'default';
  const toneClass =
    tone === 'primary' ? styles.primary : tone === 'secondary' ? styles.secondary : tone === 'accent' ? styles.accent : '';
  const className = [styles.badge, props.mono ? styles.mono : '', toneClass, props.className ?? '']
    .filter(Boolean)
    .join(' ');
  return <span className={className}>{props.children}</span>;
}

