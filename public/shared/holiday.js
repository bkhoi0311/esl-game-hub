// Giao diện NGÀY LỄ tự động, dùng chung cho Hub (Vite), màn chọn public/start và Bảng nhiều người viết public/board.
// Module ES thuần, không phụ thuộc gì. Phần LOGIC (activeHoliday...) không đụng DOM nên chạy được bằng `node --test`.
// Chỉ thêm MÀU NHẤN + vài hình trang trí SVG tự vẽ + 1 chip chúc mừng tiếng Anh. Không đụng logo ClassIn, linh vật, vùng chơi/vẽ.
// Ghi đè: ?theme=<id> (xem thử), ?theme=off (tắt), ?theme=auto (xoá ghi đè); cài đặt giáo viên 'eslhub.holiday' = 'auto' | 'off'.

export const STORE_KEY = 'eslhub.holiday';          // localStorage: 'auto' | 'off'
const PREVIEW_KEY = 'eslhub.holiday.preview';       // sessionStorage: giữ ?theme= khi chuyển trang trong lúc xem thử
export const LEAD_DAYS = 18;                        // bật trước ngày lễ 18 ngày

// Ngày dương của 3 ngày lễ âm lịch, 2026-2035 (múi giờ UTC+7). Kiểm bằng thuật toán Hồ Ngọc Đức: tests/holiday.test.mjs.
export const LUNAR = {
  2026: { tet: '2026-02-17', hung: '2026-04-26', trungthu: '2026-09-25' },
  2027: { tet: '2027-02-06', hung: '2027-04-16', trungthu: '2027-09-15' },
  2028: { tet: '2028-01-26', hung: '2028-04-04', trungthu: '2028-10-03' },
  2029: { tet: '2029-02-13', hung: '2029-04-23', trungthu: '2029-09-22' },
  2030: { tet: '2030-02-02', hung: '2030-04-12', trungthu: '2030-09-12' },
  2031: { tet: '2031-01-23', hung: '2031-04-01', trungthu: '2031-10-01' },
  2032: { tet: '2032-02-11', hung: '2032-04-19', trungthu: '2032-09-19' },
  2033: { tet: '2033-01-31', hung: '2033-04-09', trungthu: '2033-09-08' },
  2034: { tet: '2034-02-19', hung: '2034-04-28', trungthu: '2034-09-26' },
  2035: { tet: '2035-02-08', hung: '2035-04-17', trungthu: '2035-09-16' },
};

// after = số ngày giữ chủ đề SAU ngày lễ (mặc định 1 = hết ngày hôm sau). Tết: tới mùng 4 (after 3). 30/4 + 1/5: tới 2/5 (after 2).
export const HOLIDAYS = [
  { id: 'newyear', vi: 'Tết Dương lịch', en: "Happy New Year!", md: [1, 1] },
  { id: 'tet', vi: 'Tết Nguyên Đán', en: 'Happy Lunar New Year!', lunar: 'tet', after: 3 },
  { id: 'valentine', vi: 'Valentine', en: "Happy Valentine's Day!", md: [2, 14] },
  { id: 'women8', vi: 'Quốc tế Phụ nữ 8/3', en: "Happy Women's Day!", md: [3, 8] },
  { id: 'hung', vi: 'Giỗ Tổ Hùng Vương', en: "Hung Kings' Festival", lunar: 'hung' },
  { id: 'april30', vi: 'Giải phóng miền Nam 30/4 + Quốc tế Lao động 1/5', en: 'Happy Reunification Day & Labour Day!', md: [4, 30], after: 2 },
  { id: 'children', vi: 'Quốc tế Thiếu nhi 1/6', en: "Happy Children's Day!", md: [6, 1] },
  { id: 'trungthu', vi: 'Tết Trung Thu', en: 'Happy Mid-Autumn Festival!', lunar: 'trungthu' },
  { id: 'quockhanh', vi: 'Quốc khánh 2/9', en: 'Happy National Day!', md: [9, 2] },
  { id: 'women20', vi: 'Phụ nữ Việt Nam 20/10', en: "Happy Vietnamese Women's Day!", md: [10, 20] },
  { id: 'halloween', vi: 'Halloween', en: 'Happy Halloween!', md: [10, 31] },
  { id: 'teachers', vi: 'Nhà giáo Việt Nam 20/11', en: "Happy Teachers' Day!", md: [11, 20] },
  { id: 'culture24', vi: 'Ngày Văn hoá Việt Nam 24/11', en: 'Happy Vietnamese Culture Day!', md: [11, 24] },
  { id: 'christmas', vi: 'Giáng sinh', en: 'Merry Christmas!', md: [12, 25] },
];

