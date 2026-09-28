// Word Ninja — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'word-ninja',
  title: 'Word Ninja',
  needsCamera: true,
  minItems: { vocab: 8 },
  // Thông tin cho thẻ ở menu chính
  group: 'camera',
  icon: 'swords',
  description: 'Vung tay chém từ đúng nhóm.',
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
