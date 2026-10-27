// Memory Match (thuần logic): bộ thẻ gồm các cặp "từ tiếng Anh" + "hình" (không có tiếng Việt).
// picFn(v) trả về hình của từ ({ type, src | text }) hoặc null; truyền từ ngoài vào để logic chạy được trong Node.
const picKey = (p) => p.src || p.text;

export function buildDeck(vocab, pairs, rand = Math.random, picFn = () => null) {
  const seenWord = new Set();
  const seenPic = new Set();
  const items = [];
  for (const v of vocab) {
    const w = (v.word || '').trim();
    const pic = w ? picFn(v) : null;
    if (!w || !pic || seenWord.has(w.toLowerCase()) || seenPic.has(picKey(pic))) continue;
    seenWord.add(w.toLowerCase());
    seenPic.add(picKey(pic));
    items.push({ word: w, pic });
  }
  const pick = shuffle(items, rand).slice(0, pairs);
  const cards = [];
  pick.forEach((it, pair) => {
    cards.push({ pair, kind: 'word', text: it.word, word: it.word });
    cards.push({ pair, kind: 'pic', pic: it.pic, text: picKey(it.pic), word: it.word });
  });
  return shuffle(cards, rand);
}

export function isMatch(a, b) {
  return a !== b && a.pair === b.pair && a.kind !== b.kind;
}

export function maxPairs(vocab, picFn) {
  return buildDeck(vocab, 999, Math.random, picFn).length / 2;
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
