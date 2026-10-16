// Test logic thuần của Bảng thi đua có đề (PLAN-V2 mục F.1). Chạy: node --test tests/board-v2.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildPacks, MAX_MODULE, MAX_TOTAL } from '../tools/board/build-packs.mjs';
import { buildDeck, maskWord, makeRng, shuffleOptions, deckCapacity } from '../public/board/js/tasks.js';
import * as C from '../public/board/js/classroom.js';
import { createTimer } from '../public/board/js/timer.js';
import { calcScale, topHeight, classbarHeight, bandHeight, splitBands, computeZones, fontMax } from '../public/board/js/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'src/data/library');

/* ---------- P1: đóng gói gói bài ---------- */
let packDir;
async function packs() {
  if (!packDir) {
    packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-packs-'));
    const r = buildPacks({ srcDir: LIB, outDir: packDir });
    assert.deepEqual(r.errors, []);
  }
  const catalog = (await import(pathToFileURL(path.join(packDir, 'catalog.js')).href)).default;
  const out = [];
  for (const c of catalog) out.push((await import(pathToFileURL(path.join(packDir, c.id + '.js')).href)).default);
  return { catalog, packs: out };
}

test('P1: build-packs ra module + catalog (mọi gói trong index), id khớp, ≤ 12 KB, import() được', async () => {
  const { catalog, packs: ps } = await packs();
  const index = JSON.parse(fs.readFileSync(path.join(LIB, 'index.json'), 'utf8'));
  assert.equal(catalog.length, index.length);
  assert.equal(ps.length, index.length);
  assert.deepEqual(catalog.map((c) => c.id), index.map((i) => i.id), 'giữ thứ tự index.json');
  ps.forEach((p, i) => {
    assert.equal(p.id, index[i].id);
    assert.ok(p.vocab.length >= 6);
    assert.ok(p.questions.every((q) => q.o.length === 3 && q.a >= 0 && q.a <= 2));
    assert.ok(Object.keys(p.vocab[0]).sort().join() === 'c,m,w');
    const size = fs.statSync(path.join(packDir, p.id + '.js')).size;
    assert.ok(size <= MAX_MODULE, p.id + ' ' + size);
  });
  const total = fs.readdirSync(packDir).reduce((a, f) => a + fs.statSync(path.join(packDir, f)).size, 0);
  assert.ok(total <= MAX_TOTAL);
  assert.ok(fs.readFileSync(path.join(packDir, 'catalog.js'), 'utf8').startsWith('// TỰ SINH, KHÔNG SỬA TAY'));
});

test('P1b: build-packs dừng khi dữ liệu sai (không ghi gì)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-bad-'));
  fs.mkdirSync(path.join(tmp, 'packs'));
  fs.writeFileSync(path.join(tmp, 'index.json'), JSON.stringify([{ id: 'x', level: 'starters', title: 'X', titleVi: 'X' }]));
  fs.writeFileSync(path.join(tmp, 'packs/x.json'), JSON.stringify({ vocab: [{ word: 'a', meaning: 'b' }], questions: [{ prompt: 'p', options: ['a', 'b'], answer: 5 }] }));
  const out = path.join(tmp, 'out');
  const r = buildPacks({ srcDir: tmp, outDir: out });
  assert.ok(r.errors.length >= 3);
  assert.equal(fs.existsSync(out), false);
});

/* ---------- P2: sinh câu từ gói ---------- */
const txt = (runs) => runs.map((r) => r.v || '').join('');

