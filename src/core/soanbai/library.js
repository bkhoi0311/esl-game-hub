// Thư viện bài Starters / Movers / Flyers (PLAN-SOANBAI A5, A6). Nạp lười từng gói.
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
  if (!key) return Promise.reject(new Error('Không tìm thấy gói ' + id));
  return PACKS[key]();
}
