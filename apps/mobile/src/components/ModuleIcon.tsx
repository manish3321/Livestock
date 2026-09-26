import type { ModuleKey, Species } from '@farm/contracts';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../theme/tokens';

const stroke = {
  fill: 'none' as const,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function ModuleIcon({
  module,
  size = 22,
  color: strokeColor = color.textSecondary,
}: {
  module: ModuleKey;
  size?: number;
  color?: string;
}) {
  const props = { width: size, height: size, viewBox: '0 0 24 24' };
  switch (module) {
    case 'dashboard':
      return (
        <Svg {...props}>
          <Path
            {...stroke}
            stroke={strokeColor}
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
          />
        </Svg>
      );
    case 'animals':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M7.2 9.2 4.8 5.4M16.8 9.2 19.2 5.4" />
          <Path
            {...stroke}
            stroke={strokeColor}
            d="M6.4 13.2c.7-3.4 2.9-5.4 5.6-5.4s4.9 2 5.6 5.4c.4 1.7-.3 3.3-1.6 4.2-1.2.8-2.6 1.1-4 1.1s-2.8-.3-4-1.1c-1.3-.9-2-2.5-1.6-4.2Z"
          />
          <Circle cx="10.2" cy="12.4" r="0.7" fill={strokeColor} />
          <Circle cx="13.8" cy="12.4" r="0.7" fill={strokeColor} />
          <Path {...stroke} stroke={strokeColor} d="M9.5 20.5c.7-2.2 1.7-3.2 2.5-3.2s1.8 1 2.5 3.2" />
        </Svg>
      );
    case 'batches':
      return (
        <Svg {...props}>
          <Rect {...stroke} stroke={strokeColor} x="3" y="4" width="18" height="6" rx="1.5" />
          <Rect {...stroke} stroke={strokeColor} x="3" y="14" width="18" height="6" rx="1.5" />
          <Path {...stroke} stroke={strokeColor} d="M7 7h4M7 17h4" />
        </Svg>
      );
    case 'groups':
      return (
        <Svg {...props}>
          <Circle {...stroke} stroke={strokeColor} cx="8" cy="10" r="3" />
          <Circle {...stroke} stroke={strokeColor} cx="16" cy="10" r="3" />
          <Path
            {...stroke}
            stroke={strokeColor}
            d="M3.5 19c1-2.5 2.8-3.5 4.5-3.5s3.5 1 4.5 3.5M11.5 19c1-2.5 2.8-3.5 4.5-3.5s3.5 1 4.5 3.5"
          />
        </Svg>
      );
    case 'fish':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M3 12s4-6 10-6 8 6 8 6-2 6-8 6-10-6-10-6Z" />
          <Circle cx="15" cy="11" r="1" fill={strokeColor} />
          <Path {...stroke} stroke={strokeColor} d="M3 12h3" />
        </Svg>
      );
    case 'shed':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M3.5 10.5 12 3.5l8.5 7V20.5H3.5v-10Z" />
          <Path {...stroke} stroke={strokeColor} d="M9 20.5v-6h6v6" />
          <Path {...stroke} stroke={strokeColor} d="m9 14.5 6 6M15 14.5l-6 6" />
        </Svg>
      );
    case 'inbox':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M4 6h16v12H4z" />
          <Path {...stroke} stroke={strokeColor} d="m4 6 8 6 8-6" />
        </Svg>
      );
    case 'scan':
      return (
        <Svg {...props}>
          {/* Viewfinder corners */}
          <Path {...stroke} stroke={strokeColor} strokeWidth={2} d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
          <Path {...stroke} stroke={strokeColor} strokeWidth={2} d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
          <Path {...stroke} stroke={strokeColor} strokeWidth={2} d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
          <Path {...stroke} stroke={strokeColor} strokeWidth={2} d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
          {/* QR modules */}
          <Rect x="7" y="7" width="4" height="4" rx="0.6" fill={strokeColor} />
          <Rect x="13" y="7" width="4" height="4" rx="0.6" fill={strokeColor} />
          <Rect x="7" y="13" width="4" height="4" rx="0.6" fill={strokeColor} />
          <Rect x="12.2" y="12.2" width="2.2" height="2.2" fill={strokeColor} />
          <Rect x="15.5" y="12.2" width="1.6" height="1.6" fill={strokeColor} />
          <Rect x="12.2" y="15.5" width="1.6" height="1.6" fill={strokeColor} />
          <Rect x="15" y="15" width="2.5" height="2.5" rx="0.4" fill={strokeColor} />
          {/* Scan beam */}
          <Path {...stroke} stroke={strokeColor} strokeWidth={1.6} d="M6 12h12" opacity={0.85} />
        </Svg>
      );
    case 'expenses':
      return (
        <Svg {...props}>
          <Rect {...stroke} stroke={strokeColor} x="5" y="3" width="14" height="18" rx="2" />
          <Path {...stroke} stroke={strokeColor} d="M8 8h8M8 12h8M8 16h5" />
        </Svg>
      );
    case 'revenue':
      return (
        <Svg {...props}>
          <Circle {...stroke} stroke={strokeColor} cx="12" cy="12" r="8" />
          <Path
            {...stroke}
            stroke={strokeColor}
            d="M12 7v10M9.5 9.5c.6-1 1.5-1.5 2.5-1.5s2 .6 2 1.8-1 1.7-2.5 2.2-2.5.9-2.5 2.2.9 1.8 2.5 1.8 1.9-.5 2.5-1.5"
          />
        </Svg>
      );
    case 'pnl':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M4 19V5M4 19h16" />
          <Path {...stroke} stroke={strokeColor} d="m7 14 3.5-4.5L14 13l4-6" />
        </Svg>
      );
    case 'inventory':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M3 8.5 12 4l9 4.5V18l-9 4-9-4V8.5Z" />
          <Path {...stroke} stroke={strokeColor} d="M12 12v10M3 8.5 12 12l9-3.5" />
        </Svg>
      );
    case 'health':
      return (
        <Svg {...props}>
          <Rect {...stroke} stroke={strokeColor} x="4.5" y="4.5" width="15" height="15" rx="3.5" />
          <Path {...stroke} stroke={strokeColor} d="M12 8.2v7.6M8.2 12h7.6" />
        </Svg>
      );
    case 'breeding':
      return (
        <Svg {...props}>
          <Circle {...stroke} stroke={strokeColor} cx="8" cy="8" r="3" />
          <Circle {...stroke} stroke={strokeColor} cx="16" cy="16" r="3" />
          <Path {...stroke} stroke={strokeColor} d="m10 10 4 4" />
        </Svg>
      );
    case 'production':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M7.2 8.5h9.6l-.7 10.2H7.9L7.2 8.5Z" />
          <Path
            {...stroke}
            stroke={strokeColor}
            d="M8.4 8.5V6.8A3.6 3.6 0 0 1 12 4.4a3.6 3.6 0 0 1 3.6 2.4v1.7"
          />
          <Path {...stroke} stroke={strokeColor} d="M9.6 13.6h4.8" />
        </Svg>
      );
    case 'feed':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M5 14.5c0-2.2 3.1-4 7-4s7 1.8 7 4V19H5v-4.5Z" />
          <Path {...stroke} stroke={strokeColor} d="M8.2 10.6c.6-3.2 2.1-5.4 3.8-5.4s3.2 2.2 3.8 5.4" />
          <Path {...stroke} stroke={strokeColor} d="M9.5 16.4h5" />
        </Svg>
      );
    case 'reports':
      return (
        <Svg {...props}>
          <Path {...stroke} stroke={strokeColor} d="M7 3h7l4 4v14H7V3Z" />
          <Path {...stroke} stroke={strokeColor} d="M14 3v4h4M9 12h7M9 16h5" />
        </Svg>
      );
    default:
      return null;
  }
}

