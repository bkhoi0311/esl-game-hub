// Máy trạng thái KHÓA KHUNG (src/core/frame-lock.js): locked -> reframed -> settling -> locked, đếm số lần, lost, ?reframe=0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLock, LOCK } from '../src/core/frame-lock.js';

const ev = (o) => ({ moving: false, started: false, ended: false, kind: null, repeated: false, ...o });

test('locked -> reframed -> settling -> locked và đếm số lần', () => {
  const fl = createFrameLock({ enabled: true });
  const seen = [];
  fl.onChange((e) => seen.push(e.state));
  fl.ingest(ev({}), 0);
  assert.equal(fl.state, 'locked');
  fl.ingest(ev({ moving: true, started: true, kind: 'shift' }), 1000);
  assert.equal(fl.state, 'reframed');
  assert.equal(fl.count, 1);
  fl.ingest(ev({ moving: true }), 1000 + LOCK.HOT_MS + 50);
  assert.equal(fl.state, 'settling');
  fl.ingest(ev({ moving: true, kind: 'shift' }), 2000);
  assert.equal(fl.state, 'reframed', 'dấu hiệu mới thì quay lại vừa đổi khung');
  assert.equal(fl.count, 1, 'cùng một đợt đổi khung chỉ đếm 1');
  fl.ingest(ev({ moving: false, ended: true }), 3300);
  assert.equal(fl.state, 'locked');
  fl.ingest(ev({ moving: true, started: true, kind: 'cut' }), 9000);
  assert.equal(fl.count, 2);
  assert.deepEqual(seen, ['reframed', 'settling', 'reframed', 'locked', 'reframed']);
  fl.resetCount();
  assert.equal(fl.count, 0);
});

test('lost khi không có khung mới, hồi lại khi có khung', () => {
  const fl = createFrameLock({ enabled: true });
  fl.tick(100000); // chưa từng có khung: chưa kết luận
  assert.equal(fl.state, 'locked');
  fl.ingest(ev({}), 1000);
  fl.tick(1000 + LOCK.LOST_MS + 1);
  assert.equal(fl.state, 'lost');
  fl.ingest(ev({}), 6000);
  assert.equal(fl.state, 'locked');
});

test('mốc khung: chụp, đo lệch, xoá; reset không đụng mốc', () => {
  const fl = createFrameLock({ enabled: true });
  const a = new Float32Array(64 * 36).map((_, i) => (i * 7) % 200);
  fl.captureBaseline(a, 5);
  assert.equal(fl.hasBaseline, true);
  assert.equal(fl.baselineAt, 5);
  fl.reset();
  assert.equal(fl.hasBaseline, true);
  fl.push(a, 1000); // chính ảnh mốc: lệch ~ 0
  assert.ok(fl.drift < 0.01, `lệch ${fl.drift}`);
  const b = a.map((v, i) => (i * 13) % 255);
  fl.push(b, 2000);
  assert.ok(fl.drift > 0.3, `ảnh khác hẳn mà lệch ${fl.drift}`);
  fl.clearBaseline();
  assert.equal(fl.hasBaseline, false);
});

test('push dò thật: cắt sang khung khác => reframed, đếm 1', () => {
  const fl = createFrameLock({ enabled: true });
  const mk = (seed) => new Float32Array(64 * 36).map((_, i) => 60 + ((i * seed) % 120) + Math.sin(i / seed) * 20);
  const A = mk(7);
  const B = mk(13);
  let t = 0;
  for (let i = 0; i < 20; i++, t += 66) fl.push(A, t);
  assert.equal(fl.state, 'locked');
  for (let i = 0; i < 6; i++, t += 66) fl.push(B, t);
  assert.equal(fl.state, 'reframed');
  assert.equal(fl.count, 1);
});

test('?reframe=0 (enabled=false): không bao giờ đổi trạng thái', () => {
  const fl = createFrameLock({ enabled: false });
  assert.equal(fl.enabled, false);
  fl.ingest(ev({ moving: true, started: true, kind: 'shift' }), 10);
  fl.tick(99999);
  assert.equal(fl.state, 'locked');
  assert.equal(fl.count, 0);
  assert.equal(fl.push(new Float32Array(64 * 36), 5).moving, false);
});
