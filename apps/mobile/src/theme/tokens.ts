/**
 * Mobile theme façade — Kharka Farm OS (local).
 * Same export names/shapes as before so screens keep compiling unchanged.
 */
import {
  kharkaAnimalStatusColor,
  kharkaApprovalStatusColor,
  kharkaColor,
  kharkaFontSize,
  kharkaFontWeight,
  kharkaInventorySeverityColor,
  kharkaPaletteAlias,
  kharkaRadius,
  kharkaSpacing,
  kharkaSpeciesColor,
  kharkaSyncStateColor,
  kharkaTouch,
} from './kharka';

export const palette = kharkaPaletteAlias;
export const color = kharkaColor;
export const animalStatusColor = kharkaAnimalStatusColor;
export const approvalStatusColor = kharkaApprovalStatusColor;
export const inventorySeverityColor = kharkaInventorySeverityColor;
export const syncStateColor = kharkaSyncStateColor;
export const speciesColor = kharkaSpeciesColor;
export const spacing = kharkaSpacing;
export const radius = kharkaRadius;
export const fontSize = kharkaFontSize;
export const fontWeight = kharkaFontWeight;
export const touchTarget = kharkaTouch.min;

export const fonts = {
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemibold: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodyExtraBold: 'PlusJakartaSans_800ExtraBold',
  display: 'Vollkorn_700Bold',
  displaySemibold: 'Vollkorn_600SemiBold',
  ne: 'NotoSansDevanagari_400Regular',
  neMedium: 'NotoSansDevanagari_500Medium',
  neSemibold: 'NotoSansDevanagari_600SemiBold',
  neBold: 'NotoSansDevanagari_700Bold',
} as const;

export const colors = {
  bg: color.surfaceSubtle,
  surface: color.surface,
  border: color.border,
  text: color.textPrimary,
  muted: color.textMuted,
  secondary: color.textSecondary,
  accent: color.brand,
  accentStrong: color.brandStrong,
  accentSoft: color.brandSubtle,
  ember: color.ember,
  danger: color.danger,
  dangerSubtle: color.dangerSubtle,
  warn: color.warning,
  warnSubtle: color.warningSubtle,
  drawer: color.surface,
  drawerText: color.textPrimary,
  drawerMuted: color.textMuted,
  header: 'rgba(227, 249, 233, 0.96)',
  earTag: color.earTag,
} as const;

export const space = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing.xxl,
} as const;

export const type = {
  brand: fontSize.lg,
  title: fontSize.xl,
  body: fontSize.md,
  small: fontSize.sm,
  mono: fontSize.sm,
  tagStencil: fontSize.tagStencil,
} as const;

export const tap = touchTarget;
export const tapField = kharkaTouch.field;
export const tapInput = kharkaTouch.input;
export const offlineBarHeight = kharkaTouch.offlineBar;
export const keyline = kharkaTouch.keyline;
