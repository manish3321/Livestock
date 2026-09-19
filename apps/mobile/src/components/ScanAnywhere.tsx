import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SPECIES_LABEL, modulesForRole, type AnimalSearchHitDto, type Species } from '@farm/contracts';
import { formatNPR } from '@farm/contracts';
import { useFarm } from '../state/FarmProvider';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import { parseQrPayload, type QrTarget } from '../lib/qr';
import { color } from '../theme/tokens';
import { AnimalActionGrid } from './AnimalActionGrid';
import { Button, Chip, ErrorState, LoadingState, Stat, Txt, inputStyle, useTypeface } from './ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

interface ScanOverlayValue {
  open: boolean;
  openScan: () => void;
  closeScan: () => void;
}

const ScanOverlayContext = createContext<ScanOverlayValue | null>(null);

export function ScanOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo<ScanOverlayValue>(
    () => ({
      open,
      openScan: () => setOpen(true),
      closeScan: () => setOpen(false),
    }),
    [open],
  );
  return <ScanOverlayContext.Provider value={value}>{children}</ScanOverlayContext.Provider>;
}

export function useScanOverlay(): ScanOverlayValue {
  const ctx = useContext(ScanOverlayContext);
  if (!ctx) throw new Error('useScanOverlay must be used inside ScanOverlayProvider');
  return ctx;
}

type IdentifyMode = 'camera' | 'manual';
type Step = 'identify' | 'actions';

interface PickedAnimal {
  id: string;
  tag: string;
  name: string | null;
  species: string;
}

