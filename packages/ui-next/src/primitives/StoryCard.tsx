import type { StoryCardVM, StoryPhase } from '@specwave/contracts';

const phaseLabels: Record<StoryPhase, string> = {
  appeal: '诉求对齐',
  requirement: '需求编写',
  design: '设计方案',
  task: '任务拆解',
  executing: '执行中',
  completed: '已完成'
};

const phaseColors: Record<StoryPhase, string> = {
  appeal: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  requirement: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  design: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  task: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
  executing: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  completed: 'bg-green-500/20 text-green-700 dark:text-green-400'
};

export type StoryCardProps = {
  story: StoryCardVM;
  onClick: () => void;
};

export function StoryCard({ story, onClick }: StoryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{story.title}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseColors[story.phase]}`}>
          {phaseLabels[story.phase]}
        </span>
      </div>
      {story.taskProgress && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(story.taskProgress.completed / story.taskProgress.total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {story.taskProgress.completed}/{story.taskProgress.total}
          </span>
        </div>
      )}
    </button>
  );
}
