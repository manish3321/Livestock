/**
 * Mobile theme façade — Evoqed Farm Management.
 * Same export names/shapes so screens keep compiling unchanged.
 */
import {
  evoqedAnimalStatusColor,
  evoqedApprovalStatusColor,
  evoqedColor,
  evoqedFontSize,
  evoqedFontWeight,
  evoqedInventorySeverityColor,
  evoqedPaletteAlias,
  evoqedRadius,
  evoqedSpacing,
  evoqedSpeciesColor,
  evoqedStatusRail,
  evoqedSyncStateColor,
  evoqedTouch,
} from './evoqed';

export const palette = evoqedPaletteAlias;
export const color = evoqedColor;
export const animalStatusColor = evoqedAnimalStatusColor;
export const approvalStatusColor = evoqedApprovalStatusColor;
export const inventorySeverityColor = evoqedInventorySeverityColor;
export const syncStateColor = evoqedSyncStateColor;
export const speciesColor = evoqedSpeciesColor;
export const spacing = evoqedSpacing;
export const radius = evoqedRadius;
export const fontSize = evoqedFontSize;
export const fontWeight = evoqedFontWeight;
export const touchTarget = evoqedTouch.min;
export const statusRail = evoqedStatusRail;

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
export const tapField = evoqedTouch.field;
export const tapInput = evoqedTouch.input;
export const offlineBarHeight = evoqedTouch.offlineBar;
export const keyline = evoqedTouch.keyline;
