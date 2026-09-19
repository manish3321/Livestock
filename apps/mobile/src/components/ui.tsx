import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  animalStatusColor,
  approvalStatusColor,
  color,
  fonts,
  inventorySeverityColor,
  keyline,
  radius,
  space,
  tap,
  tapField,
  tapInput,
} from '../theme/tokens';
import { kharkaStatusRail } from '../theme/kharka';
import { useLocale } from '../locale/LocaleProvider';

const CHIP_COLORS: Record<string, { fg: string; bg: string }> = {
  ...animalStatusColor,
  ...approvalStatusColor,
  ...inventorySeverityColor,
};

export function useTypeface() {
  const { locale } = useLocale();
  const ne = locale === 'ne';
  return {
    regular: ne ? fonts.ne : fonts.body,
    medium: ne ? fonts.neMedium : fonts.bodyMedium,
    semibold: ne ? fonts.neSemibold : fonts.bodySemibold,
    bold: ne ? fonts.neBold : fonts.bodyBold,
    display: ne ? fonts.neSemibold : fonts.display,
  };
}

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';

export function Txt({
  children,
  style,
  weight = 'regular',
  muted,
  ...rest
}: TextProps & { weight?: Weight; muted?: boolean }) {
  const face = useTypeface();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: face[weight], color: muted ? color.textMuted : color.textPrimary },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Page({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.page, style]}>{children}</View>;
}

export function ScreenScroll({
  children,
  padded = true,
}: {
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[padded && styles.pad, styles.scrollEnd]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function PageHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  actions,
}: {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        {backLabel && onBack ? (
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button">
            <Txt style={styles.backLink}>← {backLabel}</Txt>
          </Pressable>
        ) : null}
        <Txt weight="display" style={styles.h1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt muted style={styles.subtitle}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {actions ? <View style={styles.pageActions}>{actions}</View> : null}
    </View>
  );
}

export function SectionHead({
  title,
  hint,
  companion,
  icon,
}: {
  title: string;
  hint?: string;
  /** Optional Devanagari / bilingual companion line */
  companion?: string;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadRow}>
        {icon ? <View style={styles.sectionIcon}>{icon}</View> : null}
        <View style={{ flex: 1 }}>
          <Txt weight="display" style={styles.sectionTitle}>
            {title}
          </Txt>
          {companion ? (
            <Txt weight="medium" style={styles.sectionCompanion}>
              {companion}
            </Txt>
          ) : null}
          {hint ? (
            <Txt muted style={styles.sectionHint}>
              {hint}
            </Txt>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  block,
  fab,
  field,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'urgent';
  block?: boolean;
  fab?: boolean;
  /** 56px field-logging height */
  field?: boolean;
}) {
  const face = useTypeface();
  const bg =
    variant === 'primary'
      ? color.brand
      : variant === 'urgent'
        ? color.ember
        : variant === 'secondary'
          ? color.border
          : variant === 'danger'
            ? color.dangerSubtle
            : 'transparent';
  const fg =
    variant === 'primary' || variant === 'urgent'
      ? color.surface
      : variant === 'danger'
        ? color.danger
        : color.textPrimary;
  const keylineColor =
    variant === 'urgent'
      ? color.emberStrong
      : variant === 'primary'
        ? color.brandStrong
        : variant === 'secondary'
          ? '#C8BFA8'
          : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderBottomColor: keylineColor },
        block && styles.btnBlock,
        field && styles.btnField,
        fab && styles.btnFab,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        disabled && { opacity: 0.45 },
        pressed &&
          !disabled && {
            borderBottomWidth: 1,
            transform: [{ translateY: 2 }],
            backgroundColor:
              variant === 'primary'
                ? color.brandStrong
                : variant === 'urgent'
                  ? color.emberStrong
                  : color.surfaceMuted,
          },
      ]}
    >
      <Text
        style={{
          color: fg,
          fontFamily: face.semibold,
          fontSize: fab || field ? 16 : 14,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  children,
  companion,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  companion?: string;
}) {
  return (
    <View style={styles.field}>
      <Txt weight="medium" style={styles.fieldLabel}>
        {companion ? `${label} / ${companion}` : label}
      </Txt>
      {children}
      {error ? <Txt style={styles.error}>{error}</Txt> : null}
    </View>
  );
}

