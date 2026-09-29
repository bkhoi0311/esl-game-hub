// Thành phần giao diện dùng chung: tạo phần tử, nút, modal, hướng dẫn,
// bảng điểm đội (2-4 đội), đồng hồ đếm ngược, khung game (Hướng dẫn / Tạm dừng / Chơi lại / Về menu).
import { gsap } from 'gsap';
import { icon } from './icons.js';

// ---------- Tạo phần tử ----------

// h('button', { class: 'btn', onClick: fn }, 'Text', childNode)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'value' || key === 'innerHTML' || (key in el && typeof value !== 'string')) {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function button({ label, iconName, variant = 'default', onClick, title, size, attrs = {} }) {
  return h(
    'button',
    {
      type: 'button',
      class: `btn btn-${variant}${size ? ' btn-' + size : ''}${label ? '' : ' btn-icon'}`,
      title: title || label,
      'aria-label': title || label,
      onClick,
      ...attrs,
    },
    iconName ? icon(iconName, size === 'lg' ? 28 : 22) : null,
    label ? h('span', {}, label) : null,
  );
}

// ---------- Modal ----------

let openCount = 0;

// actions: [{ label, variant, iconName, onClick(close) }]. onClick trả false để giữ modal mở.
export function openModal({ title, body, actions = [], onClose, wide = false, dismissible = true }) {
  const previous = document.activeElement;
  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.body.classList.remove('modal-open');
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) close();
  };

  const footer = actions.length
    ? h(
        'div',
        { class: 'modal-actions' },
        actions.map((a) =>
          button({
            label: a.label,
            iconName: a.iconName,
            variant: a.variant || 'default',
            attrs: a.attrs || {},
            onClick: () => {
              if (a.onClick && a.onClick(close) === false) return;
              close();
            },
          }),
        ),
      )
    : null;

  const dialog = h(
    'div',
    { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', {}, title),
      dismissible ? button({ iconName: 'x', title: 'Đóng', variant: 'ghost', onClick: close }) : null,
    ),
    h('div', { class: 'modal-body' }, body),
    footer,
  );
  const overlay = h(
    'div',
    {
      class: 'modal-overlay',
      onPointerdown: (e) => {
        if (e.target === overlay && dismissible) close();
      },
    },
    dialog,
  );

  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKey);
  openCount++;
  const focusTarget = dialog.querySelector('.modal-actions .btn') || dialog.querySelector('.btn');
  if (focusTarget) focusTarget.focus();
  return { close, el: dialog };
}

export function confirmModal({ title, message, okLabel = 'Đồng ý', cancelLabel = 'Hủy', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title,
      body: h('p', {}, message),
      actions: [
        { label: cancelLabel, variant: 'ghost' },
        { label: okLabel, variant: danger ? 'danger' : 'primary', onClick: () => (result = true) },
      ],
      onClose: () => resolve(result),
    });
  });
}

// Modal hướng dẫn chơi: 1 màn hình, dưới 40 chữ (hiển thị cho học sinh nên dùng tiếng Anh).
export function showHowTo({ title, text, steps = [] }) {
  const words = [text, ...steps].join(' ').split(/\s+/).filter(Boolean).length;
  if (words >= 40) console.warn(`[howTo] "${title}" có ${words} chữ, nên dưới 40.`);
  return openModal({
    title: title || 'How to play',
    body: h(
      'div',
      { class: 'howto' },
      text ? h('p', { class: 'howto-lead' }, text) : null,
      steps.length ? h('ol', { class: 'howto-steps' }, steps.map((s) => h('li', {}, s))) : null,
    ),
    actions: [{ label: 'Got it!', variant: 'primary', iconName: 'check' }],
  });
}

// ---------- Thông báo nhanh ----------

let toastHost = null;

