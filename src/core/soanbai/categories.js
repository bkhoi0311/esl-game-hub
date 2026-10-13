import { lang } from '../../i18n/index.js';

// Bộ nhãn category cố định (PLAN-SOANBAI mục A3). Module thuần: dùng chung cho runtime, script và test.
// phrase: cụm dùng trong câu "Which one is ...?"; group: siêu nhóm để chọn đáp án nhiễu không mơ hồ.
export const CATEGORIES = {
  fruit: { phrase: 'a fruit', group: 'food', vi: 'Trái cây', en: 'Fruit', which: true },
  vegetable: { phrase: 'a vegetable', group: 'food', vi: 'Rau củ', en: 'Vegetables', which: true },
  drink: { phrase: 'a drink', group: 'food', vi: 'Đồ uống', en: 'Drinks', which: true },
  meal: { phrase: 'a kind of meal', group: 'food', vi: 'Bữa ăn, món ăn', en: 'Meals and dishes' },
  food: { phrase: 'a kind of food', group: 'food', vi: 'Đồ ăn', en: 'Food' },
  animal: { phrase: 'an animal', group: 'living', vi: 'Động vật', en: 'Animals', which: true },
  bird: { phrase: 'a bird', group: 'living', vi: 'Chim', en: 'Birds', which: true },
  insect: { phrase: 'an insect', group: 'living', vi: 'Côn trùng', en: 'Insects', which: true },
  'sea-animal': { phrase: 'a sea animal', group: 'living', vi: 'Động vật biển', en: 'Sea animals', which: true },
  plant: { phrase: 'a plant', group: 'living', vi: 'Cây cối', en: 'Plants' },
  family: { phrase: 'a family member', group: 'people', vi: 'Gia đình', en: 'Family', which: true },
  people: { phrase: 'a person', group: 'people', vi: 'Con người', en: 'People' },
  job: { phrase: 'a job', group: 'people', vi: 'Nghề nghiệp', en: 'Jobs', which: true },
  body: { phrase: 'a part of the body', group: 'body', vi: 'Cơ thể', en: 'Body', which: true },
  clothes: { phrase: 'something you wear', group: 'things', vi: 'Quần áo', en: 'Clothes', which: true },
  house: { phrase: 'a thing in the house', group: 'things', vi: 'Trong nhà', en: 'At home' },
  school: { phrase: 'a school thing', group: 'things', vi: 'Trường học', en: 'School' },
  toy: { phrase: 'a toy', group: 'things', vi: 'Đồ chơi', en: 'Toys' },
  tech: { phrase: 'a machine or gadget', group: 'things', vi: 'Máy móc, công nghệ', en: 'Machines and technology' },
  thing: { phrase: 'an everyday object', group: 'things', vi: 'Đồ vật', en: 'Everyday objects' },
  transport: { phrase: 'a vehicle', group: 'transport', vi: 'Phương tiện', en: 'Transport', which: true },
  place: { phrase: 'a place', group: 'place', vi: 'Địa điểm', en: 'Places' },
  nature: { phrase: 'a thing in nature', group: 'nature', vi: 'Thiên nhiên', en: 'Nature' },
  weather: { phrase: 'a weather word', group: 'nature', vi: 'Thời tiết', en: 'Weather' },
  space: { phrase: 'a thing in space', group: 'nature', vi: 'Vũ trụ', en: 'Space' },
  sport: { phrase: 'a sport', group: 'activity', vi: 'Thể thao', en: 'Sports', which: true },
  hobby: { phrase: 'a free-time activity', group: 'activity', vi: 'Sở thích', en: 'Hobbies' },
  music: { phrase: 'a music word', group: 'activity', vi: 'Âm nhạc', en: 'Music' },
  celebration: { phrase: 'a celebration', group: 'activity', vi: 'Lễ hội', en: 'Festivals' },
  fantasy: { phrase: 'a fantasy character', group: 'fantasy', vi: 'Truyện thần tiên', en: 'Fairy tales' },
  color: { phrase: 'a colour', group: 'color', vi: 'Màu sắc', en: 'Colors', which: true },
  number: { phrase: 'a number', group: 'number', vi: 'Số', en: 'Numbers', which: true },
  shape: { phrase: 'a shape', group: 'describe', vi: 'Hình khối', en: 'Shapes' },
  feeling: { phrase: 'a feeling', group: 'describe', vi: 'Cảm xúc', en: 'Feelings' },
  time: { phrase: 'a time word', group: 'describe', vi: 'Thời gian', en: 'Time' },
  action: { phrase: 'an action', group: 'action', vi: 'Hành động', en: 'Actions' },
  describe: { phrase: 'a describing word', group: 'describe', vi: 'Từ miêu tả', en: 'Describing words' },
  // ---- Bộ nhãn mở rộng cho cấp KET/PET (PLAN-LEVELS mục 2.8). pos: loại từ cho phép; which: bật "Which one is ...?" ----
  health: { phrase: 'a health word', group: 'health', vi: 'Sức khoẻ', en: 'Health', pos: ['n'] },
  material: { phrase: 'a material', group: 'material', vi: 'Chất liệu', en: 'Materials', pos: ['n'], which: true },
  subject: { phrase: 'a school subject', group: 'learning', vi: 'Môn học', en: 'School subjects', pos: ['n'], which: true },
  study: { phrase: 'a study word', group: 'learning', vi: 'Học tập', en: 'Studying', pos: ['n'] },
  work: { phrase: 'a work word', group: 'work', vi: 'Công việc', en: 'Work', pos: ['n'] },
  money: { phrase: 'a money word', group: 'money', vi: 'Tiền, mua bán', en: 'Money and shopping', pos: ['n'] },
  travel: { phrase: 'a travel word', group: 'travel', vi: 'Du lịch', en: 'Travel', pos: ['n'] },
  media: { phrase: 'a media word', group: 'media', vi: 'Truyền thông, giải trí', en: 'Media and entertainment', pos: ['n'] },
  environment: { phrase: 'an environment word', group: 'nature', vi: 'Môi trường', en: 'Environment', pos: ['n'] },
  measure: { phrase: 'a measurement', group: 'number', vi: 'Đo lường', en: 'Measurements', pos: ['n'], which: true },
  country: { phrase: 'a country', group: 'place', vi: 'Quốc gia, châu lục', en: 'Countries and continents', pos: ['n'], which: true },
  nationality: { phrase: 'a nationality word', group: 'country', vi: 'Quốc tịch, ngôn ngữ', en: 'Nationalities and languages', pos: ['adj', 'n'] },
  abstract: { phrase: 'an idea word', group: 'abstract', vi: 'Từ trừu tượng', en: 'Abstract words', pos: ['n'] },
  character: { phrase: "a word for someone's character", group: 'character', vi: 'Tính cách', en: 'Personality', pos: ['adj'] },
  opinion: { phrase: 'an opinion word', group: 'opinion', vi: 'Nhận xét', en: 'Opinions', pos: ['adj'] },
  manner: { phrase: 'a word for how you do something', group: 'manner', vi: 'Cách thức', en: 'How you do things', pos: ['adv', 'phr'] },
  motion: { phrase: 'a moving verb', group: 'motion', vi: 'Di chuyển', en: 'Movement', pos: ['v'] },
  speech: { phrase: 'a talking verb', group: 'speech', vi: 'Nói, giao tiếp', en: 'Talking', pos: ['v'] },
  mind: { phrase: 'a thinking verb', group: 'mind', vi: 'Suy nghĩ', en: 'Thinking', pos: ['v'] },
  daily: { phrase: 'an everyday verb', group: 'daily', vi: 'Việc hằng ngày', en: 'Daily routines', pos: ['v'] },
  function: { phrase: 'a grammar word', group: 'function', vi: 'Từ chức năng', en: 'Function words', pos: ['other', 'prep', 'pron', 'adv', 'phr'] },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

export const POS_LIST = ['n', 'v', 'adj', 'adv', 'prep', 'pron', 'num', 'phr', 'other'];
export const LEVELS = ['starters', 'movers', 'flyers', 'ket', 'pet', 'other'];
export const LEVEL_CODES = { starters: 's', movers: 'm', flyers: 'f', ket: 'k', pet: 'p', other: 'o' };
export const LEVEL_ORDER = { starters: 0, movers: 1, flyers: 2, ket: 3, pet: 4, other: 5 };
export const LEVEL_LABEL = { starters: 'Pre A1 Starters', movers: 'A1 Movers', flyers: 'A2 Flyers', ket: 'A2 Key (KET)', pet: 'B1 Preliminary (PET)', other: 'Mở rộng' }; // i18n-keep: dữ liệu (levelLabel lưu trong thư viện); giao diện dùng t('level.other')

// Nhóm có ranh giới tự nhiên: dùng cho câu "Which one is ...?" (cờ which trong CATEGORIES). qrules.js re-export.
export const WHICH_CATS = new Set(Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].which === true));