// Chữ của hộp Cài đặt (nằm ở đây, không vào từ điển i18n của Hub, để không đổi catalog đóng băng của test i18n).
export const UI = {
  vi: { label: 'Giao diện ngày lễ', auto: 'Tự động', off: 'Tắt', hint: 'Tự bật 18 ngày trước mỗi dịp lễ, tắt sau lễ 1 ngày.' },
  en: { label: 'Holiday theme', auto: 'Automatic', off: 'Off', hint: 'Turns on 18 days before each holiday and off the day after.' },
};

export const holidayById = (id) => HOLIDAYS.find((h) => h.id === id) || null;

// ---------- Logic ngày (thuần) ----------
const DAY = 86400000;
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY); // số ngày theo lịch, không phụ thuộc múi giờ máy
const isoDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return dayNum(y, m, d); };
const toISO = (n) => new Date(n * DAY).toISOString().slice(0, 10);

// Ngày lễ h rơi vào năm dương `year` (số ngày) hoặc null nếu bảng âm lịch chưa có năm đó.
function occurrence(h, year) {
  if (h.md) return dayNum(year, h.md[0], h.md[1]);
  const row = LUNAR[year];
  return row && row[h.lunar] ? isoDay(row[h.lunar]) : null;
}

// Chủ đề đang bật cho ngày `date` (Date theo giờ máy) hoặc null.
// Cửa sổ: [ngày lễ - 18, ngày lễ + after]. Nhiều cửa sổ chồng nhau: ngày lễ gần nhất CHƯA qua thắng (đúng ngày lễ vẫn tính chưa qua);
// không có cái nào chưa qua thì lấy cái vừa qua gần nhất còn trong cửa sổ.
export function activeHoliday(date = new Date()) {
  const today = dayNum(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const hits = [];
  for (const h of HOLIDAYS) {
    for (let y = date.getFullYear() - 1; y <= date.getFullYear() + 1; y++) {
      const d = occurrence(h, y);
      if (d == null) continue;
      if (today >= d - LEAD_DAYS && today <= d + (h.after ?? 1)) hits.push({ h, d });
    }
  }
  if (!hits.length) return null;
  const upcoming = hits.filter((x) => x.d >= today).sort((a, b) => a.d - b.d);
  const best = upcoming[0] || hits.sort((a, b) => b.d - a.d)[0];
  return { ...best.h, date: toISO(best.d), daysLeft: best.d - today };
}

// Chủ đề cuối cùng cho trang: URL > xem thử trong phiên > cài đặt giáo viên > theo lịch.
export function resolveHoliday({ date = new Date(), search = '', mode = 'auto', preview = '' } = {}) {
  const m = /[?&]theme=([\w-]+)/.exec(search);
  const pick = m ? m[1] : preview;
  if (pick === 'off') return null;
  if (pick && pick !== 'auto') {
    const h = holidayById(pick);
    if (h) return { ...h, date: null, daysLeft: null, forced: true };
  }
  if (mode === 'off') return null;
  return activeHoliday(date);
}

// ---------- Kho cài đặt (bọc try/catch: chế độ riêng tư / bị chặn) ----------
export function getMode() { try { return localStorage.getItem(STORE_KEY) === 'off' ? 'off' : 'auto'; } catch { return 'auto'; } }
export function setMode(v) { try { localStorage.setItem(STORE_KEY, v === 'off' ? 'off' : 'auto'); } catch { /* bỏ qua */ } }
function readPreview(search) {
  const m = /[?&]theme=([\w-]+)/.exec(search);
  try {
    if (m) { if (m[1] === 'auto') sessionStorage.removeItem(PREVIEW_KEY); else sessionStorage.setItem(PREVIEW_KEY, m[1]); return m[1] === 'auto' ? '' : m[1]; }
    return sessionStorage.getItem(PREVIEW_KEY) || '';
  } catch { return m && m[1] !== 'auto' ? m[1] : ''; }
}

// ---------- Hình trang trí SVG (tự vẽ, nhỏ) ----------
const NS = 'http://www.w3.org/2000/svg';
const svg = (vb, body) => `<svg xmlns="${NS}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const pts = (cx, cy, R, r, n = 5, rot = -90) => Array.from({ length: n * 2 }, (_, i) => {
  const a = ((rot + (i * 180) / n) * Math.PI) / 180;
  const rad = i % 2 ? r : R;
  return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const petals = (cx, cy, n, pr, dist, fill) => Array.from({ length: n }, (_, i) => {
  const a = (i * 2 * Math.PI) / n - Math.PI / 2;
  return `<circle cx="${(cx + dist * Math.cos(a)).toFixed(1)}" cy="${(cy + dist * Math.sin(a)).toFixed(1)}" r="${pr}" fill="${fill}"/>`;
}).join('');
const GOLD = '#e0a800';

const ART = {
  lantern: (c = '#da251d') => svg('0 0 40 72',
    `<path d="M20 0v10" stroke="${GOLD}" stroke-width="2"/><rect x="13" y="9" width="14" height="6" rx="2" fill="${GOLD}"/>` +
    `<ellipse cx="20" cy="33" rx="17" ry="20" fill="${c}"/><path d="M20 14c-9 8-9 28 0 38M20 14c9 8 9 28 0 38" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.6"/>` +
    `<rect x="13" y="51" width="14" height="6" rx="2" fill="${GOLD}"/><path d="M20 57v8M16 65h8l-1.5 6h-5z" fill="${GOLD}" stroke="${GOLD}" stroke-width="1.5" stroke-linejoin="round"/>`),
  starlantern: (c = '#e53935', c2 = '#ffd54f') => svg('0 0 60 76',
    `<path d="M30 0v9" stroke="#b08900" stroke-width="2"/><polygon points="${pts(30, 36, 28, 12)}" fill="${c}"/>` +
    `<polygon points="${pts(30, 36, 16, 7)}" fill="${c2}"/><circle cx="30" cy="36" r="4" fill="#fff" fill-opacity=".8"/>` +
    `<path d="M30 62v6M26 68h8l-2 7h-4z" fill="${c}" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/>`),
  blossom: (c = '#ffcd00', mid = '#e8590c') => svg('0 0 30 30', `${petals(15, 15, 5, 6.2, 7.2, c)}<circle cx="15" cy="15" r="3.4" fill="${mid}"/>`),
  branch: (c = '#ffcd00', mid = '#e8590c') => svg('0 0 100 64',
    `<path d="M0 58C22 52 36 40 52 30S84 14 98 6" fill="none" stroke="#6b3f1d" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M30 46c2-10 6-16 12-20" fill="none" stroke="#6b3f1d" stroke-width="2.2" stroke-linecap="round"/>` +
    [[26, 40, 15], [48, 33, 17], [66, 22, 14], [86, 12, 15], [38, 20, 11]].map(([x, y, s]) =>
      `<g transform="translate(${x - s / 2} ${y - s / 2}) scale(${s / 30})">${petals(15, 15, 5, 6.2, 7.2, c)}<circle cx="15" cy="15" r="3.4" fill="${mid}"/></g>`).join('')),
  moon: () => svg('0 0 56 56', `<path d="M36 4A25 25 0 1 0 52 40 20 20 0 0 1 36 4z" fill="#ffd54f"/><circle cx="45" cy="14" r="2" fill="#ffd54f"/><circle cx="50" cy="26" r="1.4" fill="#ffd54f"/>`),
  snow: (c = '#8fb8d8') => svg('0 0 40 40', [0, 60, 120].map((r) => `<g transform="rotate(${r} 20 20)"><path d="M20 3v34M14 8l6 5 6-5M14 32l6-5 6 5" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`).join('')),
  ball: (c = '#c62828') => svg('0 0 36 56', `<path d="M18 0v14" stroke="#9aa5ab" stroke-width="2"/><rect x="13" y="12" width="10" height="6" rx="2" fill="${GOLD}"/><circle cx="18" cy="36" r="17" fill="${c}"/><path d="M6 34c8 6 16 6 24 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.4"/><ellipse cx="12" cy="28" rx="3.2" ry="5" fill="#fff" fill-opacity=".35" transform="rotate(25 12 28)"/>`),
  tree: () => svg('0 0 56 64', `<polygon points="28,4 46,26 10,26" fill="#1b7a3d"/><polygon points="28,16 52,44 4,44" fill="#23954b"/><polygon points="28,30 56,58 0,58" fill="#1b7a3d"/><rect x="24" y="56" width="8" height="8" rx="1" fill="#7a4a21"/><polygon points="${pts(28, 7, 6, 2.6)}" fill="#ffcd00"/><circle cx="20" cy="40" r="2.6" fill="#da251d"/><circle cx="36" cy="50" r="2.6" fill="#ffcd00"/><circle cx="26" cy="22" r="2.2" fill="#fff"/>`),
  pumpkin: () => svg('0 0 64 56', `<ellipse cx="32" cy="34" rx="28" ry="20" fill="#f57c00"/><ellipse cx="19" cy="34" rx="12" ry="20" fill="#ff9a1f"/><ellipse cx="45" cy="34" rx="12" ry="20" fill="#ff9a1f"/><ellipse cx="32" cy="34" rx="8" ry="20" fill="#f57c00"/><path d="M32 14c0-6 2-9 7-11" fill="none" stroke="#2e7d32" stroke-width="4" stroke-linecap="round"/><polygon points="20,28 26,28 23,34" fill="#063f2b"/><polygon points="38,28 44,28 41,34" fill="#063f2b"/><path d="M22 41q10 8 20 0" fill="none" stroke="#063f2b" stroke-width="3" stroke-linecap="round"/>`),
  flower: (c = '#f06ea3', mid = '#ffd43b') => svg('0 0 40 56', `<path d="M20 26v26" stroke="#2f9e44" stroke-width="3" stroke-linecap="round"/><path d="M20 44c-8-1-12-5-13-10 7 0 12 3 13 10z" fill="#51b368"/>${petals(20, 18, 6, 6.4, 8.4, c)}<circle cx="20" cy="18" r="5" fill="${mid}"/>`),
  heart: (c = '#e8486f') => svg('0 0 40 36', `<path d="M20 34C4 22 1 14 1 9 1 4 5 1 10 1c4 0 8 2 10 6C22 3 26 1 30 1c5 0 9 3 9 8 0 5-3 13-19 25z" fill="${c}"/><ellipse cx="11" cy="9" rx="3.4" ry="2.4" fill="#fff" fill-opacity=".45" transform="rotate(-30 11 9)"/>`),
  balloon: (c = '#00a2fd') => svg('0 0 32 68', `<ellipse cx="16" cy="19" rx="14" ry="17.5" fill="${c}"/><ellipse cx="10" cy="12" rx="3.2" ry="5.4" fill="#fff" fill-opacity=".4" transform="rotate(20 10 12)"/><path d="M13 36h6l-3 4z" fill="${c}"/><path d="M16 40c-4 8 4 12 0 20s2 6 0 8" fill="none" stroke="#8a949a" stroke-width="1.4" stroke-linecap="round"/>`),
  burst: (c = '#e0a800', c2 = '#f06ea3') => svg('0 0 60 60', Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5; const [x1, y1, x2, y2] = [30 + 8 * Math.cos(a), 30 + 8 * Math.sin(a), 30 + 26 * Math.cos(a), 30 + 26 * Math.sin(a)]; return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${i % 2 ? c2 : c}" stroke-width="3" stroke-linecap="round"/><circle cx="${(30 + 29 * Math.cos(a)).toFixed(1)}" cy="${(30 + 29 * Math.sin(a)).toFixed(1)}" r="1.8" fill="${i % 2 ? c2 : c}"/>`; }).join('') + `<circle cx="30" cy="30" r="3" fill="${c}"/>`),
  confetti: () => svg('0 0 70 40', `<circle cx="8" cy="10" r="3.2" fill="#e0a800"/><rect x="24" y="6" width="9" height="4" rx="1.5" fill="#f06ea3" transform="rotate(30 28 8)"/><circle cx="48" cy="12" r="3" fill="#00a2fd"/><rect x="58" y="22" width="9" height="4" rx="1.5" fill="#04bc09" transform="rotate(-25 62 24)"/><circle cx="16" cy="30" r="2.6" fill="#da251d"/><rect x="36" y="30" width="8" height="4" rx="1.5" fill="#e0a800" transform="rotate(15 40 32)"/>`),
  star: (c = '#ffcd00') => svg('0 0 44 44', `<polygon points="${pts(22, 23, 20, 8.2)}" fill="${c}"/>`),
  bunting: () => svg('0 0 120 42', `<path d="M0 4Q60 22 120 4" fill="none" stroke="#7a1a14" stroke-width="1.6"/>` +
    [[10, '#da251d'], [34, '#ffcd00'], [58, '#da251d'], [82, '#ffcd00'], [104, '#da251d']].map(([x, c]) => { const y = 4 + 14 * Math.sin((x / 120) * Math.PI); return `<polygon points="${x - 8},${(y + 1).toFixed(1)} ${x + 8},${(y + 1).toFixed(1)} ${x},${(y + 24).toFixed(1)}" fill="${c}"/>`; }).join('')),
  drum: () => svg('0 0 60 60', `<circle cx="30" cy="30" r="28" fill="#d9a21b"/><circle cx="30" cy="30" r="22" fill="none" stroke="#8a5a00" stroke-width="2"/><circle cx="30" cy="30" r="14" fill="none" stroke="#8a5a00" stroke-width="2"/><polygon points="${pts(30, 30, 10, 6, 14)}" fill="#8a5a00"/>` + Array.from({ length: 4 }, (_, i) => { const a = (i * Math.PI) / 2 + Math.PI / 4; return `<circle cx="${(30 + 18 * Math.cos(a)).toFixed(1)}" cy="${(30 + 18 * Math.sin(a)).toFixed(1)}" r="2.4" fill="#8a5a00"/>`; }).join('')),
  lotus: () => svg('0 0 60 44', `<path d="M4 38c10-2 16-8 26-8s16 6 26 8c-10 5-18 5-26 5S14 43 4 38z" fill="#51b368"/>` +
    `<path d="M30 6c8 6 10 16 0 26-10-10-8-20 0-26z" fill="#f48fb1"/><path d="M12 14c10 0 17 8 18 18-10 0-17-6-18-18zM48 14c-10 0-17 8-18 18 10 0 17-6 18-18z" fill="#f8bbd0"/><path d="M30 12c4 6 4 12 0 18-4-6-4-12 0-18z" fill="#fce4ec"/>`),
  books: () => svg('0 0 56 48', `<rect x="4" y="28" width="46" height="14" rx="2.5" fill="#04bc09"/><rect x="4" y="28" width="46" height="4" fill="#fff" fill-opacity=".28"/><rect x="9" y="14" width="40" height="14" rx="2.5" fill="#f06ea3"/><rect x="9" y="14" width="40" height="4" fill="#fff" fill-opacity=".28"/><rect x="14" y="2" width="32" height="12" rx="2.5" fill="#00a2fd"/><rect x="14" y="2" width="32" height="4" fill="#fff" fill-opacity=".28"/>`),
  chalk: () => svg('0 0 44 16', `<rect x="2" y="3" width="40" height="10" rx="4" fill="#fff" stroke="#9aa5ab" stroke-width="1.6"/><rect x="2" y="3" width="12" height="10" rx="4" fill="#ffd1e3"/>`),
};

