import { useEffect } from 'react';
import type { StoryBoardVM, UIIntent } from '@specwave/contracts';
import { StoryCard } from '../../primitives/StoryCard';
import { Loader2, RefreshCw } from 'lucide-react';

type StoryBoardIntent = Extract<
  UIIntent,
  | { type: 'STORY_BOARD_LOAD' }
  | { type: 'STORY_BOARD_REFRESH' }
  | { type: 'STORY_CARD_CLICK' }
>;

export type StoryBoardViewProps = {
  storyBoard: StoryBoardVM;
  activeStoryId?: string | null;
  dispatch: (intent: StoryBoardIntent) => void;
};

export function StoryBoardView({ storyBoard, activeStoryId, dispatch }: StoryBoardViewProps) {
  useEffect(() => {
    dispatch({ type: 'STORY_BOARD_LOAD' });
  }, [dispatch]);

  if (storyBoard.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
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
          暂无 Story。
        </div>
      </div>
    );
  }

  // 按创建时间倒序排列（最新的在前）
  const sortedStories = [...storyBoard.stories].sort((a, b) => {
    // 从 id 中提取数字进行排序
    const numA = parseInt(a.id.match(/\d+/)?.[0] ?? '0', 10);
    const numB = parseInt(b.id.match(/\d+/)?.[0] ?? '0', 10);
    return numB - numA;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          共 {storyBoard.stories.length} 个需求
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'STORY_BOARD_REFRESH' })}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          title="刷新"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Story 列表 */}
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-2">
          {sortedStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              isActive={activeStoryId === story.id}
              onClick={() => dispatch({ type: 'STORY_CARD_CLICK', storyId: story.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
