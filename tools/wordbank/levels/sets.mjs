// Bộ từ Appendix 1 và số (PLAN-LEVELS mục 2.6), tất định. Không đọc tệp có bản quyền: danh sách ngắn này là dữ kiện (số, thứ, tháng, châu lục).
// buildSets(existingWords:Set<string>) -> mảng { word, level, pos, kpos, cat, display, alts, note } chỉ gồm từ CHƯA có trong danh sách chữ cái.
const CARD_S = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const CARD_M = ['thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred'];
const CARD_F = ['thousand'];
const ORD_M = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const ORD_F = ['twenty-first', 'thirtieth', 'thirty-first'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const CONTINENTS = ['Africa', 'Antarctica', 'Asia', 'Australia', 'Europe', 'North America', 'South America'];
const COUNTRIES = [['Brazil', 'Brazilian'], ['Canada', 'Canadian'], ['China', 'Chinese'], ['France', 'French'], ['Ireland', 'Irish'], ['India', 'Indian'], ['Italy', 'Italian'], ['Spain', 'Spanish']];

export function buildSets(existing) {
  const have = existing instanceof Set ? existing : new Set(existing || []);
  const out = [];
  const add = (word, level, pos, cat, extra) => {
    const w = (extra && extra.word) || word.toLowerCase();
    if (have.has(w) || out.some((o) => o.word === w)) return;
    out.push(Object.assign({ word: w, level, pos, kpos: pos, cat, display: word !== w ? word : '', alts: [], note: '' }, extra || {}));
  };
  CARD_S.forEach((w) => add(w, 'starters', 'num', 'number'));
  CARD_M.forEach((w) => add(w, 'movers', 'num', 'number'));
  CARD_F.forEach((w) => add(w, 'flyers', 'num', 'number'));
  ORD_M.forEach((w) => add(w, 'movers', 'num', 'number', { note: 'thứ tự' }));
  ORD_F.forEach((w) => add(w, 'flyers', 'num', 'number', { note: 'thứ tự' }));
  DAYS.forEach((w) => add(w, 'movers', 'n', 'time'));
  MONTHS.forEach((w) => (w === 'May' ? add('May', 'flyers', 'n', 'time', { word: 'may (month)', display: 'May' }) : add(w, 'flyers', 'n', 'time')));
  SEASONS.forEach((w) => add(w, 'flyers', 'n', 'time'));
  CONTINENTS.forEach((w) => add(w, 'ket', 'n', 'country'));
  COUNTRIES.forEach(([c, n]) => { add(c, 'ket', 'n', 'country'); add(n, 'ket', 'adj', 'nationality', { note: 'quốc tịch, ngôn ngữ' }); });
  add('Vietnam', 'other', 'n', 'country', { note: 'thêm cho lớp Việt Nam' });
  add('Vietnamese', 'other', 'adj', 'nationality', { note: 'thêm cho lớp Việt Nam' });
  return out;
}
