import type { PhaseIndicatorVM, StoryPhase, UIIntent } from '@specwave/contracts';
import { Check, Circle, FileText, Lightbulb, ListTodo, Pencil, Play } from 'lucide-react';

type PhaseIndicatorIntent = Extract<UIIntent, { type: 'PHASE_INDICATOR_CLICK' }>;

export type PhaseIndicatorProps = {
  indicator: PhaseIndicatorVM;
  dispatch: (intent: PhaseIndicatorIntent) => void;
};

const phaseConfig: Record<StoryPhase, { label: string; icon: typeof Circle }> = {
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

  return (
    <div className="flex items-center gap-1 border-b bg-muted/30 px-3 py-2">
      {displayPhases.map((phase, idx) => {
        const config = phaseConfig[phase];
        const phaseInfo = indicator.availablePhases.find((p) => p.phase === phase);
        const isCurrent = indicator.currentPhase === phase;
        const isEnabled = phaseInfo?.enabled ?? false;
        const Icon = config.icon;

        const isCompleted = displayPhases.indexOf(indicator.currentPhase) > idx;

        return (
          <div key={phase} className="flex items-center">
            {idx > 0 && (
              <div className={`mx-1 h-px w-4 ${isCompleted ? 'bg-primary' : 'bg-border'}`} />
            )}
            <button
              type="button"
              disabled={!isEnabled}
              onClick={() => isEnabled && dispatch({ type: 'PHASE_INDICATOR_CLICK', phase })}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : isEnabled
                    ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    : 'cursor-not-allowed text-muted-foreground/50'
              }`}
              title={isEnabled ? `跳转到${config.label}文档` : `${config.label}文档不存在`}
            >
              <Icon className="h-3 w-3" />
              <span>{config.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
