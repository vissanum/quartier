// Shared JSON persistence: atomic writes (tmp + rename) and an in-process
// per-file mutex so concurrent jobs and API handlers never corrupt a file.

const fs = require('fs');
const path = require('path');

// One pending-write chain per absolute file path
const queues = new Map();

function loadJSON(filePath, fallback = null) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return fallback;
  return JSON.parse(fs.readFileSync(abs, 'utf-8'));
}

// Write to a temp file in the same directory, then rename over the target.
// rename() is atomic on the same filesystem, so readers never see a partial file.
function writeAtomic(absPath, data) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = path.join(path.dirname(absPath), `.${path.basename(absPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, absPath);
}

function saveJSON(filePath, data) {
  writeAtomic(path.resolve(filePath), data);
}

// Serialized read-modify-write. `mutate(current)` may return the new value,
// or mutate `current` in place and return undefined.
async function updateJSON(filePath, mutate, fallback = null) {
  const abs = path.resolve(filePath);
  const prev = queues.get(abs) || Promise.resolve();
  const next = prev.then(async () => {
    const current = loadJSON(abs, fallback);
    const result = await mutate(current);
    const value = result === undefined ? current : result;
    writeAtomic(abs, value);
    return value;
  });
  // Keep the chain alive even if this mutation throws
  queues.set(abs, next.catch(() => {}));
  return next;
}

module.exports = { loadJSON, saveJSON, updateJSON };
