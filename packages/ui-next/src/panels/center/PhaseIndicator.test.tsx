import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PhaseIndicatorVM } from '@specwave/contracts';
import { describe, expect, it, vi } from 'vitest';
import { PhaseIndicator } from './PhaseIndicator';

function buildIndicator(overrides: Partial<PhaseIndicatorVM> = {}): PhaseIndicatorVM {
  return {
    visible: true,
    storyId: 'STORY-000123(欢迎页测试)',
    currentPhase: 'design',
    availablePhases: [
      { phase: 'appeal', enabled: true, filePath: null },
      { phase: 'requirement', enabled: true, filePath: 'F:/stories/STORY-000123/01-需求.md' },
      { phase: 'design', enabled: true, filePath: 'F:/stories/STORY-000123/02-设计.md' },
      { phase: 'task', enabled: true, filePath: 'F:/stories/STORY-000123/03-任务.md' },
      { phase: 'executing', enabled: false, filePath: null },
      { phase: 'completed', enabled: false, filePath: null }
    ],
    ...overrides
  };
}

describe('PhaseIndicator', () => {
  it('visible=false 时不渲染', () => {
    const dispatch = vi.fn();
    render(<PhaseIndicator indicator={buildIndicator({ visible: false })} dispatch={dispatch} />);

    expect(screen.queryByText('STORY-000123')).toBeNull();
  });

  it('显示精简 Story 编号，并且只允许点击可用阶段', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();

    render(<PhaseIndicator indicator={buildIndicator()} dispatch={dispatch} />);

    expect(screen.getByText('STORY-000123')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '需求' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PHASE_INDICATOR_CLICK', phase: 'requirement' });

    dispatch.mockClear();
    const disabledButton = screen.getByRole('button', { name: /执行/ });
    expect((disabledButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(disabledButton);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
