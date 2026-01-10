import { useEffect } from 'react';
import type { StoryBoardVM, StoryPhase, UIIntent } from '@specwave/contracts';
import { StoryCard } from '../../primitives/StoryCard';
import { Loader2 } from 'lucide-react';

type StoryBoardIntent = Extract<
  UIIntent,
  | { type: 'STORY_BOARD_LOAD' }
  | { type: 'STORY_BOARD_REFRESH' }
  | { type: 'STORY_CARD_CLICK' }
>;

export type StoryBoardViewProps = {
  storyBoard: StoryBoardVM;
  dispatch: (intent: StoryBoardIntent) => void;
};

const phaseOrder: StoryPhase[] = ['appeal', 'requirement', 'design', 'task', 'executing', 'completed'];
const phaseLabels: Record<StoryPhase, string> = {
  appeal: '诉求对齐',
  requirement: '需求编写',
  design: '设计方案',
  task: '任务拆解',
  executing: '执行中',
  completed: '已完成'
};

export function StoryBoardView({ storyBoard, dispatch }: StoryBoardViewProps) {
  useEffect(() => {
    dispatch({ type: 'STORY_BOARD_LOAD' });
  }, [dispatch]);

  if (storyBoard.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (storyBoard.error) {
    return (
      <div className="p-3">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {storyBoard.error}
        </div>
      </div>
    );
  }

  if (storyBoard.stories.length === 0) {
    return (
      <div className="p-3">
        <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
          暂无 Story。在 .specwave/workspace/stories/ 目录下创建 Story 后，这里会显示看板视图。
        </div>
      </div>
    );
  }

  // 按阶段分组
  const storiesByPhase = phaseOrder.reduce((acc, phase) => {
    acc[phase] = storyBoard.stories.filter((s) => s.phase === phase);
    return acc;
  }, {} as Record<StoryPhase, typeof storyBoard.stories>);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Story 看板</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'STORY_BOARD_REFRESH' })}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          刷新
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-4">
          {phaseOrder.map((phase) => {
            const stories = storiesByPhase[phase];
            if (stories.length === 0) return null;
            return (
              <div key={phase}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{phaseLabels[phase]}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {stories.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stories.map((story) => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onClick={() => dispatch({ type: 'STORY_CARD_CLICK', storyId: story.id })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
