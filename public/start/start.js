(function () {
  var KEY = 'eslhub.lastPart';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
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
      })(cards[i]);
    }
  });
})();
