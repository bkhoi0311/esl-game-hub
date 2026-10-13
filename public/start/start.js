(function () {
  var KEY = 'eslhub.lastPart';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var I = window.I18N;
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
    document.documentElement.className = document.documentElement.className.replace(/\s*i18n-wait/, '');
  });
  // dự phòng: nếu có lỗi thì vẫn hiện trang sau 0,8 giây
  setTimeout(function () { document.documentElement.className = document.documentElement.className.replace(/\s*i18n-wait/, ''); }, 800);
})();