export function Chip({
  status,
  label,
  style,
}: {
  status?: string;
  label: string;
  style?: StyleProp<TextStyle>;
}) {
  const face = useTypeface();
  const tones = (status && CHIP_COLORS[status]) || {
    fg: color.textSecondary,
    bg: color.surfaceMuted,
  };
  return (
    <Text
      style={[
        styles.chip,
        { color: tones.fg, backgroundColor: tones.bg, fontFamily: face.medium },
        style,
      ]}
    >
      {label}
    </Text>
  );
}

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return <Chip status={status} label={label ?? status} />;
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const face = useTypeface();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
    >
      <Text
        style={{
          fontFamily: face.semibold,
          fontSize: 13,
          color: active ? color.surface : color.textSecondary,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Stat({
  label,
  value,
  milk,
  dots,
}: {
  label: string;
  value: string;
  milk?: boolean;
  dots?: string[];
}) {
  return (
    <View style={styles.stat}>
      <StatusRail tone={milk ? 'heat' : 'normal'} />
      <Txt muted style={styles.statLabel}>
        {label}
      </Txt>
      <Text
        style={[
          styles.statValue,
          {
            fontFamily: fonts.bodyExtraBold,
            color: milk ? color.ember : color.textPrimary,
          },
        ]}
      >
        {value}
      </Text>
      {dots && dots.length > 0 ? (
        <View style={styles.herdDots}>
          {dots.map((c, i) => (
            <View key={`${c}-${i}`} style={[styles.herdDot, { backgroundColor: c }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState() {
  const { t } = useLocale();
  return (
    <View style={styles.pageState}>
      <View style={styles.pageStateIcon}>
        <ActivityIndicator color={color.brand} />
      </View>
      <Txt weight="semibold">{t('common.loading')}</Txt>
      <Txt muted>{t('common.loadingHint')}</Txt>
    </View>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useLocale();
  return (
    <View style={styles.pageState}>
      <View style={styles.pageStateIcon}>
        <Txt weight="display" style={{ color: color.brandStrong, fontSize: 22 }}>
          ○
        </Txt>
      </View>
      <Txt weight="semibold">{message ?? t('common.empty')}</Txt>
      <Txt muted>{t('common.emptyHint')}</Txt>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useLocale();
  return (
    <View style={styles.pageState}>
      <View style={[styles.pageStateIcon, { backgroundColor: color.dangerSubtle }]}>
        <Txt weight="bold" style={{ color: color.danger, fontSize: 20 }}>
          !
        </Txt>
      </View>
      <Txt weight="semibold">{message ?? t('errors.generic')}</Txt>
      <Txt muted>{t('errors.retryHint')}</Txt>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function ForbiddenState() {
  const { t } = useLocale();
  return (
    <View style={styles.pageState}>
      <Txt weight="semibold" style={styles.h1}>
        403
      </Txt>
      <Txt muted>{t('errors.forbidden')}</Txt>
    </View>
  );
}

export function NotFoundState() {
  const { t } = useLocale();
  return (
    <View style={styles.pageState}>
      <Txt weight="semibold" style={styles.h1}>
        404
      </Txt>
      <Txt muted>{t('errors.notFound')}</Txt>
    </View>
  );
}

export function LoadingBlock() {
  return <LoadingState />;
}

export function ErrorText({ message }: { message: string }) {
  return <Txt style={styles.error}>{message}</Txt>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Txt muted>{children}</Txt>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Txt weight="display" style={[styles.sectionTitle, { marginTop: 20, marginBottom: 8 }]}>
      {children}
    </Txt>
  );
}

export function RetryBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorState message={message} onRetry={onRetry} />;
}

export function PrimaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: { label: string; onPress: () => void }) {
  return <Button {...props} variant="secondary" />;
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return <Stat label={label} value={value} />;
}

export function StatusRail({
  tone = 'normal',
  color: railColor,
}: {
  tone?: keyof typeof kharkaStatusRail;
  color?: string;
}) {
  return (
    <View
      style={[styles.statusRail, { backgroundColor: railColor ?? kharkaStatusRail[tone] }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

export function EarTagBadge({
  code,
  name,
  size = 'md',
}: {
  code: string;
  name?: string;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 8 : 12;
  const codeSize = size === 'sm' ? 14 : 18;
  return (
    <View
      style={[styles.earTag, { paddingHorizontal: pad, paddingVertical: pad - 2 }]}
      accessibilityLabel={name ? `${code}, ${name}` : code}
    >
      <View style={styles.earTagEyelet} />
      <Text style={[styles.earTagCode, { fontSize: codeSize }]}>{code}</Text>
      {name ? (
        <Text style={styles.earTagName} numberOfLines={1}>
          {name}
        </Text>
      ) : null}
    </View>
  );
}

export function QueuedNotice({
  visible,
  label,
  count,
}: {
  visible: boolean;
  label: string;
  count?: number;
}) {
  if (!visible) return null;
  return (
    <View style={styles.queued} accessibilityRole="text">
      <View style={styles.queuedStamp} />
      <Txt weight="semibold" style={styles.queuedText}>
        {count != null && count > 0 ? `${label} · ${count}` : label}
      </Txt>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  onPress,
  zebra,
  rail,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  zebra?: 'a' | 'b';
  rail?: keyof typeof kharkaStatusRail;
}) {
  const body = (
    <View
      style={[
        styles.row,
        zebra === 'b' && styles.rowZebra,
        { minHeight: tap },
      ]}
    >
      {rail ? <StatusRail tone={rail} /> : null}
      <View style={{ flex: 1, paddingLeft: rail ? 10 : 0 }}>
        <Txt weight="semibold">{title}</Txt>
        {subtitle ? (
          <Txt muted style={{ fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {meta ? (
        <Txt muted style={{ marginLeft: 8, fontSize: 13 }}>
          {meta}
        </Txt>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {columns.map((c) => (
            <Txt key={c} weight="semibold" muted style={styles.tableCell}>
              {c}
            </Txt>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.rowZebra]}>
            {row.map((cell, j) => (
              <Txt key={j} style={styles.tableCell} numberOfLines={2}>
                {cell}
              </Txt>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function inputStyle(face: ReturnType<typeof useTypeface>, focused?: boolean): TextStyle {
  return {
    minHeight: tapInput,
    paddingHorizontal: 14,
    borderWidth: focused ? 2 : 1.5,
    borderColor: focused ? color.brand : color.fieldBorder,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.textPrimary,
    fontSize: 16,
    fontFamily: face.regular,
  };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.surfaceSubtle },
  pad: { paddingHorizontal: space.lg, paddingTop: space.sm },
  scrollEnd: { paddingBottom: 56 },
  pageHeader: {
    gap: 12,
    marginBottom: 16,
    paddingTop: space.sm,
  },
  pageHeaderText: {
    minWidth: 0,
  },
  h1: { fontSize: 24, letterSpacing: -0.3, lineHeight: 32 },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, maxWidth: 520 },
  backLink: { color: color.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  pageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionHead: { marginBottom: 14 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 18, letterSpacing: -0.2, lineHeight: 24 },
  sectionCompanion: {
    marginTop: 2,
    fontSize: 13,
    color: color.textSecondary,
    transform: [{ translateY: -1 }],
  },
  sectionHint: { marginTop: 2, fontSize: 13 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: space.lg,
  },
  btn: {
    minHeight: tap,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderBottomWidth: keyline,
  },
  btnBlock: { width: '100%', borderRadius: radius.md },
  btnField: { minHeight: tapField },
  btnFab: { width: '100%', minHeight: tapField, borderRadius: radius.lg },
  btnGhost: { minHeight: 40, paddingHorizontal: 10, borderBottomWidth: 0 },
  btnDanger: { borderBottomColor: color.danger, borderBottomWidth: 2 },
  field: { marginBottom: 16, gap: 6 },
  fieldLabel: { fontSize: 13, color: color.textSecondary },
  chip: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    fontSize: 12,
    fontWeight: '600',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipOn: { backgroundColor: color.brand, borderColor: color.brand },
  stat: {
    flex: 1,
    minWidth: 140,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  statusRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  statLabel: { fontSize: 12, fontWeight: '500' },
  statValue: { fontSize: 22, letterSpacing: -0.5, marginTop: 2 },
  herdDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  herdDot: { width: 7, height: 7, borderRadius: 4 },
  pageState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 8,
  },
  pageStateIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: color.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  error: { color: color.danger, fontSize: 13, fontWeight: '500', marginVertical: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    overflow: 'hidden',
  },
  rowZebra: { backgroundColor: color.surfaceSubtle },
  earTag: {
    alignSelf: 'flex-start',
    backgroundColor: color.earTag,
    borderRadius: 6,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: 'center',
    minWidth: 72,
    borderWidth: 1.5,
    borderColor: '#E09A10',
  },
  earTagEyelet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.textPrimary,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: '#C4840A',
  },
  earTagCode: {
    fontFamily: fonts.bodyExtraBold,
    color: color.textPrimary,
    letterSpacing: -0.5,
    fontWeight: '800',
  },
  earTagName: {
    fontFamily: fonts.neMedium,
    fontSize: 11,
    color: color.textPrimary,
    marginTop: 2,
    opacity: 0.85,
  },
  queued: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: color.surfaceMuted,
    borderBottomWidth: 1.5,
    borderBottomColor: color.border,
  },
  queuedStamp: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: color.offline,
    transform: [{ rotate: '12deg' }],
  },
  queuedText: { fontSize: 13, color: color.offline, flex: 1 },
  table: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tableHeader: { flexDirection: 'row', backgroundColor: color.surfaceMuted },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.border },
  tableCell: { width: 120, padding: 10, fontSize: 13 },
});