export function ScanAnywhere() {
  const { t } = useLocale();
  const { user, api } = useFarm();
  const insets = useSafeAreaInsets();
  const face = useTypeface();
  const { open, closeScan } = useScanOverlay();
  const [permission, requestPermission] = useCameraPermissions();
  const [identifyMode, setIdentifyMode] = useState<IdentifyMode>('camera');
  const [step, setStep] = useState<Step>('identify');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AnimalSearchHitDto[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [animal, setAnimal] = useState<PickedAnimal | null>(null);
  const [batchTarget, setBatchTarget] = useState<QrTarget | null>(null);
  const handlingRef = useRef(false);
  const scanned = useRef(false);

  const allowedScan = !!user && modulesForRole(user.role).includes('scan');

  const reset = useCallback(() => {
    setIdentifyMode('camera');
    setStep('identify');
    setLookupError(null);
    setQuery('');
    setHits([]);
    setAnimal(null);
    handlingRef.current = false;
    scanned.current = false;
  }, []);

  const close = useCallback(() => {
    reset();
    closeScan();
  }, [closeScan, reset]);

  const pickAnimal = useCallback(async (id: string, preview?: PickedAnimal) => {
    if (preview) {
      setAnimal(preview);
      setStep('actions');
      return;
    }
    try {
      const detail = await api.get<{ id: string; tag: string; name: string | null; species: string }>(
        `/v1/animals/${id}`,
      );
      setAnimal({
        id: detail.id,
        tag: detail.tag,
        name: detail.name,
        species: detail.species,
      });
    } catch {
      setAnimal({ id, tag: id.slice(0, 8), name: null, species: '' });
    }
    setStep('actions');
  }, [api]);

  const resolvePayload = useCallback(
    async (raw: string) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      setLookupError(null);
      try {
        const parsed = parseQrPayload(raw);
        if (parsed?.kind === 'animal') {
          await pickAnimal(parsed.id);
          return;
        }
        if (parsed?.kind === 'batch') {
          reset();
          setBatchTarget(parsed);
          closeScan();
          return;
        }
        const matches = await api.get<AnimalSearchHitDto[]>(
          `/v1/animals/search?q=${encodeURIComponent(raw.trim())}`,
        );
        const list = Array.isArray(matches) ? matches : [];
        if (list.length === 1 && list[0]) {
          const hit = list[0];
          await pickAnimal(hit.id, {
            id: hit.id,
            tag: hit.tag,
            name: hit.name,
            species: hit.species,
          });
          return;
        }
        if (list.length > 1) {
          setHits(list);
          setIdentifyMode('manual');
          setQuery(raw.trim());
          return;
        }
        setLookupError(t('qr.notFound'));
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : t('qr.notFound'));
      } finally {
        handlingRef.current = false;
      }
    },
    [api, closeScan, pickAnimal, reset, t],
  );

  useEffect(() => {
    if (!open || identifyMode !== 'manual') return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      setLookingUp(true);
      void api
        .get<AnimalSearchHitDto[]>(`/v1/animals/search?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : [];
          setHits(list);
          setLookupError(list.length === 0 ? t('qr.notFound') : null);
        })
        .catch((err: unknown) => {
          setLookupError(err instanceof Error ? err.message : t('qr.notFound'));
        })
        .finally(() => setLookingUp(false));
    }, 280);
    return () => clearTimeout(handle);
  }, [api, identifyMode, open, query, t]);

  if (!allowedScan) return null;

  return (
    <>
      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <Txt weight="semibold" style={styles.sheetTitle}>
                {step === 'actions' ? t('qr.whatNext') : t('qr.identifyTitle')}
              </Txt>
              <Button label={t('common.close')} variant="secondary" onPress={close} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
              {step === 'identify' ? (
                <>
                  <Txt muted style={{ marginBottom: 12 }}>
                    {t('qr.identifyHint')}
                  </Txt>
                  <View style={styles.row}>
                    <Button
                      label={t('qr.useCamera')}
                      variant={identifyMode === 'camera' ? 'primary' : 'secondary'}
                      onPress={() => {
                        setLookupError(null);
                        setIdentifyMode('camera');
                      }}
                    />
                    <Button
                      label={t('qr.typeNumber')}
                      variant={identifyMode === 'manual' ? 'primary' : 'secondary'}
                      onPress={() => setIdentifyMode('manual')}
                    />
                  </View>
                  {identifyMode === 'camera' ? (
                    !permission?.granted ? (
                      <View style={{ marginTop: 12 }}>
                        <Txt style={{ color: color.danger, marginBottom: 8 }}>{t('native.cameraDenied')}</Txt>
                        <Button label={t('native.grantCamera')} onPress={() => void requestPermission()} />
                      </View>
                    ) : (
                      <CameraView
                        style={styles.camera}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={({ data }) => {
                          if (scanned.current) return;
                          scanned.current = true;
                          void resolvePayload(data).finally(() => {
                            setTimeout(() => {
                              scanned.current = false;
                            }, 1200);
                          });
                        }}
                      />
                    )
                  ) : (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <TextInput
                        style={inputStyle(face)}
                        autoCapitalize="characters"
                        placeholder={t('qr.manualPlaceholder')}
                        placeholderTextColor={color.textMuted}
                        value={query}
                        onChangeText={setQuery}
                      />
                      <Button
                        label={lookingUp ? t('qr.searching') : t('qr.lookupAnimal')}
                        disabled={lookingUp || !query.trim()}
                        onPress={() => void resolvePayload(query.trim())}
                      />
                    </View>
                  )}
                  {lookupError ? (
                    <Txt style={{ color: color.danger, marginTop: 8 }}>{lookupError}</Txt>
                  ) : null}
                  {hits.length > 0 ? (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <Txt weight="semibold">{t('qr.pickAnimal')}</Txt>
                      {hits.map((hit) => (
                        <Pressable
                          key={hit.id}
                          style={styles.hit}
                          onPress={() =>
                            void pickAnimal(hit.id, {
                              id: hit.id,
                              tag: hit.tag,
                              name: hit.name,
                              species: hit.species,
                            })
                          }
                        >
                          <Txt weight="display" style={{ fontSize: 17 }}>
                            {hit.tag}
                          </Txt>
                          <Txt muted>
                            {hit.name?.trim() || SPECIES_LABEL[hit.species as Species] || hit.species}
                            {hit.penName ? ` · ${hit.penName}` : ''}
                          </Txt>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : animal ? (
                <>
                  <Txt muted>{t('qr.scanAnimal')}</Txt>
                  <Txt weight="display" style={styles.pickedName}>
                    {`${animal.name?.trim() || SPECIES_LABEL[animal.species as Species] || animal.species} #${animal.tag}`}
                  </Txt>
                  <Txt muted style={{ marginBottom: 12 }}>
                    {t('qr.whatNextHint')}
                  </Txt>
                  <AnimalActionGrid animalId={animal.id} onNavigate={close} />
                  <View style={{ marginTop: 16 }}>
                    <Button
                      label={t('qr.backToScan')}
                      variant="secondary"
                      onPress={() => {
                        setAnimal(null);
                        setHits([]);
                        setQuery('');
                        setLookupError(null);
                        setStep('identify');
                        setIdentifyMode('camera');
                        scanned.current = false;
                      }}
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {batchTarget ? (
        <ScanResultSheet
          target={batchTarget}
          onClose={() => {
            setBatchTarget(null);
            closeScan();
          }}
        />
      ) : null}
    </>
  );
}

function ScanResultSheet({ target, onClose }: { target: QrTarget; onClose: () => void }) {
  const { t } = useLocale();
  const { api } = useFarm();
  const { can } = useAccess();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [animal, setAnimal] = useState<{
    id: string;
    tag: string;
    name: string | null;
    species: string;
    breed: string;
    breedingStock: boolean;
  } | null>(null);
  const [batch, setBatch] = useState<{ id: string; name: string; category?: string } | null>(null);
  const [econ, setEcon] = useState<{
    investedTotal: number;
    earnedTotal: number;
    net: number;
    purchaseCost?: number;
    expenseTotal?: number;
    healthCostTotal?: number;
    revenueTotal?: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (target.kind === 'animal') {
        const [a, e] = await Promise.all([
          api.get<{
            id: string;
            tag: string;
            name: string | null;
            species: string;
            breed: string;
            breedingStock: boolean;
          }>(`/v1/animals/${target.id}`),
          api.get<{
            investedTotal: number;
            earnedTotal: number;
            net: number;
            purchaseCost: number;
            expenseTotal: number;
            healthCostTotal: number;
            revenueTotal: number;
          }>(`/v1/animals/${target.id}/economics`).catch(() => null),
        ]);
        setAnimal(a);
        setEcon(e);
      } else {
        const [b, e] = await Promise.all([
          api.get<{ id: string; name: string; category?: string }>(`/v1/batches/${target.id}`),
          api.get<{ investedTotal: number; earnedTotal: number; net: number }>(
            `/v1/batches/${target.id}/economics`,
          ).catch(() => null),
        ]);
        setBatch(b);
        setEcon(e);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api, target]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <Txt weight="semibold" style={styles.sheetTitle}>
              {t('qr.resultTitle')}
            </Txt>
            <Button label={t('common.close')} variant="secondary" onPress={onClose} />
          </View>
          <ScrollView style={styles.sheetBody}>
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState onRetry={() => void load()} /> : null}
            {animal ? (
              <>
                <Txt muted>{t('qr.scanAnimal')}</Txt>
                <Txt weight="display" style={styles.pickedName}>
                  {`${animal.name?.trim() || SPECIES_LABEL[animal.species as Species]} #${animal.tag}`}
                </Txt>
                <View style={styles.chips}>
                  <Chip label={SPECIES_LABEL[animal.species as Species] ?? animal.species} />
                  <Chip label={animal.breed} />
                  {animal.breedingStock ? <Chip label={t('animals.breedingStock')} /> : null}
                </View>
                <Txt weight="semibold" style={{ marginTop: 8 }}>
                  {t('qr.whatNext')}
                </Txt>
                <Txt muted style={{ marginBottom: 8 }}>
                  {t('qr.whatNextHint')}
                </Txt>
                <AnimalActionGrid animalId={animal.id} onNavigate={onClose} />
              </>
            ) : null}
            {batch ? (
              <>
                <Txt muted>{t('qr.scanBatch')}</Txt>
                <Txt weight="display" style={styles.pickedName}>
                  {batch.name}
                </Txt>
                {can('animals:read') ? (
                  <Button
                    label={t('qr.openDetail')}
                    onPress={() => {
                      onClose();
                      navigation.navigate('BatchDetail', { id: batch.id });
                    }}
                  />
                ) : null}
              </>
            ) : null}
            {econ ? (
              <View style={{ marginTop: 16, gap: 10 }}>
                <View style={styles.stats}>
                  <Stat label={t('qr.invested')} value={formatNPR(econ.investedTotal)} />
                  <Stat label={t('qr.earned')} value={formatNPR(econ.earnedTotal)} />
                  <Stat label={t('qr.net')} value={formatNPR(econ.net)} />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 38, 28, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1.5,
    borderColor: color.border,
    borderTopWidth: 3,
    borderTopColor: color.brand,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 18, flex: 1, marginRight: 12 },
  sheetBody: { paddingHorizontal: 18, paddingBottom: 20 },
  camera: {
    height: 240,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: color.brandStrong,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  hit: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    backgroundColor: color.surface,
  },
  pickedName: { fontSize: 22, marginVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
