// Hướng dẫn cho giáo viên: video + các bước chi tiết, từ soạn bài trên máy tính
// đến mở bài trên màn hình tương tác ClassIn (cùng một tài khoản).
import { h, openModal } from './ui.js';
import { icon } from './icons.js';

const VIDEO = `${import.meta.env.BASE_URL}guide/huong-dan-luu-edu.mp4`;
const POSTER = `${import.meta.env.BASE_URL}guide/huong-dan-luu-edu.jpg`;

const PARTS = [
  {
    title: 'Trên máy tính: soạn bài',
    steps: [
      'Mở Chrome hoặc Edge, vào trang ESL Game Hub (đường link nhà trường gửi).',
      'Bấm "Soạn bài" ở thanh trên cùng.',
      'Gõ Tên bài (ví dụ: Unit 5 - Food) và Trình độ.',
      'Nhập từ vựng và câu hỏi: gõ thẳng vào bảng, hoặc chép bảng từ Excel / Google Sheet rồi dán vào ô "Dán bảng từ Excel". Bài tự lưu trên máy, tắt máy không mất.',
      'Thấy dòng chữ xanh "Nội dung hợp lệ" thì bấm nút xanh "Lưu file .edu".',
      'Kiểm tra tên bài, chọn ai được tương tác, bấm "Lưu file .edu". File nằm trong thư mục Tải xuống (Downloads) của máy.',
    ],
  },
  {
    title: 'Trên máy tính: đưa file lên Drive ClassIn',
    steps: [
      'Mở app ClassIn trên máy tính, đăng nhập tài khoản giáo viên của thầy cô.',
      'Bấm Drive ở menu bên trái, chọn Drive của tôi.',
      'Bấm Tải lên, chọn Tệp. Vào thư mục Tải xuống, chọn file .edu vừa lưu, bấm Mở. Đợi file hiện trong danh sách.',
    ],
  },
  {
    title: 'Trên màn hình tương tác ClassIn',
    steps: [
      'Vuốt từ mép dưới màn hình lên, bấm ảnh đại diện. Đăng nhập ĐÚNG tài khoản đã dùng ở máy tính: quét mã QR bằng app ClassIn trên điện thoại, hoặc nhập số điện thoại và mật khẩu.',
      'Vuốt lên lần nữa, bấm ô Tệp màu cam, chọn Drive của tôi.',
      'Bấm vào file .edu: bài mở ra. Chọn trò chơi, bấm "Bắt đầu chơi".',
    ],
  },
];

const NOTES = [
  'Máy tính và màn hình tương tác phải đăng nhập cùng một tài khoản ClassIn, nếu không sẽ không thấy file.',
  'Muốn sửa bài: sửa trong Soạn bài, bấm "Lưu file .edu" lần nữa, rồi tải file mới lên Drive. File cũ vẫn là bài cũ.',
  'Các trò chơi có nhãn "Cần camera" chỉ chơi được khi màn hình có camera.',
];

export function openGuide() {
  let n = 0;
  const video = h('video', {
    class: 'guide-video', src: VIDEO, poster: POSTER, controls: true, playsInline: true, preload: 'metadata', 'data-testid': 'guide-video',
  });
  const body = h('div', { class: 'guide' },
    h('div', { class: 'guide-media' }, video, h('p', { class: 'muted' }, 'Bấm nút phát để xem. Có thể bấm vào góc video để phóng to.')),
    h('div', { class: 'guide-text' },
      PARTS.map((part, k) => h('section', { class: 'guide-part' },
        h('h3', {}, h('span', { class: 'guide-part-no' }, String.fromCharCode(65 + k)), part.title),
        h('ol', { class: 'guide-steps', start: n + 1 }, part.steps.map((s) => (n++, h('li', {}, s)))))),
      h('div', { class: 'guide-notes' }, icon('info', 22), h('ul', {}, NOTES.map((t) => h('li', {}, t))))));
  return openModal({ title: 'Hướng dẫn: soạn bài và mở trên màn hình ClassIn', body, wide: true, actions: [{ label: 'Đã hiểu', variant: 'primary', iconName: 'check' }], onClose: () => video.pause() });
}
