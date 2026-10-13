// Trang thử Cắt màn hình trong ClassIn X (CEF 109, off-screen): sao chép chữ / ảnh, tải tệp, chuột phải, đo tạo PNG.
// Kết quả hiện bằng chữ lớn để giáo viên chụp màn hình gửi lại. Không dùng thư viện, không gửi dữ liệu đi đâu.
const $ = (id) => document.querySelector('[data-testid="' + id + '"]');
const res = {};
function show(key, outId, ok, text) {
  const o = $(outId);
  o.textContent = (ok ? 'Được: ' : 'Không được: ') + text;
  o.className = ok ? 'good' : 'bad';
  res[key] = (ok ? 'Được' : 'Không được') + ' (' + text + ')';
  const all = $('st-r-all');
  all.textContent = Object.keys(res).map((k) => k + ': ' + res[k]).join('\n');
}

async function perm() {
  try { const p = await navigator.permissions.query({ name: 'clipboard-write' }); return p.state; } catch (e) { return 'không hỏi được (' + (e && e.name) + ')'; }
}
async function info() {
  const lines = [
    'UA: ' + navigator.userAgent,
    'isSecureContext: ' + window.isSecureContext + '   hasFocus: ' + document.hasFocus() + '   DPR: ' + window.devicePixelRatio + '   cửa sổ: ' + innerWidth + 'x' + innerHeight,
    'navigator.clipboard: ' + !!navigator.clipboard + '   writeText: ' + !!(navigator.clipboard && navigator.clipboard.writeText) + '   write: ' + !!(navigator.clipboard && navigator.clipboard.write) + '   ClipboardItem: ' + (typeof window.ClipboardItem !== 'undefined'),
    'quyền clipboard-write: ' + (await perm()),
  ];
  $('st-info').textContent = lines.join('\n');
  res['Thông tin'] = 'secure ' + window.isSecureContext + ', clipboard ' + !!navigator.clipboard + ', ClipboardItem ' + (typeof window.ClipboardItem !== 'undefined') + ', quyền ' + (await perm());
}

function sampleCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#04BC09'; g.fillRect(0, 0, w, h * 0.18);
  g.fillStyle = '#1C1C1E'; g.font = 'bold ' + Math.round(h * 0.16) + 'px sans-serif';
  g.fillText('Anh mau ' + w + 'x' + h, 16, h * 0.55);
  g.strokeStyle = '#E03131'; g.lineWidth = Math.max(2, h / 60); g.beginPath(); g.moveTo(16, h * 0.75); g.lineTo(w - 16, h * 0.9); g.stroke();
  return c;
}
const toBlob = (c) => new Promise((ok, no) => { try { c.toBlob((b) => (b ? ok(b) : no(new Error('toBlob trả null'))), 'image/png'); } catch (e) { no(e); } });
const errText = (e) => (e && e.name ? e.name : 'Lỗi') + (e && e.message ? ' - ' + e.message : '');

$('st-sample').src = sampleCanvas(400, 240).toDataURL('image/png');

$('st-copy-text').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('Bang nhieu nguoi viet: thu sao chep chu'); show('Sao chép chữ', 'st-r-text', true, 'đã ghi vào bộ nhớ tạm'); }
  catch (e) { show('Sao chép chữ', 'st-r-text', false, errText(e)); }
});
$('st-copy-img').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof window.ClipboardItem === 'undefined') throw new Error('thiếu clipboard.write hoặc ClipboardItem');
    // blob dựng trước trong promise; write() gọi ngay trong cử chỉ người dùng
    const item = new window.ClipboardItem({ 'image/png': toBlob(sampleCanvas(400, 240)) });
    await navigator.clipboard.write([item]);
    show('Sao chép ảnh', 'st-r-img', true, 'đã ghi. Hãy thử Ctrl+V ở Bảng ClassIn');
  } catch (e) { show('Sao chép ảnh', 'st-r-img', false, errText(e)); }
});
function download(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
}
$('st-dl-blob').addEventListener('click', async () => {
  try {
    const b = await toBlob(sampleCanvas(400, 240));
    const u = URL.createObjectURL(b);
    download(u, 'anh-mau-blob.png');
    setTimeout(() => URL.revokeObjectURL(u), 10000);
    show('Tải (blob)', 'st-r-dl', true, 'đã bấm tải; hãy xem có hộp lưu tệp hoặc tệp mới không (trang không biết được)');
  } catch (e) { show('Tải (blob)', 'st-r-dl', false, errText(e)); }
});
$('st-dl-data').addEventListener('click', () => {
  try {
    download(sampleCanvas(400, 240).toDataURL('image/png'), 'anh-mau-data.png');
    show('Tải (data:)', 'st-r-dl', true, 'đã bấm tải; hãy xem có hộp lưu tệp hoặc tệp mới không (trang không biết được)');
  } catch (e) { show('Tải (data:)', 'st-r-dl', false, errText(e)); }
});
$('st-sample').addEventListener('contextmenu', () => { $('st-r-ctx').textContent = 'Có sự kiện chuột phải. Menu có hiện không? Hãy báo lại.'; });
$('st-perf').addEventListener('click', async () => {
  try {
    const t0 = performance.now();
    const c = document.createElement('canvas'); c.width = 3840; c.height = 2160;
    const g = c.getContext('2d'); g.fillStyle = '#121212'; g.fillRect(0, 0, 3840, 2160);
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 8; for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(100 + i * 90, 100); g.lineTo(300 + i * 80, 2000); g.stroke(); }
    const t1 = performance.now();
    const b = await toBlob(c);
    const t2 = performance.now();
    show('Đo PNG 3840x2160', 'st-r-perf', true, Math.round(t2 - t0) + ' ms (vẽ ' + Math.round(t1 - t0) + ' + nén ' + Math.round(t2 - t1) + '), ' + Math.round(b.size / 1024) + ' KB');
  } catch (e) { show('Đo PNG 3840x2160', 'st-r-perf', false, errText(e)); }
});
info();
