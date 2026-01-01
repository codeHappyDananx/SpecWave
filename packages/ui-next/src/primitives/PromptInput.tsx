import React from 'react';

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

  const setText = (next: string) => {
    if (!isControlled) setInner(next);
    props.onChangeText?.(next);
  };

  return (
    <input
      className="input mono"
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        if (e.shiftKey) return;
        const val = (text || '').trim();
        if (!val) return;
        e.preventDefault();
        props.onSubmit(val);
        setText('');
      }}
    />
  );
}

