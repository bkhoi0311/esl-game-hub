// Statue Freeze — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'statue-freeze',
  title: 'Statue Freeze',
  needsCamera: true,
  minItems: { actionCommands: 3 },
  // Thông tin cho thẻ ở menu chính
  group: 'camera',
  icon: 'person-standing',
  description: 'Nghe lệnh hành động, đứng im khi đèn đỏ.',
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
