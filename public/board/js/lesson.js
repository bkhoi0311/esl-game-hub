// Đọc bài đang soạn từ link Hub (#L=...). Chép fromB64url / pipe / decodeLesson từ src/core/content.js (bảng không import từ src/).
// Mã "1" = nén deflate-raw (DecompressionStream, có từ Chrome 103), "0" = không nén. PLAN-V2 mục B.ii.
// Chỉ lấy đề tiếng Anh: vocab (word, meaning, category), questions (prompt, options, answer), teams. Ảnh bỏ qua.
export function fromB64url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const cut = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// Rút gọn bài: bỏ mọi thứ bảng không dùng, giới hạn độ dài.
export function normalizeLesson(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('bài không hợp lệ');
  const vocab = (Array.isArray(raw.vocab) ? raw.vocab : []).slice(0, 200)
    .map((v) => ({ w: cut(v && v.word, 40), m: cut(v && v.meaning, 60), c: cut(v && v.category, 20) }))
    .filter((v) => v.w);
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 100)
    .map((q) => ({ p: cut(q && q.prompt, 160), o: (Array.isArray(q && q.options) ? q.options : []).slice(0, 3).map((x) => cut(x, 60)), a: q && q.answer }))
    .filter((q) => q.p && q.o.length === 3 && q.o.every(Boolean) && (q.a === 0 || q.a === 1 || q.a === 2));
  const teams = (Array.isArray(raw.teams) ? raw.teams : []).slice(0, 4).map((t) => cut(t, 20)).filter(Boolean);
  return { title: cut(raw.title, 60) || 'Bài của tôi', level: cut(raw.level, 20), vocab, questions, teams };
}

// Giải mã mã bài (không gồm "#L="). Mã hỏng thì ném lỗi.
export async function decodeLesson(code) {
  const kind = code[0];
  let bytes = fromB64url(code.slice(1));
  if (kind === '1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== '0') throw new Error('bad lesson code');
  return normalizeLesson(JSON.parse(new TextDecoder().decode(bytes)));
}

// Đọc từ location.hash. Trả null nếu không có #L=; ném lỗi nếu hỏng.
// Kết quả: { title, source: { id: 'lesson', title, level, vocab, questions, teams }, counts }
export async function readLessonFromHash(hash) {
  const m = String(hash == null ? location.hash : hash).match(/^#L=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const p = await decodeLesson(m[1]);
  return {
    title: p.title,
    source: { id: 'lesson', title: p.title, level: '', vocab: p.vocab, questions: p.questions, teams: p.teams },
    counts: { vocab: p.vocab.length, questions: p.questions.length },
  };
}