// Loại từ cho phép của nhãn (nhãn cũ không giới hạn loại từ). pos theo POS_LIST của kho.
export function catAllowsPos(cat, pos) {
  const k = String(cat || '').trim().toLowerCase();
  if (!isKnownCategory(k)) return false;
  const allowed = CATEGORIES[k].pos;
  return !allowed || allowed.indexOf(pos) >= 0;
}

export function isKnownCategory(cat) {
  return Object.prototype.hasOwnProperty.call(CATEGORIES, String(cat || '').trim().toLowerCase());
}

function key(cat) {
  return String(cat || '').trim().toLowerCase();
}

// Category giáo viên tự gõ ngoài bộ: phrase = "a/an <cat>" (tự đoán a/an), siêu nhóm = chính nó.
export function phraseFor(cat) {
  const k = key(cat);
  if (isKnownCategory(k)) return CATEGORIES[k].phrase;
  if (!k) return '';
  return (/^[aeiou]/.test(k) ? 'an ' : 'a ') + k;
}

export function groupOf(cat) {
  const k = key(cat);
  if (isKnownCategory(k)) return CATEGORIES[k].group;
  return k ? 'custom:' + k : '';
}

// Tên nhóm hiển thị theo ngôn ngữ giao diện; nhóm giáo viên tự gõ trả nguyên văn.
export function catLabel(cat) {
  const k = key(cat);
  if (!isKnownCategory(k)) return String(cat == null ? '' : cat);
  return lang() === 'en' ? CATEGORIES[k].en : CATEGORIES[k].vi;
}
