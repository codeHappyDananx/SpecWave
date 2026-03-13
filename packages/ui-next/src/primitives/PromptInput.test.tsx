import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromptInput } from './PromptInput';

describe('PromptInput', () => {
  it('按 Enter 提交去首尾空格后的内容并清空输入框', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<PromptInput placeholder="输入需求" ariaLabel="需求输入框" onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox', { name: '需求输入框' });
    await user.type(input, '  修复欢迎页  ');
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('修复欢迎页');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('空白内容和 Shift+Enter 都不会触发提交', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<PromptInput placeholder="输入需求" ariaLabel="需求输入框" onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox', { name: '需求输入框' });
    await user.type(input, '   ');
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '保留换行');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toContain('保留换行');
  });
});

