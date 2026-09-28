# ESL Game Hub

Bộ 11 trò chơi tiếng Anh cho lớp học, chạy trên trình duyệt. Dùng tốt nhất trên màn hình tương tác 65/75/86 inch (ClassIn Board) kèm camera góc rộng ClassIn Cam S1. Laptop và điện thoại cũng mở được.

- **Vận động với camera (4 game):** Statue Freeze, Simon Says Pose, Head Tilt Quiz, Word Ninja.
- **Thi đấu cả lớp (7 game):** Gold Heist, Impostor Word, Tug of War, Whack-a-Word, Balloon Pop, Memory Match, Tic-Tac-Toe Quiz.

Miễn phí hoàn toàn: không cần tài khoản, không có máy chủ, không gửi hình camera đi đâu. Mọi xử lý camera chạy ngay trên máy.

---

## 1. Mở bản online

Mở địa chỉ GitHub Pages của dự án bằng Chrome hoặc Edge:

```
https://<tên-tài-khoản-github>.github.io/esl-game-hub/
```

- Cả app nằm gọn trong 1 khung, tự phóng to theo màn hình. Trên bảng tương tác nên bấm **F11** để xem toàn màn hình.
- Lần đầu mở game camera AI (Simon Says, Head Tilt, Word Ninja), máy tải model AI khoảng 10 MB, cần Internet. Các lần sau trình duyệt tự lưu.

## 2. Dùng bản offline (không cần mạng)

Bản offline là **1 file HTML duy nhất**. Chép vào USB rồi bấm đúp để mở.

Có 2 cách lấy file:
- Trong tab **Soạn bài**, bấm **Lưu thành file mới**. File tải về chứa sẵn bài đang soạn.
- Hoặc tự build trên máy (cần Node.js 20 trở lên):

  ```bash
  npm install
  npm run build:offline
  ```

  Kết quả nằm ở `dist/index.html`.

Chạy được ở bản offline:
- 7 game "Thi đấu cả lớp"
- Statue Freeze (không dùng AI)
- Giọng đọc OmniVoice thu sẵn cho bài mẫu

3 game camera AI cần mạng để tải model. Nếu phải dùng không có mạng, xem mục 7 (chạy qua server trên máy).

## 3. Soạn bài mới (giáo viên)

Mở tab **Soạn bài**. Nội dung tự lưu trên máy đang dùng.

1. **Tên bài, trình độ, tên đội** (2-4 đội).
2. **Từ vựng:** bấm "Dán bảng từ Excel / Google Sheet".
   - Bôi đen bảng 4 cột theo thứ tự `word | meaning | category | example`, Ctrl+C rồi dán vào ô.
   - Chọn "Thêm vào cuối" hoặc "Thay toàn bộ", rồi bấm **Đưa vào bảng**.
   - Cũng có thể dán thẳng vào 1 ô trong bảng.
3. **Câu hỏi trắc nghiệm:** các cột `câu hỏi | đáp án A | đáp án B | đáp án C | đáp án đúng (A/B/C) | loại`.
   - Dùng `___` cho chỗ trống.
   - Không có câu hỏi thì game tự tạo câu "chọn nghĩa đúng" từ từ vựng.
4. **Lệnh hành động** (cho Statue Freeze): mỗi dòng 1 lệnh tiếng Anh.
5. **Các nút:**
   - **Xuất JSON:** lưu bài ra file để sao lưu hoặc gửi đồng nghiệp.
   - **Nhập JSON:** mở lại bài đã lưu.
   - **Lưu thành file mới:** tải 1 file HTML chạy offline, chứa sẵn bài này.
   - **Khôi phục nội dung mẫu:** quay về bài mẫu "Unit 5 - Food".

Game nào thiếu nội dung sẽ báo rõ cần thêm gì. Ví dụ Impostor Word cần ít nhất 2 nhóm, mỗi nhóm 4 từ.

## 4. Giọng đọc

- Bài mẫu có sẵn giọng người đọc thu bằng **OmniVoice**: 8 giọng nam, nữ, trẻ em và người lớn tuổi. Mỗi game có 1 giọng dẫn riêng.
- Từ hoặc câu giáo viên mới thêm sẽ được đọc bằng **giọng máy** (Web Speech) của Chrome/Edge.
  - Windows chưa có giọng tiếng Anh thì vào Settings > Time & Language > Speech > Add voices, chọn English (United States).
