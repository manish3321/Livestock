import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/http-farm-api';
import { FarmMark } from '../components/ModuleIcon';
import { Button, Txt, inputStyle, useTypeface } from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import { color } from '../theme/tokens';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useFarm();
  const { t, locale, setLocale } = useLocale();
  const face = useTypeface();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(false);
    setUnreachable(false);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      const message = err instanceof Error ? err.message : '';
      setUnreachable(
        status === 0 ||
          status === 404 ||
          status === 405 ||
          status === 502 ||
          status === 503 ||
          /Method Not Allowed|Failed to fetch|NetworkError/i.test(message),
      );
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <FarmMark size={40} light />
          <Txt weight="semibold" style={styles.heroKicker}>
            {t('appName')}
          </Txt>
          <Txt weight="display" style={styles.heroTitle}>
            {t('login.heroTitle')}
          </Txt>
          <Txt style={styles.heroBody}>{t('login.heroBody')}</Txt>
          <View style={styles.points}>
            {[t('login.point1'), t('login.point2'), t('login.point3')].map((point) => (
              <View key={point} style={styles.pointRow}>
                <View style={styles.pointDot} />
                <Txt style={styles.pointText}>{point}</Txt>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <FarmMark size={32} />
          <Txt weight="semibold" muted style={styles.kicker}>
            {t('appName')}
          </Txt>
          <Txt weight="display" style={styles.title}>
            {t('login.title')}
          </Txt>
          <Txt weight="medium" style={styles.pocket}>
            {t('login.pocket')}
          </Txt>
          <Txt weight="medium" style={styles.label}>
            {t('login.email')}
          </Txt>
          <TextInput
            style={inputStyle(face)}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
          />
          <Txt weight="medium" style={[styles.label, { marginTop: 16 }]}>
            {t('login.password')}
          </Txt>
          <TextInput
            style={inputStyle(face)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
          />
          {error ? (
            <Txt style={styles.error}>
              {t(unreachable ? 'login.serverUnreachable' : 'login.failed')}
            </Txt>
          ) : null}
          <View style={{ marginTop: 8 }}>
            <Button
              label={busy ? t('common.loading') : t('login.submit')}
              block
              disabled={busy || !email.trim() || !password}
              onPress={() => void onSubmit()}
            />
          </View>
          <Pressable
            style={styles.localeSwitch}
            onPress={() => setLocale(locale === 'ne' ? 'en' : 'ne')}
          >
            <Txt weight="semibold" style={styles.localeText}>
              {locale === 'ne' ? 'English' : 'नेपाली'}
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: color.brandStrong,
  },
  panel: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 20,
  },
  hero: {
    gap: 8,
    paddingHorizontal: 4,
  },
  heroKicker: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255,253,249,0.75)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFDF9',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    maxWidth: 280,
  },
  heroBody: {
    color: 'rgba(255,253,249,0.85)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  points: { gap: 10, marginTop: 4 },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: color.ember,
  },
  pointText: { flex: 1, color: 'rgba(255,253,249,0.9)', fontSize: 14, lineHeight: 20 },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 8,
    padding: 20,
  },
  kicker: { fontSize: 12, marginTop: 12, marginBottom: 8 },
  title: { fontSize: 25, marginBottom: 4 },
  pocket: { color: color.textSecondary, fontSize: 14, marginBottom: 16 },
  label: { fontSize: 13, color: color.textSecondary, marginBottom: 6 },
  error: { color: color.danger, fontSize: 13, fontWeight: '500', marginVertical: 8 },
  localeSwitch: { marginTop: 16, alignItems: 'center' },
  localeText: { color: color.brand, fontSize: 14 },
});
