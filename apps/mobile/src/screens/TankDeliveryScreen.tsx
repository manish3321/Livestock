import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DeliveryCreate, MilkRoundDto, TankUpdate } from '@farm/contracts';
import { AppShell } from '../components/AppShell';
import { Field } from '../components/forms';
import { Button, Card, ErrorState, LoadingState, ScreenScroll, Txt } from '../components/ui';
import { ApiError } from '../api/http-farm-api';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'TankDelivery'>;

export function TankDeliveryScreen({ navigation, route }: Props) {
  const milkRoundId = route.params.milkRoundId;
  const { api } = useFarm();
  const { t } = useLocale();
  const [round, setRound] = useState<MilkRoundDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState('');
  const [litresSent, setLitresSent] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [savingTank, setSavingTank] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MilkRoundDto>(`/v1/milk/rounds/${milkRoundId}`);
      setRound(data);
      if (data.tank?.actualLitres != null) setActual(String(data.tank.actualLitres));
      if (data.tank?.delivery?.litresSent != null) {
        setLitresSent(String(data.tank.delivery.litresSent));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('shed.saveFailed'));
    } finally {
      setLoading(false);
    }
  }, [api, milkRoundId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTank = async () => {
    const actualLitres = Number(actual);
    if (!Number.isFinite(actualLitres) || actualLitres < 0) {
      Alert.alert(t('shed.saveFailed'), t('shed.actual'));
      return;
    }
    setSavingTank(true);
    try {
      const body: TankUpdate = { actualLitres };
      const data = await api.patch<MilkRoundDto>(`/v1/milk/rounds/${milkRoundId}/tank`, body);
      setRound(data);
      Alert.alert(t('shed.saveTank'));
    } catch (err) {
      Alert.alert(t('shed.saveFailed'), err instanceof Error ? err.message : undefined);
    } finally {
      setSavingTank(false);
    }
  };

  const pickReceipt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('shed.receiptPhoto'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const saveDelivery = async () => {
    const litres = Number(litresSent);
    if (!Number.isFinite(litres) || litres <= 0) {
      Alert.alert(t('shed.saveFailed'), t('shed.litresSent'));
      return;
    }
    setSavingDelivery(true);
    try {
      const body: DeliveryCreate = {
        litresSent: litres,
        receiptNumber: receiptNumber.trim() || undefined,
      };
      await api.post(`/v1/milk/rounds/${milkRoundId}/delivery`, body);
      if (receiptUri) {
        const name = receiptUri.split('/').pop() ?? 'receipt.jpg';
        await api.uploadFile(`/v1/milk/rounds/${milkRoundId}/delivery/receipt`, 'file', {
          uri: receiptUri,
          name,
          type: 'image/jpeg',
        });
      }
      await load();
      Alert.alert(t('shed.saveDelivery'));
    } catch (err) {
      Alert.alert(t('shed.saveFailed'), err instanceof Error ? err.message : undefined);
    } finally {
      setSavingDelivery(false);
    }
  };

  return (
    <AppShell module="shed" title={`${t('shed.tank')} / ${t('shed.delivery')}`}>
      {loading ? <LoadingState /> : null}
      {error && !round ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {round ? (
        <ScreenScroll>
          <Card style={styles.card}>
            <Txt weight="display" style={styles.title}>
              {t('shed.tank')}
            </Txt>
            <Txt muted style={styles.meta}>
              {t('shed.expected')}: {round.expected.toFixed(1)} L
            </Txt>
            {round.tank?.actualLitres != null ? (
              <Txt muted style={styles.meta}>
                {t('shed.actual')}: {round.tank.actualLitres.toFixed(1)} L · {t('shed.variance')}:{' '}
                {round.tank.variancePercent?.toFixed(1) ?? '—'}%
              </Txt>
            ) : null}
            <Field
              label={t('shed.actual')}
              value={actual}
              onChangeText={setActual}
              keyboardType="decimal-pad"
            />
            <Txt muted style={styles.hint}>
              {t('shed.varianceHint')}
            </Txt>
            <Button label={t('shed.saveTank')} onPress={() => void saveTank()} disabled={savingTank} />
          </Card>

          <Card style={styles.card}>
            <Txt weight="display" style={styles.title}>
              {t('shed.delivery')}
            </Txt>
            {round.tank?.delivery?.receiptUrl ? (
              <Txt weight="semibold" style={{ color: color.brand, marginBottom: 8 }}>
                {t('shed.receiptReady')}
              </Txt>
            ) : null}
            <Field
              label={t('shed.litresSent')}
              value={litresSent}
              onChangeText={setLitresSent}
              keyboardType="decimal-pad"
            />
            <Field
              label={t('shed.receiptNumber')}
              value={receiptNumber}
              onChangeText={setReceiptNumber}
            />
            <Pressable style={styles.pick} onPress={() => void pickReceipt()} accessibilityRole="button">
              <Txt weight="semibold">
                {receiptUri ? t('shed.receiptReady') : t('shed.receiptPhoto')}
              </Txt>
            </Pressable>
            <Button
              label={t('shed.saveDelivery')}
              onPress={() => void saveDelivery()}
              disabled={savingDelivery}
            />
          </Card>

          <Button label={t('nav.shed')} onPress={() => navigation.navigate('Shed')} variant="secondary" />
        </ScreenScroll>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, gap: 8 },
  title: { fontSize: 18, color: color.brandStrong, marginBottom: 4 },
  meta: { fontSize: 13, marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 8 },
  pick: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceMuted,
    marginBottom: 8,
  },
});