- Nút bánh răng **Cài đặt** cho phép: nghe thử giọng dẫn từng game, chuyển sang chỉ dùng giọng máy, chỉnh tốc độ và chọn Anh-Mỹ/Anh-Anh cho giọng máy.

Thu giọng OmniVoice cho bài mới (chỉ làm trên máy Mac có OmniVoice, ~4 giây/câu):

```bash
node tools/voices/texts.mjs duong-dan/bai-moi.json
```

```bash
tools/voices/run_all.sh
```

Sau đó build lại. Script tự nghe lại bằng Whisper và tạo lại câu nào đọc sai.

## 5. Xử lý lỗi camera

Trước mỗi game camera có màn chọn camera. Camera góc rộng S1 thường có tên chứa "S1" hoặc "ClassIn". Hình hiển thị dạng gương; trái/phải trong lệnh luôn là trái/phải **của học sinh**.

| Thông báo trên màn hình | Cách xử lý |
| --- | --- |
| **Camera đang bị ứng dụng khác sử dụng** | Hay gặp nhất: app **ClassIn đang giữ camera S1**. Trong ClassIn, tắt camera của mình hoặc thoát hẳn lớp học. Kiểm tra cả biểu tượng ClassIn ở góc phải thanh Taskbar (chuột phải > Thoát). Đóng Zoom, Teams, app Camera của Windows và các tab khác đang dùng camera. Bấm **Thử lại**. Vẫn lỗi thì rút cáp USB của camera, cắm lại, đợi 5 giây. |
| **Trình duyệt đang chặn quyền dùng camera** | Bấm biểu tượng ổ khóa bên trái thanh địa chỉ > Camera > **Cho phép**, rồi tải lại trang (F5). Windows: Settings > Privacy & security > Camera, bật "Let apps access your camera" và "Let desktop apps access your camera". |
| **Không tìm thấy camera** | Cắm cáp USB của S1 thẳng vào máy (không qua hub). Mở Device Manager, xem mục Cameras. Bấm **Thử lại**. |
| **Máy xử lý chậm…** | Game tự giảm độ phân giải camera. Nên đóng bớt tab và ứng dụng khác. |
| **Không nạp được model AI** | Cần Internet cho lần đầu, hoặc chạy qua server trên máy (mục 7). |

Khoảng cách gợi ý:
- **Simon Says Pose:** 2-3 mét, camera thấy cả bàn chân.
- **Head Tilt Quiz:** dưới 1,5 mét.
- **Word Ninja:** 1,5-2,5 mét, thấy 2 tay.
- **Statue Freeze:** thấy cả lớp.

Game KHÔNG nhận diện từng học sinh, không ghi hình, không lưu ảnh.

## 6. Mẹo trên bảng tương tác

- Tug of War, Whack-a-Word, Balloon Pop: 2 học sinh đứng 2 bên bảng, chạm cùng lúc được. Trên điện thoại các game này báo "Dùng trên màn hình lớn".
- Mọi game đều có nút **How to play**, **Pause**, **Restart**, **Menu** ở thanh trên.

## 7. Cho người phát triển

```bash
npm install          # cài thư viện
npm run dev          # chạy thử: http://localhost:5173
npm run build        # bản online -> dist/ (kèm dist/offline.html)
npm run build:offline  # 1 file -> dist/index.html
npm run preview      # chạy bản build qua server local (dùng model AI lưu sẵn, không cần mạng)
```

Kiểm tra tự động (Playwright + Chromium):

```bash
npm test               # logic game
npm run test:games     # 7 game thi đấu, có test 2 chạm đồng thời
npm run test:camera    # 4 game camera với camera giả
npm run shots          # chụp menu, Soạn bài ở 1920x1080, 1366x768, 390x844
npm run test:offline   # mở dist/index.html bằng file:// (chạy sau build:offline)
```

Tài liệu: `CLAUDE.md` (quy ước), `docs/GAMES_SPEC.md` (đặc tả từng game). Giao diện theo Design-ClassIn-2026 (theme White).