test('P2: buildDeck write / missing / mc trên mọi gói thư viện', async () => {
  const { packs: ps } = await packs();
  for (const p of ps) {
    for (const kind of ['write', 'missing', 'mc']) {
      const d = buildDeck({ source: p, kind, count: 50, order: 'seq', seed: 7, difficulty: 2 });
      const ids = new Set(d.map((x) => x.id));
      assert.equal(ids.size, d.length, p.id + ' ' + kind + ' có id trùng');
      // 'missing' chỉ dùng từ đơn 3-10 chữ: gói toàn cụm động từ/cụm từ (PET) không có loại này; bảng báo "chưa có câu loại này" (v2.js).
      const hasSingle = p.vocab.some((v) => /^[a-z]{3,10}$/i.test(v.w.trim()));
      if (kind === 'missing' && !hasSingle) assert.equal(d.length, 0, p.id + ' missing phải rỗng');
      else assert.ok(d.length > 0, p.id + ' ' + kind + ' rỗng');
      assert.equal(d.length, deckCapacity(p, kind));
      if (kind === 'write') for (const t of d) { assert.equal(t.kind, 'write'); assert.ok(/^[a-z -]+$/i.test(txt(t.answer))); assert.ok(t.prompt.some((r) => r.t === 'hint')); }
      if (kind === 'mc') {
        for (const t of d) {
          assert.equal(t.options.length, 3);
          assert.equal(txt(t.options[t.answerIndex]), txt(t.answer));
          const orig = p.questions.find((q) => q.p === txt(t.prompt));
          assert.ok(orig, 'câu có trong gói');
          assert.equal(orig.o[orig.a], txt(t.answer), 'mc giữ đúng đáp án sau khi đảo');
        }
      }
      if (kind === 'missing') for (const t of d) {
        const w = txt(t.answer), m = t.prompt.find((r) => r.t === 'mask').v;
        const letters = m.split(' ');
        assert.equal(letters.length, w.length);
        const hidden = letters.filter((c) => c === '_').length;
        assert.equal(hidden, t.meta.masked);
        assert.ok(hidden >= 1 && hidden <= Math.max(1, Math.floor(w.length * 0.4)));
        letters.forEach((c, i) => { if (c !== '_') assert.equal(c, w[i]); });
      }
    }
  }
});

test('P2b: missing che 1/2/3 chữ theo độ khó, ưu tiên nguyên âm; rand đổi thứ tự; thiếu câu thì trả ít hơn', async () => {
  const m1 = maskWord('breakfast', 1, makeRng(1)), m2 = maskWord('breakfast', 2, makeRng(1)), m3 = maskWord('breakfast', 3, makeRng(1));
  assert.deepEqual([m1.count, m2.count, m3.count], [1, 2, 3]);
  assert.ok(m1.hidden.every((i) => 'aeiou'.indexOf('breakfast'[i]) >= 0));
  assert.equal(maskWord('cat', 3, makeRng(1)).count, 1, 'từ ngắn: ≤ 40%');
  const { packs: ps } = await packs();
  const p = ps[0];
  const a = buildDeck({ source: p, kind: 'write', count: 10, order: 'seq', seed: 1 }).map((t) => t.id);
  const b = buildDeck({ source: p, kind: 'write', count: 10, order: 'rand', seed: 1 }).map((t) => t.id);
  const c = buildDeck({ source: p, kind: 'write', count: 10, order: 'rand', seed: 1 }).map((t) => t.id);
  assert.notDeepEqual(a, b);
  assert.deepEqual(b, c, 'cùng seed cùng thứ tự');
  assert.ok(buildDeck({ source: p, kind: 'mc', count: 99, order: 'seq', seed: 1 }).length <= 15);
  const t0 = buildDeck({ source: p, kind: 'mc', count: 1, order: 'seq', seed: 1 })[0];
  const t1 = shuffleOptions(t0, makeRng(5));
  assert.equal(txt(t1.options[t1.answerIndex]), txt(t0.options[t0.answerIndex]));
});

/* ---------- S1: classroom ---------- */
function mkDeck(n, mode) {
  const tasks = [];
  for (let i = 0; i < n; i++) tasks.push({ id: 't' + i, kind: i % 2 ? 'mc' : 'write', lang: 'en', prompt: [{ t: 'text', v: 'q' + i }], options: i % 2 ? [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }], [{ t: 'text', v: 'c' }]] : null, answer: [{ t: 'text', v: 'x' }], answerIndex: i % 2 ? 1 : null, meta: {} });
  return { source: { type: 'lib', id: 'x', title: 'X' }, kind: 'write', tasks, mode, order: 'seq', seed: 1, lang: 'en' };
}

