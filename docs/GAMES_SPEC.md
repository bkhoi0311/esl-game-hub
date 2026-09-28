# Đặc tả 11 game — ESL Game Hub

> Cập nhật 28/09/2026: giáo viên bỏ ESL Wordle và Draw & Guess (không đủ hấp dẫn), thay bằng 4 game "bấm bấm" cho 2 học sinh lên bảng: Whack-a-Word, Balloon Pop, Memory Match, Tic-Tac-Toe Quiz (mục 7, 9, 10, 11).

Nội dung mẫu: chủ đề **Food, trình độ A2**. Tạo `src/data/sample-food-a2.json` với:
- 24 từ vựng, chia đều 4 nhóm: `fruit`, `vegetable`, `drink`, `meal`. Mỗi từ có nghĩa tiếng Việt và 1 câu ví dụ A2.
- 15 câu hỏi ngữ pháp A2 về chủ đề đồ ăn (thì hiện tại đơn, some/any, countable/uncountable, like + V-ing), mỗi câu 3 đáp án.
- 10 lệnh hành động cho Statue Freeze.

Mỗi game ghi: **Luyện gì**, **Chế độ**, **Cách chơi**, **Kỹ thuật**, **Nghiệm thu** (điều kiện để coi là xong).

---

## NHÓM B — Không cần camera (làm trước)

### 5. Gold Heist (lối chơi kiểu Blooket/Gimkit)
- **Luyện:** trắc nghiệm từ vựng + ngữ pháp.
- **Chế độ:** Lớp, 2-4 đội, chơi trên màn hình chung.
- **Cách chơi:** Các đội lần lượt trả lời. Đúng: chọn 1 trong 3 rương úp. Rương có thể là: +10/+20/+30 vàng, x2 vàng, mất 10 vàng, cướp 20 vàng của 1 đội tự chọn, đổi vàng với 1 đội. Sai: mất lượt. Hết số câu (giáo viên chọn 10/15/20) thì đội nhiều vàng nhất thắng.
- **Kỹ thuật:** tỉ lệ rương cấu hình được; hoạt ảnh mở rương bằng GSAP.
- **Nghiệm thu:** vàng không âm; "cướp" và "đổi" chỉ khả dụng khi có đội khác; màn kết thúc hiện bảng xếp hạng.

### 6. Impostor Word (lối chơi kiểu Among Us)
- **Luyện:** nhóm nghĩa từ vựng + nói (giải thích lý do).
- **Chế độ:** Lớp.
- **Cách chơi:** Hiện 5 thẻ từ, 4 từ cùng `category`, 1 từ khác nhóm. Có 60 giây thảo luận, sau đó giáo viên bấm vào thẻ lớp chọn. Lật đáp án kèm tên nhóm ("4 are drinks, 1 is a fruit"). Có nút phát âm từng từ.
- **Kỹ thuật:** cần ít nhất 2 nhóm, mỗi nhóm ít nhất 4 từ; không lặp tổ hợp trong 1 phiên.
- **Nghiệm thu:** thiếu nhóm thì báo rõ cần thêm gì; không bao giờ sinh vòng có 2 từ khác nhóm.

### 7. Whack-a-Word (lối chơi đập chuột chũi)
- **Luyện:** đọc hiểu từ vựng (nghĩa tiếng Việt -> từ tiếng Anh).
- **Chế độ:** 2 học sinh đứng 2 nửa bảng tương tác, chơi cùng lúc.
- **Cách chơi:** Mỗi bên có 6 hang, chuột chũi ngoi lên cầm 1 từ tiếng Anh. Phía trên hiện nghĩa tiếng Việt của từ mục tiêu. Bấm đúng con cầm từ mục tiêu +1 (máy đọc từ), bấm sai -1. Mỗi bên có mục tiêu riêng. 45/60/90 giây.
- **Kỹ thuật:** Pointer Events độc lập 2 nửa; từ mục tiêu ngoi lên ít nhất mỗi 3 con; chuột nhanh dần.
- **Nghiệm thu:** 2 chạm đồng thời đều được tính; điểm không âm; điện thoại hiện "Dùng trên màn hình lớn".

