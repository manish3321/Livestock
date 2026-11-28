import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Field } from './forms';
import { Muted } from './ui';
import { colors, space, tap } from '../theme/tokens';

export type SuggestOption = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  label: string;
  value: string;
  displayValue?: string;
  options: SuggestOption[];
  placeholder?: string;
  allowCustom?: boolean;
  minChars?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onChange: (next: { value: string; label: string; option?: SuggestOption }) => void;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

/** Type-a-few-letters picker; optionally keep free text (feed type). */
export function SuggestField({
  label,
  value,
  displayValue,
  options,
  placeholder,
  allowCustom = true,
  minChars = 1,
  autoCapitalize = 'none',
  onChange,
}: Props) {
  const [text, setText] = useState(displayValue ?? '');

  const filtered = useMemo(() => {
    const q = normalize(text);
    if (q.length < minChars) return [];
    return options
      .filter((o) => normalize(`${o.label} ${o.hint ?? ''} ${o.value}`).includes(q))
      .slice(0, 10);
  }, [minChars, options, text]);

  return (
    <View style={styles.wrap}>
      <Field
        label={label}
        value={text}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        onChangeText={(next) => {
          setText(next);
          if (allowCustom) onChange({ value: next, label: next });
          else if (!next.trim()) onChange({ value: '', label: '' });
        }}
      />
      {value && !allowCustom ? <Muted>{value.slice(0, 8)}…</Muted> : null}
      {filtered.length > 0 ? (
        <View style={styles.list}>
          {filtered.map((option) => (
            <Pressable
              key={`${option.value}-${option.label}`}
              style={styles.hit}
              onPress={() => {
                setText(option.label);
                onChange({ value: option.value, label: option.label, option });
              }}
            >
              <Text style={styles.hitText}>{option.label}</Text>
              {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.md },
  list: { gap: 6, marginTop: 2 },
  hit: {
    minHeight: tap,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    justifyContent: 'center',
    backgroundColor: colors.surface ?? '#fff',
  },
  hitText: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.muted, marginTop: 2, fontSize: 12 },
});
