import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { normalizeNepalMobile, type AuthUser } from '@farm/contracts';
import { useFarm } from '../state/FarmProvider';
import { useLocale } from '../locale/LocaleProvider';
import { Field, FormActions } from './forms';
import { Button, Card, Muted, Txt } from './ui';
import { color, space } from '../theme/tokens';

/** Collapsed row with the current SMS number; tap to edit. */
export function SmsPhoneCard() {
  const { api, user, patchUser } = useFarm();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhone(user?.phone ?? '');
  }, [user?.phone]);

  const save = async () => {
    const trimmed = phone.trim();
    const next = trimmed ? normalizeNepalMobile(trimmed) : null;
    if (trimmed && !next) {
      setError(t('sms.invalid'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const me = await api.patch<AuthUser>('/v1/auth/me', { phone: next });
      patchUser({ phone: me.phone ?? null });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.row}
      >
        <View style={styles.rowText}>
          <Txt weight="semibold">{t('sms.title')}</Txt>
          <Muted>{user?.phone ?? t('sms.notSet')}</Muted>
        </View>
        <Txt style={styles.edit}>{open ? t('common.cancel') : t('sms.edit')}</Txt>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Muted>{t('sms.hint')}</Muted>
          <Field
            label={t('sms.label')}
            value={phone}
            onChangeText={setPhone}
            placeholder="98XXXXXXXX"
            keyboardType="phone-pad"
            error={error}
          />
          <FormActions>
            <Button label={t('common.save')} onPress={() => void save()} disabled={busy} />
          </FormActions>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowText: { flex: 1, gap: 2 },
  edit: { color: color.brandStrong, fontSize: 14 },
  body: { marginTop: space.sm, gap: space.sm },
});
