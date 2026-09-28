// Luật Impostor Word (thuần logic): 4 từ cùng nhóm + 1 từ khác nhóm.

export const GROUP_SIZE = 4;

// Gom từ theo nhóm, bỏ từ trùng chữ.
export function groupWords(vocab) {
  const groups = {};
  const seen = new Set();
  for (const v of vocab) {
    const word = (v.word || '').trim();
    const cat = (v.category || '').trim().toLowerCase();
    if (!word || !cat || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    (groups[cat] ||= []).push({ ...v, word, category: cat });
  }
  return groups;
}

// Đặc tả: cần ít nhất 2 nhóm, mỗi nhóm ít nhất 4 từ. Nhóm dưới 4 từ không được dùng.
export function usableGroups(vocab) {
  const groups = groupWords(vocab);
  return Object.fromEntries(Object.entries(groups).filter(([, list]) => list.length >= GROUP_SIZE));
}

// Thông báo tiếng Việt nếu thiếu nội dung. Mảng rỗng = đủ để chơi.
export function checkContent(vocab) {
  const groups = groupWords(vocab);
  const cats = Object.keys(groups);
  const full = cats.filter((c) => groups[c].length >= GROUP_SIZE);
  if (full.length >= 2) return [];
  const missing = [`Cần ít nhất 2 nhóm từ (cột category), mỗi nhóm ít nhất ${GROUP_SIZE} từ. Hiện có ${full.length} nhóm đủ ${GROUP_SIZE} từ.`];
  const short = cats.filter((c) => groups[c].length < GROUP_SIZE);
  if (short.length) {
    missing.push('Nhóm còn thiếu: ' + short.map((c) => `"${c}" cần thêm ${GROUP_SIZE - groups[c].length} từ`).join('; ') + '.');
  }
  if (!cats.length) missing.push('Chưa có từ nào được gán nhóm.');
  return missing;
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function comboKey(words) {
  return words.map((w) => w.word.toLowerCase()).sort().join('|');
}

// Sinh 1 vòng không trùng tổ hợp đã dùng (used: Set các key). null = hết tổ hợp mới.
export function makeRound(vocab, used = new Set(), rand = Math.random) {
  const groups = usableGroups(vocab);
  const cats = Object.keys(groups);
  const majorCats = cats;
  if (cats.length < 2) return null;

  for (let attempt = 0; attempt < 400; attempt++) {
    const major = majorCats[Math.floor(rand() * majorCats.length)];
    const others = cats.filter((c) => c !== major);
    const odd = others[Math.floor(rand() * others.length)];
    const four = shuffle(groups[major], rand).slice(0, GROUP_SIZE);
    const impostor = groups[odd][Math.floor(rand() * groups[odd].length)];
    const key = comboKey([...four, impostor]);
    if (used.has(key)) continue;
    used.add(key);
    const cards = shuffle([...four.map((w) => ({ ...w, impostor: false })), { ...impostor, impostor: true }], rand);
    return { cards, major, odd, key };
  }
  return null;
}

// "drink" -> "drinks", "berry" -> "berries", "dish" -> "dishes"
export function plural(noun) {
  if (/[^aeiou]y$/i.test(noun)) return noun.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(noun)) return noun + 'es';
  return noun + 's';
}

export function article(noun) {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

// "4 are drinks, 1 is a fruit."
export function explain(major, odd) {
  return `${GROUP_SIZE} are ${plural(major)}, 1 is ${article(odd)} ${odd}.`;
}
