import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import type { MilkDisposal, RecordingMode, ScanResolveDto } from '@farm/contracts';
import { copy, type Locale } from './src/core/copy';
import { createStore, type FarmStore } from './src/core/store';
import { remainingAnimals, resolveLocalScan, saveMilkLocal, startLocalRound, undoLastMilk } from './src/core/scan-round';
import { runSync } from './src/core/sync-engine';
import { MemoryNotificationEngine } from './src/native/notifee-engine';

const TAP = 52;
const store: FarmStore = createStore();
const engine = new MemoryNotificationEngine();
const NativeCamera = CameraView as ComponentType<Record<string, unknown>>;

type Screen = 'login' | 'home' | 'round' | 'conflicts';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [locale, setLocale] = useState<Locale>('ne');
  const [email, setEmail] = useState('worker@farm.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResolveDto | null>(null);
  const [digits, setDigits] = useState('');
  const [confirmRange, setConfirmRange] = useState(false);
  const [torch, setTorch] = useState(true);
  const [search, setSearch] = useState('');
  const [photos, setPhotos] = useState(false);
  const [tick, setTick] = useState(0);
  const t = copy[locale];
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  const remaining = useMemo(() => remainingAnimals(store), [tick]);

  const onScan = useCallback((raw: string, method: 'CAMERA' | 'MANUAL_NUMBER' | 'LIST_TAP' | 'PHOTO_PICK') => {
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
      return;
    }
    Vibration.vibrate(80);
    setError(result.status === 'ambiguous' ? 'SCAN_AMBIGUOUS' : 'SCAN_NO_MATCH');
  }, []);

  const save = () => {
    if (!scan) return;
    const litres = Number(digits);
    const disposal: MilkDisposal = scan.blocks.some((b) => b.kind === 'MILK_WITHHOLD') ? 'DISCARDED' : 'SOLD';
    const result = saveMilkLocal(store, {
      animalId: scan.animal.id,
      litres,
      disposal,
      confirmOutOfRange: confirmRange,
    });
    if (!result.ok && result.code === 'YIELD_OUT_OF_RANGE') {
      setConfirmRange(true);
      setError(t.confirmSave);
      return;
    }
    if (!result.ok) {
      setError(result.code);
      return;
    }
    Vibration.vibrate(10);
    setScan(null);
    setDigits('');
    setConfirmRange(false);
    setError(t.offline);
    setTick((n) => n + 1);
  };

  if (screen === 'login') {
    return (
      <View style={styles.screen}>
        <Text style={styles.h1}>{t.appName}</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={t.email} autoCapitalize="none" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={t.password} secureTextEntry />
        <Pressable
          style={styles.btn}
          onPress={() => {
            store.accessToken = 'offline';
            setScreen('home');
          }}
        >
          <Text style={styles.btnText}>{t.login}</Text>
        </Pressable>
        <Pressable onPress={() => setLocale(locale === 'ne' ? 'en' : 'ne')}>
          <Text style={styles.link}>{locale === 'ne' ? 'English' : 'नेपाली'}</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === 'conflicts') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
        <Text style={styles.h1}>{t.conflicts}</Text>
        {store.conflicts.map((c) => (
          <View key={c.id} style={styles.row}>
            <Text style={styles.strong}>{c.entityId.slice(0, 8)}</Text>
            <Pressable style={styles.btn} onPress={() => setTick((n) => n + 1)}>
              <Text style={styles.btnText}>{t.acceptServer}</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.secondary} onPress={() => setScreen('home')}>
          <Text style={styles.secondaryText}>{t.appName}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (screen === 'home') {
    return (
      <View style={styles.screen}>
        <Text style={styles.h1}>{t.appName}</Text>
        <Text style={styles.muted}>{remaining.length} {t.remaining}</Text>
        <Pressable
          style={styles.btn}
          onPress={() => {
            startLocalRound(store, { id: crypto.randomUUID(), mode: 'MILKING' as RecordingMode, session: 'MORNING' });
            setScreen('round');
            setTick((n) => n + 1);
          }}
        >
          <Text style={styles.btnText}>{t.startMilking}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => void runSync(store, dummyApi(), engine).then(() => setScreen('conflicts'))}>
          <Text style={styles.secondaryText}>{t.conflicts} ({store.conflicts.length})</Text>
        </Pressable>
      </View>
    );
  }

  const withhold = scan?.blocks.find((b) => b.kind === 'MILK_WITHHOLD');

  return (
    <View style={styles.screen}>
      {scan ? (
        <ScrollView contentContainerStyle={styles.pad}>
          <Text style={styles.who}>
            {scan.animal.shortNo ?? scan.animal.name}
          </Text>
          {scan.animal.photoUrl ? <Image source={{ uri: scan.animal.photoUrl }} style={styles.photo} /> : null}
          <Text style={styles.muted}>
            {t.usual} {scan.context.rolling7Mean ?? '—'}
          </Text>
          {withhold ? <Text style={styles.hold}>{t.cannotSell}</Text> : null}
          <Text style={styles.display}>{digits || '0.0'}</Text>
          <View style={styles.padGrid}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'C'].map((ch) => (
              <Pressable
                key={ch}
                style={styles.key}
                onPress={() => setDigits((d) => (ch === 'C' ? '' : d.length >= 5 ? d : d + ch))}
              >
                <Text style={styles.keyText}>{ch}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.hold}>{error}</Text> : null}
          <Pressable style={styles.btn} onPress={save}>
            <Text style={styles.btnText}>{confirmRange ? t.confirmSave : t.save}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setScan(null)}>
            <Text style={styles.secondaryText}>{t.torch}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <NativeCamera
            style={styles.camera}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }: { data: string }) => onScan(data, 'CAMERA')}
          />
          <Pressable style={styles.torch} onPress={() => setTorch((v) => !v)}>
            <Text style={styles.btnText}>{t.torch}</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder={t.typeNumber}
            keyboardType="number-pad"
            onSubmitEditing={() => onScan(search, 'MANUAL_NUMBER')}
          />
          <Pressable style={styles.secondary} onPress={() => store.round && undoLastMilk(store) && setTick((n) => n + 1)}>
            <Text style={styles.secondaryText}>{t.undo}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setPhotos((v) => !v)}>
            <Text style={styles.secondaryText}>{t.photoGrid}</Text>
          </Pressable>
          <ScrollView style={styles.list}>
            {remaining.map((a) => (
              <Pressable key={a.id} style={styles.row} onPress={() => onScan(a.id, photos ? 'PHOTO_PICK' : 'LIST_TAP')}>
                <Text style={styles.strong}>{a.shortNo ?? a.tag}</Text>
                <Text style={styles.muted}>{a.name ?? a.penName ?? ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function dummyApi() {
  return {
    login: async () => ({ accessToken: '', refreshToken: '', expiresIn: 0, user: {} as never }),
    pull: async () => ({ changes: [], nextCursor: 0, hasMore: false }),
    push: async () => ({ results: [] }),
    listAnimals: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
    activeWithholds: async () => [],
    markerCohort: async () => ({ groups: [] }),
    listTasks: async () => ({ items: [], page: 1, pageSize: 200, total: 0 }),
    claimBlock: async () => {
      throw new Error('offline');
    },
    remaining: async () => ({ round: {} as never, expected: 0, recorded: 0, remaining: [] }),
    postRest: async () => undefined,
    patchRest: async () => undefined,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f1ea', padding: 16 },
  pad: { paddingBottom: 32 },
  h1: { fontSize: 28, fontWeight: '700', color: '#1a2e1a', marginBottom: 12 },
  muted: { color: '#3d4a3d', fontSize: 16, fontWeight: '500' },
  input: {
    minHeight: TAP,
    borderWidth: 2,
    borderColor: '#1a2e1a',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '500',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  btn: {
    minHeight: TAP,
    backgroundColor: '#c45c26',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  secondary: {
    minHeight: TAP,
    borderWidth: 2,
    borderColor: '#1a2e1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  secondaryText: { color: '#1a2e1a', fontSize: 16, fontWeight: '600' },
  link: { color: '#1a2e1a', fontSize: 16, marginTop: 12 },
  camera: { height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  torch: {
    minHeight: TAP,
    backgroundColor: '#1a2e1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  list: { flex: 1 },
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#d7d2c8',
  },
  strong: { fontSize: 22, fontWeight: '700', color: '#1a2e1a' },
  who: { fontSize: 32, fontWeight: '700', color: '#1a2e1a' },
  display: { fontSize: 48, fontWeight: '700', color: '#1a2e1a', textAlign: 'center', marginVertical: 8 },
  padGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  key: {
    width: '32%',
    minHeight: TAP,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1a2e1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 24, fontWeight: '700', color: '#1a2e1a' },
  hold: { color: '#9b1c1c', fontSize: 16, fontWeight: '700' },
  photo: { width: 72, height: 72, borderRadius: 8, marginBottom: 8 },
});
