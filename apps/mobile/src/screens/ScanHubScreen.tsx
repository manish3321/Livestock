import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PageResult } from '@farm/contracts';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppShell } from '../components/AppShell';
import { AnimalChoiceDialog, type ChosenAnimal } from '../components/AnimalChoiceDialog';
import { AnimalPhoto } from '../components/AnimalPhoto';
import { Button, Card, ErrorText, PageHeader, Txt, inputStyle, useTypeface } from '../components/ui';
import { toQuery } from '../api/query';
import { useFarm } from '../state/FarmProvider';
import { useLocale } from '../locale/LocaleProvider';
import { parseQrPayload } from '../lib/qr';
import { searchAnimalsLocal } from '../lib/animal-search';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme/tokens';

type AnimalSuggestion = {
  id: string;
  tag: string;
  name?: string | null;
  shortNo?: string | null;
  species?: string | null;
  photoUrl?: string | null;
  penName?: string | null;
};

type SearchHit =
  | ({ kind: 'animal' } & AnimalSuggestion)
  | { kind: 'batch'; id: string; name: string; category?: string };
type BatchSuggestion = { id: string; name: string; category?: string };

export function ScanHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api, store, revision } = useFarm();
  void revision;
  const { t } = useLocale();
  const face = useTypeface();
  const [permission, requestPermission] = useCameraPermissions();
  const [tagQuery, setTagQuery] = useState('');
  const [batchQuery, setBatchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<SearchHit | null>(null);
  const [animalHits, setAnimalHits] = useState<AnimalSuggestion[]>([]);
  const [batchHits, setBatchHits] = useState<BatchSuggestion[]>([]);
  const [lookingAnimals, setLookingAnimals] = useState(false);
  const [lookingBatches, setLookingBatches] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [chosen, setChosen] = useState<ChosenAnimal | null>(null);
  const scanned = useRef(false);
  const animalReq = useRef(0);

  const pickAnimal = useCallback((animal: AnimalSuggestion) => {
    setHit({ kind: 'animal', ...animal });
    setChosen(animal);
    setError(null);
  }, []);

  const lookup = useCallback(
    async (q: string, kind?: 'animal' | 'batch') => {
      setError(null);
      setHit(null);
      const parsed = parseQrPayload(q);
      try {
        if (parsed?.kind === 'animal' || (!kind && parsed?.kind !== 'batch' && /^[a-f0-9-]{36}$/i.test(q.trim()))) {
          const id = parsed?.kind === 'animal' ? parsed.id : q.trim();
          try {
            const detail = await api.get<{
              id: string;
              tag: string;
              name?: string | null;
              herdNumber?: string | null;
              species?: string;
              photoUrl?: string | null;
              shed?: string | null;
            }>(`/v1/animals/${id}`);
            pickAnimal({
              id: detail.id,
              tag: detail.tag,
              name: detail.name,
              shortNo: detail.herdNumber,
              species: detail.species,
              photoUrl: detail.photoUrl,
              penName: detail.shed,
            });
          } catch {
            setError(t('qr.notFound'));
          }
          return;
        }
        if (parsed?.kind === 'batch' || kind === 'batch') {
          if (parsed?.kind === 'batch') {
            setHit({ kind: 'batch', id: parsed.id, name: 'Batch' });
            return;
          }
        }
        if (kind !== 'batch') {
          const animals = await api.get<AnimalSuggestion[]>(
            `/v1/animals/search?q=${encodeURIComponent(q.trim())}`,
          );
          const list = Array.isArray(animals) ? animals : [];
          if (list.length === 1 && list[0]) {
            setAnimalHits([]);
            pickAnimal(list[0]);
            return;
          }
          if (list.length > 1) {
            setAnimalHits(list.slice(0, 8));
            return;
          }
        }
        const batches = await api.get<PageResult<{ id: string; name: string; category?: string }>>(
          `/v1/batches${toQuery({ page: 1, pageSize: 5, q: q.trim() })}`,
        );
        setBatchHits(batches.items.slice(0, 8));
        if (batches.items[0]) {
          setHit({
            kind: 'batch',
            id: batches.items[0].id,
            name: batches.items[0].name,
            category: batches.items[0].category,
          });
          return;
        }
        setError(t('qr.notFound'));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('qr.notFound'));
      }
    },
    [api, pickAnimal, t],
  );

  useEffect(() => {
    const q = tagQuery.trim();
    if (q.length < 1) {
      setAnimalHits([]);
      setLookingAnimals(false);
      return;
    }
    const local: AnimalSuggestion[] = searchAnimalsLocal(store, q, 8).map((a) => ({
      id: a.id,
      tag: a.tag,
      name: a.name,
      shortNo: a.shortNo,
      species: a.species,
      penName: a.penName,
    }));
    setAnimalHits(local);
    setError(null);
    setLookingAnimals(true);
    const id = ++animalReq.current;
    const handle = setTimeout(() => {
      void api
        .get<AnimalSuggestion[]>(`/v1/animals/search?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          if (id !== animalReq.current) return;
          const list = Array.isArray(rows) ? rows.slice(0, 8) : [];
          setAnimalHits(list.length > 0 ? list : local);
          if (list.length === 0 && local.length === 0) setError(t('qr.notFound'));
        })
        .catch((err: unknown) => {
          if (id !== animalReq.current) return;
          if (local.length === 0) {
            setAnimalHits([]);
            setError(err instanceof Error ? err.message : t('qr.notFound'));
          }
        })
        .finally(() => {
          if (id === animalReq.current) setLookingAnimals(false);
        });
    }, 120);
    return () => {
      clearTimeout(handle);
    };
  }, [api, store, t, tagQuery]);

  useEffect(() => {
    const q = batchQuery.trim();
    if (q.length < 1) {
      setBatchHits([]);
      setLookingBatches(false);
      return;
    }
    let cancelled = false;
    setLookingBatches(true);
    setError(null);
    const handle = setTimeout(() => {
      void api
        .get<PageResult<BatchSuggestion>>(`/v1/batches${toQuery({ page: 1, pageSize: 8, q })}`)
        .then((page) => {
          if (cancelled) return;
          const list = page.items.slice(0, 8);
          setBatchHits(list);
          if (list.length === 0) setError(t('qr.notFound'));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setBatchHits([]);
          setError(err instanceof Error ? err.message : t('qr.notFound'));
        })
        .finally(() => {
          if (!cancelled) setLookingBatches(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [api, batchQuery, t]);

  const onBarcode = ({ data }: { data: string }) => {
    if (!scanning || scanned.current || chosen) return;
    scanned.current = true;
    void lookup(data).finally(() => {
      setTimeout(() => {
        scanned.current = false;
      }, 1500);
    });
  };

  return (
    <AppShell module="scan">
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <PageHeader
          title={t('nav.scan')}
          subtitle={t('qr.hubSubtitle')}
          actions={
            <Button
              label={scanning ? t('qr.stopCamera') : t('qr.startCamera')}
              variant={scanning ? 'secondary' : 'primary'}
              onPress={() => setScanning((v) => !v)}
            />
          }
        />
        {error ? <ErrorText message={error} /> : null}
        <Card style={{ marginBottom: 16 }}>
          <Txt weight="semibold" style={styles.h2}>
            {t('qr.cameraTitle')}
          </Txt>
          <Txt muted style={{ marginBottom: 8 }}>
            {t('qr.cameraHint')}
          </Txt>
          {!permission?.granted ? (
            <Button label={t('native.grantCamera')} onPress={() => void requestPermission()} />
          ) : scanning ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onBarcode}
            />
          ) : (
            <Txt muted>{t('qr.cameraIdle')}</Txt>
          )}
        </Card>
        <Card>
          <Txt weight="semibold" style={styles.h2}>
            {t('qr.manualTitle')}
          </Txt>
          <Txt muted style={{ marginBottom: 8 }}>
            {t('qr.manualHint')}
          </Txt>
          <TextInput
            style={[inputStyle(face), { marginBottom: 8 }]}
            value={tagQuery}
            onChangeText={setTagQuery}
            placeholder={t('qr.animalTagPlaceholder')}
            placeholderTextColor={color.textMuted}
            autoCapitalize="characters"
            onSubmitEditing={() => void lookup(tagQuery, 'animal')}
          />
          {lookingAnimals && tagQuery.trim() && animalHits.length === 0 ? (
            <Txt muted style={{ marginBottom: 6 }}>
              Searching…
            </Txt>
          ) : null}
          {animalHits.length > 0 ? (
            <Txt weight="semibold" style={{ marginBottom: 6, fontSize: 13 }}>
              {t('qr.pickAnimal')}
            </Txt>
          ) : null}
          {animalHits.map((row) => (
            <Pressable
              key={row.id}
              style={styles.suggestion}
              onPress={() => {
                setTagQuery(row.tag);
                setAnimalHits([]);
                pickAnimal(row);
              }}
            >
              <AnimalPhoto animalId={row.id} photoUrl={row.photoUrl} species={row.species} size={44} />
              <View style={{ flex: 1 }}>
                <Txt weight="semibold">
                  {row.shortNo ?? row.tag}
                  {row.name ? ` · ${row.name}` : ''}
                </Txt>
                {row.penName ? <Txt muted>{row.penName}</Txt> : null}
              </View>
            </Pressable>
          ))}
          {tagQuery.trim() && animalHits.length === 0 && !lookingAnimals ? (
            <Button
              label={t('qr.lookupAnimal')}
              variant="ghost"
              onPress={() => void lookup(tagQuery, 'animal')}
            />
          ) : null}
          <TextInput
            style={[inputStyle(face), { marginTop: 12, marginBottom: 8 }]}
            value={batchQuery}
            onChangeText={setBatchQuery}
            placeholder={t('qr.batchNamePlaceholder')}
            placeholderTextColor={color.textMuted}
            onSubmitEditing={() => void lookup(batchQuery, 'batch')}
          />
          {lookingBatches && batchQuery.trim() ? (
            <Txt muted style={{ marginBottom: 6 }}>
              …
            </Txt>
          ) : null}
          {batchHits.map((row) => (
            <Pressable
              key={row.id}
              style={styles.suggestion}
              onPress={() => {
                setBatchQuery(row.name);
                setBatchHits([]);
                setHit({
                  kind: 'batch',
                  id: row.id,
                  name: row.name,
                  category: row.category,
                });
                setError(null);
              }}
            >
              <Txt weight="semibold">
                {row.name}
                {row.category ? ` · ${row.category}` : ''}
              </Txt>
            </Pressable>
          ))}
          <Button label={t('qr.lookupBatch')} variant="secondary" onPress={() => void lookup(batchQuery, 'batch')} />
        </Card>
        {hit?.kind === 'animal' ? (
          <View style={styles.hit}>
            <View style={styles.hitRow}>
              <AnimalPhoto animalId={hit.id} photoUrl={hit.photoUrl} species={hit.species} size={56} />
              <Txt weight="display" style={[styles.hitTitle, { flex: 1 }]}>
                {hit.shortNo ?? hit.tag}
                {hit.name ? ` · ${hit.name}` : ''}
              </Txt>
            </View>
            <Button label={t('qr.chooseTitle')} onPress={() => setChosen(hit)} />
          </View>
        ) : null}
        {hit?.kind === 'batch' ? (
          <View style={styles.hit}>
            <Txt weight="display" style={styles.hitTitle}>
              {hit.name}
              {hit.category ? ` · ${hit.category}` : ''}
            </Txt>
            <Button
              label={t('qr.openDetail')}
              onPress={() => navigation.navigate('BatchDetail', { id: hit.id })}
            />
          </View>
        ) : null}
      </ScrollView>
      <AnimalChoiceDialog animal={chosen} onClose={() => setChosen(null)} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48, gap: 8 },
  h2: { fontSize: 17, marginBottom: 4 },
  camera: {
    height: 280,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: color.brandStrong,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  hit: {
    marginTop: 16,
    padding: 16,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    gap: 8,
  },
  hitTitle: { fontSize: 18 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 6,
    backgroundColor: color.surface,
  },
});
