// Hồ sơ hiệu năng (THUẦN, không DOM): chọn theo tham số URL / UA ClassIn. Xem PLAN-PERF mục 3.
export const PROFILES = {
  full:  { kCap: 2,    glass: 'auto', desync: true,  renderer: 'classic', tile: 192, liveClear: 'zone', minStep: 0.6, livePts: 1500, final: 'pf', calm: false, predict: false, coal: true },
  lite:  { kCap: 1.25, glass: 'off',  desync: false, renderer: 'classic', tile: 192, liveClear: 'bbox', minStep: 1.2, livePts: 400,  final: 'pf', calm: true,  predict: false, coal: true },
  ultra: { kCap: 1,    glass: 'off',  desync: false, renderer: 'tiles',   tile: 192, liveClear: 'bbox', minStep: 1.2, livePts: 1500, final: 'pf', calm: true,  predict: false, coal: true },
};

export function isClassInUA(ua) { return /ClassIn/i.test(ua || ''); }

// Số trong [min, max] hoặc null.
function num(v, min, max) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) return null;
  return n;
}
const bool01 = (v) => (v === '1' ? true : v === '0' ? false : null);

// Trả { name, source:'param'|'ua'|'default', overrides:[...], ...các khoá }
export function parseProfile(search, ua) {
  const q = new URLSearchParams(search || '');
  const wanted = q.get('perf');
  let name, source;
  if (wanted && PROFILES[wanted]) { name = wanted; source = 'param'; }
  else if (isClassInUA(ua)) { name = 'lite'; source = 'ua'; }
  else { name = 'full'; source = 'default'; }
  const p = Object.assign({}, PROFILES[name], { name, source, overrides: [] });
  const over = (key) => { if (p.overrides.indexOf(key) < 0) p.overrides.push(key); };

  const dpr = num(q.get('dpr'), 0.5, 3);
  if (dpr != null) { p.kCap = dpr; over('dpr'); }
  const g = q.get('glass');
  if (g === '0') { p.glass = 'off'; over('glass'); } else if (g === '1') { p.glass = 'on'; over('glass'); }
  const ds = bool01(q.get('desync'));
  if (ds != null) { p.desync = ds; over('desync'); }
  const inc = bool01(q.get('inc'));
  if (inc != null) { p.renderer = inc ? 'tiles' : 'classic'; over('inc'); }
  const tilesRaw = q.get('tiles');
  if (tilesRaw != null && tilesRaw.trim() !== '') {
    const n = Number(tilesRaw);
    if (n === 0 || (isFinite(n) && n >= 64 && n <= 512)) {
      p.tile = n; over('tiles');
      if (inc == null) p.renderer = 'tiles';
    }
  }
  const fin = q.get('final');
  if (fin === 'pf' || fin === 'line') { p.final = fin; over('final'); }
  const step = num(q.get('step'), 0.3, 5);
  if (step != null) { p.minStep = step; over('step'); }
  const lp = num(q.get('livepts'), 100, 1500);
  if (lp != null) { p.livePts = Math.round(lp); over('livepts'); }
  const calm = bool01(q.get('calm'));
  if (calm != null) { p.calm = calm; over('calm'); }
  const pr = bool01(q.get('predict'));
  if (pr != null) { p.predict = pr; over('predict'); }
  const co = bool01(q.get('coal'));
  if (co != null) { p.coal = co; over('coal'); }
  return p;
}

const fmt = (n) => String(n).replace('.', ',');
const SRC = { param: 'theo tham số', ua: 'tự nhận ClassIn', default: 'mặc định' };

export function profileText(p) {
  const head = p.name + ' (' + (SRC[p.source] || p.source) + ')';
  const kg = p.glass === 'off' ? 'kính tắt' : p.glass === 'on' ? 'kính bật' : 'kính tự động';
  const parts = [head, 'k≤' + fmt(p.kCap), kg, 'desync ' + (p.desync ? 'bật' : 'tắt')];
  if (p.renderer === 'tiles') {
    parts.push('gia tăng', p.tile ? 'lát ' + p.tile + ' px' : '1 canvas', 'chốt ' + p.final);
  } else {
    parts.push('cổ điển', 'xoá ' + p.liveClear, 'step ' + fmt(p.minStep), 'tách ' + p.livePts);
  }
  if (p.overrides && p.overrides.length) parts.push('ghi đè: ' + p.overrides.join(', '));
  return parts.join(' · ');
}
