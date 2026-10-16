(function () {
  var KEY = 'eslhub.lastPart';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var I = window.I18N;

  // ---- Bài soạn nhúng trong địa chỉ (#L=... hoặc ?L=...), cùng mã hoá với Hub (src/core/content.js):
  // mã đầu '1' = nén deflate-raw, '0' = không nén; phần còn lại base64url. Màn chọn chỉ đọc tên + số từ/số câu
  // rồi chuyển nguyên mã sang Hub khi bấm ESL; Bảng không nhận bài.
  var CODE_MAX = 120000;
  function lessonCode() {
    var m = /^#L=([01][A-Za-z0-9_-]+)/.exec(location.hash) || /[?&]L=([01][A-Za-z0-9_-]+)/.exec(location.search);
    return m && m[1].length <= CODE_MAX ? m[1] : '';
  }
  function b64urlBytes(text) {
    var bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function inflate(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  // Trả Promise<{ title, words, questions }>; mã hỏng thì từ chối.
  function readLesson(code) {
    return Promise.resolve().then(function () {
      var bytes = b64urlBytes(code.slice(1));
      return code.charAt(0) === '1' ? inflate(bytes) : bytes;
    }).then(function (u8) {
      var o = JSON.parse(new TextDecoder().decode(u8));
      if (!o || typeof o !== 'object') throw new Error('bad lesson');
      return {
        title: String(o.title == null ? '' : o.title).replace(/\s+/g, ' ').trim().slice(0, 60),
        words: Array.isArray(o.vocab) ? o.vocab.length : 0,
        questions: Array.isArray(o.questions) ? o.questions.length : 0,
      };
    });
  }
  window.__startLesson = { lessonCode: lessonCode, readLesson: readLesson };

  document.addEventListener('DOMContentLoaded', function () {
    var cards = document.querySelectorAll('.part-card');
    var last = get();
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var id = card.getAttribute('data-part');
        if (id === last) {
          var b = card.querySelector('.part-badge'); if (b) b.hidden = false;
          try { card.focus({ preventScroll: true }); } catch (e) {}
        }
        card.addEventListener('click', function () { set(id); });
        card.setAttribute('data-href0', card.getAttribute('href'));
      })(cards[i]);
    }
    var code = lessonCode();
    var gamesCard = document.querySelector('.part-card[data-part="games"]');
    if (code && gamesCard) {
      // Hub nhận bài qua #L=; Bảng giữ nguyên liên kết (không mang bài).
      gamesCard.setAttribute('data-href0', '../#L=' + code);
      gamesCard.setAttribute('href', '../#L=' + code);
    }
    if (!I) return;
    // Liên kết sang Hub / Bảng mang theo ngôn ngữ (?ui=en); tiếng Việt giữ nguyên liên kết cũ.
    function links() {
      for (var j = 0; j < cards.length; j++) cards[j].setAttribute('href', I.withUi(cards[j].getAttribute('data-href0')));
    }
    var slot = document.getElementById('lang-slot');
    if (slot) I.mountSwitch(slot);
    I.onLang(links);
    I.apply();
    links();
    if (code && gamesCard) {
      readLesson(code).then(function (L) {
        var chip = gamesCard.querySelector('.lesson-chip');
        var title = L.title || '';
        if (!chip) return;
        var tt = chip.querySelector('.lesson-title');
        tt.textContent = title;
        tt.hidden = !title;
        I.bind(chip.querySelector('.lesson-words'), 'start.lesson.words', { n: L.words });
        I.bind(chip.querySelector('.lesson-qs'), 'start.lesson.questions', { n: L.questions });
        chip.querySelector('.lesson-qs').hidden = !L.questions;
        chip.querySelector('.lesson-words').hidden = !L.words;
        chip.hidden = false;
        gamesCard.className += ' has-lesson';
        I.bind(gamesCard, 'start.games.ariaLesson', { title: title || '' }, 'aria-label');
      }, function () { /* mã hỏng: Hub tự báo; màn chọn vẫn dùng bình thường */ });
    }
    document.documentElement.className = document.documentElement.className.replace(/\s*i18n-wait/, '');
  });
  // dự phòng: nếu có lỗi thì vẫn hiện trang sau 0,8 giây
  setTimeout(function () { document.documentElement.className = document.documentElement.className.replace(/\s*i18n-wait/, ''); }, 800);
})();
