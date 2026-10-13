import { t, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/soanbai.vi.js';
import CORE_VI from '../../i18n/strings/core.vi.js';

addStrings('soanbai', VI);
addStrings('core', CORE_VI);

// Phần thuần của Thư viện bài (không DOM, không import.meta.glob) để test bằng Node. library.js re-export.
// Thứ tự tab người dùng muốn. Gói chung (general) chỉ hiện ở "Tất cả chủ đề".
export const LIB_LEVELS = [
  { value: 'all', get label() { return t('sb.lib.all'); } },
  { value: 'movers', label: 'A1 Movers' },
  { value: 'starters', label: 'Pre A1 Starters' },
  { value: 'flyers', label: 'A2 Flyers' },
  { value: 'ket', label: 'A2 Key (KET)' },
  { value: 'pet', label: 'B1 Preliminary (PET)' },
];

// Chip chủ đề: bấm thay cho gõ chữ (bàn phím ảo của ClassIn che màn hình). re khớp trên tên EN + VI không dấu.
export const LIB_THEMES = [
  { value: 'animal', get label() { return t('sb.theme.animal'); }, re: /animal|\bpets?\b|farm|bird|insect|dong vat|thu cung|vat nuoi|sinh vat|con trung|plants?\b/ },
  { value: 'food', get label() { return t('sb.theme.food'); }, re: /food|drink|fruit|vegetable|meal|kitchen|cook|ingredient|restaurant|cafe|do an|do uong|\brau\b|trai cay|bua an|nau an|nha hang/ },
  { value: 'home', get label() { return t('sb.theme.home'); }, re: /house|home|\brooms?\b|furniture|building|household|\bnha\b|do dac|nha cua/ },
  { value: 'school', get label() { return t('sb.theme.school'); }, re: /school|class|learn|study|studying|education|universit|exam|subject|truong|lop hoc|hoc tap|do dung|mon hoc/ },
  { value: 'body', get label() { return t('sb.theme.body'); }, re: /body|face|health|clothes|clothing|dress|fashion|fitness|illness|medicine|senses|co the|quan ao|suc khoe|benh|thoi trang/ },
  { value: 'sport', get label() { return t('sb.theme.sport'); }, re: /\bsports?\b|game|hobb|\btoys?\b|music|film|outdoor|entertainment|competition|the thao|so thich|tro choi|do choi|am nhac|giai tri/ },
  { value: 'place', get label() { return t('sb.theme.place'); }, re: /place|town|city|countryside|transport|travel|journey|airport|holiday|tourism|countr|continent|direction|geography|landscape|nature|environment|weather|climate|sky|space|beach|\bnoi\b|thanh pho|di chuyen|thien nhien|thoi tiet|giao thong|du lich|quoc gia|phuong huong|moi truong/ },
  { value: 'number', get label() { return t('sb.theme.number'); }, re: /number|ordinal|\btime\b|periods?|\bdays?\b|month|quantity|measure|maths|often|\bso\b|thoi gian|ngay|thang|do luong/ },
  { value: 'action', get label() { return t('sb.theme.action'); }, re: /verb|action|adjective|describ|feeling|opinion|adverb|opposite|thinking|movement|moving|doing|phrasal|phrases|prepositions|useful|dong tu|tinh tu|cam xuc|mieu ta|y kien|trang tu|trai nghia|cum tu/ },
  { value: 'people', get label() { return t('sb.theme.people'); }, re: /famil|friend|people|\bjobs?\b|work|career|profession|occupation|character|personality|behaviour|manners|relationship|roles|interview|police|law\b|politic|society|gia dinh|ban be|nghe nghiep|cong viec|tinh cach|con nguoi/ },
  { value: 'money', get label() { return t('sb.theme.money'); }, re: /shop|money|price|bank|business|technolog|computer|device|internet|phone|media|news|document|forms|books|reading|communicat|messages|social|mua sam|tien bac|cong nghe|may tinh|tin tuc|sach/ },
  { value: 'culture', get label() { return t('sb.theme.culture'); }, re: /science|discover|art\b|culture|history|tradition|festival|celebrat|colou?rs?|shapes?|materials?|drawing|fairy|adventure|old and new|rules|khoa hoc|van hoa|lich su|le hoi|mau sac|hinh|truyen|phieu luu/ },
];

// Bỏ dấu tiếng Việt, thường hoá: "Đồ ăn" -> "do an".
export function foldText(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Số gói theo cấp (chỉ gói có cấp, không tính gói chung) + tổng.
export function countByLevel(index) {
  const c = { all: index.length };
  index.forEach((x) => { if (!x.general) c[x.level] = (c[x.level] || 0) + 1; });
  return c;
}

// Tab nào hiện: 'all' luôn có, cấp khác chỉ hiện khi có gói.
export function visibleLevels(index) {
  const c = countByLevel(index);
  return LIB_LEVELS.filter((l) => l.value === 'all' || c[l.value] > 0);
}

// Lọc gói theo tab, chip chủ đề, ô tìm (tên EN, tên VI, toàn bộ từ). Trả mảng theo thứ tự index.
export function filterPacks(index, { level = 'all', theme = '', q = '' } = {}) {
  const th = LIB_THEMES.find((x) => x.value === theme);
  const words = foldText(q).split(' ').filter(Boolean);
  return index.filter((x) => {
    if (level !== 'all' && (x.general || x.level !== level)) return false;
    const head = foldText(x.title + ' ' + x.titleVi);
    if (th && !th.re.test(head)) return false;
    if (words.length) {
      const hay = head + ' ' + foldText(x.kw || (x.preview || []).join(' '));
      if (!words.every((w) => hay.indexOf(w) >= 0)) return false;
    }
    return true;
  });
}

// Nhãn cấp trên thẻ: gói mới ghi thẳng cấp; gói chung ghi "gợi ý <cấp>".
export function levelTag(x) {
  const lab = x.level === 'other' ? t('level.other') : x.levelLabel || (LIB_LEVELS.find((l) => l.value === x.level) || { label: '' }).label;
  return x.general ? t('sb.lib.suggested', { level: lab }) : lab;
}
