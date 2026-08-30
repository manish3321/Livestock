import type { ModuleKey } from '@farm/contracts';
import type { Species } from '@farm/contracts';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function ModuleIcon({ module, size = 22 }: { module: ModuleKey; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const };
  switch (module) {
    case 'dashboard':
      return (
        <svg {...props}>
          <path {...stroke} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case 'animals':
      return (
        <svg {...props}>
          <circle {...stroke} cx="12" cy="10" r="4" />
          <path {...stroke} d="M6 20c1.5-3 4-4.5 6-4.5S16.5 17 18 20" />
          <path {...stroke} d="M8 8.5 6 6M16 8.5 18 6" />
        </svg>
      );
    case 'groups':
      return (
        <svg {...props}>
          <circle {...stroke} cx="8" cy="10" r="3" />
          <circle {...stroke} cx="16" cy="10" r="3" />
          <path {...stroke} d="M3.5 19c1-2.5 2.8-3.5 4.5-3.5s3.5 1 4.5 3.5M11.5 19c1-2.5 2.8-3.5 4.5-3.5s3.5 1 4.5 3.5" />
        </svg>
      );
    case 'fish':
      return (
        <svg {...props}>
          <path {...stroke} d="M3 12s4-6 10-6 8 6 8 6-2 6-8 6-10-6-10-6Z" />
          <circle cx="15" cy="11" r="1" fill="currentColor" />
          <path {...stroke} d="M3 12h3" />
        </svg>
      );
    case 'scan':
      return (
        <svg {...props}>
          <path {...stroke} d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" />
          <rect {...stroke} x="8" y="8" width="8" height="8" rx="1" />
        </svg>
      );
    case 'expenses':
      return (
        <svg {...props}>
          <rect {...stroke} x="5" y="3" width="14" height="18" rx="2" />
          <path {...stroke} d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case 'revenue':
      return (
        <svg {...props}>
          <circle {...stroke} cx="12" cy="12" r="8" />
          <path {...stroke} d="M12 7v10M9.5 9.5c.6-1 1.5-1.5 2.5-1.5s2 .6 2 1.8-1 1.7-2.5 2.2-2.5.9-2.5 2.2.9 1.8 2.5 1.8 1.9-.5 2.5-1.5" />
        </svg>
      );
    case 'pnl':
      return (
        <svg {...props}>
          <path {...stroke} d="M4 19V5M4 19h16" />
          <path {...stroke} d="m7 14 3.5-4.5L14 13l4-6" />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...props}>
          <path {...stroke} d="M3 8.5 12 4l9 4.5V18l-9 4-9-4V8.5Z" />
          <path {...stroke} d="M12 12v10M3 8.5 12 12l9-3.5" />
        </svg>
      );
    case 'health':
      return (
        <svg {...props}>
          <path {...stroke} d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z" />
        </svg>
      );
    case 'breeding':
      return (
        <svg {...props}>
          <circle {...stroke} cx="8" cy="8" r="3" />
          <circle {...stroke} cx="16" cy="16" r="3" />
          <path {...stroke} d="m10 10 4 4" />
        </svg>
      );
    case 'production':
      return (
        <svg {...props}>
          <path {...stroke} d="M8 8c0-2 1.8-4 4-4s4 2 4 4c2.5.5 4 2.2 4 4.5S17.5 17 15 17H9c-2.5 0-4-2-4-4.5S5.5 8.5 8 8Z" />
          <path {...stroke} d="M10 17v3M14 17v3" />
        </svg>
      );
    case 'feed':
      return (
        <svg {...props}>
          <path {...stroke} d="M4 18h16M6 18V9l6-4 6 4v9" />
          <path {...stroke} d="M9 14h6M10 11h4" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...props}>
          <path {...stroke} d="M7 3h7l4 4v14H7V3Z" />
          <path {...stroke} d="M14 3v4h4M9 12h7M9 16h5" />
        </svg>
      );
    default:
      return null;
  }
}

export function SpeciesGlyph({ species }: { species: Species }) {
  const label =
    species === 'BUFFALO'
      ? 'BUF'
      : species === 'COW'
        ? 'COW'
        : species === 'PIG'
          ? 'PIG'
          : 'GOT';
  return <span className="animal-card-glyph">{label}</span>;
}
