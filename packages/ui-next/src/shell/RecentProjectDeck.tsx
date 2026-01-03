import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import type { RecentProjectVM, UIIntent } from '@specwave/contracts';
import { Icon } from '../primitives/Icons';
import styles from './RecentProjectDeck.module.css';

type RecentDeckIntent = Extract<UIIntent, { type: 'PROJECT_OPEN_RECENT' } | { type: 'RECENT_PROJECT_REMOVE' }>;

export type RecentProjectDeckProps = {
  projects: RecentProjectVM[];
  isLoading: boolean;
  dispatch: (intent: RecentDeckIntent) => void;
  delayMs?: number;
  pauseOnHover?: boolean;
};

type Slot = {
  x: number;
  y: number;
  z: number;
  zIndex: number;
};

function makeSlot(i: number, distX: number, distY: number, total: number): Slot {
  return {
    x: i * distX,
    y: i * distY,
    z: -i * distX * 1.5,
    zIndex: total - i
  };
}

function placeNow(el: HTMLDivElement, slot: Slot, skew: number) {
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: 'center center',
    zIndex: slot.zIndex,
    force3D: true
  });
}

function computeDistances(total: number) {
  const cardDistance = total >= 9 ? 10 : total >= 6 ? 12 : 14;
  const verticalDistance = total >= 9 ? 10 : total >= 6 ? 12 : 14;
  return { cardDistance, verticalDistance, skewAmount: 6 as const };
}

function easingConfig(easing: 'elastic' | 'smooth') {
  if (easing === 'elastic') {
    return {
      ease: 'elastic.out(0.6,0.9)',
      durDrop: 2,
      durMove: 2,
      durReturn: 2,
      promoteOverlap: 0.9,
      returnDelay: 0.05
    } as const;
  }
  return {
    ease: 'power1.inOut',
    durDrop: 0.8,
    durMove: 0.8,
    durReturn: 0.8,
    promoteOverlap: 0.45,
    returnDelay: 0.2
  } as const;
}

export function RecentProjectDeck(props: RecentProjectDeckProps) {
  const { projects, isLoading } = props;
  const delayMs = props.delayMs ?? 5200;
  const pauseOnHover = props.pauseOnHover ?? true;

  const projectsKey = useMemo(() => projects.map((p) => p.path).join('\n'), [projects]);
  const refs = useMemo(() => projects.map(() => React.createRef<HTMLDivElement>()), [projectsKey]);
  const orderRef = useRef<number[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  const total = refs.length;
  const { cardDistance, verticalDistance, skewAmount } = useMemo(() => computeDistances(total), [total]);
  const config = useMemo(() => easingConfig(total >= 6 ? 'smooth' : 'elastic'), [total]);

  useEffect(() => {
    const node = deckRef.current;
    if (!node) return;
    if (!total) return;

    orderRef.current = Array.from({ length: total }, (_, i) => i);

    const placeAll = () => {
      for (let i = 0; i < total; i += 1) {
        const el = refs[i]?.current;
        if (!el) continue;
        placeNow(el, makeSlot(i, cardDistance, verticalDistance, total), skewAmount);
      }
    };

    const swap = () => {
      if (orderRef.current.length < 2) return;

      const front = orderRef.current[0];
      if (front == null) return;
      const rest = orderRef.current.slice(1);
      const elFront = refs[front]?.current;
      if (!elFront) return;

      const tl = gsap.timeline();
      tlRef.current = tl;

      tl.to(elFront, {
        y: '+=500',
        duration: config.durDrop,
        ease: config.ease
      });

      tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);
      rest.forEach((idx, i) => {
        const el = refs[idx]?.current;
        if (!el) return;
        const slot = makeSlot(i, cardDistance, verticalDistance, total);
        tl.set(el, { zIndex: slot.zIndex }, 'promote');
        tl.to(
          el,
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            duration: config.durMove,
            ease: config.ease
          },
          `promote+=${i * 0.15}`
        );
      });

      const backSlot = makeSlot(total - 1, cardDistance, verticalDistance, total);
      tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);
      tl.call(
        () => {
          gsap.set(elFront, { zIndex: backSlot.zIndex });
        },
        undefined,
        'return'
      );
      tl.to(
        elFront,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          duration: config.durReturn,
          ease: config.ease
        },
        'return'
      );

      tl.call(() => {
        orderRef.current = [...rest, front];
      });
    };

    const start = () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      placeAll();
      if (total >= 2) swap();
      if (total >= 2) intervalRef.current = window.setInterval(swap, delayMs);
    };

    const stop = () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      tlRef.current?.pause();
    };

    start();

    if (pauseOnHover) {
      node.addEventListener('mouseenter', stop);
      node.addEventListener('mouseleave', start);
    }

    return () => {
      if (pauseOnHover) {
        node.removeEventListener('mouseenter', stop);
        node.removeEventListener('mouseleave', start);
      }
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      tlRef.current?.kill();
      tlRef.current = null;
      for (const r of refs) {
        if (!r.current) continue;
        gsap.killTweensOf(r.current);
      }
    };
  }, [cardDistance, config, delayMs, pauseOnHover, refs, skewAmount, total, verticalDistance]);

  if (!projects.length) return null;

  return (
    <section className={styles.recents} aria-label="历史项目">
      <div ref={deckRef} className={styles.deck} aria-label="历史项目卡片">
        {projects.map((p, i) => (
          <div key={p.path} ref={refs[i]} className={styles.card} aria-label={`历史项目：${p.name}`}>
            <button
              type="button"
              className={styles.cardOpen}
              disabled={isLoading || !p.exists}
              onClick={() => props.dispatch({ type: 'PROJECT_OPEN_RECENT', path: p.path })}
            >
              <div className={styles.cardNameRow}>
                <div className={styles.cardName}>{p.name}</div>
                {!p.exists ? (
                  <span className={styles.cardWarn} title="路径不存在（可手动移除）" aria-label="路径不存在">
                    <Icon name="warning" size={18} />
                  </span>
                ) : null}
              </div>
              <div className={styles.cardPath}>{p.path}</div>
            </button>

            <button
              type="button"
              className={styles.cardRemove}
              disabled={isLoading}
              aria-label={`从历史项目移除：${p.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.dispatch({ type: 'RECENT_PROJECT_REMOVE', path: p.path });
              }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
