// Spell Grid — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'wordle',
  title: 'Spell Grid',
  needsCamera: false,
  minItems: { vocab: 1 },
  // Thông tin cho thẻ ở menu chính
  group: 'class',
  icon: 'grid',
  description: 'Đoán từ bí mật trong 6 lượt (chính tả).',
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
