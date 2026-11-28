/**
 * Evoqed Farm Management - mobile design tokens.
 * Warm cream surfaces with moss/ember brand accents.
 */

export const evoqedPalette = {
  // Brand
  moss: '#1F4D38',
  mossDeep: '#033623',
  mossMid: '#2A6A4A',
  mossSoft: '#E3F9E9',
  mossFixed: '#A1D1B6',
  mossFixedStrong: '#BCEED1',
  terracotta: '#C45C26',
  terracottaDeep: '#9F410A',
  terracottaSoft: '#FE884F',
  terracottaWash: '#FEF6EE',
  earTag: '#F9A825',
  // Surfaces (tonal clay + mint chrome from mockups)
  canvas: '#F8F5EE',
  card: '#FFFDF9',
  pressed: '#F0EAE1',
  clay: '#E5DEC9',
  fieldBorder: '#D4CCA9',
  mint: '#E3F9E9',
  mintDim: '#CADFD0',
  outline: '#717973',
  // Foreground
  ink: '#14261C',
  inkMuted: '#5C6B60',
  inkSecondary: '#414943',
  white: '#FFFFFF',
  // System states
  healthy: '#2E7D32',
  healthySoft: '#E8F5E9',
  heat: '#E65100',
  heatSoft: '#FFF3E0',
  withhold: '#C62828',
  withholdSoft: '#FFEBEE',
  offline: '#5C6B60',
  offlineSoft: '#E5DEC9',
  // Extra accents
  teal: '#00695C',
  blue: '#1565C0',
  blueSoft: '#E3F2FD',
  purple: '#6A1B9A',
  purpleSoft: '#F3E5F5',
  pink: '#C2185B',
  pinkSoft: '#FCE4EC',
} as const;

/** Semantic color map â€” same keys as former @farm/design-tokens `color`. */
export const evoqedColor = {
  brand: evoqedPalette.moss,
  brandStrong: evoqedPalette.mossDeep,
  brandSubtle: evoqedPalette.mossSoft,
  accent: evoqedPalette.moss,
  accentStrong: evoqedPalette.mossDeep,
  ember: evoqedPalette.terracotta,
  emberStrong: evoqedPalette.terracottaDeep,
  textPrimary: evoqedPalette.ink,
  textSecondary: evoqedPalette.inkSecondary,
  textMuted: evoqedPalette.inkMuted,
  border: evoqedPalette.clay,
  surface: evoqedPalette.card,
  surfaceSubtle: evoqedPalette.canvas,
  surfaceMuted: evoqedPalette.mint,
  danger: evoqedPalette.withhold,
  dangerSubtle: evoqedPalette.withholdSoft,
  warning: evoqedPalette.heat,
  warningSubtle: evoqedPalette.heatSoft,
  info: evoqedPalette.blue,
  infoSubtle: evoqedPalette.blueSoft,
  success: evoqedPalette.healthy,
  successSubtle: evoqedPalette.healthySoft,
  earTag: evoqedPalette.earTag,
  fieldBorder: evoqedPalette.fieldBorder,
  offline: evoqedPalette.offline,
  outline: evoqedPalette.outline,
  mint: evoqedPalette.mint,
  mossFixed: evoqedPalette.mossFixed,
  terracottaSoft: evoqedPalette.terracottaSoft,
  terracottaWash: evoqedPalette.terracottaWash,
} as const;

