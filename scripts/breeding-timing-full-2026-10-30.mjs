/**
 * Full breeding timing direction summary PDF.
 * Run: node scripts/breeding-timing-full-2026-10-30.mjs
 */
import { jsPDF } from '../apps/web/node_modules/jspdf/dist/jspdf.es.min.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'breeding-timing-full-2026-10-30.pdf');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const margin = 18;
const maxW = 210 - margin * 2;
let y = margin;

function ensureSpace(need = 12) {
  if (y + need > 285) {
    doc.addPage();
    y = margin;
  }
}

function h1(text) {
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(text, margin, y);
  y += 9;
}

function h2(text) {
  ensureSpace(14);
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(text, margin, y);
  y += 7;
}

function body(text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    ensureSpace(6);
    doc.text(line, margin, y);
    y += 5;
  }
}

function bullet(text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(`•  ${text}`, maxW);
  for (const line of lines) {
    ensureSpace(6);
    doc.text(line, margin, y);
    y += 5;
  }
}

h1('Kharka Farm OS — Breeding timing (full)');
body('Date: Thursday 30 October 2026 (Nepal)');
body('Repo: manish3321/Livestock · Live: evoqedlivestockfarm.vercel.app');
body('Scope: full Watch / Walk / Herd timing direction. Tabs unchanged. Local changes not pushed.');

h2('One farmer rule');
bullet('Walk = today’s work only (Nepal calendar day: overdue + due today).');
bullet('Watch = planning / status (this week, next heat, days to calving).');
bullet('Herd = managers (KPIs + history).');
bullet('Same rule on phone and web. Mobile Walk now prefers GET /v1/breeding/board.');

h2('1–2. Human timing on every Walk row');
bullet('Each row: Do by · Why · one late consequence (e.g. “window closing”).');
bullet('No stacked overdue labels. Contracts: doBy*/why*/late*/urgency on BoardItemDto.');
bullet('Quiet-day cap: HEAT_WATCH preferred over SILENT_HEAT_CHECK for the same animal.');

h2('3. Next action after every save');
bullet('Banner: Saved → next is X → Due Y, with a large Open next button.');
bullet('Heat → service window · Service → PD day · PD → Watch countdowns · Calving → colostrum within 2h · Colostrum → postpartum on Walk.');

h2('4. Service window = one mental model');
bullet('Watch IN_HEAT shows “Walk owns this · window closes {clock}”.');
bullet('Breed now / Open on Walk switches to Walk tab with the service form.');

h2('5. Colostrum timed Walk group');
bullet('Own COLOSTRUM group. Green ≤2h, amber 2–6h, red >6h (row urgency + group colour).');

h2('6. Mobile = web Walk');
bullet('Phone loads the same board DTO: groups, technician call, injection, dry-off, manager decisions.');
bullet('Offline fallback still uses local task grouping (today-only, not tomorrow).');

h2('7. Softer voluntary wait');
bullet('Heat in VWP: choose Observation only (no breed window) or Confirm real heat.');
bullet('Service in VWP: confirm “Serve anyway” before the pregnancy chain fires.');

h2('API speed');
bullet('Board still prefetches species configs + enrollments in parallel; taskMetadata is sync.');

h2('Verify (tested 30 Oct 2026)');
bullet('API board/watch unit tests + mobile breeding-board-walk.test.ts (2/2).');
bullet('Live Walk: COLOSTRUM Why 1h GREEN / 4h AMBER / 8h RED; group colour RED (worst).');
bullet('VWP Serve anyway: B01 → confirm → service write UI-VWP-SERVE-ANYWAY; next banner PD.');
bullet('Mobile Walk prefers GET /v1/breeding/board (no physical device this session).');
bullet('Smoke script smoke-breeding-remaining.mjs: colostrum G/A/R + VWP service + board contract.');

y += 6;
body('— End —');

const buf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
