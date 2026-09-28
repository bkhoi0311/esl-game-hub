# ESL Game Hub — hướng dẫn cho Claude Code

## Dự án là gì
Một web app chứa 11 game tương tác cho lớp ESL (tiếng Anh). Dùng trên:
- Màn hình tương tác lớp học (cảm ứng đa điểm) + camera góc rộng ClassIn S1 (USB webcam, Windows).
- Laptop/điện thoại của học sinh.

Đặc tả chi tiết từng game: `docs/GAMES_SPEC.md`. Đọc file đó trước khi code bất kỳ game nào.

## Ràng buộc bắt buộc
- **0 đồng phí bên thứ ba.** Không dùng API trả phí, không dùng dịch vụ cần đăng nhập, không backend, không database.
- **Không gửi hình ảnh camera ra ngoài.** Mọi xử lý camera chạy trên máy. Không ghi hình, không chụp, không lưu frame.
- **Chữ hiển thị cho học sinh bằng tiếng Anh.** Giao diện cho giáo viên (menu cài đặt, tab Soạn bài) bằng tiếng Việt.
- Không dùng hình ảnh, tên, nhân vật có bản quyền (Squid Game, Among Us, Fruit Ninja, Blooket, Wordle...). Chỉ mượn lối chơi, tự đặt tên và tự vẽ giao diện.
- Không dùng emoji làm icon chính. Icon dạng SVG tự vẽ hoặc bộ icon mã nguồn mở (Lucide).

## Stack
- **Vite + JavaScript thuần (ES modules)**, không dùng React/Vue. Mục tiêu: dễ đọc, dễ sửa.
- **vite-plugin-singlefile**: bản build offline ra 1 file `dist/index.html`.
- Thư viện được phép: `@mediapipe/tasks-vision` (camera), `gsap` (hiệu ứng), `canvas-confetti`, `howler` (âm thanh), `sortablejs`, `lucide`, `phaser` 4 (game hành động: Balloon Pop, Whack-a-Word, Word Ninja, dải kéo co Tug of War, lớp phủ Statue Freeze — người dùng duyệt 28/09/2026). Muốn thêm thư viện khác: hỏi trước.
- Giao diện trẻ em: mascot Lumi (`src/core/mascot.js`), nền thế giới (`src/core/world.js`), hiệu ứng (`src/core/fx.js`), kênh sự kiện `correct`/`wrong`/`win` (`src/core/events.js`). Phaser 4: đọc `node_modules/phaser/types/phaser.d.ts`, không dùng API Phaser 3.
- Phát âm: Web Speech API (`speechSynthesis`, giọng `en-US` hoặc `en-GB`), có kiểm tra khi máy không có giọng tiếng Anh.
- Kiểm tra giao diện: Playwright, ở 3 kích thước: 1920x1080 (màn hình lớp), 1366x768 (laptop), 390x844 (điện thoại).

## Cấu trúc thư mục
```
src/
  main.js              # router: menu chính -> từng game
  core/
    content.js         # đọc/ghi bộ nội dung (lesson pack), validate schema
    editor.js          # tab Soạn bài: nhập, dán từ Excel, xuất/nhập JSON, lưu thành file mới
    ui.js              # nút, modal, bảng điểm đội, đồng hồ đếm ngược dùng chung
    audio.js           # âm thanh đúng/sai/thắng, TTS
    camera.js          # mở camera, chọn thiết bị (S1), xử lý lỗi quyền, tắt camera khi rời game
    vision.js          # nạp MediaPipe (pose, face, frame diff), dùng chung cho 4 game camera
  games/
    statue-freeze/  simon-pose/  head-tilt/  word-ninja/
    gold-heist/  impostor/  tug-of-war/  whack-word/  balloon-pop/  memory-match/  tic-tac-toe/
    shared/              # khung chung game 2 người chia đôi màn hình
  data/sample-food-a2.json
docs/GAMES_SPEC.md
```
Mỗi game export đúng 1 interface:
```js
export default {
  id, title, needsCamera, minItems,       // minItems: số mục nội dung tối thiểu để chơi
  mount(rootEl, content, settings),       // dựng game
  unmount()                               // dọn sạch: timer, listener, camera, animation frame
}
```

## Bộ nội dung (lesson pack) — schema chung cho cả 11 game
```json
{
  "title": "Unit 5 - Food",
  "level": "A2",
  "vocab": [
    { "word": "banana", "meaning": "quả chuối", "category": "fruit",
      "example": "I eat a banana every morning.", "image": "" }
  ],
  "questions": [
    { "prompt": "She ___ rice every day.", "options": ["eats", "eat", "eating"],
      "answer": 0, "type": "grammar" }
  ],
  "actionCommands": ["Hop on one foot", "Touch your toes", "Spin around"],
  "teams": ["Red", "Blue"]
}
```
- Game thiếu nội dung (dưới `minItems`) thì hiện thông báo rõ ràng cần nhập thêm gì, không được crash.
- Câu hỏi trắc nghiệm có thể tự sinh từ `vocab` (chọn nghĩa đúng) khi `questions` trống.

## Tiêu chuẩn chung cho mọi game
- Chữ tối thiểu 32px ở màn hình 1920 wide; vùng chạm tối thiểu 64x64px.
- Mọi game có: nút Hướng dẫn (1 màn hình, dưới 40 chữ), nút Tạm dừng, nút Chơi lại, nút Về menu.
- Chế độ đội (2-4 đội) dùng chung component bảng điểm.
- Dùng Pointer Events và `touch-action: none` cho vùng chơi để hỗ trợ đa điểm chạm.
- `unmount()` phải tắt camera (dừng mọi track) và hủy `requestAnimationFrame`. Kiểm tra bằng cách vào/ra game 5 lần liên tiếp.

## Camera
- Liệt kê thiết bị bằng `enumerateDevices`, cho giáo viên chọn camera (S1 thường không phải camera mặc định).
- Xử lý rõ ràng 3 lỗi: bị từ chối quyền, camera đang bị ứng dụng khác dùng (`NotReadableError` — thường do app ClassIn đang giữ camera), không có camera. Mỗi lỗi có hướng dẫn tiếng Việt cụ thể.
- Hiển thị hình camera dạng gương (mirror). Trái/phải trong lệnh luôn là trái/phải **của học sinh**.
- Model MediaPipe: bản online nạp từ CDN chính thức; lưu sẵn file model trong `public/models/` để chạy qua server local khi cần offline.
- Nếu FPS < 15 trong 5 giây: hiện cảnh báo máy yếu, tự hạ độ phân giải camera.

## Build và deploy
- `npm run dev` — phát triển.
- `npm run build` — bản online, deploy GitHub Pages bằng GitHub Actions.
- `npm run build:offline` — 1 file HTML duy nhất, mở bằng bấm đúp. 7 game không cần camera và Statue Freeze phải chạy được ở bản này.
- Giọng đọc OmniVoice thu sẵn: `tools/voices/` (xem README).

## Cách làm việc
- Làm theo giai đoạn trong `KICKOFF_PROMPT.md`. Hết mỗi giai đoạn: chạy Playwright, chụp màn hình, dừng lại báo cáo và chờ duyệt.
- Không tự thêm game hoặc tính năng ngoài đặc tả. Có ý tưởng thì ghi vào `docs/IDEAS.md`.
- Commit nhỏ, message rõ ràng, mỗi game ít nhất 1 commit riêng.
