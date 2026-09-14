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
          <path {...stroke} d="M7.2 9.2 4.8 5.4M16.8 9.2 19.2 5.4" />
          <path {...stroke} d="M6.4 13.2c.7-3.4 2.9-5.4 5.6-5.4s4.9 2 5.6 5.4c.4 1.7-.3 3.3-1.6 4.2-1.2.8-2.6 1.1-4 1.1s-2.8-.3-4-1.1c-1.3-.9-2-2.5-1.6-4.2Z" />
          <circle cx="10.2" cy="12.4" r="0.7" fill="currentColor" />
          <circle cx="13.8" cy="12.4" r="0.7" fill="currentColor" />
          <path {...stroke} d="M9.5 20.5c.7-2.2 1.7-3.2 2.5-3.2s1.8 1 2.5 3.2" />
        </svg>
      );
    case 'batches':
      return (
        <svg {...props}>
          <rect {...stroke} x="3" y="4" width="18" height="6" rx="1.5" />
          <rect {...stroke} x="3" y="14" width="18" height="6" rx="1.5" />
          <path {...stroke} d="M7 7h4M7 17h4" />
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
    case 'shed':
      return (
        <svg {...props}>
          <path {...stroke} d="M3.5 10.5 12 3.5l8.5 7V20.5H3.5v-10Z" />
          <path {...stroke} d="M9 20.5v-6h6v6" />
          <path {...stroke} d="m9 14.5 6 6M15 14.5l-6 6" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...props}>
          <path {...stroke} d="M4 6h16v12H4z" />
          <path {...stroke} d="m4 6 8 6 8-6" />
        </svg>
      );
    case 'scan':
      return (
        <svg {...props}>
          <path {...stroke} d="M9 6.5h6a2 2 0 0 1 2 2v8.4l-5 2.6-5-2.6V8.5a2 2 0 0 1 2-2Z" />
          <circle {...stroke} cx="12" cy="10.2" r="1.15" />
          <path {...stroke} d="M10 13.6h4M10 16h2.8" />
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
          <rect {...stroke} x="4.5" y="4.5" width="15" height="15" rx="3.5" />
          <path {...stroke} d="M12 8.2v7.6M8.2 12h7.6" />
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
          <path {...stroke} d="M7.2 8.5h9.6l-.7 10.2H7.9L7.2 8.5Z" />
          <path {...stroke} d="M8.4 8.5V6.8A3.6 3.6 0 0 1 12 4.4a3.6 3.6 0 0 1 3.6 2.4v1.7" />
          <path {...stroke} d="M9.6 13.6h4.8" />
        </svg>
      );
    case 'feed':
      return (
        <svg {...props}>
          <path {...stroke} d="M5 14.5c0-2.2 3.1-4 7-4s7 1.8 7 4V19H5v-4.5Z" />
          <path {...stroke} d="M8.2 10.6c.6-3.2 2.1-5.4 3.8-5.4s3.2 2.2 3.8 5.4" />
          <path {...stroke} d="M9.5 16.4h5" />
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
