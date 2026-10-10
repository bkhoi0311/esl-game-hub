// Bộ nhãn category cố định (PLAN-SOANBAI mục A3). Module thuần: dùng chung cho runtime, script và test.
// phrase: cụm dùng trong câu "Which one is ...?"; group: siêu nhóm để chọn đáp án nhiễu không mơ hồ.
export const CATEGORIES = {
  fruit: { phrase: 'a fruit', group: 'food', vi: 'Trái cây' },
  vegetable: { phrase: 'a vegetable', group: 'food', vi: 'Rau củ' },
  drink: { phrase: 'a drink', group: 'food', vi: 'Đồ uống' },
  meal: { phrase: 'a kind of meal', group: 'food', vi: 'Bữa ăn, món ăn' },
  food: { phrase: 'a kind of food', group: 'food', vi: 'Đồ ăn' },
  animal: { phrase: 'an animal', group: 'living', vi: 'Động vật' },
  bird: { phrase: 'a bird', group: 'living', vi: 'Chim' },
  insect: { phrase: 'an insect', group: 'living', vi: 'Côn trùng' },
  'sea-animal': { phrase: 'a sea animal', group: 'living', vi: 'Động vật biển' },
  plant: { phrase: 'a plant', group: 'living', vi: 'Cây cối' },
  family: { phrase: 'a family member', group: 'people', vi: 'Gia đình' },
  people: { phrase: 'a person', group: 'people', vi: 'Con người' },
  job: { phrase: 'a job', group: 'people', vi: 'Nghề nghiệp' },
  body: { phrase: 'a part of the body', group: 'body', vi: 'Cơ thể' },
  clothes: { phrase: 'something you wear', group: 'things', vi: 'Quần áo' },
  house: { phrase: 'a thing in the house', group: 'things', vi: 'Trong nhà' },
  school: { phrase: 'a school thing', group: 'things', vi: 'Trường học' },
  toy: { phrase: 'a toy', group: 'things', vi: 'Đồ chơi' },
  tech: { phrase: 'a machine or gadget', group: 'things', vi: 'Máy móc, công nghệ' },
  thing: { phrase: 'an everyday object', group: 'things', vi: 'Đồ vật' },
  transport: { phrase: 'a vehicle', group: 'transport', vi: 'Phương tiện' },
  place: { phrase: 'a place', group: 'place', vi: 'Địa điểm' },
  nature: { phrase: 'a thing in nature', group: 'nature', vi: 'Thiên nhiên' },
  weather: { phrase: 'a weather word', group: 'nature', vi: 'Thời tiết' },
  space: { phrase: 'a thing in space', group: 'nature', vi: 'Vũ trụ' },
  sport: { phrase: 'a sport', group: 'activity', vi: 'Thể thao' },
  hobby: { phrase: 'a free-time activity', group: 'activity', vi: 'Sở thích' },
  music: { phrase: 'a music word', group: 'activity', vi: 'Âm nhạc' },
  celebration: { phrase: 'a celebration', group: 'activity', vi: 'Lễ hội' },
  fantasy: { phrase: 'a fantasy character', group: 'fantasy', vi: 'Truyện thần tiên' },
  color: { phrase: 'a colour', group: 'color', vi: 'Màu sắc' },
  number: { phrase: 'a number', group: 'number', vi: 'Số' },
  shape: { phrase: 'a shape', group: 'describe', vi: 'Hình khối' },
  feeling: { phrase: 'a feeling', group: 'describe', vi: 'Cảm xúc' },
  time: { phrase: 'a time word', group: 'describe', vi: 'Thời gian' },
  action: { phrase: 'an action', group: 'action', vi: 'Hành động' },
  describe: { phrase: 'a describing word', group: 'describe', vi: 'Từ miêu tả' },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

export const POS_LIST = ['n', 'v', 'adj', 'adv', 'prep', 'pron', 'num', 'phr', 'other'];
export const LEVELS = ['starters', 'movers', 'flyers', 'ket', 'other'];
export const LEVEL_CODES = { starters: 's', movers: 'm', flyers: 'f', ket: 'k', other: 'o' };

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
