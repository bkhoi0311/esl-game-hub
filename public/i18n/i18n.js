/* Lõi song ngữ Việt / English cho màn chọn (public/start) và Bảng nhiều người viết (public/board).
   Script thường (không phải module), gắn vào window.I18N. Không fetch, hợp CSP script-src 'self'.
   Thứ tự chọn ngôn ngữ: ?ui= > localStorage 'eslhub.ui' > 'vi'. KHÔNG BAO GIỜ đọc tham số `lang` (ClassIn tự gắn lang=en).
   Chỉ dùng tính năng có từ Chromium 84 (ClassIn X dùng Chromium 109). Xem PLAN-I18N.md. */
(function (root) {
  'use strict';
  var KEY = 'eslhub.ui';
  var LANGS = ['vi', 'en'];
  var dict = { vi: {}, en: {} };
  var listeners = [];
  var cur = 'vi';
  var missing = [];

  function valid(l) { return l === 'vi' || l === 'en'; }

  // Thuần: để unit test. ui hợp lệ > storage hợp lệ > 'vi'; storage ném lỗi thì bỏ qua.
  function resolve(search, storage) {
    var m = /[?&]ui=([^&#]*)/.exec(search || '');
    if (m && valid(m[1])) return m[1];
    try {
      var s = storage && storage.getItem(KEY);
      if (valid(s)) return s;
    } catch (e) { /* cửa sổ không giữ localStorage */ }
    return 'vi';
  }

  function store(l) { try { root.localStorage.setItem(KEY, l); } catch (e) { /* bỏ qua */ } }
  function readStore() { try { return root.localStorage; } catch (e) { return null; } }

  function add(d) {
    for (var i = 0; i < LANGS.length; i++) {
      var l = LANGS[i], src = d && d[l];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) dict[l][k] = src[k];
    }
    // <title data-i18n> nằm trong <head>: dịch ngay khi có chuỗi (tránh nháy tiêu đề tab)
    try {
      var ti = root.document && root.document.querySelector('title[data-i18n]');
      if (ti && cur !== 'vi') applyOne(ti);
    } catch (e) { /* bỏ qua */ }
  }

  function fmt(v, params) {
    if (v && typeof v === 'object') v = params && params.n === 1 ? v.one : v.other;   // số nhiều tiếng Anh
    if (typeof v !== 'string') return v;
    return v.replace(/\{(\w+)\}/g, function (m, p) {
      if (params && params[p] != null) return String(params[p]);
      if (root.__i18nStrict) missing.push('param:' + p + ' in ' + v);
      return m;
    });
  }

  function tIn(l, key, params) {
    var v = dict[l] && dict[l][key];
    if (v == null) v = dict.vi[key];
    if (v == null) {
      missing.push(key);
      try { if (root.console && /[?&]test=1/.test(root.location.search)) root.console.error('[i18n] thiếu khoá ' + key); } catch (e) { /* bỏ qua */ }
      return key;
    }
    return fmt(v, params);
  }
  function t(key, params) { return tIn(cur, key, params); }

  function readArgs(el) {
    var a = el.getAttribute('data-i18n-args');
    if (!a) return null;
    try { return JSON.parse(a); } catch (e) { return null; }
  }

  function applyOne(el) {
    var k = el.getAttribute('data-i18n');
    var ka = el.getAttribute('data-i18n-aria');
    var kt = el.getAttribute('data-i18n-title');
    var vi = el.getAttribute('data-i18n-vi');
    var args = (k || ka || kt) ? readArgs(el) : null;
    var v;
    if (k) { v = t(k, args); if (el.textContent !== v) el.textContent = v; }
    if (ka) { v = t(ka, args); if (el.getAttribute('aria-label') !== v) el.setAttribute('aria-label', v); }
    if (kt) { v = t(kt, args); if (el.getAttribute('title') !== v) el.setAttribute('title', v); }
    if (vi != null) {
      v = cur === 'en' ? (el.getAttribute('data-i18n-en') || vi) : vi;
      if (el.textContent !== v) el.textContent = v;
    }
  }

  function apply(rootEl) {
    var d = root.document;
    if (!d) return;
    var base = rootEl || d;
    try { d.documentElement.lang = cur; } catch (e) { /* bỏ qua */ }
    var list = base.querySelectorAll('[data-i18n],[data-i18n-aria],[data-i18n-title],[data-i18n-vi]');
    for (var i = 0; i < list.length; i++) applyOne(list[i]);
    if (base.nodeType === 1 && (base.hasAttribute('data-i18n') || base.hasAttribute('data-i18n-aria') || base.hasAttribute('data-i18n-title') || base.hasAttribute('data-i18n-vi'))) applyOne(base);
  }

  // Gắn khoá vào phần tử và dịch ngay. attr: 'text' | 'aria-label' | 'title'
  function bind(el, key, params, attr) {
    var name = attr === 'aria-label' || attr === 'aria' ? 'data-i18n-aria' : attr === 'title' ? 'data-i18n-title' : 'data-i18n';
    el.setAttribute(name, key);
    if (params) el.setAttribute('data-i18n-args', JSON.stringify(params));
    else if (el.hasAttribute('data-i18n-args')) el.removeAttribute('data-i18n-args');
    applyOne(el);
    return el;
  }
  function bindPair(el, pair) {
    el.setAttribute('data-i18n-vi', pair.vi);
    el.setAttribute('data-i18n-en', pair.en);
    applyOne(el);
    return el;
  }

  function onLang(fn) {
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  function setLang(l, o) {
    o = o || {};
    if (!valid(l)) return false;
    var changed = l !== cur;
    cur = l;
    if (o.persist !== false) store(l);
    if (o.url !== false) {
      try {
        var loc = root.location;
        var search = (loc.search || '').replace(/([?&])ui=[^&#]*(&|$)/, function (m, a, b) { return b ? a : ''; });
        search = search.replace(/[?&]$/, '');
        search += (search ? '&' : '?') + 'ui=' + l;
        root.history.replaceState(null, '', loc.pathname + search + (loc.hash || ''));
      } catch (e) { /* bỏ qua */ }
    }
    apply();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](l, changed); } catch (e) { try { root.console.error(e); } catch (e2) { /* bỏ qua */ } }
    }
    return true;
  }

  // Thêm / thay ?ui= vào liên kết, giữ query cũ và hash. Tiếng Việt (mặc định): bỏ ui để liên kết giữ nguyên như trước.
  function withUi(href, l) {
    l = l || cur;
    var hi = href.indexOf('#');
    var hash = hi >= 0 ? href.slice(hi) : '';
    var rest = hi >= 0 ? href.slice(0, hi) : href;
    var qi = rest.indexOf('?');
    var base = qi >= 0 ? rest.slice(0, qi) : rest;
    var qs = qi >= 0 ? rest.slice(qi + 1) : '';
    var parts = qs ? qs.split('&').filter(function (p) { return p && p.split('=')[0] !== 'ui'; }) : [];
    if (l !== 'vi') parts.push('ui=' + l);
    return base + (parts.length ? '?' + parts.join('&') : '') + hash;
  }

  /* ---------- cờ (SVG nội tuyến, khung 30x20, không dùng id) ---------- */
  var STAR = '0,-1.05 0.24,-0.32 1,-0.32 0.38,0.12 0.62,0.85 0,0.4 -0.62,0.85 -0.38,0.12 -1,-0.32 -0.24,-0.32';
  var STARS = [[2.4, 2.2], [6, 2.2], [9.6, 2.2], [4.2, 5.4], [7.8, 5.4], [2.4, 8.6], [6, 8.6], [9.6, 8.6]];
  function flag(code) {
    var head = '<svg viewBox="0 0 30 20" width="36" height="24" aria-hidden="true" focusable="false">';
    if (code === 'vi') {
      return head + '<rect width="30" height="20" fill="#DA251D"/>' +
        '<polygon fill="#FFFF00" points="15,4.4 16.35,8.55 20.71,8.55 17.18,11.11 18.53,15.25 15,12.69 11.47,15.25 12.82,11.11 9.29,8.55 13.65,8.55"/></svg>';
    }
    var s = head + '<rect width="30" height="20" fill="#fff"/>' +
      '<path fill="#B22234" d="M0 0h30v1.54H0zM0 3.08h30v1.54H0zM0 6.15h30v1.54H0zM0 9.23h30v1.54H0zM0 12.31h30v1.54H0zM0 15.38h30v1.54H0zM0 18.46h30v1.54H0z"/>' +
      '<rect width="12" height="10.77" fill="#3C3B6E"/><g fill="#fff">';
    for (var i = 0; i < STARS.length; i++) s += '<polygon transform="translate(' + STARS[i][0] + ' ' + STARS[i][1] + ')" points="' + STAR + '"/>';
    return s + '</g></svg>';
  }

  /* ---------- công tắc hai nút [cờ VN VI] [cờ Mỹ EN] ---------- */
  // opts.wire(btn, fn): cách nối sự kiện bấm (bảng dùng pressable); mặc định click.
  function mountSwitch(host, opts) {
    opts = opts || {};
    var d = root.document;
    var seg = d.createElement('div');
    seg.className = 'lang-seg' + (opts.cls ? ' ' + opts.cls : '');
    seg.setAttribute('role', 'group');
    seg.setAttribute('data-testid', 'lang-switch');
    seg.setAttribute('data-i18n-aria', 'lang.group');
    var btns = [];
    ['vi', 'en'].forEach(function (code) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn';
      b.setAttribute('data-testid', 'lang-' + code);
      b.setAttribute('lang', code);
      b.setAttribute('data-i18n-aria', 'lang.' + code);
      b.innerHTML = '<span class="flag" aria-hidden="true">' + flag(code) + '</span><span class="lang-code">' + code.toUpperCase() + '</span>';
      var go = function () { if (cur !== code) setLang(code); };
      if (opts.wire) opts.wire(b, go); else b.addEventListener('click', go);
      seg.appendChild(b);
      btns.push([code, b]);
    });
    function paint() {
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i][0] === cur;
        btns[i][1].setAttribute('aria-pressed', on ? 'true' : 'false');
        btns[i][1].classList.toggle('is-selected', on);
      }
    }
    paint();
    onLang(paint);
    host.appendChild(seg);
    applyOne(seg);
    for (var i = 0; i < btns.length; i++) applyOne(btns[i][1]);
    return seg;
  }

  add({
    vi: {
      'common.forClassinX': 'Dành cho ClassIn X',
      'common.disclaimer': 'Công cụ bổ trợ, không phải tính năng chính thức của ClassIn',
      'common.boardName': 'Bảng nhiều người viết',
      'common.cancel': 'Huỷ',
      'common.close': 'Đóng',
      'common.done': 'Xong',
      'common.start': 'Bắt đầu',
      'lang.group': 'Ngôn ngữ giao diện',
      'lang.vi': 'Tiếng Việt',
      'lang.en': 'English',
    },
    en: {
      'common.forClassinX': 'For ClassIn X',
      'common.disclaimer': 'Add-on tool, not an official ClassIn feature',
      'common.boardName': 'Multi-Writer Board',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.done': 'Done',
      'common.start': 'Start',
      'lang.group': 'Interface language',
      'lang.vi': 'Tiếng Việt',
      'lang.en': 'English',
    },
  });

  // Khởi động: chọn ngôn ngữ; ?ui= hợp lệ thì ghi luôn vào localStorage để trang sau không cần tham số.
  try {
    cur = resolve(root.location ? root.location.search : '', readStore());
    if (root.location && /[?&]ui=(vi|en)(&|#|$)/.test(root.location.search)) store(cur);
    if (root.document && root.document.documentElement) {
      var de = root.document.documentElement;
      de.lang = cur;
      // Trang tĩnh viết sẵn bằng tiếng Việt (data-i18n-wait): ẩn tới khi dịch xong, tránh nháy chữ Việt trước khi sang EN.
      if (cur !== 'vi' && de.hasAttribute('data-i18n-wait')) de.className += ' i18n-wait';
    }
  } catch (e) { cur = 'vi'; }

  root.I18N = {
    LANGS: LANGS, KEY: KEY, resolve: resolve, lang: function () { return cur; }, setLang: setLang,
    t: t, tIn: tIn, onLang: onLang, bind: bind, bindPair: bindPair, apply: apply, withUi: withUi, flag: flag,
    add: add, mountSwitch: mountSwitch, dict: dict, missing: missing,
  };
})(typeof window !== 'undefined' ? window : this);
