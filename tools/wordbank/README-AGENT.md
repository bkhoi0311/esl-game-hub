# Giao việc cho agent dữ liệu: tạo 1 phần kho từ

Việc của bạn: đọc `tools/wordbank/in/part-NN.txt` (mỗi dòng `word<TAB>tên emoji`, khoảng 97 từ) và ghi `tools/wordbank/parts/part-NN.json`: mảng JSON thuần, UTF-8, thụt 2 dấu cách, **mỗi từ của file in đúng 1 lần**, cùng thứ tự. Không sửa file nào khác. Không chép câu/định nghĩa từ sách hay tài liệu Cambridge: tự viết.

## Mỗi mục (A1)
```json
{ "word": "banana", "vi": "quả chuối", "pos": "n", "cat": "fruit", "level": "starters",
  "ex": "I eat a banana every morning.", "img": "Banana", "alt": [], "pl": "",
  "check": false, "levelCheck": false, "skip": false, "note": "" }
```
- `word`: y nguyên khoá trong file in (chữ thường, giữ cụm từ). `img`: chép tên emoji của dòng đó.
- `pos`: `n v adj adv prep pron num phr other`. `level`: `starters movers flyers ket other` (cấp thấp nhất mà từ xuất hiện; bạn tự gán theo hiểu biết, không có danh sách chính thức).
- `alt`: biến thể chính tả tra cũng ra (`["colour"]`). `pl`: số nhiều bất quy tắc (`"children"`, `"feet"`, `"mice"`, `"sheep"`). Không có thì để `[]` / `""`.
- `check:true` khi **không chắc** nghĩa/nhóm/ví dụ. KHÔNG đoán. `levelCheck:true` khi không chắc cấp độ (cứ đánh nếu bạn không thật tự tin, build vẫn chạy). `skip:true` cho từ không hợp trẻ em (rượu bia, vũ khí, thuốc tiêm, đồ bơi hở, tên riêng/thương hiệu) và **bắt buộc ghi `note`** lý do; lúc đó `vi` và `ex` được để `""`.

## Quy tắc nội dung (A4)
- `vi`: 1-40 ký tự, tiếng Việt có dấu, chữ thường đầu dòng (trừ tên riêng), 1 nghĩa phổ thông cho trẻ 6-12 tuổi (tối đa 2 nghĩa ngăn bằng ", " khi thật cần). Danh từ đếm được ghi loại từ ("quả chuối", "con mèo", "cái bàn"). Động từ không thêm "sự". Không phiên âm, không giải thích, không `;` `/` `(`. Đa nghĩa: chọn nghĩa hợp nhóm emoji (`bat` = "con dơi", `ruler` = "cái thước kẻ", `glass` = "cái cốc thuỷ tinh", `pupil=Student` = "học sinh"). Emoji lệch nghĩa (vd `club=Microphone`): chọn nghĩa đúng và đánh `check:true`.
- `ex`: câu đơn, 4-12 từ, ≤70 ký tự, viết hoa đầu câu, kết thúc `.` `?` `!`, hiện tại đơn/tiếp diễn, không chữ Việt, không thương hiệu/người thật, nội dung vui và an toàn. Chứa đúng từ (hoặc số nhiều/chia động từ đơn giản/`pl`/`alt`) **đúng 1 lần**; tránh bắt đầu câu bằng chính từ đó.
- `cat` chỉ lấy 1 nhãn trong bộ sau (bắt buộc):
  `fruit vegetable drink meal food` · `animal bird insect sea-animal plant` · `family people job` · `body` · `clothes house school toy tech thing` · `transport place` · `nature weather space` · `sport hobby music celebration` · `fantasy` · `color number shape feeling time` · `action describe`.
  Chọn: con vật biển -> `sea-animal`; chim -> `bird`; sâu bọ (spider, snail, worm) -> `insect`; đồ ăn vặt/nguyên liệu/tráng miệng -> `food`; món nấu (soup, pizza, rice) -> `meal`; hoạt động: sở thích -> `hobby`, môn thể thao -> `sport`.

## Lệnh kiểm (chạy đến khi 0 lỗi mới xong)
```
node tools/wordbank/check.mjs part-NN          # đối chiếu với in/part-NN.txt
node tools/wordbank/check.mjs --file <file.json>   # kiểm 1 file bất kỳ (không đối chiếu in/)
```
Lỗi = thoát mã 1 (phải sửa hết). "Lưu ý" chỉ để cân nhắc (vi dài, ex bắt đầu bằng chính từ, trùng nghĩa trong cùng nhóm). File mẫu chạy được: `tools/wordbank/EXAMPLE-part.json`.

## 10 dòng mẫu (đủ trường, đã qua check.mjs)
```json
{ "word": "banana", "vi": "quả chuối", "pos": "n", "cat": "fruit", "level": "starters", "ex": "I eat a banana every morning.", "img": "Banana", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "apple", "vi": "quả táo", "pos": "n", "cat": "fruit", "level": "starters", "ex": "She has an apple in her bag.", "img": "Red apple", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "orange", "vi": "quả cam", "pos": "n", "cat": "fruit", "level": "starters", "ex": "This orange is very sweet.", "img": "Orange circle", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "carrot", "vi": "cà rốt", "pos": "n", "cat": "vegetable", "level": "starters", "ex": "Rabbits like to eat carrots.", "img": "Carrot", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "potato", "vi": "khoai tây", "pos": "n", "cat": "vegetable", "level": "movers", "ex": "We need two potatoes for the soup.", "img": "Potato", "alt": [], "pl": "", "check": false, "levelCheck": true, "skip": false, "note": "" }
{ "word": "milk", "vi": "sữa", "pos": "n", "cat": "drink", "level": "starters", "ex": "He drinks milk before bed.", "img": "Glass of milk", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "breakfast", "vi": "bữa sáng", "pos": "n", "cat": "meal", "level": "starters", "ex": "I have breakfast at seven o'clock.", "img": "Pancakes", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "lunch", "vi": "bữa trưa", "pos": "n", "cat": "meal", "level": "starters", "ex": "We have lunch at school.", "img": "Bento box", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
{ "word": "club", "vi": "câu lạc bộ", "pos": "n", "cat": "hobby", "level": "movers", "ex": "I go to the chess club on Friday.", "img": "Microphone", "alt": [], "pl": "", "check": true, "levelCheck": true, "skip": false, "note": "emoji Microphone lệch nghĩa; cần duyệt" }
{ "word": "beer", "vi": "", "pos": "n", "cat": "drink", "level": "other", "ex": "", "img": "Beer mug", "alt": [], "pl": "", "check": false, "levelCheck": false, "skip": true, "note": "đồ uống có cồn, không hợp trẻ em" }
```
(Trong file thật, đặt các mục trong một mảng `[ ... ]` ngăn bằng dấu phẩy.)

Từ bị check.mjs bắt buộc `skip:true`: beer, wine, gun, pistol, bomb, bikini, syringe, injection, cigarette, alcohol, whisky, vodka, cocktail, rifle, grenade.
