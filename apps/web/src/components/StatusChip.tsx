import {
  animalStatusColor,
  approvalStatusColor,
  inventorySeverityColor,
} from '@farm/design-tokens';

const CHIP_COLORS: Record<string, { fg: string; bg: string }> = {
  ...animalStatusColor,
  ...approvalStatusColor,
  ...inventorySeverityColor,
};

/** Status chip driven by shared semantic tokens (animal, approval, inventory). */
export function StatusChip({ status, label }: { status: string; label?: string }) {
  const colors = CHIP_COLORS[status] ?? { fg: 'var(--color-text-secondary)', bg: 'var(--color-surface-muted)' };
  return (
    <span className="chip" style={{ color: colors.fg, background: colors.bg }}>
      {label ?? status}
    </span>
  );
}
