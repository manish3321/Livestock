import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MilkDisposal, ScanResolveDto } from '@farm/contracts';
import {
  abandonLocalRound,
  finishLocalRound,
  remainingAnimals,
  resolveLocalScan,
  saveHealthLocal,
  saveMilkLocal,
  saveWeightLocal,
  undoLastMilk,
} from '../core/scan-round';
import { Numpad } from '../components/Numpad';
import { AppShell } from '../components/AppShell';
import { EarTagBadge } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { color, fonts, tap as TAP } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Round'>;

export function RoundScreen({ navigation }: Props) {
  const { store, api, revision, persist } = useFarm();
  const { t } = useLocale();
  const copy = {
    usual: t('shed.noUsual'),
    cannotSell: t('shed.cannotSell'),
    weightKg: t('animals.weightKg'),
    title: t('health.title'),
    medicine: t('health.protocol'),
    dosage: t('shed.confirmDose'),
    confirmSave: t('shed.confirmSave'),
    save: t('shed.save'),
    back: t('shed.back'),
    cameraDenied: t('native.cameraDenied'),
    grantCamera: t('native.grantCamera'),
    torch: t('native.torch'),
    typeNumber: t('shed.typeNumber'),
    undo: t('shed.undo'),
    photoGrid: t('shed.photoGrid'),
    remaining: t('shed.stillToDo'),
    emptyHerd: t('native.emptyHerd'),
    finish: t('shed.finish'),
    abandon: t('native.abandon'),
    offline: t('native.offline'),
  };
  const [scan, setScan] = useState<ScanResolveDto | null>(null);
  const [digits, setDigits] = useState('');
  const [confirmRange, setConfirmRange] = useState(false);
  const [torch, setTorch] = useState(true);
  const [search, setSearch] = useState('');
  const [photos, setPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medicine, setMedicine] = useState('');
  const [dosage, setDosage] = useState('');
  const [title, setTitle] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLock, setScanLock] = useState(false);

  void revision;
  const remaining = useMemo(() => remainingAnimals(store), [store, revision]);
  const mode = store.round?.mode ?? 'MILKING';

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  const onScan = useCallback(
    (raw: string, method: 'CAMERA' | 'MANUAL_NUMBER' | 'LIST_TAP' | 'PHOTO_PICK') => {
      if (scanLock && method === 'CAMERA') return;
      const result = resolveLocalScan(store, raw, method);
      if (result.status === 'ok') {
        Vibration.vibrate(20);
        setScan(result.dto);
        setDigits(
          result.dto.context.alreadyRecordedThisRound && result.dto.context.existingValue != null
            ? String(result.dto.context.existingValue)
            : '',
        );
        setConfirmRange(false);
        setError(null);
        setTitle(mode === 'VACCINATION' ? 'Vaccination' : mode === 'TREATMENT' ? 'Treatment' : '');
        if (method === 'CAMERA') {
          setScanLock(true);
          setTimeout(() => setScanLock(false), 1200);
        }
        return;
      }
      Vibration.vibrate(80);
      setError(result.status === 'ambiguous' ? 'SCAN_AMBIGUOUS' : 'SCAN_NO_MATCH');
    },
    [mode, scanLock, store],
  );

  const save = () => {
    if (!scan) return;
    if (mode === 'WEIGHING') {
      const result = saveWeightLocal(store, { animalId: scan.animal.id, weightKg: Number(digits) });
      if (!result.ok) {
        setError(result.code);
        return;
      }
    } else if (mode === 'VACCINATION' || mode === 'TREATMENT') {
      const result = saveHealthLocal(store, {
        animalId: scan.animal.id,
        type: mode,
        title: title || mode,
        medicine,
        dosage: dosage || digits,
      });
      if (!result.ok) {
        setError(result.code);
        return;
      }
    } else {
      const litres = Number(digits);
      const disposal: MilkDisposal = scan.blocks.some((b) => b.kind === 'MILK_WITHHOLD')
        ? 'DISCARDED'
        : 'SOLD';
      const result = saveMilkLocal(store, {
        animalId: scan.animal.id,
        litres,
        disposal,
        confirmOutOfRange: confirmRange,
      });
      if (!result.ok && result.code === 'YIELD_OUT_OF_RANGE') {
        setConfirmRange(true);
        setError(copy.confirmSave);
        return;
      }
      if (!result.ok) {
        setError(result.code);
        return;
      }
    }
    Vibration.vibrate(10);
    setScan(null);
    setDigits('');
    setMedicine('');
    setDosage('');
    setTitle('');
    setConfirmRange(false);
    setError(copy.offline);
    persist();
  };

  const finish = async () => {
    const mode = store.round?.mode;
    const roundId = store.round?.id;
    finishLocalRound(store);
    persist();
    if (mode === 'MILKING' && roundId && store.accessToken) {
      try {
        const finished = await api.post<{ milkRoundId?: string | null }>(
          `/v1/rounds/${roundId}/finish`,
          { skips: [] },
        );
        store.outbox = store.outbox.filter(
          (o) => !(o.rest?.kind === 'round-finish' && o.rest.id === roundId),
        );
        if (finished?.milkRoundId) {
          if (store.round) store.round.milkRoundId = finished.milkRoundId;
          persist();
          navigation.navigate('TankDelivery', { milkRoundId: finished.milkRoundId });
          return;
        }
      } catch {
        /* offline — shed can open tank after sync */
      }
    }
    navigation.navigate('Shed');
  };

  const abandon = () => {
    abandonLocalRound(store);
    persist();
    navigation.navigate('Shed');
  };

  const withhold = scan?.blocks.find((b) => b.kind === 'MILK_WITHHOLD');

  return (
    <AppShell module="shed">
    <View style={styles.screen}>
          {scan ? (
        <ScrollView contentContainerStyle={styles.pad}>
          <EarTagBadge
            code={String(scan.animal.shortNo ?? scan.animal.name ?? '—')}
            name={scan.animal.nameNp ?? scan.animal.name ?? undefined}
          />
          {scan.animal.photoUrl ? (
            <Image source={{ uri: scan.animal.photoUrl }} style={styles.photo} />
          ) : null}
          {mode === 'MILKING' ? (
            <>
              <Text style={styles.muted}>
                {copy.usual} {scan.context.rolling7Mean ?? '—'}
              </Text>
              {withhold ? <Text style={styles.hold}>{copy.cannotSell}</Text> : null}
              <Text style={styles.display}>{digits || '0.0'}</Text>
              <Numpad value={digits} onChange={setDigits} />
            </>
          ) : null}
          {mode === 'WEIGHING' ? (
            <>
              <Text style={styles.muted}>{copy.weightKg}</Text>
              <Text style={styles.display}>{digits || '0.0'}</Text>
              <Numpad value={digits} onChange={setDigits} />
            </>
          ) : null}
          {mode === 'VACCINATION' || mode === 'TREATMENT' ? (
            <>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={copy.title}
              />
              <TextInput
                style={styles.input}
                value={medicine}
                onChangeText={setMedicine}
                placeholder={copy.medicine}
              />
              <TextInput
                style={styles.input}
                value={dosage}
                onChangeText={setDosage}
                placeholder={copy.dosage}
              />
            </>
          ) : null}
          {error ? <Text style={styles.hold}>{error}</Text> : null}
          <Pressable style={styles.btn} onPress={save}>
            <Text style={styles.btnText}>
              {confirmRange && mode === 'MILKING' ? copy.confirmSave : copy.save}
            </Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setScan(null)}>
            <Text style={styles.secondaryText}>{copy.back}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.padFlex}>
          {!permission?.granted ? (
            <View style={styles.perm}>
              <Text style={styles.hold}>{copy.cameraDenied}</Text>
              <Pressable style={styles.btn} onPress={() => void requestPermission()}>
                <Text style={styles.btnText}>{copy.grantCamera}</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={styles.camera}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => onScan(data, 'CAMERA')}
            />
          )}
          <Pressable style={styles.torch} onPress={() => setTorch((v) => !v)}>
            <Text style={styles.btnText}>{copy.torch}</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder={copy.typeNumber}
            keyboardType="number-pad"
            onSubmitEditing={() => onScan(search, 'MANUAL_NUMBER')}
          />
          <View style={styles.rowBtns}>
            <Pressable
              style={styles.secondaryHalf}
              onPress={() => {
                if (store.round && undoLastMilk(store)) persist();
              }}
            >
              <Text style={styles.secondaryText}>{copy.undo}</Text>
            </Pressable>
            <Pressable style={styles.secondaryHalf} onPress={() => setPhotos((v) => !v)}>
              <Text style={styles.secondaryText}>{copy.photoGrid}</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>
            {remaining.length} {copy.remaining}
          </Text>
          {remaining.length === 0 ? <Text style={styles.muted}>{copy.emptyHerd}</Text> : null}
          {error ? <Text style={styles.hold}>{error}</Text> : null}
          <FlatList
            style={styles.list}
            data={remaining}
            keyExtractor={(a) => a.id}
            initialNumToRender={24}
            windowSize={8}
            renderItem={({ item: a }) => (
              <Pressable
                style={styles.row}
                onPress={() => onScan(a.id, photos ? 'PHOTO_PICK' : 'LIST_TAP')}
              >
                <View style={styles.left}>
                  {photos && (a.photoLocalPath || a.photoUrl) ? (
                    <Image
                      source={{ uri: a.photoLocalPath ?? a.photoUrl! }}
                      style={styles.thumb}
                    />
                  ) : null}
                  <Text style={styles.strong}>{a.shortNo ?? a.tag}</Text>
                </View>
                <Text style={styles.muted}>{a.name ?? a.penName ?? ''}</Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.btn} onPress={() => void finish()}>
            <Text style={styles.btnText}>{copy.finish}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={abandon}>
            <Text style={styles.secondaryText}>{copy.abandon}</Text>
          </Pressable>
        </View>
      )}
    </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surfaceSubtle },
  pad: { padding: 16, paddingBottom: 32 },
  padFlex: { flex: 1, padding: 16 },
  muted: { color: color.textSecondary, fontSize: 15, fontWeight: '500' },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: color.fieldBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '500',
    backgroundColor: color.surface,
    marginBottom: 12,
    color: color.textPrimary,
  },
  btn: {
    minHeight: 56,
    backgroundColor: color.brand,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: color.brandStrong,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    minHeight: 48,
    backgroundColor: color.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    borderBottomWidth: 3,
    borderBottomColor: '#C8BFA8',
  },
  secondaryText: { color: color.textPrimary, fontSize: 16, fontWeight: '600' },
  secondaryHalf: {
    flex: 1,
    minHeight: 48,
    backgroundColor: color.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    borderBottomWidth: 3,
    borderBottomColor: '#C8BFA8',
  },
  rowBtns: { flexDirection: 'row', gap: 8 },
  camera: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: color.brandStrong,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  torch: {
    minHeight: 48,
    backgroundColor: color.ember,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: color.emberStrong,
  },
  who: { fontSize: 28, fontWeight: '700', color: color.textPrimary },
  display: {
    fontSize: 40,
    fontWeight: '800',
    color: color.textPrimary,
    textAlign: 'center',
    marginVertical: 8,
    letterSpacing: -1,
    fontFamily: fonts.bodyExtraBold,
  },
  hold: { color: color.danger, fontSize: 15, fontWeight: '700' },
  photo: { width: 72, height: 72, borderRadius: 8, marginBottom: 8 },
  perm: { marginBottom: 12 },
  list: { flex: 1 },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  strong: { fontSize: 18, fontWeight: '800', color: color.textPrimary, letterSpacing: -0.5 },
});
