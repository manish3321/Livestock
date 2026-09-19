/**
 * Kharka Utilitarian Agritech — mobile-local design system.
 * Source: stitch_nepal_farm_os/kharka_utilitarian_agritech/DESIGN.md
 * (warm cream surfaces + moss/ember brand — not the Material YAML greens).
 */

export const kharkaPalette = {
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

/** Semantic color map — same keys as former @farm/design-tokens `color`. */
export const kharkaColor = {
  brand: kharkaPalette.moss,
  brandStrong: kharkaPalette.mossDeep,
  brandSubtle: kharkaPalette.mossSoft,
  accent: kharkaPalette.moss,
  accentStrong: kharkaPalette.mossDeep,
  ember: kharkaPalette.terracotta,
  emberStrong: kharkaPalette.terracottaDeep,
  textPrimary: kharkaPalette.ink,
  textSecondary: kharkaPalette.inkSecondary,
  textMuted: kharkaPalette.inkMuted,
  border: kharkaPalette.clay,
  surface: kharkaPalette.card,
  surfaceSubtle: kharkaPalette.canvas,
  surfaceMuted: kharkaPalette.mint,
  danger: kharkaPalette.withhold,
  dangerSubtle: kharkaPalette.withholdSoft,
  warning: kharkaPalette.heat,
  warningSubtle: kharkaPalette.heatSoft,
  info: kharkaPalette.blue,
  infoSubtle: kharkaPalette.blueSoft,
  success: kharkaPalette.healthy,
  successSubtle: kharkaPalette.healthySoft,
  earTag: kharkaPalette.earTag,
  fieldBorder: kharkaPalette.fieldBorder,
  offline: kharkaPalette.offline,
  outline: kharkaPalette.outline,
  mint: kharkaPalette.mint,
  mossFixed: kharkaPalette.mossFixed,
  terracottaSoft: kharkaPalette.terracottaSoft,
  terracottaWash: kharkaPalette.terracottaWash,
} as const;

/** Alias palette shape kept for MoreDrawer / legacy `palette.*` imports. */
export const kharkaPaletteAlias = {
  green800: kharkaPalette.moss,
  green700: kharkaPalette.mossMid,
  green600: '#3A7D58',
  green100: kharkaPalette.mossSoft,
  cream: kharkaPalette.canvas,
  creamDark: kharkaPalette.clay,
  gray900: kharkaPalette.ink,
  gray700: kharkaPalette.inkSecondary,
  gray500: kharkaPalette.inkMuted,
  gray300: kharkaPalette.clay,
  gray100: kharkaPalette.pressed,
  gray50: kharkaPalette.canvas,
  white: kharkaPalette.card,
  terracotta: kharkaPalette.terracotta,
  terracottaDark: kharkaPalette.terracottaDeep,
  red700: kharkaPalette.withhold,
  red100: kharkaPalette.withholdSoft,
  amber700: kharkaPalette.heat,
  amber100: kharkaPalette.heatSoft,
  blue700: kharkaPalette.blue,
  blue100: kharkaPalette.blueSoft,
  purple700: kharkaPalette.purple,
  purple100: kharkaPalette.purpleSoft,
  teal700: kharkaPalette.teal,
  teal100: '#E0F2F1',
  pink700: kharkaPalette.pink,
  pink100: kharkaPalette.pinkSoft,
  earTag: kharkaPalette.earTag,
  mint: kharkaPalette.mint,
} as const;

export const kharkaAnimalStatusColor = {
  GROWING: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
  HEIFER: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
  ACTIVE: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
  PREGNANT: { fg: kharkaPalette.purple, bg: kharkaPalette.purpleSoft },
  SICK: { fg: kharkaPalette.withhold, bg: kharkaPalette.withholdSoft },
  QUARANTINE: { fg: kharkaPalette.heat, bg: kharkaPalette.heatSoft },
  DRY: { fg: kharkaPalette.heat, bg: kharkaPalette.heatSoft },
  LACTATING: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
  CULLED: { fg: kharkaPalette.purple, bg: kharkaPalette.purpleSoft },
  SOLD: { fg: kharkaPalette.blue, bg: kharkaPalette.blueSoft },
  DEAD: { fg: kharkaPalette.withhold, bg: kharkaPalette.withholdSoft },
} as const;

export const kharkaApprovalStatusColor = {
  PENDING: { fg: kharkaPalette.heat, bg: kharkaPalette.heatSoft },
  APPROVED: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
  REJECTED: { fg: kharkaPalette.withhold, bg: kharkaPalette.withholdSoft },
  ESCALATED: { fg: kharkaPalette.purple, bg: kharkaPalette.purpleSoft },
} as const;

export const kharkaInventorySeverityColor = {
  CRITICAL: { fg: kharkaPalette.withhold, bg: kharkaPalette.withholdSoft },
  LOW: { fg: kharkaPalette.heat, bg: kharkaPalette.heatSoft },
  GOOD: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
} as const;

export const kharkaSyncStateColor = {
  pending: { fg: kharkaPalette.offline, bg: kharkaPalette.offlineSoft },
  syncing: { fg: kharkaPalette.blue, bg: kharkaPalette.blueSoft },
  synced: { fg: kharkaPalette.healthy, bg: kharkaPalette.healthySoft },
  failed: { fg: kharkaPalette.withhold, bg: kharkaPalette.withholdSoft },
  conflict: { fg: kharkaPalette.purple, bg: kharkaPalette.purpleSoft },
} as const;

export const kharkaSpeciesColor = {
  BUFFALO: kharkaPalette.inkSecondary,
  COW: kharkaPalette.teal,
  PIG: kharkaPalette.purple,
  GOAT: kharkaPalette.heat,
  POULTRY: kharkaPalette.blue,
  FISH: '#3A7D58',
} as const;

export const kharkaSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  gutter: 12,
  margin: 16,
} as const;

export const kharkaRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const kharkaFontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 32,
  tagStencil: 20,
} as const;

export const kharkaFontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const kharkaTypeRamp = {
  label: { size: 13, weight: '600' as const, lineHeight: 18 },
  body: { size: 16, weight: '400' as const, lineHeight: 24 },
  headline: { size: 24, weight: '600' as const, lineHeight: 32 },
  display: { size: 32, weight: '700' as const, lineHeight: 40 },
  tagStencil: { size: 20, weight: '800' as const, lineHeight: 24 },
} as const;

export const kharkaStatusRail = {
  normal: kharkaPalette.healthy,
  heat: kharkaPalette.heat,
  withhold: kharkaPalette.withhold,
} as const;

export const kharkaTouch = {
  min: 48,
  field: 56,
  input: 52,
  offlineBar: 44,
  keyline: 3,
} as const;
