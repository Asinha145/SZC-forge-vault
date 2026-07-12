/**
 * Persistence for SZC-ARMF user rows. localStorage, one entry per loaded
 * filename, keyed inside by element GlobalId:
 *
 *   "SZC-ARMF::<filename>" -> { "<GlobalId>": [ { module, value }, ... ] }
 *
 * Row 0 is always the fixed "Part Type 2" row. Data is only ever written by
 * the SZC-ARMF tab; the source IFC is never touched.
 *
 * The parsed blob is cached per filename so the per-keystroke autosave path
 * doesn't re-parse the whole entry on every input event.
 */

const PREFIX = "SZC-ARMF::";

const keyFor = (filename) => PREFIX + filename;

let cache = { key: null, data: null };

export function loadAllArmf(filename) {
  const key = keyFor(filename);
  if (cache.key === key) return cache.data;
  let data = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    console.error("SZC-ARMF: failed to read saved data", e);
  }
  cache = { key, data };
  return data;
}

/** True when the user has saved rows for this element before. */
export function hasSavedArmf(filename, globalId) {
  return Array.isArray(loadAllArmf(filename)[globalId]);
}

export function getArmfRows(filename, globalId) {
  const rows = loadAllArmf(filename)[globalId];
  if (Array.isArray(rows) && rows.length) return rows;
  return [{ module: "Part Type 2", value: "" }];
}

export function saveArmfRows(filename, globalId, rows) {
  const all = loadAllArmf(filename);
  all[globalId] = rows;
  try {
    localStorage.setItem(keyFor(filename), JSON.stringify(all));
  } catch (e) {
    console.error("SZC-ARMF: failed to persist data", e);
  }
}
