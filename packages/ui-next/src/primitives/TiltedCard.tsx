import React from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import styles from './TiltedCard.module.css';

const springValues = { damping: 30, stiffness: 110, mass: 1.8 };

const persistedTilts = new Map<string, { rotateX: number; rotateY: number; scale: number; over: boolean }>();

export type TiltedCardProps = {
  className?: string;
  innerClassName?: string;
  disabled?: boolean;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  persistKey?: string;
  children: React.ReactNode;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;

    const apply = () => setReduced(Boolean(mq.matches));
    apply();

    const onChange = () => apply();
    try {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);

  return reduced;
}

export function TiltedCard(props: TiltedCardProps) {
  const rotateAmplitude = props.rotateAmplitude ?? 10;
  const scaleOnHover = props.scaleOnHover ?? 1.02;
  const prefersReducedMotion = usePrefersReducedMotion();
  const disabled = Boolean(props.disabled || prefersReducedMotion);
  const persistKey = props.persistKey;

  const ref = React.useRef<HTMLDivElement | null>(null);
  const [tiltOn, setTiltOn] = React.useState(false);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  React.useEffect(() => {
    if (disabled) {
      setTiltOn(false);
      scale.set(1);
      rotateX.set(0);
      rotateY.set(0);
      return;
    }
    if (!persistKey) return;
    const prev = persistedTilts.get(persistKey);
    if (!prev) return;
    setTiltOn(Boolean(prev.over));
    scale.set(prev.scale);
    rotateX.set(prev.rotateX);
    rotateY.set(prev.rotateY);
  }, [disabled, persistKey, rotateX, rotateY, scale]);

  const persist = React.useCallback(
    (next?: { rotateX?: number; rotateY?: number; scale?: number }) => {
      if (!persistKey) return;
      persistedTilts.set(persistKey, {
        rotateX: next?.rotateX ?? rotateX.get(),
        rotateY: next?.rotateY ?? rotateY.get(),
        scale: next?.scale ?? scale.get(),
        over: tiltOn
      });
    },
    [persistKey, rotateX, rotateY, scale, tiltOn]
  );

  const handleMouseMove = (e: React.MouseEvent) => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;
    rotateX.set(rotationX);
    rotateY.set(rotationY);
    persist({ rotateX: rotationX, rotateY: rotationY });
  };

  const handleMouseEnter = () => {
    setTiltOn(true);
    if (disabled) return;
    scale.set(scaleOnHover);
    persist({ scale: scaleOnHover });
  };

  const handleMouseLeave = () => {
    setTiltOn(false);
    if (disabled) return;
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    persist({ rotateX: 0, rotateY: 0, scale: 1 });
  };

  const className = [styles.root, props.className ?? ''].filter(Boolean).join(' ');
  const innerClassName = [styles.inner, props.innerClassName ?? ''].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={className}
      data-tilt={tiltOn && !disabled ? 'on' : undefined}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className={innerClassName} style={disabled ? undefined : { rotateX, rotateY, scale }}>
        {props.children}
      </motion.div>
    </div>
  );
}