// Mỗi chủ đề: màu nhấn + (nền nhạt) + 2 cụm hình (trái / phải, mỗi hình: [tên, ...đối số màu], cao tính theo đơn vị) + hạt rơi (chỉ menu/start).
// chipBg/chipInk/chipLine đã chọn để chữ đạt tương phản >= 4.5:1.
const RED = '#da251d', YEL = '#ffcd00';
export const THEMES = {
  newyear: { accent: '#e0a800', tint: '#fff6dc', chipBg: '#fff3c9', chipInk: '#6b4700', chipLine: '#e0a800', L: [['burst', 4.4], ['confetti', 2.2]], R: [['confetti', 2.2], ['burst', '#f06ea3', '#e0a800', 4.4]] , fall: { kind: 'confetti', colors: ['#e0a800', '#f06ea3', '#00a2fd', '#04bc09'] } },
  tet: { accent: RED, tint: '#ffeee3', chipBg: RED, chipInk: '#fff', chipLine: YEL, L: [['lantern', RED, 5.2], ['lantern', '#c81e16', 3.6]], R: [['branch', YEL, '#e8590c', 3.4], ['lantern', RED, 4.4]], fall: { kind: 'petal', colors: ['#f4b400', '#f48fb1', '#ffcd00'] } },
  valentine: { accent: '#e8486f', tint: '#ffeaf0', chipBg: '#ffe0e8', chipInk: '#9c1240', chipLine: '#f08ca6', L: [['heart', '#e8486f', 2.8], ['heart', '#f48fb1', 2]], R: [['heart', '#f48fb1', 2], ['heart', '#e8486f', 3]], fall: { kind: 'heart', colors: ['#f48fb1', '#e8486f', '#f8bbd0'] } },
  women8: { accent: '#e0679a', tint: '#ffedf5', chipBg: '#ffe1ee', chipInk: '#8f1b52', chipLine: '#ee8fb7', L: [['flower', '#f06ea3', 4.8], ['flower', '#ff9fc4', 3.4]], R: [['flower', '#ff9fc4', 3.4], ['flower', '#f06ea3', 4.8]], fall: { kind: 'petal', colors: ['#f8bbd0', '#f48fb1'] } },
  hung: { accent: RED, tint: '#fff1e0', chipBg: RED, chipInk: '#fff', chipLine: YEL, L: [['drum', 3.4], ['bunting', 2.6]], R: [['bunting', 2.6], ['drum', 3.4]], fall: null },
  april30: { accent: RED, tint: '#fff0e4', chipBg: RED, chipInk: '#fff', chipLine: YEL, L: [['star', YEL, 3.2], ['bunting', 2.6]], R: [['bunting', 2.6], ['star', YEL, 3.2]], fall: null },
  children: { accent: '#ff9800', tint: '#fff3dc', chipBg: '#ffeccb', chipInk: '#7a3f00', chipLine: '#ff9800', L: [['balloon', '#00a2fd', 5.4], ['balloon', '#ff6d8c', 4.2]], R: [['balloon', '#04bc09', 4.2], ['balloon', '#ff9800', 5.4]], fall: { kind: 'confetti', colors: ['#00a2fd', '#ff9800', '#ff6d8c', '#04bc09'] } },
  trungthu: { accent: '#f08a1a', tint: '#fff2de', chipBg: '#ffe9cc', chipInk: '#8a3f00', chipLine: '#f08a1a', L: [['starlantern', '#e53935', '#ffd54f', 5.4], ['starlantern', '#f9a825', '#fff176', 3.8]], R: [['moon', 4.2], ['starlantern', '#fb8c00', '#ffe082', 5]], fall: null },
  quockhanh: { accent: RED, tint: '#fff0e4', chipBg: RED, chipInk: '#fff', chipLine: YEL, L: [['star', YEL, 3.4], ['bunting', 2.6]], R: [['bunting', 2.6], ['star', YEL, 3.4]], fall: null },
  women20: { accent: '#e0679a', tint: '#ffeef3', chipBg: '#ffe1ea', chipInk: '#8f1b45', chipLine: '#ee8fb0', L: [['flower', '#f48fb1', 4.8], ['flower', '#ffab91', 3.4]], R: [['flower', '#ffab91', 3.4], ['flower', '#f06ea3', 4.8]], fall: { kind: 'petal', colors: ['#f8bbd0', '#ffccbc'] } },
  halloween: { accent: '#f57c00', tint: '#fff1e0', chipBg: '#063f2b', chipInk: '#ffd9a8', chipLine: '#f57c00', L: [['pumpkin', 4], ['star', '#ffb74d', 1.8]], R: [['star', '#ffb74d', 1.8], ['pumpkin', 4.6]], fall: { kind: 'leaf', colors: ['#f57c00', '#ffb74d', '#8bc34a'] } },
  teachers: { accent: '#04bc09', tint: '#eefaee', tint2: '#ffeaf3', chipBg: '#e6f7e6', chipInk: '#063f2b', chipLine: '#04bc09', L: [['flower', '#f06ea3', 4.8], ['books', 3]], R: [['flower', '#ff9fc4', 4.4], ['flower', '#f06ea3', 3]], fall: { kind: 'petal', colors: ['#f8bbd0', '#a5e6a8', '#f48fb1'] } },
  culture24: { accent: RED, tint: '#fff1e2', chipBg: RED, chipInk: '#fff', chipLine: YEL, L: [['lotus', 3.2], ['star', YEL, 2]], R: [['drum', 3.2], ['lotus', 3]], fall: null },
  christmas: { accent: '#c62828', tint: '#fdeeee', tint2: '#e9f6ee', chipBg: '#c62828', chipInk: '#fff', chipLine: '#2e9d55', L: [['ball', '#c62828', 5], ['tree', 4.6]], R: [['snow', '#8fb8d8', 3.4], ['ball', '#1b7a3d', 4]], fall: { kind: 'snow', colors: ['#bcd9ee', '#cfe3f3', '#a9cde6'] } },
};

