import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, radius, tap } from '../theme/tokens';
import { Txt, inputStyle, useTypeface } from './ui';

export function Field({
  label,
  error,
  hint,
  companion,
  ...props
}: { label: string; error?: string; hint?: string; companion?: string } & TextInputProps) {
  const face = useTypeface();
  return (
    <View style={styles.field}>
      <Txt weight="medium" style={styles.label}>
        {companion ? `${label} / ${companion}` : label}
      </Txt>
      {hint ? (
        <Txt muted style={styles.hint}>
          {hint}
        </Txt>
      ) : null}
      <TextInput
        style={[inputStyle(face), error ? styles.inputError : null, props.multiline && styles.area]}
        placeholderTextColor={color.textMuted}
        {...props}
      />
      {error ? <Txt style={styles.error}>{error}</Txt> : null}
    </View>
  );
}

export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: readonly T[] | T[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  const face = useTypeface();
  return (
    <View style={styles.field}>
      <Txt weight="medium" style={styles.label}>
        {label}
      </Txt>
      <View style={styles.chips}>
        {options.map((opt) => {
          const on = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text
                style={{
                  fontFamily: face.semibold,
                  fontSize: 13,
                  color: on ? color.surface : color.textSecondary,
                  fontWeight: '600',
                }}
              >
                {labels?.[opt] ?? opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
  field: { marginBottom: 16, gap: 6 },
  label: { fontSize: 13, color: color.textSecondary },
  hint: { fontSize: 12, marginBottom: 2 },
  inputError: { borderColor: color.danger },
  area: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  error: { color: color.danger, fontSize: 13, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: tap,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    borderWidth: 1.5,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: color.brand, borderColor: color.brand },
  actions: { gap: 10, marginTop: 8 },
});
