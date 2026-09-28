// Danh sách giọng OmniVoice, câu dẫn của game và cách đặt tên file âm thanh.
// File thuần JS (không DOM) để cả app và script Node (tools/voices/texts.mjs) cùng dùng.

// 8 giọng giáo viên đã chọn (28/09/2026). instruct/seed: cách tạo giọng gốc bằng OmniVoice.
export const VOICES = [
  { id: 'v01', label: 'Bé gái (Mỹ)', sample: '01_girl_child_us' },
  { id: 'v02', label: 'Bé trai (Mỹ)', sample: '02_boy_child_us' },
  { id: 'v03', label: 'Nữ thiếu niên (Mỹ)', sample: '03_girl_teen_us' },
  { id: 'v04', label: 'Nam thiếu niên (Anh)', sample: '04_boy_teen_uk' },
  { id: 'v05', label: 'Nữ trẻ (Mỹ)', sample: '05_woman_young_us' },
  { id: 'v06', label: 'Nam trẻ (Mỹ)', sample: '06_man_young_us' },
  { id: 'v09', label: 'Nữ trung niên (Mỹ)', sample: '09_woman_middle_us' },
  { id: 'v12', label: 'Ông lớn tuổi (Mỹ)', sample: '12_man_elder_us' },
];

// Giọng dẫn mặc định của từng game (giáo viên đổi được trong Cài đặt).
export const GAME_VOICE = {
  'statue-freeze': 'v06',
  'simon-pose': 'v12',
  'head-tilt': 'v03',
  'word-ninja': 'v04',
  'gold-heist': 'v02',
  impostor: 'v05',
  'tug-of-war': 'v06',
  'whack-word': 'v01',
  'balloon-pop': 'v09',
  'memory-match': 'v12',
  'tic-tac-toe': 'v06',
};
export const DEFAULT_VOICE = 'v05';

export const DEFAULT_TEAMS = ['Red', 'Blue', 'Green', 'Pink'];

// Câu dẫn cố định. {team} được thay bằng tên đội.
export const LINES = {
  letsPlay: "Let's play!",
  correct: 'Correct!',
  tryAgain: 'Oh no! Try again.',
  timesUp: "Time's up!",
  greatJob: 'Great job!',
  tie: "It's a tie!",
  teamTurn: '{team} team, your turn!',
  teamWins: '{team} team wins!',
  // Gold Heist
  goldWelcome: 'Welcome to Gold Heist!',
  pickChest: 'Pick a treasure chest!',
  // Impostor Word
  findImpostor: 'Find the impostor!',
  // Tug of War
  readyPull: 'Ready, set, pull!',
  // Statue Freeze
  standStill: 'Everybody, stand still.',
  freeze: 'Freeze!',
  // Whack-a-Word
  whackStart: 'Whack the right word!',
  // Memory Match
  findPairs: 'Find the pairs!',
  match: "It's a match!",
  // Tic-Tac-Toe Quiz
  threeInRow: 'Three in a row!',
};