export function toast(message, type = 'info', ms = 2600) {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = h('div', { class: 'toast-host', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const iconName = type === 'error' ? 'alert' : type === 'success' ? 'circle-check' : 'info';
  const el = h('div', { class: `toast toast-${type}` }, icon(iconName, 20), h('span', {}, message));
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- Bảng điểm đội ----------

export const TEAM_COLORS = ['#ff5a00', '#0c6bed', '#04bc09', '#fd3cc6'];

// teams: ['Red', 'Blue', ...] (2-4 đội).
// Trả về { el, add(i, n), set(i, n), scores, highlight(i), reset(), onChange }.
export function createScoreboard(teams, { min = 0, controls = true, onChange, unit = '' } = {}) {
  const names = teams.slice(0, 4);
  while (names.length < 2) names.push(`Team ${names.length + 1}`);
  const scores = names.map(() => 0);
  const valueEls = [];
  const cards = [];

  const el = h('div', { class: 'scoreboard', style: { '--teams': names.length } });
  names.forEach((name, i) => {
    const value = h('div', { class: 'score-value' }, '0');
    valueEls.push(value);
    const card = h(
      'div',
      { class: 'score-team', style: { '--team': TEAM_COLORS[i] } },
      h('div', { class: 'score-name' }, name),
      h(
        'div',
        { class: 'score-row' },
        controls ? button({ iconName: 'minus', title: `${name} −1`, variant: 'ghost', onClick: () => api.add(i, -1) }) : null,
        value,
        controls ? button({ iconName: 'plus', title: `${name} +1`, variant: 'ghost', onClick: () => api.add(i, 1) }) : null,
      ),
    );
    cards.push(card);
    el.appendChild(card);
  });

  const render = (i, bump) => {
    valueEls[i].textContent = scores[i] + unit;
    if (bump) {
      valueEls[i].classList.remove('bump');
      void valueEls[i].offsetWidth; // chạy lại hiệu ứng
      valueEls[i].classList.add('bump');
    }
  };

  const api = {
    el,
    names,
    scores,
    add(i, n) {
      return api.set(i, scores[i] + n);
    },
    set(i, n) {
      const next = min == null ? n : Math.max(min, n);
      if (next === scores[i]) return scores[i];
      scores[i] = next;
      render(i, true);
      if (onChange) onChange([...scores], i);
      return next;
    },
    highlight(i) {
      cards.forEach((c, k) => c.classList.toggle('active', k === i));
    },
    reset() {
      scores.fill(0);
      scores.forEach((_, i) => render(i, false));
      api.highlight(-1);
    },
    ranking() {
      return names.map((name, i) => ({ name, score: scores[i], index: i })).sort((a, b) => b.score - a.score);
    },
  };
  return api;
}

// ---------- Đồng hồ đếm ngược ----------

// Trả về { el, start(), pause(), resume(), reset(sec), stop(), remaining, running }.
export function createCountdown({ seconds = 60, warnAt = 10, onTick, onEnd } = {}) {
  let total = seconds;
  let remaining = seconds;
  let running = false;
  let endAt = 0;
  let timer = null;

  const label = h('span', { class: 'countdown-label' });
  const ring = h('span', { class: 'countdown-ring' });
  const el = h('div', { class: 'countdown', role: 'timer', 'aria-live': 'off' }, ring, label);

  const fmt = (s) => {
    const sec = Math.ceil(s);
    return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
  };

  const render = () => {
    label.textContent = fmt(remaining);
    el.style.setProperty('--progress', total ? remaining / total : 0);
    el.classList.toggle('warn', remaining <= warnAt && remaining > 0);
    el.classList.toggle('done', remaining <= 0);
    el.classList.toggle('paused', !running && remaining > 0 && remaining < total);
  };

  const loop = () => {
    const prev = Math.ceil(remaining);
    remaining = Math.max(0, (endAt - performance.now()) / 1000);
    if (Math.ceil(remaining) !== prev && onTick) onTick(Math.ceil(remaining));
    render();
    if (remaining <= 0) {
      api.stop();
      if (onEnd) onEnd();
    }
  };

  const api = {
    el,
    get remaining() {
      return remaining;
    },
    get running() {
      return running;
    },
    start() {
      remaining = total;
      api.resume();
    },
    resume() {
      if (running || remaining <= 0) return;
      running = true;
      endAt = performance.now() + remaining * 1000;
      timer = setInterval(loop, 100);
      render();
    },
    pause() {
      if (!running) return;
      loop();
      running = false;
      clearInterval(timer);
      render();
    },
    stop() {
      running = false;
      clearInterval(timer);
      render();
    },
    reset(sec = total) {
      api.stop();
      total = sec;
      remaining = sec;
      render();
    },
  };
  render();
  return api;
}

// ---------- Khung game ----------

// Dựng thanh công cụ chuẩn cho mọi game. Trả về { el, stage, bar, setPaused(bool), destroy() }.
export function createGameFrame(root, { title, howTo, onPause, onResume, onRestart, onExit }) {
  let paused = false;
  const pauseBtn = button({
    label: 'Pause',
    iconName: 'pause',
    variant: 'ghost',
    onClick: () => api.setPaused(!paused),
  });
  const bar = h(
    'div',
    { class: 'game-bar' },
    h('h1', { class: 'game-title' }, title),
    h('div', { class: 'game-bar-extra' }),
    h(
      'div',
      { class: 'game-bar-actions' },
      howTo ? button({ label: 'How to play', iconName: 'help', variant: 'ghost', onClick: () => showHowTo(howTo) }) : null,
      pauseBtn,
      button({ label: 'Restart', iconName: 'restart', variant: 'ghost', onClick: () => onRestart && onRestart() }),
      button({ label: 'Menu', iconName: 'home', variant: 'ghost', onClick: () => (onExit ? onExit() : (location.hash = '#/')) }),
    ),
  );
  const stage = h('div', { class: 'game-stage' });
  const pauseLayer = h('div', { class: 'pause-layer', hidden: true }, h('div', { class: 'pause-text' }, 'Paused'));
  const el = h('div', { class: 'game-frame' }, bar, stage, pauseLayer);
  root.appendChild(el);

  const api = {
    el,
    bar,
    stage,
    extra: bar.querySelector('.game-bar-extra'),
    get paused() {
      return paused;
    },
    setPaused(value) {
      if (value === paused) return;
      paused = value;
      pauseLayer.hidden = !paused;
      pauseBtn.querySelector('span').textContent = paused ? 'Resume' : 'Pause';
      pauseBtn.replaceChild(icon(paused ? 'play' : 'pause', 22), pauseBtn.querySelector('svg'));
      if (paused && onPause) onPause();
      if (!paused && onResume) onResume();
    },
    destroy() {
      el.remove();
    },
  };
  pauseLayer.addEventListener('pointerdown', () => api.setPaused(false));
  return api;
}

// ---------- Dùng chung cho các game ----------

// Nút chọn 1 trong nhiều giá trị. options: [{ value, label }].
export function segmented(options, value, onChange, testId) {
  const el = h('div', { class: 'segmented has-thumb', role: 'group', 'data-testid': testId });
  // Viên trắng trượt tới lựa chọn mới theo lò xo (CSS .seg-thumb).
  const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  const place = () => {
    const on = el.querySelector('.btn[aria-pressed="true"]');
    if (!on || !on.offsetWidth) return;
    thumb.style.left = `${on.offsetLeft}px`;
    thumb.style.width = `${on.offsetWidth}px`;
  };
  el.append(thumb);
  const render = () => {
    [...el.children].forEach((c) => c !== thumb && c.remove()); // giữ viên trượt để nó trượt được
    options.forEach((o) =>
      el.append(
        button({
          label: o.label,
          attrs: { 'aria-pressed': String(o.value === value), disabled: o.disabled || null, 'data-value': o.value },
          onClick: () => {
            value = o.value;
            render();
            place();
            onChange(value);
          },
        }),
      ),
    );
  };
  render();
  // Đặt vị trí lần đầu khi đã gắn vào trang (chưa gắn thì chưa đo được).
  const first = () => (el.isConnected ? place() : requestAnimationFrame(first));
  requestAnimationFrame(first);
  if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(el);
  return el;
}

// Màn hình cài đặt trước khi chơi. rows: [{ label, hint, control }].
export function setupScreen({ gameId, title, rows, startLabel = 'Bắt đầu chơi', onStart, art }) {
  return h(
    'div', { class: 'setup' },
    h('div', { class: 'setup-card' },
      h('h2', {}, art || null, h('span', {}, title)),
      rows.map((r) => h('label', { class: 'setup-row' }, h('span', {}, r.label), r.control, r.hint ? h('small', {}, r.hint) : null)),
      h('div', { class: 'setup-actions' },
        button({ label: startLabel, iconName: 'play', variant: 'primary', size: 'lg', onClick: onStart, attrs: { 'data-testid': `${gameId}-start` } }))),
  );
}

// 3 nút đáp án A/B/C. Trả về { el, buttons }. Dùng pointerdown để 2 người chạm cùng lúc không chặn nhau.
export function answerButtons(options, onPick, { usePointer = false } = {}) {
  const el = h('div', { class: 'answers' });
  const buttons = options.map((text, i) => {
    const b = h('button', { type: 'button', class: 'answer-btn', 'data-index': i },
      h('span', { class: 'answer-key' }, 'ABC'[i]), h('span', { class: 'answer-text' }, text));
    if (usePointer) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!b.disabled) onPick(i, b);
      });
      b.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !b.disabled) onPick(i, b);
      });
    } else {
      b.addEventListener('click', () => !b.disabled && onPick(i, b));
    }
    el.append(b);
    return b;
  });
  return { el, buttons };
}

