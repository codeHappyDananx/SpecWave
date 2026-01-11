import React from 'react';
import type { StoryStepperVM, UIIntent } from '@specwave/contracts';
import styles from './ReactBitsStepper.module.css';

type StepperIntent = Extract<UIIntent, { type: 'STORY_STEPPER_PHASE_CLICK' }>;

export type ReactBitsStepperProps = {
  stepper: StoryStepperVM;
  dispatch: (intent: StepperIntent) => void;
};

// Star Border 组件 - 旋转渐变边框效果
function StarBorder({
  children,
  color = 'var(--primary)',
  speed = '4s',
  className = '',
}: {
  children: React.ReactNode;
  color?: string;
  speed?: string;
  className?: string;
}) {
  return (
    <div
      className={`${styles.starBorder} ${className}`}
      style={{ '--star-color': color, '--star-speed': speed } as React.CSSProperties}
    >
      <div className={styles.starBorderInner}>{children}</div>
    </div>
  );
}

export function ReactBitsStepper(props: ReactBitsStepperProps) {
  const { stepper, dispatch } = props;

  if (!stepper.visible) return null;

  return (
    <div className={styles.container}>
      {stepper.phases.map((phase, index) => {
        const isActive = phase.phase === stepper.currentPhase;
        const isDisabled = !phase.enabled;

        const stepState = isDisabled ? 'disabled' : isActive ? 'active' : 'inactive';

        const indicator = (
          <div className={`${styles.indicator} ${styles[`indicator-${stepState}`]}`}>
            <span className={styles.stepNumber}>{index + 1}</span>
          </div>
        );

        return (
          <React.Fragment key={phase.phase}>
            {index > 0 && <div className={styles.connector} />}
            <button
              type="button"
              className={`${styles.step} ${styles[`step-${stepState}`]}`}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  dispatch({ type: 'STORY_STEPPER_PHASE_CLICK', phase: phase.phase });
                }
              }}
              aria-label={`${phase.label}${isDisabled ? '（不可用）' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isActive ? <StarBorder>{indicator}</StarBorder> : indicator}
              <span className={styles.label}>{phase.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