### 8. Tug of War (kéo co trên bảng tương tác)
- **Luyện:** phản xạ từ vựng/ngữ pháp.
- **Chế độ:** 2 học sinh đứng 2 bên màn hình cảm ứng.
- **Cách chơi:** Màn hình chia đôi, mỗi bên có câu hỏi và 3 nút đáp án riêng (thứ tự đáp án khác nhau). Mỗi câu đúng kéo dây 1 nấc về phía mình, sai thì bị khóa 2 giây. Dây chạm vạch là thắng.
- **Kỹ thuật:** Pointer Events độc lập 2 nửa màn hình, 2 người chạm cùng lúc không được chặn nhau.
- **Nghiệm thu:** test Playwright mô phỏng 2 chạm đồng thời; trên điện thoại hiện thông báo "Dùng trên màn hình lớn".

### 9. Balloon Pop (bóng bay chữ)
- **Luyện:** phân loại từ vựng theo nhóm.
- **Chế độ:** 2 học sinh 2 nửa bảng, chơi cùng lúc.
- **Cách chơi:** Bóng bay có chữ bay lên. Banner chung "Pop only DRINKS" (nhóm mục tiêu đổi mỗi 20 giây, máy đọc to). Bấm nổ bóng đúng nhóm +1, sai nhóm -1.
- **Kỹ thuật:** cần ít nhất 2 nhóm, mỗi nhóm ít nhất 3 từ; bóng bay nhanh dần.
- **Nghiệm thu:** 2 chạm đồng thời đều được tính; thiếu nhóm thì báo rõ.

### 10. Memory Match (lật thẻ tìm cặp)
- **Luyện:** ghi nhớ từ vựng (từ tiếng Anh <-> nghĩa tiếng Việt).
- **Chế độ:** 2-4 đội thay phiên trên cùng bảng.
- **Cách chơi:** 6/8/10 cặp thẻ úp. Lật 2 thẻ: đúng cặp thì +1, máy đọc từ, được lật tiếp; sai thì úp lại, đổi lượt.
- **Nghiệm thu:** mỗi cặp gồm đúng 1 thẻ từ + 1 thẻ nghĩa, không trùng chữ; hết cặp thì hiện xếp hạng.

### 11. Tic-Tac-Toe Quiz (cờ ca-rô 3x3)
- **Luyện:** trắc nghiệm từ vựng/ngữ pháp.
- **Chế độ:** 2 đội (X và O) thay phiên.
- **Cách chơi:** Đội chọn 1 ô trống, trả lời câu hỏi 3 đáp án. Đúng thì chiếm ô, sai thì ô vẫn trống và mất lượt. 3 ô thẳng hàng thắng ván; đội thua đi trước ván sau; bảng điểm cộng dồn các ván.
- **Nghiệm thu:** nhận đúng 8 đường thắng và hòa; ô đã chiếm không chọn lại được.

## NHÓM A — Dùng camera (làm sau)

Chung cho nhóm A: màn hình chọn camera trước khi vào game; hình gương; nút tắt camera luôn hiển thị; không lưu hình.

### 1. Statue Freeze (lối chơi kiểu "Đèn xanh đèn đỏ", KHÔNG dùng hình ảnh Squid Game)
- **Luyện:** nghe lệnh hành động.
- **Chế độ:** Cả lớp, camera góc rộng.
- **Cách chơi:** Máy đọc 1 lệnh trong `actionCommands` bằng TTS, đèn xanh 3-8 giây (ngẫu nhiên), cả lớp làm theo. Đèn đỏ: đứng im 3 giây. Vùng có chuyển động khi đèn đỏ được tô đỏ trên màn hình. Giáo viên nhìn vùng đỏ để gọi tên học sinh bị loại.
- **Kỹ thuật:** so sánh khung hình (frame differencing), chia lưới 16x9 ô, **không dùng AI**. Có bước hiệu chỉnh 3 giây lúc bắt đầu (lớp đứng yên) để đặt ngưỡng nhiễu. Thanh trượt độ nhạy cho giáo viên.
- **Lưu ý:** game KHÔNG nhận diện từng học sinh, chỉ chỉ ra vùng có chuyển động. Ghi rõ điều này trong phần hướng dẫn.
- **Nghiệm thu:** chạy được ở bản offline; tay người vẫy trước webcam khi đèn đỏ thì ô tương ứng đỏ; đứng yên thì không báo nhầm quá 1 ô.