function art(spec) {
  const [name, ...rest] = spec;
  const h = rest.pop();
  return { name, h, html: ART[name](...rest) };
}

// ---------- DOM ----------
const PAGES = { hub: '.app-header', start: '.top', board: '#topbar' };

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

// Bảng: thanh trên kín chỗ (công cụ ở giữa). Tìm khoảng trống ngang lớn nhất GIỮA các nút / tiêu đề; đủ rộng thì đặt chip chúc mừng,
// hẹp hơn thì đặt 1 hình nhỏ, không đủ thì ẩn. Không bao giờ đè nút. Theo dõi đổi kích thước / dựng lại thanh.
function fitBoard(chip, th) {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const a = art(th.L[0]);
  const orn = el('span', 'hol-orn hol-board-orn', a.html);
  orn.style.setProperty('--h', '2.2');
  orn.setAttribute('data-hol-hidden', '1'); chip.setAttribute('data-hol-hidden', '1');
  document.body.append(orn);
  let raf = 0;
  const run = () => {
    raf = 0;
    if (!document.body.contains(chip)) return;
    const br = bar.getBoundingClientRect();
    const spans = [...bar.querySelectorAll('button, img, .tb-title, .tb-pill, .seg, .tb-sub, .tb-disc')]
      .map((n) => n.getBoundingClientRect()).filter((r) => r.width > 2 && r.height > 2 && r.top < br.bottom && r.bottom > br.top)
      .map((r) => [r.left, r.right]).sort((x, y) => x[0] - y[0]);
    let best = [0, 0], edge = 0;
    for (const [l, r] of spans) { if (l - edge > best[1] - best[0]) best = [edge, l]; edge = Math.max(edge, r); }
    const gap = best[1] - best[0];
    const mid = (best[0] + best[1]) / 2, cy = br.top + br.height / 2;
    chip.removeAttribute('data-hol-hidden'); orn.removeAttribute('data-hol-hidden');
    const cw = chip.offsetWidth, ow = orn.offsetWidth;
    const place = (n, w) => { n.style.left = `${Math.round(mid - w / 2)}px`; n.style.top = `${Math.round(cy)}px`; };
    if (gap >= cw + 20) { place(chip, cw); orn.setAttribute('data-hol-hidden', '1'); }
    else if (gap >= ow + 16) { place(orn, ow); chip.setAttribute('data-hol-hidden', '1'); }
    else { chip.setAttribute('data-hol-hidden', '1'); orn.setAttribute('data-hol-hidden', '1'); }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(run); };
  kick();
  addEventListener('resize', kick);
  if (typeof ResizeObserver === 'function') new ResizeObserver(kick).observe(bar);
  if (typeof MutationObserver === 'function') new MutationObserver(kick).observe(bar, { childList: true, subtree: true });
}