/** Alias palette shape kept for MoreDrawer / legacy `palette.*` imports. */
export const evoqedPaletteAlias = {
  green800: evoqedPalette.moss,
  green700: evoqedPalette.mossMid,
  green600: '#3A7D58',
  green100: evoqedPalette.mossSoft,
  cream: evoqedPalette.canvas,
  creamDark: evoqedPalette.clay,
  gray900: evoqedPalette.ink,
  gray700: evoqedPalette.inkSecondary,
  gray500: evoqedPalette.inkMuted,
  gray300: evoqedPalette.clay,
  gray100: evoqedPalette.pressed,
  gray50: evoqedPalette.canvas,
  white: evoqedPalette.card,
  terracotta: evoqedPalette.terracotta,
  terracottaDark: evoqedPalette.terracottaDeep,
  red700: evoqedPalette.withhold,
  red100: evoqedPalette.withholdSoft,
  amber700: evoqedPalette.heat,
  amber100: evoqedPalette.heatSoft,
  blue700: evoqedPalette.blue,
  blue100: evoqedPalette.blueSoft,
  purple700: evoqedPalette.purple,
  purple100: evoqedPalette.purpleSoft,
  teal700: evoqedPalette.teal,
  teal100: '#E0F2F1',
  pink700: evoqedPalette.pink,
  pink100: evoqedPalette.pinkSoft,
  earTag: evoqedPalette.earTag,
  mint: evoqedPalette.mint,
} as const;

export const evoqedAnimalStatusColor = {
  GROWING: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
  HEIFER: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
  ACTIVE: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
  PREGNANT: { fg: evoqedPalette.purple, bg: evoqedPalette.purpleSoft },
  SICK: { fg: evoqedPalette.withhold, bg: evoqedPalette.withholdSoft },
  QUARANTINE: { fg: evoqedPalette.heat, bg: evoqedPalette.heatSoft },
  DRY: { fg: evoqedPalette.heat, bg: evoqedPalette.heatSoft },
  LACTATING: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
  CULLED: { fg: evoqedPalette.purple, bg: evoqedPalette.purpleSoft },
  SOLD: { fg: evoqedPalette.blue, bg: evoqedPalette.blueSoft },
  DEAD: { fg: evoqedPalette.withhold, bg: evoqedPalette.withholdSoft },
} as const;

export const evoqedApprovalStatusColor = {
  PENDING: { fg: evoqedPalette.heat, bg: evoqedPalette.heatSoft },
  APPROVED: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
  REJECTED: { fg: evoqedPalette.withhold, bg: evoqedPalette.withholdSoft },
  ESCALATED: { fg: evoqedPalette.purple, bg: evoqedPalette.purpleSoft },
} as const;

export const evoqedInventorySeverityColor = {
  CRITICAL: { fg: evoqedPalette.withhold, bg: evoqedPalette.withholdSoft },
  LOW: { fg: evoqedPalette.heat, bg: evoqedPalette.heatSoft },
  GOOD: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
} as const;

export const evoqedSyncStateColor = {
  pending: { fg: evoqedPalette.offline, bg: evoqedPalette.offlineSoft },
  syncing: { fg: evoqedPalette.blue, bg: evoqedPalette.blueSoft },
  synced: { fg: evoqedPalette.healthy, bg: evoqedPalette.healthySoft },
  failed: { fg: evoqedPalette.withhold, bg: evoqedPalette.withholdSoft },
  conflict: { fg: evoqedPalette.purple, bg: evoqedPalette.purpleSoft },
} as const;

export const evoqedSpeciesColor = {
  BUFFALO: evoqedPalette.inkSecondary,
  COW: evoqedPalette.teal,
  PIG: evoqedPalette.purple,
  GOAT: evoqedPalette.heat,
  POULTRY: evoqedPalette.blue,
  FISH: '#3A7D58',
} as const;

export const evoqedSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  gutter: 12,
  margin: 16,
} as const;

export const evoqedRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const evoqedFontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 32,
  tagStencil: 20,
} as const;

export const evoqedFontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const evoqedTypeRamp = {
  label: { size: 13, weight: '600' as const, lineHeight: 18 },
  body: { size: 16, weight: '400' as const, lineHeight: 24 },
  headline: { size: 24, weight: '600' as const, lineHeight: 32 },
  display: { size: 32, weight: '700' as const, lineHeight: 40 },
  tagStencil: { size: 20, weight: '800' as const, lineHeight: 24 },
} as const;

export const evoqedStatusRail = {
  normal: evoqedPalette.healthy,
  heat: evoqedPalette.heat,
  withhold: evoqedPalette.withhold,
} as const;

export const evoqedTouch = {
  min: 48,
  field: 56,
  input: 52,
  offlineBar: 44,
  keyline: 3,
} as const;