test('S1a: Đề chung: mọi vùng cùng câu, nextShared/prevShared, đảo A/B/C theo vùng', () => {
  const cls = C.createClassroom(3);
  C.applyDeck(cls, mkDeck(5, 'common'), { teams: ['Red', 'Blue'], timer: { mode: 'off', total: 60 } });
  assert.deepEqual(cls.zones.map((z) => z.task), [0, 0, 0]);
  assert.deepEqual(cls.zones.map((z) => z.team), ['Red', 'Blue', 'Team 3']);
  assert.equal(C.nextShared(cls), true);
  assert.deepEqual(cls.zones.map((z) => z.task), [1, 1, 1]);
  // câu 1 là mc: mỗi vùng thứ tự khác, vị trí đáp án khác nhau
  const pos = cls.zones.map((z) => z.optOrder.indexOf(1));
  assert.equal(new Set(pos).size, 3, 'vị trí đáp án khác nhau theo vùng: ' + pos);
  assert.ok(cls.zones.every((z) => z.optOrder.slice().sort().join() === '0,1,2'));
  C.nextShared(cls); C.nextShared(cls); C.nextShared(cls);
  assert.equal(cls.shared, 4);
  assert.equal(C.nextShared(cls), false, 'hết đề');
  assert.equal(C.prevShared(cls), true);
  assert.equal(cls.shared, 3);
  C.applyDeck(cls, mkDeck(1, 'common'), {});
  assert.equal(C.prevShared(cls), false);
});

test('S1b: Chia câu: vùng i nhận câu i, nextForZone không trùng, prevForZone, hết câu', () => {
  const cls = C.createClassroom(4);
  C.applyDeck(cls, mkDeck(6, 'split'), {});
  assert.deepEqual(cls.zones.map((z) => z.task), [0, 1, 2, 3]);
  assert.equal(C.nextForZone(cls, 2), true);
  assert.equal(cls.zones[1].task, 4);
  assert.deepEqual(cls.zones.map((z) => z.task), [0, 4, 2, 3], 'vùng khác không đổi');
  assert.equal(C.nextForZone(cls, 1), true);
  assert.equal(cls.zones[0].task, 5);
  assert.equal(C.nextForZone(cls, 3), false, 'hết câu');
  assert.equal(C.prevForZone(cls, 2), true);
  assert.equal(cls.zones[1].task, 1);
  assert.equal(C.prevForZone(cls, 2), false, 'không lùi quá câu đầu');
  const all = [].concat(...cls.zones.map((z) => z.history));
  assert.equal(new Set(all).size, all.length, 'không câu nào phát hai lần');
});

test('S1c: chấm ✓/✗ bấm lại bỏ chấm, điểm, totals xếp hạng + dẫn đầu, newRound giữ điểm', () => {
  const cls = C.createClassroom(3);
  C.applyDeck(cls, mkDeck(6, 'common'), {});
  C.setRevealed(cls, true);
  assert.ok(cls.zones.every((z) => z.shown));
  C.setVerdict(cls, 1, true); C.setVerdict(cls, 2, false); C.setVerdict(cls, 3, true);
  assert.deepEqual(cls.zones.map((z) => z.score), [1, 0, 1]);
  C.setVerdict(cls, 1, true);                 // bấm lần hai: bỏ chấm
  assert.equal(cls.zones[0].score, 0); assert.equal(cls.zones[0].verdict, null);
  C.setVerdict(cls, 1, true); C.setVerdict(cls, 3, false);   // đổi ý
  assert.deepEqual(cls.zones.map((z) => z.score), [1, 0, 0]);
  const t = C.totals(cls);
  assert.equal(t.rows[0].id, 1); assert.deepEqual(t.leaders, [1]); assert.equal(t.top, 1);
  assert.equal(cls.zones[0].judged, 1);
  const r = C.newRound(cls);
  assert.equal(r.end, false);
  assert.equal(cls.shared, 1);
  assert.deepEqual(cls.zones.map((z) => z.score), [1, 0, 0], 'giữ điểm');
  assert.ok(cls.zones.every((z) => z.verdict === null && !z.shown) && cls.revealed === false);
  assert.equal(cls.round, 2);
  for (let i = 0; i < 6; i++) C.newRound(cls);
  assert.equal(C.newRound(cls).end, true, 'hết đề giữ câu cuối');
  assert.equal(cls.shared, 5);
  C.resetScores(cls);
  assert.equal(C.totals(cls).top, 0);
  assert.deepEqual(C.totals(cls).leaders, []);
});

