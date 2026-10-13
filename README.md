# ESL Game Hub

Bộ 11 trò chơi tiếng Anh cho lớp học, chạy trên trình duyệt. Dùng tốt nhất trên màn hình tương tác 65/75/86 inch (ClassIn Board) kèm camera góc rộng ClassIn Cam S1. Laptop và điện thoại cũng mở được.

- **Vận động với camera (3 game):** Statue Freeze, Simon Says Pose, Word Ninja.
- **Thi đấu cả lớp (8 game):** Gold Heist, Impostor Word, Tug of War, Whack-a-Word, Balloon Pop, Memory Match, Tic-Tac-Toe Quiz, Sentence Race.

Miễn phí hoàn toàn: không cần tài khoản, không có máy chủ, không gửi hình camera đi đâu. Mọi xử lý camera chạy ngay trên máy.

---

## 1. Mở bản online

Mở địa chỉ GitHub Pages của dự án bằng Chrome hoặc Edge:

```
https://<tên-tài-khoản-github>.github.io/esl-game-hub/
```

- Mở địa chỉ gốc sẽ thấy **màn chọn 2 phần**: ESL Game Hub và Bảng nhiều người viết.
- ESL Game Hub nằm ở `#/` (thêm `#/` sau địa chỉ gốc để vào thẳng); bảng nhiều người viết nằm ở `board/`.
- File `.edu` mới `public/start/edu/ESL-Game-Hub-2-phan.edu` mở màn chọn trong ClassIn.
- File `.edu` của bảng `public/board/edu/Bang-nhieu-nguoi-viet.edu` mở thẳng bảng (mặc định 2 vùng, đổi 1–4 vùng ngay trong trang), không qua màn chọn. Mọi trình duyệt chạy cùng một bản; HUD chẩn đoán ẩn, mở bằng bấm 5 lần vào nhãn tiêu đề (hoặc `?debug=1`).
- **Bảng thi đua có đề (Bảng nhiều người viết v2).** Thanh lớp học dưới thanh trên: **Chọn đề** (79 gói thư viện, gồm 48 gói Movers/Starters: Viết từ / Chữ còn thiếu / Trắc nghiệm; bài đang soạn trong Hub; **Toán lớp 1–12** do máy sinh theo luật, có đáp án), **Nền** (Trống, 4 dòng, Ô li, Lưới, Trục toạ độ), đồng hồ (đếm ngược 30/60/90/120 giây hoặc bấm giờ; hết giờ khoá vùng), **Đáp án** rồi chấm ✓ ✗ từng vùng, **Điểm**, **Lượt mới**. Thẻ đề ghim ở đầu mỗi vùng; **Đề chung** (mọi vùng cùng câu, đảo A/B/C theo vùng) hoặc **Chia câu** (mỗi vùng một câu, nút ‹ › riêng). Đội: bấm chip tên đội ở thẻ để đổi tên và màu. Chi tiết thiết kế: `PLAN-V2.md`; ghi chú làm: `BUILD-NOTES-V2.md` (thư mục dự án).
  - Từ bài soạn: Soạn bài > Lưu file .edu > **Lưu .edu cho Bảng nhiều người viết** (bài đi theo phần sau `#L=`, không gửi lên máy chủ); nút **Mở thử trên Bảng** để xem ngay. Chỉ đề tiếng Anh.
  - Link làm sẵn cho từng tiết (tham số URL, giá trị sai thì bỏ qua): `board/?zones=3&src=lib:food-and-drink&kind=write|missing|mc&mode=common|split&order=seq|rand&n=10&timer=0|30|60|90|120|up&paper=blank|lines4|oli|grid|axes`, hoặc `board/?zones=3&src=math&grade=5&type=frac-add&d=2&n=10`. Có `src` thì bảng nạp đề luôn và chờ bấm Bắt đầu.
  - Gói bài là tệp sinh ra: sửa thư viện (`src/data/library`) rồi chạy `node tools/board/build-packs.mjs` (ghi `public/board/packs/*.js`, không sửa tay). `node tools/board/math-samples.mjs` in 30 đề Toán mẫu mỗi lớp để giáo viên duyệt.
  - Kiểm thử: `node --test tests/board-v2.test.mjs` (logic: gói bài, sinh đề toán + bộ kiểm độc lập, lớp học, đồng hồ, link bài, bố cục) và `node tests/board-v2.mjs` (trình duyệt, giả ClassIn X, chạm w = h = 50, 1280x720 và 1920x1080; `DIST=1` thử trên bản build).
