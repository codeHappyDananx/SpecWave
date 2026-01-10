import type { StoryCardVM, StoryPhase } from '@specwave/contracts';

const phaseLabels: Record<StoryPhase, string> = {
  appeal: '诉求',
  requirement: '需求',
  design: '设计',
  task: '任务',
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
  isActive?: boolean;
  onClick: () => void;
};

export function StoryCard({ story, isActive, onClick }: StoryCardProps) {
  // 从 id 中提取需求号，如 STORY-000012(xxx) -> STORY-000012
  const storyNumber = story.id.match(/^STORY-\d+/)?.[0] ?? story.id;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        isActive
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'bg-card hover:bg-accent/50 hover:border-accent'
      }`}
    >
      {/* 需求号 + 阶段标签 */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-primary/80 tracking-wide">
          {storyNumber}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseColors[story.phase]}`}>
          {phaseLabels[story.phase]}
        </span>
      </div>

      {/* 标题 */}
      <div className="text-sm font-medium leading-tight line-clamp-2">
        {story.title}
      </div>

      {/* 任务进度 */}
      {story.taskProgress && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
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
