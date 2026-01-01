import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import styles from './LayoutGrid.module.css';

type LayoutIntent = Extract<
  UIIntent,
  | { type: 'LAYOUT_CONTAINER_SET' }
  | { type: 'LAYOUT_DRAG_START' }
  | { type: 'LAYOUT_DRAG_MOVE' }
  | { type: 'LAYOUT_DRAG_END' }
>;

export type LayoutGridProps = {
  layout: AppViewModel['layout'];
  showLeft: boolean;
  showCenter: boolean;
  showRight: boolean;
  dispatch: (intent: LayoutIntent) => void;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
};

export function LayoutGrid(props: LayoutGridProps) {
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ startX: number; handle: 'L' | 'R' } | null>(null);

  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (!w) return;
      props.dispatch({ type: 'LAYOUT_CONTAINER_SET', widthPx: w });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.dispatch]);

  const onSplitterPointerDown = (handle: 'L' | 'R') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, handle };
    props.dispatch({ type: 'LAYOUT_DRAG_START', handle });

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      props.dispatch({ type: 'LAYOUT_DRAG_MOVE', deltaX: ev.clientX - dragRef.current.startX });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      props.dispatch({ type: 'LAYOUT_DRAG_END' });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const splitLActive = props.showLeft && (props.showCenter || props.showRight || (!props.showCenter && !props.showRight));
  const splitRActive = props.showCenter && props.showRight;

  const gridTemplateColumns = (() => {
    // 这里的宽度是“期望宽度”，CSS Grid 允许在小窗下缩到更小；
    // 内容最小宽度由各区域自己的横向滚动条承载。
    const leftCol = props.showLeft ? `minmax(0px, ${props.layout.leftPx}px)` : '0px';
    const splitLCol = splitLActive ? '8px' : '0px';
    // 中区吃满剩余空间，但不设置硬最小列宽；“不挤压内容”的约束由中区自己的横向滚动条承载。
    const centerCol = props.showCenter ? `minmax(0px, 1fr)` : props.showRight ? '0px' : '1fr';
    const splitRCol = splitRActive ? '8px' : '0px';
    // 只有右区时，让右区也能吃满，避免出现空白。
    const rightCol = props.showRight
      ? props.showCenter
        ? `minmax(0px, ${props.layout.rightPx}px)`
        : `minmax(${props.layout.rightPx}px, 1fr)`
      : '0px';
    return [leftCol, splitLCol, centerCol, splitRCol, rightCol].join(' ');
  })();

  const bodyClassName = props.layout.isDragging ? `${styles.body} ${styles.dragging}` : styles.body;
  const splitterLClassName = splitLActive ? styles.splitter : `${styles.splitter} ${styles.inactive}`;
  const splitterRClassName = splitRActive ? styles.splitter : `${styles.splitter} ${styles.inactive}`;

  return (
    <div
      ref={bodyRef}
      className={bodyClassName}
      aria-label="工作区主体"
      style={{ gridTemplateColumns }}
    >
      <div className={styles.pane} data-hidden={props.showLeft ? 'false' : 'true'} aria-hidden={!props.showLeft}>
        {props.left}
      </div>
      <div
        className={splitterLClassName}
        role="separator"
        aria-label="调整左/中宽度"
        aria-hidden={!splitLActive}
        onPointerDown={splitLActive ? onSplitterPointerDown('L') : undefined}
      />
      <div className={styles.pane} data-hidden={props.showCenter ? 'false' : 'true'} aria-hidden={!props.showCenter}>
        {props.center}
      </div>
      <div
        className={splitterRClassName}
        role="separator"
        aria-label="调整中/右宽度"
        aria-hidden={!splitRActive}
        onPointerDown={splitRActive ? onSplitterPointerDown('R') : undefined}
      />
      <div className={styles.pane} data-hidden={props.showRight ? 'false' : 'true'} aria-hidden={!props.showRight}>
        {props.right}
      </div>
    </div>
  );
}
