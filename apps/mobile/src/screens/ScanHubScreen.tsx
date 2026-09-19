import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PageResult } from '@farm/contracts';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppShell } from '../components/AppShell';
import { Button, Card, ErrorText, PageHeader, Txt, inputStyle, useTypeface } from '../components/ui';
import { toQuery } from '../api/query';
import { useFarm } from '../state/FarmProvider';
import { useLocale } from '../locale/LocaleProvider';
import { parseQrPayload } from '../lib/qr';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme/tokens';

type SearchHit =
  | { kind: 'animal'; id: string; tag?: string; name?: string | null }
  | { kind: 'batch'; id: string; name: string; category?: string };

export function ScanHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { api } = useFarm();
  const { t } = useLocale();
  const face = useTypeface();
  const [permission, requestPermission] = useCameraPermissions();
  const [tagQuery, setTagQuery] = useState('');
  const [batchQuery, setBatchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<SearchHit | null>(null);
  const [scanning, setScanning] = useState(true);
  const scanned = useRef(false);

  const lookup = useCallback(
    async (q: string, kind?: 'animal' | 'batch') => {
      setError(null);
      setHit(null);
      const parsed = parseQrPayload(q);
      try {
        if (parsed?.kind === 'animal' || (!kind && parsed?.kind !== 'batch' && /^[a-f0-9-]{36}$/i.test(q.trim()))) {
          const id = parsed?.kind === 'animal' ? parsed.id : q.trim();
          setHit({ kind: 'animal', id, tag: id.slice(0, 8) });
          return;
        }
        if (parsed?.kind === 'batch' || kind === 'batch') {
          if (parsed?.kind === 'batch') {
            setHit({ kind: 'batch', id: parsed.id, name: 'Batch' });
            return;
          }
        }
        if (kind !== 'batch') {
          const animals = await api.get<Array<{ id: string; tag: string; name?: string | null }>>(
            `/v1/animals/search?q=${encodeURIComponent(q.trim())}`,
          );
          const list = Array.isArray(animals) ? animals : [];
          if (list[0]) {
            setHit({ kind: 'animal', id: list[0].id, tag: list[0].tag, name: list[0].name });
            return;
          }
        }
        const batches = await api.get<PageResult<{ id: string; name: string; category?: string }>>(
          `/v1/batches${toQuery({ page: 1, pageSize: 5, q: q.trim() })}`,
        );
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
    [api, t],
  );

  const onBarcode = ({ data }: { data: string }) => {
    if (!scanning || scanned.current) return;
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
          />
          <Button label={t('qr.lookupAnimal')} variant="secondary" onPress={() => void lookup(tagQuery, 'animal')} />
          <TextInput
            style={[inputStyle(face), { marginTop: 12, marginBottom: 8 }]}
            value={batchQuery}
            onChangeText={setBatchQuery}
            placeholder={t('qr.batchNamePlaceholder')}
            placeholderTextColor={color.textMuted}
          />
          <Button label={t('qr.lookupBatch')} variant="secondary" onPress={() => void lookup(batchQuery, 'batch')} />
        </Card>
        {hit?.kind === 'animal' ? (
          <View style={styles.hit}>
            <Txt weight="display" style={styles.hitTitle}>
              {hit.tag}
              {hit.name ? ` · ${hit.name}` : ''}
            </Txt>
            <Button
              label={t('qr.openDetail')}
              onPress={() => navigation.navigate('AnimalDetail', { id: hit.id })}
            />
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
});
