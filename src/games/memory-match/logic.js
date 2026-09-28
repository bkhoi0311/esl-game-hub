// Memory Match (thuần logic): bộ thẻ gồm các cặp "từ tiếng Anh" + "nghĩa tiếng Việt".
export function buildDeck(vocab, pairs, rand = Math.random) {
  const seenWord = new Set();
  const seenMeaning = new Set();
  const items = [];
  for (const v of vocab) {
    const w = (v.word || '').trim();
    const m = (v.meaning || '').trim();
    if (!w || !m || seenWord.has(w.toLowerCase()) || seenMeaning.has(m.toLowerCase())) continue;
    seenWord.add(w.toLowerCase());
    seenMeaning.add(m.toLowerCase());
    items.push({ word: w, meaning: m });
  }
  const pick = shuffle(items, rand).slice(0, pairs);
  const cards = [];
  pick.forEach((it, pair) => {
    cards.push({ pair, kind: 'word', text: it.word, word: it.word });
    cards.push({ pair, kind: 'meaning', text: it.meaning, word: it.word });
  });
  return shuffle(cards, rand);
}

export function isMatch(a, b) {
  return a !== b && a.pair === b.pair && a.kind !== b.kind;
}

export function maxPairs(vocab) {
  return buildDeck(vocab, 999).length / 2;
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
