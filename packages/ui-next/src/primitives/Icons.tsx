import React from 'react';

export type IconName = 'folder' | 'tasks' | 'terminal' | 'chat' | 'theme' | 'plus' | 'close' | 'warning';

type IconProps = {
  name: IconName;
  size?: number;
  title?: string;
};

export function Icon(props: IconProps) {
  const size = props.size ?? 20;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    role: 'img',
    'aria-label': props.title ?? props.name
  };

  switch (props.name) {
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2H18.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
        </svg>
      );
    case 'tasks':
      return (
        <svg {...common}>
          <path d="M9 6h12" />
          <path d="M9 12h12" />
          <path d="M9 18h12" />
          <path d="M3.5 6.5l1.5 1.5 2.5-3" />
          <path d="M3.5 12.5l1.5 1.5 2.5-3" />
          <path d="M3.5 18.5l1.5 1.5 2.5-3" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...common}>
          <path d="M4 5h16v14H4z" />
          <path d="M7 9l2 2-2 2" />
          <path d="M11 13h6" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 12a7 7 0 0 1-7 7H7l-4 3 1.2-4.6A7 7 0 0 1 3 12a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7Z" />
          <path d="M7.8 12h.01" />
          <path d="M12 12h.01" />
          <path d="M16.2 12h.01" />
        </svg>
      );
    case 'theme':
      return (
        <svg {...common}>
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" />
          <path d="M17.66 6.34l1.41-1.41" />
          <path d="M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10Z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return null;
  }
}
