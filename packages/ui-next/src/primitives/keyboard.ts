import type React from 'react';

export function activateOnEnterOrSpace(e: React.KeyboardEvent, onActivate: () => void) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  onActivate();
}