export function line(key, vars = {}) {
  return (LINES[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// Chuẩn hoá câu trước khi đọc: "___" đọc thành 1 nhịp ngừng, gộp khoảng trắng.
export function speakable(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/_{2,}/g, ' ... ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Khoá file âm thanh: FNV-1a 32 bit của câu đã chuẩn hoá (chữ thường).
export function clipKey(text) {
  const s = speakable(text).toLowerCase();
  const bytes = new TextEncoder().encode(s);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Câu giải thích của Impostor Word (dùng chung với game).
function plural(noun) {
  if (/[^aeiou]y$/i.test(noun)) return noun.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(noun)) return noun + 'es';
  return noun + 's';
}
export function balloonTarget(category) {
  return `Pop only ${plural(category)}!`;
}
export function ninjaTarget(category) {
  return `Slice only ${plural(category)}!`;
}
export function impostorExplain(major, odd) {
  return `4 are ${plural(major)}, 1 is ${/^[aeiou]/i.test(odd) ? 'an' : 'a'} ${odd}.`;
}

// Simon Says Pose: câu lệnh của 8 tư thế.
export const SIMON_POSES = {
  'left-hand': 'raise your left hand',
  'right-hand': 'raise your right hand',
  'hands-up': 'hands up',
  'hands-on-head': 'put your hands on your head',
  't-pose': 'put your arms out',
  'touch-nose': 'touch your nose',
  'one-leg': 'stand on one leg',
  squat: 'squat down',
};
export function simonCommand(text, simonSays) {
  return simonSays ? `Simon says, ${text}.` : `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// Câu mỗi game cần đọc, theo bộ nội dung.
export function textsForGame(gameId, pack) {
  const vocab = (pack.vocab || []).filter((v) => v && v.word);
  const words = vocab.map((v) => v.word);
  const teams = [...new Set([...(pack.teams || []), ...DEFAULT_TEAMS])];
  const perTeam = (key) => teams.map((team) => line(key, { team }));
  const cats = [...new Set(vocab.map((v) => String(v.category || '').toLowerCase()).filter(Boolean))];
  const prompts = (pack.questions || []).map((q) => q.prompt);
  const common = [line('letsPlay'), line('greatJob'), line('tie')];
  switch (gameId) {
    case 'gold-heist':
      return [...common, ...prompts, line('goldWelcome'), line('pickChest'), line('correct'), line('tryAgain'), ...perTeam('teamTurn'), ...perTeam('teamWins')];
    case 'impostor':
      return [...common, ...words, line('findImpostor'), line('correct'), line('tryAgain'),
        ...cats.flatMap((a) => cats.filter((b) => b !== a).map((b) => impostorExplain(a, b)))];
    case 'tug-of-war':
      return [...common, line('readyPull'), ...teams.map((t) => `${t} wins!`)];
    case 'whack-word':
      return [...common, ...words, line('whackStart'), line('timesUp'), ...teams.map((t) => `${t} wins!`)];
    case 'balloon-pop':
      return [...common, ...cats.map(balloonTarget), line('timesUp'), ...teams.map((t) => `${t} wins!`)];
    case 'memory-match':
      return [...common, ...words, line('findPairs'), line('match'), ...perTeam('teamTurn'), ...perTeam('teamWins')];
    case 'tic-tac-toe':
      return [...common, ...prompts, line('correct'), line('tryAgain'), line('threeInRow'), ...perTeam('teamTurn'), ...perTeam('teamWins')];
    case 'head-tilt':
      return [...common, ...prompts, line('correct'), line('tryAgain')];
    case 'word-ninja':
      return [...common, ...cats.map(ninjaTarget), line('timesUp'), line('tryAgain')];
    case 'simon-pose':
      return [...common, ...Object.values(SIMON_POSES).flatMap((t) => [simonCommand(t, true), simonCommand(t, false)])];
    case 'statue-freeze':
      return [...common, ...(pack.actionCommands || []), line('standStill'), line('freeze')];
    default:
      return [];
  }
}

// Câu cần thu cho từng giọng: giọng dẫn của game thu câu của game đó;
// giọng mặc định thu tất cả (dùng khi nghe thử trong Soạn bài và làm giọng dự phòng).
export function textsByVoice(pack) {
  const byVoice = {};
  const add = (vid, list) => {
    const set = (byVoice[vid] ||= new Set());
    list.forEach((t) => {
      const s = speakable(t);
      if (s) set.add(s);
    });
  };
  for (const [gameId, vid] of Object.entries(GAME_VOICE)) {
    const list = textsForGame(gameId, pack);
    add(vid, list);
    add(DEFAULT_VOICE, list);
  }
  const vocab = (pack.vocab || []).filter((v) => v && v.word);
  add(DEFAULT_VOICE, [...vocab.map((v) => v.word), ...vocab.map((v) => v.example)]);
  return Object.fromEntries(Object.entries(byVoice).map(([k, v]) => [k, [...v]]));
}