### 2. Simon Says Pose
- **Luyện:** nghe, bộ phận cơ thể, trái/phải.
- **Chế độ:** 1-3 học sinh đứng cách camera 2-3 mét, thấy toàn thân.
- **Cách chơi:** Máy đọc "Simon says ..." hoặc chỉ đọc lệnh. Có "Simon says": làm đúng tư thế trong 4 giây thì được điểm. Không có "Simon says" mà vẫn làm: mất điểm.
- **Thư viện tư thế cố định** (chỉ những tư thế nhận diện ổn định): raise your left hand, raise your right hand, hands up, hands on your head, arms out (T-pose), touch your nose, stand on one leg, squat down. Giáo viên chọn tư thế dùng trong bài, không gõ lệnh tự do.
- **Kỹ thuật:** MediaPipe Pose Landmarker, `numPoses` = 3; kiểm tra tư thế bằng vị trí tương đối các điểm (cổ tay so với vai, cổ tay so với mũi...), giữ đúng liên tục 0.5 giây mới tính.
- **Nghiệm thu:** vẽ khung xương lên hình; trái/phải đúng theo học sinh khi hình đã lật gương.

### 3. Head Tilt Quiz (kiểu filter trắc nghiệm trên TikTok)
- **Luyện:** từ vựng/ngữ pháp chọn 1 trong 2.
- **Chế độ:** 1-2 học sinh đứng gần camera (dưới 1.5 mét).
- **Cách chơi:** Câu hỏi hiện trên đầu, 2 đáp án ở 2 bên khuôn mặt. Nghiêng đầu quá 15 độ và giữ 0.4 giây để chọn. 10 câu, mỗi câu 6 giây.
- **Kỹ thuật:** MediaPipe Face Landmarker, tính góc nghiêng từ 2 khóe mắt. Câu có 3 đáp án thì chỉ lấy đáp án đúng + 1 đáp án sai.
- **Nghiệm thu:** góc nghiêng hiển thị dạng thanh chỉ báo; không chọn nhầm khi đầu thẳng.

### 4. Word Ninja (lối chơi kiểu Fruit Ninja)
- **Luyện:** phân loại từ vựng.
- **Chế độ:** 1-2 học sinh.
- **Cách chơi:** Đầu vòng hiện nhóm mục tiêu ("Slice only DRINKS"). Các thẻ từ bay lên theo đường cong. Vung tay qua thẻ để chém. Chém đúng nhóm +1, chém sai nhóm mất 1 mạng (có 3 mạng). 60 giây.
- **Kỹ thuật:** MediaPipe Pose Landmarker, dùng điểm cổ tay 2 tay, vẽ vệt sáng theo cổ tay; chỉ tính là chém khi tốc độ tay đủ lớn.
- **Nghiệm thu:** có chế độ dự phòng chém bằng chuột/cảm ứng khi không có camera.

---

## Màn hình chung
- **Menu chính:** 11 thẻ game chia 2 nhóm ("Vận động với camera", "Thi đấu cả lớp"), thẻ game camera có nhãn "Cần camera".
- **Tab Soạn bài:** bảng nhập từ vựng (dán trực tiếp từ Excel/Google Sheet, các cột: word, meaning, category, example), bảng câu hỏi, danh sách lệnh, tên đội. Nút: Xuất JSON, Nhập JSON, **Lưu thành file mới** (tải về 1 file HTML đã chứa nội dung), Khôi phục nội dung mẫu.
- **Cài đặt:** chọn camera, bật/tắt âm thanh, giọng đọc OmniVoice thu sẵn (mỗi game 1 giọng dẫn) hoặc giọng máy, tốc độ đọc TTS, giọng Anh-Mỹ/Anh-Anh.
