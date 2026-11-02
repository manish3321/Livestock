/**
 * PDF mirror of docs/notification-reminders.html (updated tank shortfall rules).
 * Run: node scripts/notification-reminders-pdf.mjs
 */
import { jsPDF } from '../apps/web/node_modules/jspdf/dist/jspdf.es.min.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'docs', 'notification-reminders.pdf');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const margin = 16;
const maxW = 210 - margin * 2;
let y = margin;
let page = 1;

function footer() {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Evoqed Livestock · Notifications · Page ${page}`, margin, 290);
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

h1('Notifications & Reminders');
body('Evoqed Livestock · Updated 2 November 2026');
body(
  'Full narrative lives in docs/notification-reminders.html. This PDF captures the model and the 2 Nov tank-rule change.',
);

h2('How it works');
bullet('Every reminder is an Inbox task created from farm events or scheduled checks.');
bullet('Dispatcher delivers due tasks as push; CRITICAL may also SMS and Nepali voice.');
bullet('Anti-fatigue: night hold for non-urgent, daily caps, bundling, escalate if unacked.');
bullet('Phone keeps local alarms for urgent tasks when offline.');

h2('Urgency bands');
bullet('CRITICAL — SMS/voice eligible (e.g. calving watch overdue).');
bullet('HIGH — push promptly (tank shortfall, expense approval, stock reorder…).');
bullet('NORMAL / LOW — can wait for quiet hours bundling.');

h2('Tank shortfall (updated 2 Nov 2026)');
body(
  'Previously any tank reading above milked litres also raised TANK_VARIANCE. Now:',
);
bullet('Actual or delivery litres above milked SOLD → rejected immediately (TANK_ABOVE_MILKED). No task.');
bullet('Actual litres −8% or worse vs milked SOLD → HIGH task “Tank shortfall … — check missing milk” / Nepali equivalent.');
bullet('−2% to −5% short remains normal loss and does not raise a task.');
bullet('Task deep-link opens Shed.');

h2('Where copy lives');
bullet('API task titles: apps/api/src/milk/milk.service.ts (ensureTask for TANK_VARIANCE).');
bullet('Web/mobile Inbox labels: i18n tasks.TANK_VARIANCE + milk.varianceHint (EN + NP).');
bullet('Rules table: apps/api/src/notifications/notification-rules.ts.');

y += 4;
body('See also: docs/notification-reminders.html for the full reminder catalogue.');
footer();

const buf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
