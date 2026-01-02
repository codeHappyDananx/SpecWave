import React from 'react';
import styles from './Panel.module.css';

export type PanelProps = {
  as?: 'aside' | 'section' | 'div';
  ariaLabel: string;
  header?: React.ReactNode;
  headerAriaLabel?: string;
  bodyAriaLabel?: string;
  minwPx?: number;
  children: React.ReactNode;
};

export function Panel(props: PanelProps) {
  const Tag = props.as ?? 'section';
  const hasHeader = Boolean(props.header);

  return (
    <Tag className={styles.panel} aria-label={props.ariaLabel} data-has-header={hasHeader ? 'true' : 'false'}>
      {props.header ? (
        <div className={styles.header} aria-label={props.headerAriaLabel}>
          {props.header}
        </div>
      ) : null}
      <div className={styles.bodyScroll} aria-label={props.bodyAriaLabel}>
        <div className={styles.bodyInner} style={{ ['--sw-panel-minw' as any]: props.minwPx ? `${props.minwPx}px` : undefined }}>
          {props.children}
        </div>
      </div>
    </Tag>
  );
}

export type PanelHeaderIconProps = {
  ariaLabel: string;
  children: React.ReactNode;
};

export function PanelHeaderIcon(props: PanelHeaderIconProps) {
  return (
    <div className={styles.headerIcon} aria-label={props.ariaLabel}>
      {props.children}
    </div>
  );
}