test('S1d: đổi số vùng đặt lại điểm và chia lại câu; toJSON/fromJSON; khoá và ẩn đề', () => {
  const cls = C.createClassroom(2);
  C.applyDeck(cls, mkDeck(8, 'split'), { timer: { mode: 'down', total: 30 } });
  assert.equal(cls.hidden, false, 'Chia câu không ẩn đề');
  C.nextForZone(cls, 1); C.setRevealed(cls, true); C.setVerdict(cls, 2, true);
  C.setZoneCount(cls, 4);
  assert.equal(cls.zones.length, 4);
  assert.deepEqual(cls.zones.map((z) => z.task), [0, 1, 2, 3]);
  assert.ok(cls.zones.every((z) => z.score === 0 && !z.shown));
  assert.equal(cls.zones[3].team, 'Team 4');
  const copy = C.fromJSON(JSON.parse(JSON.stringify(C.toJSON(cls))));
  assert.deepEqual(C.toJSON(copy), C.toJSON(cls));
  assert.ok(copy.used instanceof Set && copy.used.size === 4);
  assert.equal(C.fromJSON({ v: 9 }), null);
  const c2 = C.createClassroom(2);
  C.applyDeck(c2, mkDeck(3, 'common'), { timer: { mode: 'down', total: 30 } });
  assert.equal(c2.hidden, true, 'Đề chung + đếm ngược: ẩn đề chờ Bắt đầu');
  assert.equal(C.isLocked(c2, 1), true);
  C.startTimer(c2);
  assert.equal(c2.hidden, false); assert.equal(C.isLocked(c2, 1), false);
  C.endTimer(c2);
  assert.equal(C.isLocked(c2, 2), true);
  C.resetTimer(c2);
  assert.equal(c2.hidden, true); assert.equal(c2.zones[0].locked, false); assert.equal(c2.timer.left, 30);
  C.setTimerConfig(c2, 'up', 0);
  assert.equal(c2.hidden, false);
});

/* ---------- Y1: bố cục ---------- */
test('Y1: bandH và vùng viết ở 1280x720 và 1920x1080 khớp bảng C.8', () => {
  const cases = [[1280, 720, 600, 120, 480, [1280, 639, 425, 318], [44, 38, 32, 28]], [1920, 1080, 900, 180, 720, [1920, 959, 638, 478], [66, 57, 48, 42]]];
  for (const [W, H, stageH, band, write, widths, fonts] of cases) {
    const s = calcScale(W, H);
    const top = topHeight(s) + classbarHeight(s);
    assert.equal(H - top, stageH);
    assert.equal(bandHeight(s, stageH, true), band);
    assert.equal(bandHeight(s, stageH, false), 0);
    for (let n = 1; n <= 4; n++) {
      const rects = computeZones(W, H, n, top);
      const sp = splitBands(rects, bandHeight(s, stageH, true));
      assert.ok(Math.abs(sp.writes[0].h - write) <= 1);
      assert.ok(Math.abs(sp.bands[0].h - band) <= 1);
      assert.ok(Math.abs(rects[0].w - widths[n - 1]) <= 1, `w ${n}: ${rects[0].w} vs ${widths[n - 1]}`);
      assert.equal(fontMax(n, s), fonts[n - 1]);
      assert.equal(sp.writes[0].y, rects[0].y + sp.bands[0].h);
    }
  }
  assert.equal(splitBands(computeZones(1280, 720, 2, 120), 0).writes[0].h, 600);
});

