/**
 * Full product guide PDF for Evoqed Livestock.
 * Run: node scripts/evoqed-app-guide.mjs
 */
import { jsPDF } from '../apps/web/node_modules/jspdf/dist/jspdf.es.min.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'evoqed-livestock-app-guide.pdf');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const margin = 16;
const maxW = 210 - margin * 2;
let y = margin;
let page = 1;

function footer() {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Evoqed Livestock · App guide · Page ${page}`, margin, 290);
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
  ensureSpace(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(text, margin, y);
  y += 10;
}

function h2(text) {
  ensureSpace(14);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(text, margin, y);
  y += 7;
}

function h3(text) {
  ensureSpace(12);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(text, margin, y);
  y += 6;
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

h1('Evoqed Livestock — Product guide');
body('Prepared: Monday 2 November 2026 (Nepal)');
body('Live web: https://evoqedlivestockfarm.vercel.app');
body('Repo: github.com/manish3321/Livestock · Mobile: Expo / EAS preview APK');
body(
  'Evoqed Livestock (also called Kharka Farm OS in older docs) is a farm operating system for commercial and mixed farms in Nepal. It covers the shed, breeding desk, health, batches, inventory, money, and offline phone work in one shared API.',
);

h2('1. What it is');
bullet('One NestJS API (/v1) as source of truth, with farm-scoped tenancy on every row.');
bullet('React web dashboard for owners, managers, workers, vets, and co-ops.');
bullet('Expo React Native phone app for shed rounds, breeding Watch/Walk/Herd, inbox, and offline sync.');
bullet('English and Nepali (नेपाली) on web and phone.');
bullet('Postgres (Supabase), JWT auth, push/SMS/voice notification pipeline for Inbox tasks.');

h2('2. Who uses it (roles)');
bullet('ADMIN — full access: ops, money, reports, members, audit.');
bullet('MANAGER — operations plus approvals, revenue, P&L, reports, change approvals.');
bullet('WORKER — data entry and shed/rounds; Watch + Walk only in Breeding (no Herd KPIs).');
bullet('VET — animals (read), health/breeding write, inventory read, rounds; no stock write or money.');
bullet('COOP — read animals/production/revenue/reports; no Shed or Breeding write.');
body('Details: docs/rbac.md. The API enforces permissions even if the UI shows a button.');

h2('3. Main modules');
h3('Home (dashboard)');
body(
  'Greeting, yesterday’s milk/eggs/fish, urgent alerts (overdue health, low stock), quick links, and today’s Inbox tasks. Needs a healthy /v1/dashboard/summary call.',
);

h3('Shed');
bullet('Modes: Milking (Morning / Evening / Midday), Vaccination, Treatment, Weighing, Health check, Band (markers).');
bullet('Start or resume a recording round; type herd number / tag or tap remaining animals.');
bullet('Blank litres stay disabled; huge litres rejected; unknown codes do not attach to another animal.');
bullet('Finish with skip reasons (including DRIED_OFF); abandon marks ABANDONED without inventing a tank total.');
bullet('Tank and delivery cannot exceed milked SOLD litres (TANK_ABOVE_MILKED). Shortfalls of −8% or worse raise a HIGH tank shortfall task.');
bullet('Daily sheet shows the session’s animals, skips, and totals.');

h3('Breeding');
bullet('Watch — planning windows (heat, breed today, dry-off, calving, colostrum).');
bullet('Walk — today’s actionable desk.');
bullet('Herd — KPIs (conception, days open, heat detection, observer table). Managers/admins/vets only — not workers.');
bullet('Sheets: heat, service, pregnancy check (PD), calving, colostrum, dry-off.');
bullet('Species-aware windows (buffalo vs cow); goats are not offered cattle protocols.');

h3('Livestock & batches');
bullet('Animal picker counts by species in one request; open a species for the paged list.');
bullet('Batch detail loads economics, illness, mortality, feed, water, sampling, harvest in one combined payload (inventory picker can stay separate).');

h3('Health, inventory, feed, production, money');
bullet('Vaccinations/treatments pick inventory; stock cannot go negative without STOCK_NEGATIVE.');
bullet('Milk withhold markers show on the milking pad; withhold blocks SOLD milk.');
bullet('Expenses: worker submits → manager approves → large amounts escalate to admin.');
bullet('Revenue, P&L, reports for roles that have finance/reports permissions.');

h3('Inbox & notifications');
bullet('Every reminder is a farm task. Dispatcher sends push; CRITICAL may also SMS/voice.');
bullet('Anti-fatigue: night hold for non-urgent, daily caps, bundling, escalation if unacked.');
bullet('See docs/notification-reminders.html (updated 2 Nov 2026).');

h2('4. Phone & offline');
bullet('Bottom nav: Home, Shed, Scan QR, Inbox, More.');
bullet('Offline module cache pages past 100 rows (cap 20 pages per module) so large herds hydrate fully.');
bullet('Outbox sync: failed mutations stay failed/pending — never silently marked success as duplicates.');
bullet('EXPO_PUBLIC_API_URL points at production (EAS preview) or http://10.0.2.2:4001 for emulator → local API.');

h2('5. Technical shape');
bullet('Monorepo: apps/api (Nest), apps/web (Vite React), apps/mobile (Expo 52), packages/contracts + design-tokens.');
bullet('Local API may use DIRECT_URL (session :5432) for fast shed reads; Vercel must use pooler DATABASE_URL.');
bullet('Deploy: Vercel hosts API+web; mobile via EAS Build (preview APK).');

h2('6. How to sign in locally');
bullet('Seed users (password from SEED_PASSWORD, default ChangeMe123!): owner/manager/worker@farm.local; test VET/COOP if seeded.');
bullet('Web :5173 · API :4001 · Metro :8081.');

y += 4;
body('— End of product guide —');
footer();

const buf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
