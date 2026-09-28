// Draw & Guess — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'draw-guess',
  title: 'Draw & Guess',
  needsCamera: false,
  minItems: { vocab: 5 },
  // Thông tin cho thẻ ở menu chính
  group: 'class',
  icon: 'brush',
  description: 'Vẽ từ bí mật, cả lớp đoán bằng tiếng Anh.',
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
