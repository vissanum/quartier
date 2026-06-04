#!/usr/bin/env node
// Clean slate: wipe all sample/work data so the operator can start fresh,
// without touching code, configuration, legal records or the public website.
//
// DRY-RUN BY DEFAULT — prints exactly what would be removed and exits.
// Nothing is deleted until you pass --yes.
//
// Removes:
//   projects/<id>/            every project dir (scrapes, redesigns, showcases)
//   projects/pipeline.json    → reset to []
//   prospects/prospects.json  → reset to []
//   prospects/searches.json   → reset to []
//   prospects/fetched/        downloaded prospect sites
//   prospects/analysis/       lighthouse/analysis output
//
// Never touches:
//   prospects/config.json     (business-type search config)
//   outreach/suppression.json (legal record — "BAJA" is forever, survives resets)
//   config.operator.json, .env, templates/, code
//   the public website repo (deploy.repoPath) — deployed demos are managed there
//
// Usage:
//   node tools/reset-data.js          # dry-run: show the plan
//   node tools/reset-data.js --yes    # actually delete

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const yes = process.argv.includes('--yes');

function dirSize(p) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
  } catch { /* unreadable — count as 0 */ }
  return total;
}

function human(bytes) {
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes > 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

const plan = [];

// 1. Project directories (everything in projects/ except pipeline.json)
const projectsDir = path.join(root, 'projects');
if (fs.existsSync(projectsDir)) {
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(projectsDir, entry.name);
    plan.push({ kind: 'rmdir', target: full, label: `projects/${entry.name}/ (${human(dirSize(full))})` });
  }
}

// 2. JSON stores reset to empty arrays
for (const rel of ['projects/pipeline.json', 'prospects/prospects.json', 'prospects/searches.json']) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    plan.push({ kind: 'empty-json', target: full, label: `${rel} → []` });
  }
}

// 3. Prospect work dirs
for (const rel of ['prospects/fetched', 'prospects/analysis']) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    plan.push({ kind: 'rmdir', target: full, label: `${rel}/ (${human(dirSize(full))})` });
  }
}

if (!plan.length) {
  console.log('Nothing to reset — the workspace is already clean.');
  process.exit(0);
}

console.log(yes ? 'Resetting workspace data:\n' : 'DRY-RUN — would remove:\n');
for (const item of plan) console.log(`  ${item.kind === 'empty-json' ? '∅' : '✕'} ${item.label}`);
console.log('\nPreserved: prospects/config.json, outreach/suppression.json (registro legal de bajas),');
console.log('config.operator.json, .env, templates/, todo el código y el repo público (demos desplegadas).');

if (!yes) {
  console.log('\n(Nada borrado. Ejecuta con --yes para aplicar.)');
  process.exit(0);
}

for (const item of plan) {
  if (item.kind === 'rmdir') fs.rmSync(item.target, { recursive: true, force: true });
  else fs.writeFileSync(item.target, '[]\n');
}
console.log(`\n✓ Hecho — ${plan.length} elementos. Lienzo limpio.`);
