import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeftRailSwitcher } from './LeftRailSwitcher';

describe('LeftRailSwitcher', () => {
  it('展示激活态并在点击时切换左栏标签', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();

    render(<LeftRailSwitcher tab="workbench" dispatch={dispatch} />);

    const workbenchButton = screen.getByRole('button', { name: '工作区' });
    const capabilityButton = screen.getByRole('button', { name: '能力（MCP 与技能）' });

    expect(workbenchButton.getAttribute('data-active')).toBe('true');
    expect(capabilityButton.getAttribute('data-active')).toBe('false');

    await user.click(capabilityButton);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'LEFT_PANEL_TAB_SET', tab: 'codexCapabilities' });
  });
});

