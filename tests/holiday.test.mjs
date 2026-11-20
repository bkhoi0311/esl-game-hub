import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHoliday, resolveHoliday, LUNAR, HOLIDAYS } from '../public/shared/holiday.js';
import { lunarToSolarISO } from './lib/lunar-hnd.mjs';

const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const id = (s) => (activeHoliday(at(s)) || {}).id || null;

test('bảng âm lịch 2026-2035 khớp thuật toán Hồ Ngọc Đức (UTC+7)', () => {
  for (let y = 2026; y <= 2035; y++) {
    assert.equal(LUNAR[y].tet, lunarToSolarISO(1, 1, y), `Tết ${y}`);
    assert.equal(LUNAR[y].hung, lunarToSolarISO(10, 3, y), `Hùng Vương ${y}`);
    assert.equal(LUNAR[y].trungthu, lunarToSolarISO(15, 8, y), `Trung Thu ${y}`);
  }
  assert.equal(LUNAR[2027].tet, '2027-02-06');
  assert.equal(LUNAR[2028].tet, '2028-01-26');
  assert.equal(LUNAR[2026].trungthu, '2026-09-25');
  assert.equal(LUNAR[2027].trungthu, '2027-09-15');
  assert.equal(LUNAR[2027].hung, '2027-04-16');
});

test('ngày chốt theo yêu cầu', () => {
  assert.equal(id('2026-11-20'), 'teachers');
  assert.equal(id('2026-11-21'), 'teachers'); // 20/11 còn đang diễn ra (tới 21/11)
  assert.equal(id('2026-11-22'), 'culture24');
  assert.equal(id('2026-11-22'), 'culture24');
  assert.equal(id('2026-11-25'), 'culture24'); // hết ngày sau lễ
  assert.equal(id('2026-11-26'), null);
  assert.equal(id('2026-12-06'), null);
  assert.equal(id('2026-12-07'), 'christmas');
  assert.equal(id('2026-12-26'), 'christmas'); // Giáng sinh còn đang diễn ra tới 26/12
  assert.equal(id('2026-12-27'), 'newyear');
  assert.equal(id('2027-01-02'), 'newyear');
  assert.equal(id('2027-01-03'), null);
  assert.equal(id('2027-01-18'), null);
  assert.equal(id('2027-01-19'), 'tet');
  assert.equal(id('2027-01-20'), 'tet');
});

test('Tết tới mùng 4, 30/4 tới 2/5, Trung Thu', () => {
  assert.equal(id('2027-02-06'), 'tet');
  assert.equal(id('2026-02-17'), 'tet');
  assert.equal(id('2026-02-18'), 'tet'); // mùng 2 Tết 2026, đang diễn ra thắng 8/3
  assert.equal(id('2026-02-20'), 'tet');
  assert.equal(id('2026-02-21'), 'women8');
  for (const d of ['2027-02-07', '2027-02-08', '2027-02-09']) assert.equal(id(d), 'tet'); // mùng 2-4 đang diễn ra thắng Valentine
  assert.equal(id('2027-02-10'), 'valentine');
  assert.equal(id('2027-04-18'), 'april30');
  assert.equal(id('2027-05-02'), 'april30');
  assert.equal(id('2027-05-03'), null);
  assert.equal(id('2026-09-07'), 'trungthu');
  assert.equal(id('2026-09-06'), null);
  assert.equal(id('2026-09-26'), 'trungthu');
});

test('chồng cửa sổ: ngày lễ gần nhất chưa qua thắng', () => {
  assert.equal(id('2027-01-25'), 'tet');          // Tết Dương lịch đã qua
  assert.equal(id('2027-01-26'), 'tet');
  assert.equal(id('2027-01-27'), 'tet');          // Valentine bắt đầu 27/1 nhưng Tết (6/2) gần hơn
});

test('Valentine chồng Tết 2027 (Tết 6/2, Valentine 14/2)', () => {
  assert.equal(id('2027-02-06'), 'tet');
  
  assert.equal(id('2027-02-10'), 'valentine'); // Tết kết thúc 9/2
});

test('quét cả năm: mỗi ngày trả về null hoặc chủ đề hợp lệ, không ném lỗi', () => {
  const ids = new Set(HOLIDAYS.map((h) => h.id));
  for (let d = new Date(2026, 0, 1); d < new Date(2036, 0, 1); d.setDate(d.getDate() + 1)) {
    const a = activeHoliday(d);
    if (a) assert.ok(ids.has(a.id));
  }
});

test('ghi đè URL / cài đặt', () => {
  const d = at('2026-12-06');
  assert.equal(resolveHoliday({ date: d, search: '?theme=tet' }).id, 'tet');
  assert.equal(resolveHoliday({ date: at('2026-11-20'), search: '?theme=off' }), null);
  assert.equal(resolveHoliday({ date: at('2026-11-20'), mode: 'off' }), null);
  assert.equal(resolveHoliday({ date: at('2026-11-20'), mode: 'off', search: '?theme=christmas' }).id, 'christmas');
  assert.equal(resolveHoliday({ date: d, search: '?theme=bogus' }), null);
  assert.equal(resolveHoliday({ date: d, preview: 'halloween' }).id, 'halloween');
});
