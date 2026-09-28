// Impostor Word — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'impostor',
  title: 'Impostor Word',
  needsCamera: false,
  minItems: { vocab: 8 },
  // Thông tin cho thẻ ở menu chính
  group: 'class',
  icon: 'search',
  description: 'Tìm từ khác nhóm và giải thích vì sao.',
  ready: false,

  mount(rootEl) {
    this._root = rootEl;
    rootEl.textContent = '';
  },

  unmount() {
    if (this._root) this._root.textContent = '';
    this._root = null;
  },
};
