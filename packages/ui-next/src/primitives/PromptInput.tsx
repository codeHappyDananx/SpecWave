import React from 'react';
import styles from './PromptInput.module.css';

export type PromptInputProps = {
  value?: string;
  placeholder: string;
  ariaLabel: string;
  onChangeText?: (text: string) => void;
  onSubmit: (text: string) => void;
};

export function PromptInput(props: PromptInputProps) {
  const isControlled = props.value != null;
  const [inner, setInner] = React.useState('');
  const text = isControlled ? props.value! : inner;
  const elRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setText = (next: string) => {
    if (!isControlled) setInner(next);
    props.onChangeText?.(next);
  };

  const syncHeight = React.useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(44, next)}px`;
  }, []);

  React.useLayoutEffect(() => {
    syncHeight();
  }, [syncHeight, text]);

  return (
    <textarea
      ref={elRef}
      className={styles.input}
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      rows={1}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        // Ctrl/Shift+Enter：换行（多行输入）
        if (e.shiftKey || e.ctrlKey) return;
        const val = (text || '').trim();
        if (!val) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        props.onSubmit(val);
        setText('');
      }}
    />
  );
}
