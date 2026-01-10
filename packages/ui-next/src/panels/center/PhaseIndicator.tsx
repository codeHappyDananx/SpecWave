import type { PhaseIndicatorVM, StoryPhase, UIIntent } from '@specwave/contracts';
import { motion } from 'motion/react';
import styles from './PhaseIndicator.module.css';

type PhaseIndicatorIntent = Extract<UIIntent, { type: 'PHASE_INDICATOR_CLICK' }>;

export type PhaseIndicatorProps = {
  indicator: PhaseIndicatorVM;
  dispatch: (intent: PhaseIndicatorIntent) => void;
};

const phaseConfig: Record<StoryPhase, { label: string }> = {
  appeal: { label: '诉求' },
  requirement: { label: '需求' },
  design: { label: '设计' },
  task: { label: '任务' },
  executing: { label: '执行' },
  completed: { label: '完成' }
};

const displayPhases: StoryPhase[] = ['appeal', 'requirement', 'design', 'task', 'executing', 'completed'];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.1, type: 'tween', ease: 'easeOut', duration: 0.3 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function StepConnector({ isComplete }: { isComplete: boolean }) {
  return (
    <div className={styles.connector}>
      <motion.div
        className={styles.connectorInner}
        initial={false}
        animate={isComplete ? { width: '100%' } : { width: 0 }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

export function PhaseIndicator({ indicator, dispatch }: PhaseIndicatorProps) {
  if (!indicator.visible) return null;

  const currentIdx = displayPhases.indexOf(indicator.currentPhase);
  
  // 只显示 STORY-XXXXXX 部分
  const storyNumber = indicator.storyId?.match(/^STORY-\d+/)?.[0] ?? indicator.storyId;

  return (
    <div className={styles.container}>
      {/* Story ID */}
      {storyNumber && <div className={styles.storyId}>{storyNumber}</div>}

      {/* Stepper */}
      <div className={styles.stepperRow}>
        {displayPhases.map((phase, idx) => {
          const config = phaseConfig[phase];
          const phaseInfo = indicator.availablePhases.find((p) => p.phase === phase);
          const isCurrent = indicator.currentPhase === phase;
          const isEnabled = phaseInfo?.enabled ?? false;
          const isCompleted = idx < currentIdx;

          const status = isCurrent ? 'active' : isCompleted ? 'complete' : 'inactive';

          return (
            <div key={phase} className={styles.stepWrapper}>
              {/* Step Indicator */}
              <motion.button
                type="button"
                disabled={!isEnabled}
                onClick={() => isEnabled && dispatch({ type: 'PHASE_INDICATOR_CLICK', phase })}
                className={styles.stepIndicator}
                data-status={status}
                data-enabled={isEnabled ? 'true' : 'false'}
                title={isEnabled ? `跳转到${config.label}` : `${config.label}文档不存在`}
                animate={status}
                initial={false}
                whileHover={isEnabled ? { scale: 1.08 } : undefined}
                whileTap={isEnabled ? { scale: 0.95 } : undefined}
              >
                <motion.div
                  className={styles.stepCircle}
                  variants={{
                    inactive: { 
                      backgroundColor: 'var(--color-bg-elevated)',
                      borderColor: 'var(--color-border)'
                    },
                    active: { 
                      backgroundColor: 'var(--color-accent)',
                      borderColor: 'var(--color-accent)'
                    },
                    complete: { 
                      backgroundColor: 'var(--color-accent)',
                      borderColor: 'var(--color-accent)'
                    }
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {isCompleted ? (
                    <CheckIcon className={styles.checkIcon} />
                  ) : isCurrent ? (
                    <div className={styles.activeDot} />
                  ) : (
                    <span className={styles.stepNumber}>{idx + 1}</span>
                  )}
                </motion.div>
                <span className={styles.stepLabel}>{config.label}</span>
              </motion.button>

              {/* Connector */}
              {idx < displayPhases.length - 1 && <StepConnector isComplete={idx < currentIdx} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
