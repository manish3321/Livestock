import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Render HTML to a PDF and open the native share/print sheet. */
export async function printHtml(title: string, htmlBody: string): Promise<void> {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; color: #14261C; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #E5DEC9; padding: 6px 8px; text-align: left; }
  th { background: #E3F9E9; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${htmlBody}
</body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}

export function tableHtml(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell == null ? '' : String(cell))}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
