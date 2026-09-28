// Gold Heist — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'gold-heist',
  title: 'Gold Heist',
  needsCamera: false,
  minItems: { questions: 10 },
  // Thông tin cho thẻ ở menu chính
  group: 'class',
  icon: 'coins',
  description: 'Trắc nghiệm theo đội, mở rương vàng.',
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
