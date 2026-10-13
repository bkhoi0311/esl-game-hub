// Thư viện bài theo cấp (PLAN-LEVELS 5.6). Nạp lười từng gói. Phần thuần (tab, chip, lọc) ở libfilter.js để test bằng Node.
const PACKS = import.meta.glob('../../data/library/packs/*.json', { import: 'default' });

let indexPromise = null;

export function loadIndex() {
  if (!indexPromise) {
    indexPromise = import('../../data/library/index.json')
      .then((m) => m.default || m)
      .catch((err) => { indexPromise = null; throw err; });
  }
  return indexPromise;
}

export function loadPack(id) {
  const key = Object.keys(PACKS).find((k) => k.endsWith('/' + id + '.json'));
  if (!key) return Promise.reject(new Error('Pack not found: ' + id));
  return PACKS[key]();
}

export { LIB_LEVELS, LIB_THEMES, foldText, countByLevel, visibleLevels, filterPacks, levelTag } from './libfilter.js';
