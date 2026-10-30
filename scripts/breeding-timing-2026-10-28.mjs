/**
 * Breeding timing / Walk–Watch improvements summary PDF.
 * Run: node scripts/breeding-timing-2026-10-28.mjs
 */
import { jsPDF } from '../apps/web/node_modules/jspdf/dist/jspdf.es.min.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'breeding-timing-2026-10-28.pdf');

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

h1('Kharka Farm OS — Breeding timing');
body('Date: Tuesday 28 October 2026 (Nepal)');
body('Repo: manish3321/Livestock · Live: evoqedlivestockfarm.vercel.app');
body('Scope: clearer Walk vs Watch timing, colostrum urgency, next-step toasts, faster breeding board API. Uncommitted local changes (not pushed).');

h2('1. Problem');
body('Watch and Walk both felt like “status lists.” Overdue wording stacked, colostrum sat inside a mixed post-calving bucket, and after saving heat/service/PD/calving the UI did not say what to do next.');

h2('2. Walk board (today’s timed work)');
bullet('New COLOSTRUM group — right after Breed today — for COLOSTRUM_FEED only.');
bullet('Late items append a single “late / ढिलो” marker; no stacked overdue copy.');
bullet('Colostrum context uses hours after birth; breed window still shows clock deadline.');
bullet('Walk row “Record colostrum” opens the colostrum form directly.');

h2('3. Watch board (cycle status)');
bullet('Removed duplicate “overdue” suffix next to the countdown label.');
bullet('Help text points timed work (breed window, colostrum) to Walk.');
bullet('Primary CTA is stage-aware: Log heat / Breed now / PD / Calving / Colostrum.');

h2('4. After-save next steps');
bullet('Heat → next: breed in 12–18h window (Walk → Breed today).');
bullet('Service → next: pregnancy check on due day (Walk).');
bullet('PD → Watch shows dry-off and calving countdowns.');
bullet('Calving → next: colostrum within 2 hours (Walk → Colostrum).');
bullet('Colostrum → postpartum checks remain on Walk.');
bullet('English and Nepali toast strings updated together.');

h2('5. Mobile alignment');
bullet('WalkKind “colostrum” split out; order matches web: breed → colostrum → heat → PD → dry-off → post-calving.');
bullet('SYNC_AI included in breed-today; dedicated Colostrum primary button.');

h2('6. API speed (GET breeding board)');
bullet('Species configs for all species on the board prefetch in parallel with sync enrollments.');
bullet('taskMetadata made synchronous (no await in the per-task loop).');
bullet('No change to bootstrap page size, batch detail, animal-picker counts, or sync protocol.');

h2('7. Tests');
bullet('breeding-board.test.ts: COLOSTRUM group order + RECORD_COLOSTRUM action.');
bullet('Late marker appears once on overdue Walk items.');

h2('8. Files touched');
bullet('packages/contracts — BOARD_GROUP_KEYS includes COLOSTRUM.');
bullet('apps/api — breeding-board.ts, breeding-board.service.ts, breeding-board.test.ts.');
bullet('apps/web — BreedingBoard, BreedingWatch, en/ne i18n.');
bullet('apps/mobile — breeding-groups.ts, BreedingScreen, en/ne i18n.');

h2('9. How to verify');
bullet('Open Walk: Colostrum section appears for fresh calves; late items say “late” once.');
bullet('Open Watch: countdown only; CTA matches next form.');
bullet('Save heat → toast points at breed window; save calving → toast points at colostrum.');
bullet('Mobile Walk shows Colostrum as its own section.');

const buf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