- Cả app nằm gọn trong 1 khung, tự phóng to theo màn hình. Trên bảng tương tác nên bấm **F11** để xem toàn màn hình.
- Lần đầu mở game camera AI (Simon Says, Word Ninja), máy tải model AI khoảng 10 MB, cần Internet. Các lần sau trình duyệt tự lưu.

## 2. Dùng bản offline (không cần mạng)

Bản offline là **1 file HTML duy nhất**. Chép vào USB rồi bấm đúp để mở.

Tự build trên máy (cần Node.js 20 trở lên). Bản offline không còn đăng trên trang web:

  ```bash
  npm install
  npm run build:offline
  ```

  Kết quả nằm ở `dist/index.html`.

Chạy được ở bản offline:
- 8 game "Thi đấu cả lớp"
- Statue Freeze (không dùng AI)
- Giọng đọc OmniVoice thu sẵn cho bài mẫu

2 game camera AI cần mạng để tải model. Nếu phải dùng không có mạng, xem mục 7 (chạy qua server trên máy).

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
5. **Soạn nhanh (4 công cụ, thanh phía trên bảng từ vựng):**
   - **Điền từ danh sách:** gõ hoặc dán các từ tiếng Anh (mỗi dòng 1 từ hoặc cách nhau dấu phẩy). Máy tự điền nghĩa tiếng Việt, nhóm và câu ví dụ từ kho khoảng 3.580 từ (Starters đến PET) có sẵn, không cần mạng. Từ chưa có trong kho hiện viền cam để bạn tự điền. Nút **Tự điền ô trống** trong bảng từ vựng chỉ điền ô còn trống, không ghi đè chữ bạn đã gõ.
   - **Tạo câu hỏi tự động:** chọn số câu (5, 10, 15...) và loại câu (chọn nghĩa, chọn từ, điền chỗ trống, đúng chính tả...). Cần ít nhất 3 từ có nghĩa. Có thể "Thêm vào cuối" hoặc "Thay toàn bộ"; luôn xem và sửa được trong bảng.
   - **Nhập file:** CSV, TXT (danh sách từ) hoặc Excel .xlsx, bấm chọn hoặc kéo thả vào trang. Có bước xem trước rồi mới Đưa vào bảng. Bấm **Tải file mẫu** để lấy file .xlsx (3 trang) hoặc 2 file CSV mẫu.
   - **Thư viện bài:** gói theo cấp độ (tab A1 Movers, Pre A1 Starters, Flyers, KET, PET; tab chỉ hiện khi có gói) cộng 31 gói "Chủ đề chung" ở tab Tất cả chủ đề. Mỗi bài 12 đến 20 từ, 15 câu hỏi và lệnh hành động cho Statue Freeze. Tìm bằng chip chủ đề (bấm, dùng được trên bảng ClassIn) hoặc ô gõ (chỉ để dùng trên laptop). Chọn bài rồi "Thay bài đang soạn" hoặc "Chỉ thêm vào cuối" và sửa tuỳ ý. Cấp độ dựa trên danh sách từ vựng Cambridge English (Starters, Movers, Flyers 2025; A2 Key; B1 Preliminary); ứng dụng không liên kết với Cambridge và không được Cambridge chứng nhận.
   - **Cấp độ từ vựng** (kho từ): cấp của từng từ tham chiếu danh sách từ Cambridge English (Pre A1 Starters, A1 Movers, A2 Flyers 2025; A2 Key; B1 Preliminary). ESL Game Hub không liên kết và không được Cambridge chứng nhận. Danh sách gốc nằm cục bộ ở `tools/wordbank/src/` (bị gitignore, không đưa lên GitHub); pipeline ở `tools/wordbank/levels/` (`npm run levels`, `levels:relevel`, `levels:split`, `wordbank`). Hướng dẫn agent dữ liệu: `tools/wordbank/README-AGENT-LEVELS.md`.
   - **Nhập từ Google Sheet:** trong Google Sheet bấm Tệp > Chia sẻ > **Xuất bản lên web**, chọn đúng trang tính, chọn định dạng **CSV**, bấm Xuất bản, rồi copy link dán vào ô "link Google Sheet" trong **Nhập file** (cần mạng). Mỗi trang tính 1 link, dán nhiều link mỗi dòng 1 link. Nếu báo "chưa công khai" thì chưa Xuất bản; cách chắc chắn nhất là Tệp > Tải xuống > CSV rồi kéo thả vào trang.
   - **Lưu ý:** kho từ không phủ hết mọi từ. Từ lạ, tên riêng, từ rất khó sẽ không có sẵn nghĩa; cấp độ trong kho do AI gán nên chỉ để tham khảo. Hãy đọc lại nghĩa và câu hỏi trước khi dùng trên lớp.
