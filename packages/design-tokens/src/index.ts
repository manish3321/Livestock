/**
 * Semantic design tokens for the Farm Management ERP.
 *
 * Visual language aligned with the Cattle Management concept:
 * forest green CTAs, soft cream surfaces, large rounded cards —
 * adapted for multi-species ERP (tag + status chips, no marketplace chrome).
 */

export const palette = {
  // Brand — moss / pasture
  green800: '#163A2A',
  green700: '#1F5C3B',
  green600: '#2E7A4F',
  green100: '#E6F3EA',
  // Linen / warm paper
  cream: '#F4F1EA',
  creamDark: '#E7E1D4',
  gray900: '#1C211D',
  gray700: '#3E463F',
  gray500: '#6A726B',
  gray300: '#D5CFC3',
  gray100: '#EEE9DF',
  gray50: '#F4F1EA',
  white: '#FFFdf8',
  // Accent
  terracotta: '#C45C26',
  terracottaDark: '#A3491C',
  // Signals
  red700: '#C62828',
  red100: '#FFEBEE',
  amber700: '#E65100',
  amber100: '#FFF3E0',
  blue700: '#1565C0',
  blue100: '#E3F2FD',
  purple700: '#6A1B9A',
  purple100: '#F3E5F5',
  teal700: '#00695C',
  teal100: '#E0F2F1',
  pink700: '#C2185B',
  pink100: '#FCE4EC',
} as const;

export const color = {
  brand: palette.green700,
  brandStrong: palette.green800,
  brandSubtle: palette.green100,
  accent: palette.terracotta,
  accentStrong: palette.terracottaDark,
  textPrimary: palette.gray900,
  textSecondary: palette.gray700,
  textMuted: palette.gray500,
  border: palette.gray300,
  surface: palette.white,
  surfaceSubtle: palette.cream,
  surfaceMuted: palette.creamDark,
  danger: palette.red700,
  dangerSubtle: palette.red100,
  warning: palette.amber700,
  warningSubtle: palette.amber100,
  info: palette.blue700,
  infoSubtle: palette.blue100,
  success: palette.green700,
  successSubtle: palette.green100,
} as const;

/** Animal status chips. */
export const animalStatusColor = {
  GROWING: { fg: palette.green700, bg: palette.green100 },
  HEIFER: { fg: palette.green700, bg: palette.green100 },
  ACTIVE: { fg: palette.green700, bg: palette.green100 },
  PREGNANT: { fg: palette.purple700, bg: palette.purple100 },
  SICK: { fg: palette.red700, bg: palette.red100 },
  QUARANTINE: { fg: palette.amber700, bg: palette.amber100 },
  DRY: { fg: palette.amber700, bg: palette.amber100 },
  LACTATING: { fg: palette.green700, bg: palette.green100 },
  CULLED: { fg: palette.purple700, bg: palette.purple100 },
  SOLD: { fg: palette.blue700, bg: palette.blue100 },
  DEAD: { fg: palette.red700, bg: palette.red100 },
} as const;

/** Expense approval workflow states. */
export const approvalStatusColor = {
  PENDING: { fg: palette.amber700, bg: palette.amber100 },
  APPROVED: { fg: palette.green700, bg: palette.green100 },
  REJECTED: { fg: palette.red700, bg: palette.red100 },
  ESCALATED: { fg: palette.purple700, bg: palette.purple100 },
} as const;

/** Inventory stock severity. */
export const inventorySeverityColor = {
  CRITICAL: { fg: palette.red700, bg: palette.red100 },
  LOW: { fg: palette.amber700, bg: palette.amber100 },
  GOOD: { fg: palette.green700, bg: palette.green100 },
} as const;

/** Offline sync badge colors (unused by web dashboard). */
export const syncStateColor = {
  pending: { fg: palette.amber700, bg: palette.amber100 },
  syncing: { fg: palette.blue700, bg: palette.blue100 },
  synced: { fg: palette.green700, bg: palette.green100 },
  failed: { fg: palette.red700, bg: palette.red100 },
  conflict: { fg: palette.purple700, bg: palette.purple100 },
} as const;

/** Species accent colors for charts and list accents. */
export const speciesColor = {
  BUFFALO: palette.gray700,
  COW: palette.teal700,
  PIG: palette.purple700,
  GOAT: palette.amber700,
  POULTRY: palette.blue700,
  FISH: palette.green600,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/** Type scale sized for outdoor/adult legibility; body stays ≥17. */
export const fontSize = {
  xs: 14,
  sm: 15,
  md: 17,
  lg: 19,
  xl: 26,
  xxl: 32,
  display: 40,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Minimum interactive target size (web px). */
export const touchTarget = 48;
