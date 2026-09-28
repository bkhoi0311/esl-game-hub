// Head Tilt Quiz — chưa làm (Sắp có). Đặc tả: docs/GAMES_SPEC.md
export default {
  id: 'head-tilt',
  title: 'Head Tilt Quiz',
  needsCamera: true,
  minItems: { questions: 10 },
  // Thông tin cho thẻ ở menu chính
  group: 'camera',
  icon: 'scan-face',
  description: 'Nghiêng đầu chọn 1 trong 2 đáp án.',
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