6. **Các nút:**
   - **Lưu file .edu:** tải file .edu cho ClassIn (tải lên Drive, mở trên màn hình tương tác). Cửa sổ mở 1280x720.
   - **Hướng dẫn (video):** video + các bước từ soạn bài đến mở trên màn hình ClassIn.
   - **Khôi phục nội dung mẫu:** quay về bài mẫu "Unit 5 - Food".

Game nào thiếu nội dung sẽ báo rõ cần thêm gì. Ví dụ Impostor Word cần ít nhất 2 nhóm, mỗi nhóm 4 từ.

## 4. Giọng đọc

- Bài mẫu có sẵn giọng người đọc thu bằng **OmniVoice**: 8 giọng nam, nữ, trẻ em và người lớn tuổi. Mỗi game có 1 giọng dẫn riêng.
- Từ hoặc câu giáo viên mới thêm sẽ được đọc bằng **giọng máy** (Web Speech) của Chrome/Edge.
  - Windows chưa có giọng tiếng Anh thì vào Settings > Time & Language > Speech > Add voices, chọn English (United States).
- **Giọng đọc trong game thi đấu:** Cài đặt > **Đọc từ trong game thi đấu**, mặc định **Tắt**. Khi Tắt, các game thi đấu (Gold Heist, Impostor Word, Tug of War, Whack-a-Word, Balloon Pop, Memory Match, Tic-Tac-Toe Quiz, Sentence Race) và Word Ninja chỉ còn âm hiệu (đúng/sai/điểm/đếm ngược/thắng) và điểm, không đọc từ hay câu hỏi, đỡ ồn khi học sinh bấm liên tục. Statue Freeze và Simon Says vẫn đọc lệnh vì đó là luật chơi. Nút loa trong game (Listen của Gold Heist, loa trên thẻ Impostor), nghe thử trong Cài đặt và Soạn bài vẫn đọc khi bấm. Whack-a-Word, Balloon Pop và Sentence Race có **Chống bấm loạn** (mặc định Bật): bấm sai thì bên đó bị khoá 0,7–0,8 giây.
- **Statue Freeze (nhận diện chuyển động v2):** nhạy cả với cử động trong thân người. Nút **-/+ Độ nhạy** ngay trên thanh game, **ô vàng** là vùng đang chuyển động (bảo cả lớp đứng yên rồi chỉnh độ nhạy tới khi hết ô vàng), **ô đỏ** là vùng bị tính lỗi sau lượt "Freeze!", **ô xám** là vùng luôn nhấp nháy (TV, quạt) bị bỏ qua. Có chế độ **Chia đội** (trái/phải, đội không có ô đỏ được +1). `?diag=sf` hiện bảng chẩn đoán (Hz, ms, nhiễu, ngưỡng); `?sf=v1` chạy lại thuật toán cũ để so sánh.
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
npm run build        # bản online -> dist/
npm run build:offline  # 1 file -> dist/index.html
npm run preview      # chạy bản build qua server local (dùng model AI lưu sẵn, không cần mạng)
```

Kiểm tra tự động (Playwright + Chromium):

```bash
npm test               # logic game + Soạn nhanh + kho từ + thư viện bài
npm run test:soanbai   # Soạn nhanh trên trình duyệt (dev; thêm đối số dist hoặc offline sau khi build)
node tools/library/build.mjs   # sinh lại thư viện bài từ tools/library/topics.json (31 gói chung) + tools/library/topics/<cấp>.json và kho từ
node tools/library/coverage.mjs --list   # tỉ lệ phủ từ của từng cấp + danh sách từ chưa có gói
node tools/board/build-packs.mjs         # sinh lại gói cho bảng (public/board/packs) sau khi build thư viện
node tools/wordbank/merge.mjs  # ghép tools/wordbank/parts thành src/data/wordbank/words.json
npm run test:games     # 8 game thi đấu, có test 2 chạm đồng thời
npm run test:camera    # game camera với camera giả (Statue Freeze v2, Simon, Word Ninja)
npm run shots          # chụp menu, Soạn bài ở 1920x1080, 1366x768, 390x844
npm run test:offline   # mở dist/index.html bằng file:// (chạy sau build:offline)
```

Tài liệu: `CLAUDE.md` (quy ước), `docs/GAMES_SPEC.md` (đặc tả từng game). Giao diện theo Design-ClassIn-2026 (theme White).