export function clearHoliday() {
  const r = document.documentElement;
  delete r.dataset.holiday; delete r.dataset.holPage; delete r.dataset.holFall;
  document.querySelectorAll('.hol-line, .hol-chip, .hol-orns, .hol-fall, .hol-board-orn').forEach((n) => n.remove());
  ['--hol-accent', '--hol-tint', '--hol-tint2', '--hol-chip-bg', '--hol-chip-ink', '--hol-chip-line'].forEach((k) => r.style.removeProperty(k));
}

function fallAllowed() {
  const r = document.documentElement;
  const rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !rm && !navigator.webdriver && !r.classList.contains('perf-lite') && !r.classList.contains('no-loop') && !r.classList.contains('no-idle');
}

// Gắn chủ đề vào trang. page: 'hub' | 'start' | 'board'. Trả chủ đề đang bật hoặc null.
export function initHoliday({ page = 'hub', date = new Date(), search = location.search, host = null } = {}) {
  clearHoliday();
  const h = resolveHoliday({ date, search, mode: getMode(), preview: readPreview(search) });
  if (!h) return null;
  const th = THEMES[h.id];
  const r = document.documentElement;
  r.dataset.holiday = h.id;
  r.dataset.holPage = page;
  const set = (k, v) => v && r.style.setProperty(k, v);
  set('--hol-accent', th.accent); set('--hol-tint', th.tint); set('--hol-tint2', th.tint2 || th.tint);
  set('--hol-chip-bg', th.chipBg); set('--hol-chip-ink', th.chipInk); set('--hol-chip-line', th.chipLine);

  document.body.append(el('div', 'hol-line'));

  const headEl = host || document.querySelector(PAGES[page]);
  // Chip chúc mừng (tiếng Anh cho học sinh). Hub/start: nằm trong thanh trên. Bảng: cố định giữa thanh trên.
  const chip = el('span', 'hol-chip');
  chip.setAttribute('data-testid', 'holiday-chip');
  chip.textContent = h.en;
  chip.title = h.vi;
  if (page === 'board' || !headEl) document.body.append(chip); else headEl.append(chip);
  if (page === 'board') fitBoard(chip, th);

  // Hình trang trí treo dưới thanh trên (hub, start). Bảng: không có hình ngoài thanh (không đè vùng vẽ).
  if (page !== 'board' && headEl) {
    const side = (cls, list) => { const s = el('div', 'hol-side ' + cls); list.map(art).forEach((a, i) => { const o = el('span', `hol-orn hol-o-${a.name} hol-i${i}`, a.html); o.style.setProperty('--h', a.h); s.append(o); }); return s; };
    const wrap = el('div', 'hol-orns');
    wrap.append(side('hol-l', th.L), side('hol-r', th.R));
    headEl.append(wrap);
  }

  // Hạt rơi nhẹ (menu / màn chọn). Tối đa 20 phần tử, thuần CSS, tắt khi giảm chuyển động / máy do tự động điều khiển.
  if (page !== 'board' && th.fall && fallAllowed()) {
    r.dataset.holFall = '1';
    const f = el('div', `hol-fall hol-fall--${th.fall.kind}`);
    f.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 20; i++) {
      const p = el('i', 'hol-p');
      const s = p.style;
      s.setProperty('--x', `${(i * 5 + (i % 3) * 1.7).toFixed(1)}%`);
      s.setProperty('--d', `${(11 + (i % 7) * 1.6).toFixed(1)}s`);
      s.setProperty('--w', `${(-(i * 1.37) % 14).toFixed(2)}s`);
      s.setProperty('--sz', `${(0.5 + (i % 4) * 0.16).toFixed(2)}rem`);
      s.setProperty('--c', th.fall.colors[i % th.fall.colors.length]);
      s.setProperty('--sw', `${(i % 2 ? 1 : -1) * (1.2 + (i % 3))}rem`);
      f.append(p);
    }
    document.body.append(f);
  }
  return h;
}
