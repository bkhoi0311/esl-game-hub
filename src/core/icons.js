// Icon SVG từ bộ Lucide (mã nguồn mở). Chỉ import icon cần dùng để bản build nhỏ gọn.
import {
  ArrowLeftRight, BookOpen, Brush, Camera, Check, CircleCheck, CircleHelp, ClipboardPaste, Clock,
  Coins, Download, FileCode, Gamepad2, Grid3x3, Hand, House, Info, Lock, Minus, Pause,
  PersonStanding, Play, Plus, RefreshCcw, RotateCcw, ScanFace, Search, Settings, Swords, Timer,
  Trash2, TriangleAlert, Trophy, Upload, Users, Volume2, X,
} from 'lucide';

const ICONS = {
  'arrow-left-right': ArrowLeftRight, 'book-open': BookOpen, brush: Brush, camera: Camera,
  check: Check, 'circle-check': CircleCheck, help: CircleHelp, paste: ClipboardPaste, clock: Clock,
  coins: Coins, download: Download, 'file-code': FileCode, gamepad: Gamepad2, grid: Grid3x3,
  hand: Hand, home: House, info: Info, lock: Lock, minus: Minus, pause: Pause,
  'person-standing': PersonStanding, play: Play, plus: Plus, refresh: RefreshCcw,
  restart: RotateCcw, 'scan-face': ScanFace, search: Search, settings: Settings, swords: Swords,
  timer: Timer, trash: Trash2, alert: TriangleAlert, trophy: Trophy, upload: Upload,
  users: Users, volume: Volume2, x: X,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, size = 24) {
  const node = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const [tag, attrs] of node || []) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
    svg.appendChild(child);
  }
  return svg;
}
