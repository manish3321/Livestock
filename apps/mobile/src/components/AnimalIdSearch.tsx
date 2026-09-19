import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Field } from './forms';
import { Muted } from './ui';
import { useFarm } from '../state/FarmProvider';
import { colors, space, tap } from '../theme/tokens';

/** Tag/herd search that fills an animal UUID field (mirrors web pickers). */
export function AnimalIdSearch({
  label = 'Animal',
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (id: string, tag?: string) => void;
}) {
  const { api } = useFarm();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ id: string; tag: string; name?: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const rows = await api.get<Array<{ id: string; tag: string; name?: string | null }>>(
        `/v1/animals/search?q=${encodeURIComponent(q.trim())}`,
      );
      setHits(rows.slice(0, 8));
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Field label={`${label} ID`} value={value} onChangeText={(t) => onChange(t)} autoCapitalize="none" />
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder="Search tag / herd #"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        onSubmitEditing={() => void search()}
      />
      <Pressable style={styles.btn} onPress={() => void search()}>
        <Text style={styles.btnText}>{busy ? '…' : 'Find animal'}</Text>
      </Pressable>
      {hits.length === 0 && q.trim() ? <Muted>No matches</Muted> : null}
      {hits.map((h) => (
        <Pressable
          key={h.id}
          style={styles.hit}
          onPress={() => {
            onChange(h.id, h.tag);
            setQ(h.tag);
            setHits([]);
          }}
        >
          <Text style={styles.hitText}>
            {h.tag}
            {h.name ? ` · ${h.name}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.md },
  input: {
    minHeight: tap,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: space.md,
    backgroundColor: '#fff',
    color: colors.text,
  },
  btn: {
    minHeight: tap - 8,
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.accent, fontWeight: '700' },
  hit: {
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  hitText: { color: colors.text, fontWeight: '600' },
});