/* ---------- T1: đồng hồ ---------- */
test('T1: timer đếm ngược, tạm dừng, tiếp, hết giờ gọi onEnd đúng 1 lần, bấm giờ xuôi', () => {
  let now = 0, ends = 0; const ticks = [];
  const tm = createTimer({ now: () => now, onTick: (s) => ticks.push(s.left), onEnd: () => ends++, schedule: () => 1, cancel: () => {} });
  tm.set('down', 10);
  assert.equal(tm.state().left, 10);
  tm.start();
  now = 2500; tm.tick();
  assert.equal(tm.state().left, 8, 'ceil(7,5)');
  tm.pause();
  assert.equal(tm.state().running, false);
  now = 9000; tm.tick();
  assert.equal(tm.state().left, 8, 'tạm dừng không trôi');
  tm.start();
  now = 9000 + 7400; tm.tick();
  assert.equal(tm.state().left, 1);
  assert.equal(ends, 0);
  now = 9000 + 7600; tm.tick();
  assert.equal(ends, 1); assert.equal(tm.state().left, 0); assert.equal(tm.state().running, false);
  now += 5000; tm.tick(); tm.tick();
  assert.equal(ends, 1, 'onEnd chỉ 1 lần');
  tm.reset();
  assert.equal(tm.state().left, 10); assert.equal(tm.state().ended, false);
  tm.set('up', 0);
  now = 100000; tm.start(); now += 3700; tm.tick();
  assert.equal(tm.state().left, 3);
  now += 60000; tm.tick();
  assert.equal(tm.state().left, 63);
  assert.equal(ends, 1);
  tm.set('off', 0); tm.start();
  assert.equal(tm.state().running, false);
  // speed: 30× => 60 giây chạy trong 2 giây thật
  now = 0; ends = 0;
  const fast = createTimer({ now: () => now, onEnd: () => ends++, schedule: () => 1, cancel: () => {}, speed: 30 });
  fast.set('down', 60); fast.start(); now = 1900; fast.tick();
  assert.equal(ends, 0); now = 2000; fast.tick();
  assert.equal(ends, 1);
});

/* ---------- Toán: M1-M7 ---------- */
import { generateMath, MATH_TYPES, checkAnswer, boundOf, ALL_TYPES } from '../public/board/js/math/gen.js';
import * as Q from '../public/board/js/math/rational.js';
import { validateRuns, escapeHtml } from '../public/board/js/math/render.js';
import { nums, evalExpr, exprText, COMPLEX } from '../public/board/js/math/expr.js';
import { runsText } from '../public/board/js/tasks.js';

const PAIRS = [];
for (let g = 1; g <= 12; g++) for (const t of MATH_TYPES[g]) PAIRS.push([g, t.type]);

test('M0: MATH_TYPES: mỗi lớp có dạng của lớp và 1-2 lớp trước, không trùng, có nhãn Việt', () => {
  assert.equal(Object.keys(MATH_TYPES).length, 12);
  for (let g = 1; g <= 12; g++) {
    const l = MATH_TYPES[g];
    assert.ok(l.length >= 3, 'lớp ' + g);
    assert.equal(new Set(l.map((x) => x.type)).size, l.length);
    assert.ok(l.every((x) => x.labelVi && x.home <= g && x.home >= g - 2));
    assert.equal(l[0].home, g, 'dạng của chính lớp đứng đầu');
  }
  assert.ok(MATH_TYPES[1].every((x) => !x.review));
  assert.ok(MATH_TYPES[6].some((x) => x.type === 'graph-point') && !MATH_TYPES[5].some((x) => x.type === 'graph-point'));
  assert.ok(ALL_TYPES.length >= 36);
  const homes = new Set(); for (let g = 1; g <= 12; g++) MATH_TYPES[g].forEach((x) => homes.add(x.type));
  assert.equal(homes.size, ALL_TYPES.length, 'mọi dạng đều xuất hiện ở một lớp nào đó');
});

