import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoryBoardVM } from '@specwave/contracts';
import { describe, expect, it, vi } from 'vitest';
import { StoryBoardView } from './StoryBoardView';

function buildStoryBoard(overrides: Partial<StoryBoardVM> = {}): StoryBoardVM {
  return {
    isLoading: false,
    error: null,
    stories: [
      {
        id: 'STORY-000002(旧 Story)',
        title: '旧 Story',
        phase: 'requirement',
        createdAt: '2026-03-10T10:00:00.000Z',
        taskProgress: null,
        path: 'F:/stories/STORY-000002'
      },
      {
        id: 'STORY-000010(最新 Story)',
        title: '最新 Story',
        phase: 'design',
        createdAt: '2026-03-11T10:00:00.000Z',
        taskProgress: { completed: 1, total: 3 },
        path: 'F:/stories/STORY-000010'
      }
    ],
    ...overrides
  };
}

describe('StoryBoardView', () => {
  it('挂载时只触发一次加载，并按编号倒序展示 Story', () => {
    const dispatch = vi.fn();
    const storyBoard = buildStoryBoard();
    const { rerender } = render(<StoryBoardView storyBoard={storyBoard} activeStoryId={null} dispatch={dispatch} />);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'STORY_BOARD_LOAD' });

    rerender(<StoryBoardView storyBoard={storyBoard} activeStoryId={null} dispatch={dispatch} />);
    expect(dispatch).toHaveBeenCalledTimes(1);

    const storyButtons = screen
      .getAllByRole('button')
      .filter((button) => button.textContent?.includes('STORY-'));

    expect(storyButtons[0]?.textContent).toContain('STORY-000010');
    expect(storyButtons[1]?.textContent).toContain('STORY-000002');
  });

  it('支持刷新和点击 Story 卡片', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();

    render(<StoryBoardView storyBoard={buildStoryBoard()} activeStoryId="STORY-000010(最新 Story)" dispatch={dispatch} />);
    dispatch.mockClear();

    await user.click(screen.getByRole('button', { name: '刷新 Story 列表' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'STORY_BOARD_REFRESH' });

    await user.click(screen.getByRole('button', { name: /最新 Story/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'STORY_CARD_CLICK', storyId: 'STORY-000010(最新 Story)' });
  });
});

