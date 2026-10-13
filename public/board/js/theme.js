// Màu nền bảng (Trắng / Đen) và bảng màu bút theo cặp. THUẦN, không DOM. PLAN-BOARD-V21 mục 2.
export const BOARDS = {
  dark: { key: 'dark', name: 'Đen', bg: '#121212', rgb: [18, 18, 18] },
  light: { key: 'light', name: 'Trắng', bg: '#FFFFFF', rgb: [255, 255, 255] },
};
// Cặp theo vị trí: dark[i] <-> light[i]. Phải là song ánh (đổi qua lại không trôi màu).
export const PALETTES = {
  dark: [
    { key: 'white', name: 'Trắng', hex: '#FFFFFF' }, { key: 'red', name: 'Đỏ', hex: '#FF4D4F' }, { key: 'yellow', name: 'Vàng', hex: '#FFD43B' },
    { key: 'green', name: 'Xanh lá', hex: '#40C057' }, { key: 'blue', name: 'Xanh dương', hex: '#4DABF7' }, { key: 'orange', name: 'Cam', hex: '#FF922B' },
  ],
  light: [
    { key: 'black', name: 'Đen', hex: '#1C1C1E' }, { key: 'red', name: 'Đỏ', hex: '#E03131' }, { key: 'yellow', name: 'Vàng đậm', hex: '#E67700' },
    { key: 'green', name: 'Xanh lá', hex: '#2F9E44' }, { key: 'blue', name: 'Xanh dương', hex: '#1971C2' }, { key: 'orange', name: 'Cam', hex: '#D9480F' },
  ],
};
export const parseTheme = (v) => (v === 'light' ? 'light' : 'dark');

// Bảng đổi mã màu từ nền `from` sang nền `to` (khoá 'dark' | 'light').
export function inkMap(from, to) {
  const m = new Map();
  const a = PALETTES[from], b = PALETTES[to];
  for (let i = 0; i < a.length; i++) m.set(a[i].hex.toUpperCase(), b[i].hex);
  return m;
}

// Đổi màu mọi nét tới được: zone.color, zone.strokes, zone.undo (a.stroke; a.removed[j] là nét hoặc { stroke }) và `extra` (nét đang vẽ).
// Mỗi nét chỉ đổi 1 lần (Set). Màu không có trong bảng thì giữ. Trả số nét đã đổi.
export function remapInk(board, map, extra) {
  const seen = new Set();
  let n = 0;
  const one = (s) => {
    if (!s || typeof s !== 'object' || seen.has(s)) return;
    seen.add(s);
    const to = map.get(String(s.color).toUpperCase());
    if (to) { s.color = to; n++; }
  };
  for (const z of board.zones) {
    const zc = map.get(String(z.color).toUpperCase());
    if (zc) z.color = zc;
    for (const s of z.strokes) one(s);
    for (const a of z.undo) {
      if (a.stroke) one(a.stroke);
      if (a.removed) for (const r of a.removed) one(r && r.stroke ? r.stroke : r);
    }
  }
  if (extra) for (const s of extra) one(s);
  return n;
}

// Màu lớp kẻ theo nền.
export function paperColors(theme) {
  if (theme === 'light') {
    return { line: 'rgba(28,28,30,0.16)', major: 'rgba(28,28,30,0.32)', margin: 'rgba(224,49,49,0.5)', axis: 'rgba(28,28,30,0.8)', axisText: 'rgba(28,28,30,0.7)' };
  }
  return { line: 'rgba(255,255,255,0.14)', major: 'rgba(255,255,255,0.26)', margin: 'rgba(255,105,97,0.35)', axis: 'rgba(255,255,255,0.7)', axisText: 'rgba(255,255,255,0.55)' };
}
