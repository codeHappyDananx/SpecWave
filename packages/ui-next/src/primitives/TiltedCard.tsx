import React from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import styles from './TiltedCard.module.css';

const springValues = { damping: 30, stiffness: 110, mass: 1.8 };

export type TiltedCardProps = {
  className?: string;
  innerClassName?: string;
  disabled?: boolean;
  scaleOnHover?: number;
  rotateAmplitude?: number;
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

  const ref = React.useRef<HTMLDivElement | null>(null);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  React.useEffect(() => {
    if (!disabled) return;
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }, [disabled, rotateX, rotateY, scale]);

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
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    scale.set(scaleOnHover);
  };

  const handleMouseLeave = () => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  const className = [styles.root, props.className ?? ''].filter(Boolean).join(' ');
  const innerClassName = [styles.inner, props.innerClassName ?? ''].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={className} onMouseMove={handleMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <motion.div className={innerClassName} style={disabled ? undefined : { rotateX, rotateY, scale }}>
        {props.children}
      </motion.div>
    </div>
  );
}
