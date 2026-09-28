# Prompt khởi động — dán vào Claude Code

Chuẩn bị (1 lần):
1. Tạo thư mục `esl-game-hub`, chép vào: `CLAUDE.md`, `KICKOFF_PROMPT.md`, `docs/GAMES_SPEC.md`.
2. Mở Terminal trong thư mục đó, chạy `claude`.
3. Dán lần lượt từng prompt bên dưới. Chỉ dán prompt tiếp theo khi đã duyệt xong giai đoạn trước.

---

## Prompt 1 — Khung dự án
```
Đọc CLAUDE.md và docs/GAMES_SPEC.md. Làm Giai đoạn 1:
- Khởi tạo Vite (JS thuần), cài các thư viện được phép trong CLAUDE.md, cài vite-plugin-singlefile và Playwright.
- Tạo cấu trúc thư mục, interface game, router, menu chính 9 thẻ (game chưa làm hiện "Sắp có").
- Tạo src/data/sample-food-a2.json theo đặc tả.
- Làm tab Soạn bài (content.js, editor.js) đầy đủ, gồm cả "Lưu thành file mới".
- Làm ui.js (bảng điểm đội, đồng hồ, modal hướng dẫn) và audio.js (TTS, âm đúng/sai).
- Khởi tạo git, commit.
Xong thì chạy Playwright chụp menu và tab Soạn bài ở 3 kích thước, báo cáo và dừng lại chờ tôi duyệt.
```

## Prompt 2 — 5 game không cần camera
```
Làm Giai đoạn 2: 5 game nhóm B trong GAMES_SPEC (Gold Heist, Impostor Word, ESL Wordle, Tug of War, Draw & Guess).
Làm từng game một, mỗi game xong thì: tự kiểm tra các điều kiện "Nghiệm thu", chạy Playwright, commit.
Sau cả 5 game: chạy npm run build:offline, xác nhận 5 game chạy được khi mở file dist/index.html trực tiếp.
Báo cáo bảng: game | nghiệm thu đạt/chưa đạt | lỗi còn lại. Dừng lại chờ duyệt.
```

## Prompt 3 — 4 game camera
```
Làm Giai đoạn 3: camera.js, vision.js và 4 game nhóm A (Statue Freeze trước, rồi Simon Says Pose, Head Tilt Quiz, Word Ninja).
Làm Statue Freeze trước vì không cần AI. Với 3 game còn lại, nạp MediaPipe từ CDN và lưu sẵn model vào public/models.
Mở npm run dev để tôi tự test bằng webcam. Liệt kê cho tôi các bước test từng game (đứng cách camera bao xa, làm động tác gì, kết quả mong đợi).
Dừng lại chờ tôi báo kết quả test.
```

## Prompt 4 — Đưa lên mạng
```
Làm Giai đoạn 4:
- Tạo GitHub Actions deploy bản online lên GitHub Pages.
- Viết README tiếng Việt: cách mở online, cách dùng bản offline, cách giáo viên soạn bài mới, cách xử lý lỗi camera (đặc biệt khi app ClassIn đang giữ camera S1).
- Hướng dẫn tôi từng lệnh để tạo repo GitHub và bật Pages.
```

---

## Nếu Claude Code đi sai hướng
- Game chạy lỗi: "Chạy Playwright tái hiện lỗi [mô tả], sửa, chạy lại test."
- Tự thêm tính năng ngoài đặc tả: "Bỏ phần [X], chỉ làm đúng GAMES_SPEC. Ghi ý tưởng vào docs/IDEAS.md."
- Camera không mở trên máy lớp: gửi nguyên văn thông báo lỗi trên màn hình cho Claude Code.