test('M1: mọi dạng x lớp x 3 độ khó x 200 seed: checkAnswer đúng 100%, không NaN, lớp 1-5 không âm', () => {
  let n = 0;
  for (const [g, type] of PAIRS) for (let d = 1; d <= 3; d++) for (let seed = 1; seed <= 200; seed++) {
    const out = generateMath({ grade: g, type, difficulty: d, count: 1, seed, lang: 'vi' });
    assert.equal(out.length, 1, `${type} lớp ${g} d${d} seed ${seed}: không sinh được`);
    const t = out[0];
    assert.ok(checkAnswer(t), `${type} lớp ${g} d${d} seed ${seed}: ${runsText(t.prompt)} => ${runsText(t.answer)}`);
    const text = runsText(t.prompt) + ' ' + runsText(t.answer);
    assert.ok(!/NaN|Infinity|undefined|null/.test(text), 'NaN: ' + text);
    for (const x of nums(text)) assert.ok(isFinite(x));
    if (g <= 5) assert.ok(!/−/.test(runsText(t.answer)) && !/\(−/.test(runsText(t.prompt)), `lớp ${g} có số âm: ${text}`);
    assert.equal(t.kind, 'math'); assert.equal(t.meta.type, type); assert.equal(t.meta.grade, g); assert.equal(t.meta.difficulty, d);
    n++;
  }
  assert.ok(n > 40000, 'số câu đã kiểm: ' + n);
});

test('M1b: bản tiếng Anh cũng qua checkAnswer', () => {
  for (const [g, type] of PAIRS) for (let d = 1; d <= 3; d++) for (let seed = 1; seed <= 30; seed++) {
    const t = generateMath({ grade: g, type, difficulty: d, count: 1, seed, lang: 'en' })[0];
    assert.ok(t && checkAnswer(t), `${type} en: ${t && runsText(t.prompt)}`);
    assert.equal(t.lang, 'en');
    assert.ok(!/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(runsText(t.prompt)), 'còn chữ Việt trong đề tiếng Anh: ' + runsText(t.prompt));
  }
});

test('M1c: checkAnswer bắt được đáp án sai', () => {
  let caught = 0, total = 0;
  for (const [g, type] of PAIRS) {
    const t = generateMath({ grade: g, type, difficulty: 2, count: 1, seed: 3, lang: 'vi' })[0];
    const bad = Object.assign({}, t, { answer: [{ t: 'text', v: /^[<>=]$/.test(runsText(t.answer)) ? (runsText(t.answer) === '<' ? '>' : '<') : 'sai 7777' }] });
    total++;
    if (!checkAnswer(bad)) caught++;
  }
  assert.equal(caught, total, 'bộ kiểm phải loại đáp án sai ở mọi dạng');
  // sai nhẹ: lệch 1
  const t = generateMath({ grade: 3, type: 'add', difficulty: 2, count: 1, seed: 9 })[0];
  const v = nums(runsText(t.answer))[0];
  assert.equal(checkAnswer(t), true);
  assert.equal(checkAnswer(Object.assign({}, t, { answer: [{ t: 'text', v: String(v + 1) }] })), false);
});

test('M2: phạm vi theo độ khó: số trong đề nằm trong biên; Khó có giá trị lớn nhất >= Dễ', () => {
  const seen = {};
  for (const [g, type] of PAIRS) {
    const mx = [0, 0, 0, 0];
    for (let d = 1; d <= 3; d++) {
      const bound = boundOf(type, g, d);
      for (let seed = 1; seed <= 200; seed++) {
        const t = generateMath({ grade: g, type, difficulty: d, count: 1, seed })[0];
        const m = Math.max.apply(null, nums(runsText(t.prompt)).map(Math.abs).concat([0]));
        assert.ok(m <= bound + 1e-9, `${type} lớp ${g} d${d}: ${m} > biên ${bound}: ${runsText(t.prompt)}`);
        if (m > mx[d]) mx[d] = m;
      }
    }
    assert.ok(mx[3] >= mx[1], `${type} lớp ${g}: Khó (${mx[3]}) nhỏ hơn Dễ (${mx[1]})`);
    seen[g + ':' + type] = mx.slice(1).join('/');
  }
});

test('M3: không trùng: count = 20 ra 20 khoá khác nhau, hoặc ít hơn kèm cờ short', () => {
  let shorts = 0;
  for (const [g, type] of PAIRS) for (let d = 1; d <= 3; d++) {
    const out = generateMath({ grade: g, type, difficulty: d, count: 20, seed: 11 });
    const keys = new Set(out.map((t) => runsText(t.prompt).replace(/\s+/g, ' ')));
    assert.equal(keys.size, out.length, `${type} lớp ${g} d${d} có đề trùng`);
    assert.equal(new Set(out.map((t) => t.id)).size, out.length, 'id trùng');
    if (out.length < 20) { assert.equal(out.short, true, `${type} d${d} thiếu câu mà không có cờ short`); shorts++; } else assert.ok(!out.short);
  }
  assert.ok(shorts < 40, 'quá nhiều dạng không đủ 20 câu: ' + shorts);
  // các dạng phổ biến phải đủ 20 câu ở độ khó 2
  for (const type of ['add', 'sub', 'mul', 'div', 'frac-add', 'linear', 'quadratic', 'deriv-poly', 'complex']) {
    const g = MATH_TYPES.hasOwnProperty ? PAIRS.find((p) => p[1] === type)[0] : 1;
    assert.equal(generateMath({ grade: g, type, difficulty: 2, count: 20, seed: 4 }).length, 20, type);
  }
});

test('M4: đáp án nhiễu: 3 phương án khác nhau, nhiễu khác đúng, cùng kiểu, lớp 1-5 không âm', () => {
  let withOpts = 0;
  const kinds = new Set();
  for (const [g, type] of PAIRS) for (let d = 1; d <= 3; d++) {
    const out = generateMath({ grade: g, type, difficulty: d, count: 12, seed: 21, options: true });
    for (const t of out) {
      if (!t.options) { assert.equal(t.answerIndex, null); continue; }
      withOpts++; kinds.add(type);
      assert.equal(t.options.length, 3);
      const txt = t.options.map((o) => runsText(o));
      assert.equal(new Set(txt).size, 3, `phương án trùng: ${txt.join(' | ')} (${type})`);
      assert.ok(t.answerIndex >= 0 && t.answerIndex <= 2);
      assert.equal(txt[t.answerIndex], runsText(t.answer), 'đáp án đúng ở đúng vị trí');
      const isFrac = (s) => s.indexOf('/') >= 0;
      const isSym = (s) => /^[<>=]$/.test(s);
      const fr = txt.map(isFrac), sy = txt.map(isSym);
      assert.ok(fr.every((x) => x === fr[0]), `không cùng kiểu (phân số): ${txt.join(' | ')}`);
      assert.ok(sy.every((x) => x === sy[0]), 'không cùng kiểu (ký hiệu)');
      if (g <= 5) assert.ok(txt.every((s) => s.indexOf('−') < 0), 'số âm ở lớp ' + g + ': ' + txt.join(' | '));
      // phương án nhiễu mang cùng đơn vị với đáp án
      if (t.meta.unit) assert.ok(txt.every((s) => s.endsWith(' ' + t.meta.unit)), 'đơn vị: ' + txt.join(' | '));
    }
  }
  assert.ok(withOpts > 500 && kinds.size >= 15, `ít câu có nhiễu: ${withOpts}, ${kinds.size} dạng`);
});

test('M5: tất định: cùng seed cùng đề; khác seed khác đề', () => {
  for (const [g, type] of PAIRS.filter((_, i) => i % 3 === 0)) {
    const a = generateMath({ grade: g, type, difficulty: 2, count: 8, seed: 77 }).map((t) => runsText(t.prompt));
    const b = generateMath({ grade: g, type, difficulty: 2, count: 8, seed: 77 }).map((t) => runsText(t.prompt));
    assert.deepEqual(a, b);
  }
  const x = generateMath({ grade: 4, type: 'mul', difficulty: 2, count: 8, seed: 1 }).map((t) => runsText(t.prompt));
  const y = generateMath({ grade: 4, type: 'mul', difficulty: 2, count: 8, seed: 2 }).map((t) => runsText(t.prompt));
  assert.notDeepEqual(x, y);
});

test('M6: rational: + − × ÷, tối giản, mẫu dương, so với số thực', () => {
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 2000; i++) {
    const a = Q.frac(Math.floor(rnd() * 41) - 20, Math.floor(rnd() * 19) + 1), b = Q.frac(Math.floor(rnd() * 41) - 20, Math.floor(rnd() * 19) + 1);
    const fa = a.n / a.d, fb = b.n / b.d;
    for (const [q, f] of [[Q.add(a, b), fa + fb], [Q.sub(a, b), fa - fb], [Q.mul(a, b), fa * fb]]) {
      assert.ok(q.d > 0 && Q.gcd(q.n, q.d) === 1);
      assert.ok(Math.abs(Q.toNumber(q) - f) < 1e-9);
    }
    if (b.n !== 0) { const q = Q.div(a, b); assert.ok(q.d > 0 && Q.gcd(q.n, q.d) === 1); assert.ok(Math.abs(Q.toNumber(q) - fa / fb) < 1e-9); }
  }
  assert.throws(() => Q.frac(1, 0)); assert.throws(() => Q.div(Q.frac(1, 2), Q.frac(0, 3)));
  assert.deepEqual(Q.frac(6, -8), { n: -3, d: 4 });
  assert.equal(Q.cmp(Q.frac(1, 3), Q.frac(2, 6)), 0); assert.equal(Q.cmp(Q.frac(1, 3), Q.frac(1, 2)), -1);
  assert.equal(Q.lcm(4, 6), 12);
});

