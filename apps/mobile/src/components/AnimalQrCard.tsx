import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SvgXml } from 'react-native-svg';
import { animalScanUrl, qrSvg } from '../lib/qr';
import { printHtml } from '../lib/printHtml';
import { useLocale } from '../locale/LocaleProvider';
import { color, radius } from '../theme/tokens';
import { Button, Txt } from './ui';

/** Show / print / share an animal ear-tag QR (parity with web QrPrintCard). */
export function AnimalQrCard({
  animalId,
  title,
  subtitle,
}: {
  animalId: string;
  title: string;
  subtitle?: string;
}) {
  const { t } = useLocale();
  const url = animalScanUrl(animalId);
  const [svg, setSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSvg(null);
    void qrSvg(url)
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setError(t('errors.generic'));
      });
    return () => {
      cancelled = true;
    };
  }, [url, t]);

  const print = async () => {
    if (!svg) return;
    setBusy(true);
    try {
      await printHtml(
        title,
        `<div style="text-align:center">
          ${subtitle ? `<p style="color:#5C6B60">${escapeHtml(subtitle)}</p>` : ''}
          <div style="display:inline-block;width:260px;height:260px">${svg}</div>
          <p style="font-size:10px;word-break:break-all;color:#666;margin-top:12px">${escapeHtml(url)}</p>
        </div>`,
      );
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!svg) return;
    setBusy(true);
    try {
      const path = `${FileSystem.cacheDirectory ?? ''}animal-qr-${animalId.slice(0, 8)}.svg`;
      await FileSystem.writeAsStringAsync(path, svg, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'image/svg+xml',
          dialogTitle: t('qr.download'),
        });
      } else {
        await print();
      }
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Txt weight="display" style={styles.heading}>
        {t('qr.title')}
      </Txt>
      {svg ? (
        <SvgXml xml={svg} width={200} height={200} accessibilityLabel={t('qr.title')} />
      ) : (
        <Txt muted>{error ?? t('common.loading')}</Txt>
      )}
      <Txt muted style={styles.url} numberOfLines={3}>
        {url}
      </Txt>
      <View style={styles.actions}>
        <Button
          label={busy ? t('common.loading') : t('qr.print')}
          variant="secondary"
          disabled={!svg || busy}
          onPress={() => void print()}
        />
        <Button
          label={busy ? t('common.loading') : t('qr.download')}
          variant="secondary"
          disabled={!svg || busy}
          onPress={() => void share()}
        />
      </View>
    </View>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  heading: { fontSize: 18, alignSelf: 'flex-start' },
  url: { fontSize: 11, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
