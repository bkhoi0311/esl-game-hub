// Simon Says Pose — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'simon-pose',
  title: 'Simon Says Pose',
  needsCamera: true,
  minItems: 0,
  // Thông tin cho thẻ ở menu chính
  group: 'camera',
  icon: 'hand',
  description: 'Nghe lệnh, bộ phận cơ thể, trái/phải.',
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
