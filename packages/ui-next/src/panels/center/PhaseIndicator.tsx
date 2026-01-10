import type { PhaseIndicatorVM, StoryPhase, UIIntent } from '@specwave/contracts';
import { Check, FileText, Lightbulb, ListTodo, Pencil, Play } from 'lucide-react';
import styles from './PhaseIndicator.module.css';

type PhaseIndicatorIntent = Extract<UIIntent, { type: 'PHASE_INDICATOR_CLICK' }>;

export type PhaseIndicatorProps = {
  indicator: PhaseIndicatorVM;
  dispatch: (intent: PhaseIndicatorIntent) => void;
};

const phaseConfig: Record<StoryPhase, { label: string; icon: typeof Lightbulb }> = {
  appeal: { label: '诉求', icon: Lightbulb },
  requirement: { label: '需求', icon: Pencil },
  design: { label: '设计', icon: FileText },
  task: { label: '任务', icon: ListTodo },
  executing: { label: '执行', icon: Play },
  completed: { label: '完成', icon: Check }
};

const displayPhases: StoryPhase[] = ['appeal', 'requirement', 'design', 'task', 'executing', 'completed'];

export function PhaseIndicator({ indicator, dispatch }: PhaseIndicatorProps) {
  if (!indicator.visible) return null;

  const currentIdx = displayPhases.indexOf(indicator.currentPhase);

  return (
    <div className={styles.container}>
      <div className={styles.stepper}>
        {displayPhases.map((phase, idx) => {
          const config = phaseConfig[phase];
          const phaseInfo = indicator.availablePhases.find((p) => p.phase === phase);
          const isCurrent = indicator.currentPhase === phase;
          const isEnabled = phaseInfo?.enabled ?? false;
          const isCompleted = idx < currentIdx;
          const Icon = config.icon;

          return (
            <div key={phase} className={styles.stepWrapper}>
              {/* 连接线（第一个节点前不显示） */}
              {idx > 0 && (
                <div
                  className={styles.connector}
                  data-completed={isCompleted || isCurrent ? 'true' : 'false'}
                />
              )}

              {/* 步骤节点 */}
              <button
                type="button"
                disabled={!isEnabled}
                onClick={() => isEnabled && dispatch({ type: 'PHASE_INDICATOR_CLICK', phase })}
                className={styles.step}
                data-state={isCurrent ? 'current' : isCompleted ? 'completed' : 'pending'}
                data-enabled={isEnabled ? 'true' : 'false'}
                title={isEnabled ? `跳转到${config.label}` : `${config.label}文档不存在`}
              >
                <div className={styles.circle}>
                  {isCompleted ? <Check className={styles.icon} /> : <Icon className={styles.icon} />}
                </div>
                <span className={styles.label}>{config.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
