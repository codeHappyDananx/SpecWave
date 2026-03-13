import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppViewModel } from '@specwave/contracts';
import { describe, expect, it, vi } from 'vitest';
import { TopBar, type TopBarProps } from './TopBar';

function buildProps(overrides: Partial<TopBarProps> = {}): TopBarProps {
  return {
    projects: {
      openTabs: [{ id: 'proj-1', folderName: 'SpecWave', path: 'F:/AI/SpecWave' }],
      activeTabId: 'proj-1'
    },
    globalSearchQuery: '',
    leftVisible: true,
    centerVisible: true,
    rightVisible: true,
    rightMode: 'chat' satisfies AppViewModel['rightMode'],
    dispatch: vi.fn(),
    ...overrides
  };
}

describe('TopBar', () => {
  it('搜索框输入和清空都会派发全局搜索意图', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<TopBar {...props} />);

    const input = screen.getByRole('searchbox', { name: '搜索文件' });
    await user.type(input, 'welcome');
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: 'GLOBAL_SEARCH_SET', query: 'welcome' });

    await user.click(screen.getByRole('button', { name: '清空' }));
    expect(props.dispatch).toHaveBeenLastCalledWith({ type: 'GLOBAL_SEARCH_SET', query: '' });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('终端按钮会按当前右栏状态切换模式或显隐', async () => {
    const user = userEvent.setup();
    const props = buildProps({
      rightVisible: true,
      rightMode: 'terminal'
    });

    render(<TopBar {...props} />);

    await user.click(screen.getByRole('button', { name: '终端' }));

    expect(props.dispatch).toHaveBeenCalledTimes(1);
    expect(props.dispatch).toHaveBeenCalledWith({ type: 'PANEL_TOGGLE_RIGHT' });
  });

  it('皮肤按钮默认切主题，按住 Shift 切主色', () => {
    const props = buildProps();

    render(<TopBar {...props} />);

    const themeButton = screen.getByRole('button', { name: '皮肤' });

    fireEvent.click(themeButton);
    expect(props.dispatch).toHaveBeenCalledWith({ type: 'THEME_TOGGLE' });

    fireEvent.click(themeButton, { shiftKey: true });
    expect(props.dispatch).toHaveBeenCalledWith({ type: 'SKIN_CYCLE' });
  });

  it('项目页签支持激活和关闭', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<TopBar {...props} />);

    await user.click(screen.getByRole('tab', { name: /SpecWave/ }));
    await user.click(screen.getByRole('button', { name: '关闭项目 SpecWave' }));

    expect(props.dispatch).toHaveBeenCalledWith({ type: 'PROJECT_TAB_SET_ACTIVE', id: 'proj-1' });
    expect(props.dispatch).toHaveBeenCalledWith({ type: 'PROJECT_TAB_CLOSE', id: 'proj-1' });
  });
});