// Màn kết thúc: bảng xếp hạng + pháo giấy.
export function resultsScreen({ title = 'Final ranking', ranking, colors = TEAM_COLORS, unit = '', onReplay, onMenu }) {
  const el = h(
    'div', { class: 'results', 'data-testid': 'results' },
    icon('trophy', 80),
    h('h2', {}, title),
    h('ol', { class: 'rank-list' },
      ranking.map((r, k) =>
        h('li', { style: { '--team': colors[r.index] } },
          h('span', { class: 'rank-pos' }, `#${k + 1}`), h('span', {}, r.name), h('span', {}, `${r.score}${unit}`)))),
    h('div', { class: 'results-actions' },
      button({ label: 'Play again', iconName: 'restart', variant: 'primary', size: 'lg', onClick: onReplay }),
      button({ label: 'Menu', iconName: 'home', size: 'lg', onClick: onMenu || (() => (location.hash = '#/')) })),
  );
  el.querySelector('.icon').classList.add('trophy');
  // Khoảnh khắc thắng (skill game-feel-motion): cúp -> tiêu đề -> từng hạng (hạng 1 nổi bật) -> nút.
  requestAnimationFrame(() => {
    if (!el.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rows = el.querySelectorAll('.rank-list li');
    gsap.timeline({ defaults: { overwrite: 'auto' } })
      .from(el.querySelector('.trophy'), { scale: 0.5, rotation: -14, opacity: 0, duration: 0.55, ease: 'back.out(2.2)', clearProps: 'transform,opacity' })
      .from(el.querySelector('h2'), { y: 16, opacity: 0, duration: 0.35, ease: 'power2.out', clearProps: 'transform,opacity' }, '-=0.25')
      .from(rows, { x: -28, opacity: 0, duration: 0.35, ease: 'power2.out', stagger: 0.12, clearProps: 'transform,opacity' }, '-=0.1')
      .fromTo(rows[0] || [], { scale: 1 }, { scale: 1.05, duration: 0.18, ease: 'power1.out', yoyo: true, repeat: 1, clearProps: 'transform' })
      .from(el.querySelectorAll('.results-actions .btn'), { y: 10, opacity: 0, duration: 0.3, ease: 'power2.out', stagger: 0.06, clearProps: 'transform,opacity' }, '-=0.1');
  });
  return el;
}

// Game cần màn hình lớn (bảng tương tác).
export function isSmallScreen() {
  return document.body.classList.contains('fluid') || window.innerWidth < 700;
}
