// Tug of War — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'tug-of-war',
  title: 'Tug of War',
  needsCamera: false,
  minItems: { questions: 6 },
  // Thông tin cho thẻ ở menu chính
  group: 'class',
  icon: 'arrow-left-right',
  description: '2 học sinh thi trả lời nhanh trên bảng.',
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
