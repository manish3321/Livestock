/**
 * Changes on 1–2 Nov 2026 (Nepal).
 * Run: node scripts/work-summary-2026-11-01-02.mjs
 */
import { jsPDF } from '../apps/web/node_modules/jspdf/dist/jspdf.es.min.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'work-summary-2026-11-01-02.pdf');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const margin = 16;
const maxW = 210 - margin * 2;
let y = margin;
let page = 1;

function footer() {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Evoqed Livestock · 1–2 Nov 2026 · Page ${page}`, margin, 290);
  doc.setTextColor(0);
}
function newPage() {
  footer();
  doc.addPage();
  page += 1;
  y = margin;
}
function ensureSpace(need = 12) {
  if (y + need > 282) newPage();
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
  for (const line of doc.splitTextToSize(text, maxW)) {
    ensureSpace(6);
    doc.text(line, margin, y);
    y += 5;
  }
}
function bullet(text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const line of doc.splitTextToSize(`•  ${text}`, maxW)) {
    ensureSpace(6);
    doc.text(line, margin, y);
    y += 5;
  }
}

h1('Evoqed Livestock — Changes 1–2 Nov 2026');
body('Repo: manish3321/Livestock · Live: evoqedlivestockfarm.vercel.app');
body('This note covers Sunday 1 November and Monday 2 November 2026 (Nepal).');

h2('1. Sunday 1 Nov — Breeding desk');
bullet('3b956bf — Desk UI for Walk, sheets, Watch, and mobile.');
bullet('da3c720 — Mobile breeding desk mirror for Watch, Herd, and sheets.');
body(
  'Breeding on web and phone now shares the same mental model: Watch for planning, Walk for today’s work, Herd for KPIs (managers+). Heat / service / PD / calving / colostrum sheets were hardened for desk use.',
);

h2('2. Monday 2 Nov morning — Breeding polish');
bullet('13be15f — Harden Watch desk rows; keep tab strip horizontal.');
bullet('94e66ed — Species photo cues and animated Watch / Walk / Herd toggle.');
bullet('7f0df3f / 3d2381c — AnimalPhoto species placeholders on Walk/Watch (emoji match).');

h2('3. Monday 2 Nov — OS remaining work (6178123)');
body('Large ship: speed, shed/breeding proofs, offline pagination, batch detail, animal counts, indexes.');

function h3ish(t) {
  ensureSpace(11);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(t, margin, y);
  y += 6;
}

h3ish('Shed performance');
bullet('GET /v1/rounds/today and /remaining: one-shot SQL + lean roster (no milk history hydrate).');
bullet('Warm samples after fix ~150–200 ms locally (was ~2 s); production uses pooler.');
bullet('today() does not call abandonStale; remaining() only round + progress.');
bullet('Prisma indexes for milk filter [farmId, type, session, entryDate] and ScanEvent.roundId.');
bullet('Evening milking can restart after finish (unlink closed milkRoundId unique clash).');

h3ish('Shed / milk rules');
bullet('Typed herd match uses full digit suffix (not endsWith) on API and phone.');
bullet('Tank/delivery reject litres above milked SOLD (TANK_ABOVE_MILKED).');
bullet('Tank shortfall task only for −8% or worse (not for over-fill).');
bullet('STOCK_NEGATIVE on inventory OUT; future heat rejected (HEAT_FUTURE_DATE).');

h3ish('Offline & clients');
bullet('Sync bootstrap + mobile module-cache walk pages until short/total (cap 20 pages).');
bullet('Batch detail combined endpoint used by web + phone; old routes remain.');
bullet('Animal species counts endpoint for picker (web + phone).');
bullet('Worker metrics stay 403; Herd tab hidden for WORKER.');

h2('4. Monday 2 Nov evening — Production hotfix (cd02ce4)');
bullet('Homepage “Something went wrong” — API FUNCTION_INVOCATION_FAILED on Vercel.');
bullet('Cause: Prisma preferred DIRECT_URL (session mode) which exhausts Supabase clients in serverless.');
bullet('Fix: Vercel/Lambda uses DATABASE_URL pooler; local Nest may still prefer DIRECT_URL.');
bullet('Pushed and verified login + /v1/dashboard/summary again.');

h2('5. Notifications updated (same day)');
bullet('Task titles for TANK_VARIANCE → “Tank shortfall … — check missing milk” (EN/NP).');
bullet('Shed varianceHint EN/NP: over-fill rejected; shortfall −8% raises task.');
bullet('docs/notification-reminders.html tank row rewritten (2 Nov 2026).');

h2('6. Releases');
bullet('GitHub main: through cd02ce4.');
bullet('EAS preview APK: https://expo.dev/accounts/evoqed/projects/farm-shed/builds/b5d13630-4643-4732-a78d-6986532eed45');
bullet('APK build from 6178123 OS work; redeploy web/API includes cd02ce4 pooler fix.');

h2('7. How to verify');
bullet('Web Home loads after hard refresh.');
bullet('Breeding: owner/manager sees Watch | Walk | Herd; worker sees Watch | Walk only.');
bullet('Shed remaining warm < 1 s on local DIRECT_URL.');
bullet('Tank save above milked → 400 TANK_ABOVE_MILKED.');

y += 4;
body('— End of 1–2 Nov summary —');
footer();

const buf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
