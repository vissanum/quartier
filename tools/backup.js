#!/usr/bin/env node
// Dated backup of the operational JSON records. suppression.json is a LEGAL
// record (LSSI opt-outs) that lives gitignored in a single copy — losing it
// would break the "no volveremos a escribirte" promise. Run before risky
// operations and periodically; restores are a plain copy back.
//
// Usage:
//   node tools/backup.js                # → backups/<timestamp>/...
//   node tools/backup.js --out <dir>    # custom destination
//   npm run backup

const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCES = [
  'projects/pipeline.json',
  'outreach/suppression.json',
  'prospects/prospects.json',
  'prospects/searches.json',
];

function stampDir(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function runBackup({ root = process.cwd(), outDir = null, sources = DEFAULT_SOURCES,
                     date = new Date() } = {}) {
  const dest = outDir || path.join(root, 'backups', stampDir(date));
  const copied = [];
  const skipped = [];
  for (const rel of sources) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) {
      skipped.push(rel);
      continue;
    }
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(src, target);
    copied.push(rel);
  }
  return { dir: dest, copied, skipped };
}

module.exports = { runBackup, DEFAULT_SOURCES, stampDir };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? args[outIdx + 1] : null;

  const { dir, copied, skipped } = runBackup({ outDir });
  for (const rel of copied) console.log(`✓ ${rel}`);
  for (const rel of skipped) console.log(`– ${rel} (no existe, saltado)`);
  console.log(`\nBackup: ${dir} (${copied.length} archivos)`);
  if (skipped.includes('outreach/suppression.json')) {
    console.warn('⚠ suppression.json no existe todavía — el registro legal está vacío o falta.');
  }
}
