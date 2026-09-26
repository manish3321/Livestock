import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Field } from './forms';
import { Muted } from './ui';
import { useFarm } from '../state/FarmProvider';
import { searchAnimalsLocal, type AnimalSearchHit } from '../lib/animal-search';
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
  const { api, store, revision } = useFarm();
  void revision;
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AnimalSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setHits([]);
      setBusy(false);
      setSearchError(null);
      return;
    }

    // Instant suggestions from the hydrated herd — no network wait.
    const local = searchAnimalsLocal(store, query, 8);
    setHits(local);
    setSearchError(null);
    setBusy(true);

    const id = ++reqId.current;
    const handle = setTimeout(() => {
      void api
        .get<AnimalSearchHit[]>(`/v1/animals/search?q=${encodeURIComponent(query)}`)
        .then((rows) => {
          if (id !== reqId.current) return;
          const remote = Array.isArray(rows) ? rows.slice(0, 8) : [];
          // Prefer remote when it returns; otherwise keep local hits.
          setHits(remote.length > 0 ? remote : local);
          if (remote.length === 0 && local.length === 0) {
            setSearchError(null);
          }
        })
        .catch(() => {
          if (id !== reqId.current) return;
          // Keep local hits if offline/slow — only show error when nothing local.
          if (local.length === 0) setSearchError('Search failed — check connection');
        })
        .finally(() => {
          if (id === reqId.current) setBusy(false);
        });
    }, 120);

    return () => {
      clearTimeout(handle);
    };
  }, [api, q, store]);

  return (
    <View style={styles.wrap}>
      <Field label={`${label} ID`} value={value} onChangeText={(t) => onChange(t)} autoCapitalize="none" />
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder="Type tag / herd # — picks appear below"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {busy && q.trim() && hits.length === 0 ? <Muted>Searching…</Muted> : null}
      {searchError ? <Muted>{searchError}</Muted> : null}
      {!busy && !searchError && hits.length === 0 && q.trim() ? <Muted>No matches</Muted> : null}
      {hits.length > 0 ? (
        <View style={styles.list}>
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
                {h.shortNo && h.shortNo !== h.tag ? ` · #${h.shortNo}` : ''}
                {h.name ? ` · ${h.name}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
    paddingHorizontal: space.sm,
    color: colors.text,
  },
  list: { gap: 6, marginTop: 2 },
  hit: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  hitText: { color: colors.text, fontWeight: '600' },
});
