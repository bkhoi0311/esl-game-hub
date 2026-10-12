// Hồ sơ hiệu năng. ClassIn X (CEF OSR) tự bật 'lite'. Ghi đè: ?perf=full|lite  (+ ?gk=1.5 ?gfps=60 ?glass=1 ?idle=1)
// Tham số URL đặt TRƯỚC dấu # (index.html?perf=full#/); tham số sau # (#/?perf=full) cũng được đọc.
const q = new URLSearchParams(location.search + '&' + (location.hash.split('?')[1] || ''));
const ua = navigator.userAgent;
const auto = /ClassIn/i.test(ua) ? 'lite' : 'full';
const name = ['full', 'lite'].includes(q.get('perf')) ? q.get('perf') : auto;
const num = (k, d) => (q.has(k) && !Number.isNaN(Number(q.get(k))) ? Number(q.get(k)) : d);
export const PERF = {
  name,
  source: q.has('perf') && ['full', 'lite'].includes(q.get('perf')) ? 'param' : auto === 'lite' ? 'ua' : 'default',
  glass: q.has('glass') ? q.get('glass') === '1' : name === 'full',
  idle: q.has('idle') ? q.get('idle') === '1' : name === 'full', // animation lặp vô hạn
  gk: q.has('gk') ? num('gk', 0) : 0, // 0 = tự chọn (xem gameK trong phaser-host.js)
  gfps: num('gfps', name === 'lite' ? 30 : 0), // 0 = không giới hạn
  confetti: name === 'lite' ? 0.4 : 1,
  diag: q.get('diag'),
};
export function applyPerfClasses() {
  const c = document.documentElement.classList;
  c.toggle('perf-lite', PERF.name === 'lite');
  c.toggle('no-glass', !PERF.glass);
  c.toggle('no-loop', !PERF.idle);
}