export function ScanGlyph({ size = 22, color: strokeColor = color.textSecondary }: { size?: number; color?: string }) {
  return <ModuleIcon module="scan" size={size} color={strokeColor} />;
}

export function MoreGlyph({ size = 20, color: strokeColor = color.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M5 7h14M5 12h14M5 17h10"
      />
    </Svg>
  );
}

export function FarmMark({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const bg = light ? 'rgba(255,253,249,0.18)' : color.brand;
  const ridge = light ? 'rgba(255,253,249,0.55)' : '#2A6A4A';
  const door = light ? color.brandStrong : color.brand;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect width="40" height="40" rx="10" fill={bg} />
      <Path
        d="M20 6L8 16V32c0 .8.7 1.5 1.5 1.5h21c.8 0 1.5-.7 1.5-1.5V16L20 6Z"
        fill={ridge}
        stroke={light ? '#E5DEC9' : '#E5DEC9'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <Path
        d="M14 33.5V20.5c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v13"
        fill={door}
        stroke={color.earTag}
        strokeWidth="1.6"
      />
      <Circle cx="20" cy="14" r="2.4" fill={color.ember} />
      <Path
        d="M7 15c-2.5-4 0-8 4.5-6.5"
        stroke={light ? '#FFFDF9' : '#FFFDF9'}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M33 15c2.5-4 0-8-4.5-6.5"
        stroke={light ? '#FFFDF9' : '#FFFDF9'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function speciesCode(species: Species): string {
  return species === 'BUFFALO' ? 'BUF' : species === 'COW' ? 'COW' : species === 'PIG' ? 'PIG' : 'GOT';
}
