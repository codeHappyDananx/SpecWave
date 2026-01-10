import React from 'react';
import { motion } from 'motion/react';
import type { StoryStepperVM, UIIntent } from '@specwave/contracts';
import styles from './ReactBitsStepper.module.css';

type StepperIntent = Extract<UIIntent, { type: 'STORY_STEPPER_PHASE_CLICK' }>;

export type ReactBitsStepperProps = {
  stepper: StoryStepperVM;
  dispatch: (intent: StepperIntent) => void;
};

function CheckIcon() {
  return (
    <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <motion.path
        d="M5 13l4 4L19 7"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </svg>
  );
}

export function ReactBitsStepper(props: ReactBitsStepperProps) {
  const { stepper, dispatch } = props;

  if (!stepper.visible) return null;

  const currentIndex = stepper.phases.findIndex((p) => p.phase === stepper.currentPhase);

  return (
    <div className={styles.container}>
      {stepper.phases.map((phase, index) => {
        const isActive = phase.phase === stepper.currentPhase;
        const isComplete = index < currentIndex;
        const isDisabled = !phase.enabled;

        const stepState = isDisabled
          ? 'disabled'
          : isComplete
            ? 'complete'
            : isActive
              ? 'active'
              : 'inactive';

        return (
          <React.Fragment key={phase.phase}>
            {index > 0 && (
              <div
                className={`${styles.connector} ${index <= currentIndex ? styles.connectorActive : ''}`}
              />
            )}
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
              <motion.div
                className={styles.indicator}
                initial={false}
                animate={{
                  scale: isActive ? 1.1 : 1,
                  backgroundColor: isComplete || isActive
                    ? 'var(--primary)'
                    : isDisabled
                      ? 'var(--muted)'
                      : 'transparent'
                }}
                transition={{ duration: 0.2 }}
              >
                {isComplete ? (
                  <CheckIcon />
                ) : (
                  <span className={styles.stepNumber}>{index + 1}</span>
                )}
              </motion.div>
              <span className={styles.label}>{phase.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