test('M6b: bộ tính biểu thức độc lập', () => {
  assert.equal(evalExpr('3 + 4 × 2'), 11);
  assert.equal(evalExpr('(3 + 4) × 2'), 14);
  assert.equal(evalExpr('2x + 1', { x: 3 }), 7);
  assert.equal(evalExpr('(x + 2)(x − 5)', { x: 4 }), -6);
  assert.equal(evalExpr('3(x)^(2) − x', { x: 2 }), 10);
  assert.ok(Math.abs(evalExpr('((1)/(2)) + ((1)/(3))') - 5 / 6) < 1e-12);
  assert.equal(evalExpr('√(144)'), 12);
  assert.equal(evalExpr('(−7) + 4'), -3);
  assert.equal(evalExpr('7,5 + 2,5'), 10);
  assert.deepEqual(evalExpr('(3 + 2i) × (1 − 4i)', { i: { re: 0, im: 1 } }, COMPLEX), { re: 11, im: -10 });
  assert.deepEqual(nums('x = −3 hoặc x = 2'), [-3, 2]);
  assert.deepEqual(nums('−5/6'), [-5 / 6]);
  assert.deepEqual(nums('7 dư 5'), [7, 5]);
  assert.throws(() => evalExpr('1/0 +'));
});

test('M7: Run hợp lệ, không HTML trong chữ, tên dạng không chứa dữ liệu lạ', () => {
  let n = 0;
  for (const [g, type] of PAIRS) for (const lang of ['vi', 'en']) {
    const out = generateMath({ grade: g, type, difficulty: 3, count: 5, seed: 3, lang, options: true });
    for (const t of out) {
      assert.ok(validateRuns(t.prompt) && validateRuns(t.answer), type);
      if (t.options) t.options.forEach((o) => assert.ok(validateRuns(o)));
      const walk = (runs) => runs.forEach((r) => { if (r.t === 'text') { assert.ok(escapeHtml(r.v).indexOf('<') < 0); } for (const k of ['n', 'd', 'b', 'e', 'v', 'lo', 'hi']) if (Array.isArray(r[k])) walk(r[k]); });
      walk(t.prompt); walk(t.answer);
      n++;
    }
  }
  assert.ok(n > 400);
  assert.equal(validateRuns([{ t: 'frac', n: [{ t: 'text', v: '1' }] }]), false, 'thiếu mẫu');
  assert.equal(validateRuns([{ t: 'zzz' }]), false);
  assert.equal(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
  // phân số dựng cấu trúc .mf: có Run frac ở dạng cộng phân số
  const f = generateMath({ grade: 5, type: 'frac-add', difficulty: 2, count: 3, seed: 1 })[0];
  assert.ok(f.prompt.filter((r) => r.t === 'frac').length === 2);
});

// ================= v2.1: chạm để bỏ màn Hết giờ =================
test('D1: dismissTimeup mở khoá vùng, giữ hidden, giữ đồng hồ 00:00', () => {
  const cls = C.createClassroom(3);
  C.applyDeck(cls, { source: { type: 'lib', id: 'x', title: 'x' }, kind: 'write', tasks: [{ id: 't1', prompt: 'p', answer: 'a' }, { id: 't2', prompt: 'q', answer: 'b' }], mode: 'common', order: 'seq', seed: 1, lang: 'en' }, { timer: { mode: 'down', total: 30 } });
  C.startTimer(cls);
  C.endTimer(cls);
  assert.ok(cls.zones.every((z) => z.locked), 'hết giờ khoá mọi vùng');
  assert.equal(C.isLocked(cls, 1), true);
  const hiddenBefore = cls.hidden;
  C.dismissTimeup(cls);
  assert.ok(cls.zones.every((z) => !z.locked), 'mở khoá');
  assert.equal(C.isLocked(cls, 2), false);
  assert.equal(cls.hidden, hiddenBefore, 'không đổi hidden');
  assert.equal(cls.timer.left, 0, 'đồng hồ vẫn 00:00'); assert.equal(cls.timer.running, false);
  assert.equal(cls.timer.mode, 'down'); assert.equal(cls.timer.total, 30);
});
