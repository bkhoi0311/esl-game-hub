# Giao việc cho agent dữ liệu (đợt cấp độ): soạn 1 phần kho từ mới

Tài liệu này thay `README-AGENT.md` cho các phần `new-NN`. Việc của bạn: đọc `tools/wordbank/in/new-NN.txt` và ghi `tools/wordbank/parts/new-NN.json`: mảng JSON thuần, UTF-8, thụt 2 dấu cách, **mỗi dòng của file in đúng 1 mục**, cùng thứ tự. Chỉ ghi 1 file đó; không sửa file nào khác. **Không** mở thư mục `tools/wordbank/src/` (tài liệu Cambridge có bản quyền). **Không** chép câu ví dụ, định nghĩa từ bất kỳ tài liệu hay sách nào: tự viết.

Cấp độ của từ đã được lấy tất định từ danh sách Cambridge English (Pre A1 Starters, A1 Movers, A2 Flyers 2025; A2 Key; B1 Preliminary). Bạn **không** đoán, **không** đổi cấp.

## File in `new-NN.txt` (cột ngăn bằng TAB, 8 cột)
`word  kpos  level  sense  alt  pl  display  cpos`
- `word`, `kpos` (= `pos` của mục), `level`, `alt` (ngăn bằng `|`), `pl`, `display`: **chép y nguyên** vào mục. check.mjs so lại từng trường và báo lỗi nếu khác.
- `sense`: ghi chú ngắn của danh sách (vd `of place`, `as in mail`); có thì **bắt buộc** chọn nghĩa theo ghi chú, và chép y nguyên vào trường `sense`.
- `cpos`: loại từ gốc của danh sách (vd `adj+n`, `v`, `det`) để bạn biết nghĩa nào cần ghi; **không** đưa vào mục.
- Dòng `sets` (new-05): số, thứ tự, thứ, tháng, nước, quốc tịch, châu lục; `display` là dạng viết hoa. Ví dụ `vi`: "số mười hai", "thứ Hai", "tháng Một", "nước Pháp", "người Pháp, tiếng Pháp". `cat` của bộ này: số/thứ tự -> `number`; thứ/tháng/mùa -> `time`; nước/châu lục -> `country`; quốc tịch -> `nationality`.

## Khoá có hậu tố nghĩa và chỗ trống trong cụm
- `word` có thể kết thúc bằng hậu tố trong ngoặc để phân biệt hai lemma trùng chữ: `may (month)` (tháng Năm) khác `may` (động từ khuyết thiếu), `it (subject)` (môn tin học) khác `it` (đại từ). Hậu tố chỉ là khoá: câu ví dụ chỉ chứa phần trước ngoặc (`May`, `IT`).
- Cụm có chỗ trống `as ... as`, `give somebody a call`: câu ví dụ dùng từ thật vào chỗ trống (`as fast as`, `give you a call`); matcher tự khớp.
- Hai dạng đơn/số nhiều hoặc hai chính tả cùng nghĩa (café/cafe, pyjamas/pajamas) chỉ giữ MỘT mục (cấp thấp hơn) và đưa dạng kia vào `alt`/`pl`; `check.mjs all` báo lỗi nếu còn cặp trùng.

## Mỗi mục
```json
{ "word": "borrow", "vi": "mượn", "pos": "v", "cat": "daily", "level": "flyers",
  "ex": "<câu tự viết, chứa từ đúng 1 lần>", "img": "", "alt": [], "pl": "", "display": "",
  "sense": "", "check": false, "levelCheck": false, "skip": false, "note": "" }
```
- `img` để `""` (từ mới không có emoji).
- `levelCheck` luôn `false`. `skip:true` chỉ cho từ trong `HARD_BLOCK` của check.mjs (beer, wine, gun, pistol, bomb, bikini, syringe, injection, cigarette, alcohol, whisky, vodka, cocktail, rifle, grenade) và bắt buộc có `note`; lúc đó `vi` và `ex` để `""`.
- `check:true` khi **không chắc** nghĩa, nhóm hoặc câu. KHÔNG đoán. Nhưng **không** đánh check chỉ vì từ khó hay từ PET: luật cũ từng làm agent đánh nhầm hàng loạt; check.mjs báo "Lưu ý" nếu một phần có hơn 10% mục `check:true`.

## `vi` (1 đến 40 ký tự, tiếng Việt có dấu, chữ thường đầu dòng trừ tên riêng)
- Nghĩa **thông dụng nhất theo đúng loại từ** của dòng in (`cpos`). Có `sense` thì bắt buộc theo `sense`.
- Tự nhiên, cách người Việt hay nói: "con ong" (không "ong mật"), "mượn" (không "sự mượn"). Danh từ đếm được có từ chỉ loại khi tự nhiên ("quả chuối", "chiếc vé", "tấm hộ chiếu"). Danh từ trừu tượng không thêm "sự" trừ khi tiếng Việt bắt buộc ("lời khuyên" cho advice, "cơ hội" cho chance).
- Starters/Movers/Flyers: nghĩa cho trẻ 6-12 tuổi. KET: 10-14 tuổi. PET: thiếu niên 12-16 tuổi, được dùng từ Hán Việt phổ thông ("bảo hiểm", "phỏng vấn", "ô nhiễm").
- Tối đa 2 nghĩa ngăn bằng ", " khi dòng in có 2 loại từ cùng cấp (`light` adj+n -> "ánh sáng, nhẹ") hoặc khi 1 nghĩa không đủ rõ. Không dùng `;` `/` `(`. Không phiên âm, không giải thích.
- Từ chức năng: nghĩa ngắn ("và", "nhưng", "của tôi", "mặc dù"). Mạo từ `a`/`the`: "một" / "cái, này (mạo từ)" chấp nhận được, đánh `check:true` để Opus quyết cách ghi.
- Cụm động từ: nghĩa của cả cụm ("look after" = "chăm sóc").

## `ex` (câu ví dụ tự viết)
- Chứa đúng từ (hoặc dạng chia / số nhiều / `alt` / `pl`) **đúng 1 lần**, không bắt đầu câu bằng chính từ. Viết hoa đầu câu, kết thúc `.` `?` `!`. Không chữ Việt, không thương hiệu, không người thật, không địa danh nhạy cảm.
- Độ dài và ngữ pháp theo cấp (check.mjs báo **lỗi** nếu vượt):

| Cấp | Số từ | Ký tự | Ngữ pháp được dùng |
|---|---|---|---|
| starters | 4-9 | tối đa 55 | hiện tại đơn/tiếp diễn, can, there is/are, câu mệnh lệnh ngắn |
| movers | 4-10 | tối đa 60 | + so sánh hơn/nhất, quá khứ đơn của `be` và vài động từ có quy tắc, must, have to |
| flyers | 4-12 | tối đa 70 | + quá khứ đơn, going to, will, could, should, may/might |
| ket | 5-12 | tối đa 75 | + hiện tại hoàn thành, mệnh đề because/when/if (loại 1) |
| pet | 5-14 | tối đa 90 | + mệnh đề quan hệ, câu điều kiện loại 1-2, bị động đơn giản, used to |

- Ngữ cảnh: S/M/F ở nhà, trường, công viên, động vật, đồ chơi. KET thêm mua sắm, du lịch gần, thể thao, công nghệ đơn giản. PET dùng ngữ cảnh thiếu niên: trường lớp, môn học, công nghệ, du lịch, sức khoẻ, sở thích, việc làm thêm, môi trường, cảm xúc. **Không** dùng hẹn hò, rượu bia, bạo lực, chính trị, tôn giáo.
- Câu phải làm rõ **đúng nghĩa đã chọn**: ngữ cảnh trong câu phải chỉ ra nghĩa đó (tự nghĩ tình huống, không dùng lại câu mẫu của tài liệu này hay của sách). Từ đa nghĩa thì câu không được mơ hồ.
- Từ nhạy cảm PET (arrest, crime, prison, thief...): câu trung tính, kể sự việc như một bản tin ngắn, không có chi tiết bạo lực; tự nghĩ câu riêng cho từng từ (không dùng chung một khuôn câu cho nhiều từ), `note: "PET nhạy cảm"`.
- check.mjs chặn câu trùng nguyên văn hoặc có chuỗi từ 6 từ liền nhau trùng một câu ví dụ trong tài liệu Cambridge (nếu máy có tài liệu đó). Hãy tự nghĩ câu, đừng nhớ lại ví dụ sách.

## `cat` (chỉ dùng 58 nhãn dưới đây, đúng loại từ cho phép)
| cat | Ý nghĩa | Loại từ cho phép | Bật "Which one is...?" |
|---|---|---|---|
| `fruit` | Trái cây | mọi loại từ | có |
| `vegetable` | Rau củ | mọi loại từ | có |
| `drink` | Đồ uống | mọi loại từ | có |
| `meal` | Bữa ăn, món ăn | mọi loại từ | - |
| `food` | Đồ ăn | mọi loại từ | - |
| `animal` | Động vật | mọi loại từ | có |
| `bird` | Chim | mọi loại từ | có |
| `insect` | Côn trùng | mọi loại từ | có |
| `sea-animal` | Động vật biển | mọi loại từ | có |
| `plant` | Cây cối | mọi loại từ | - |
| `family` | Gia đình | mọi loại từ | có |
| `people` | Con người | mọi loại từ | - |
| `job` | Nghề nghiệp | mọi loại từ | có |
| `body` | Cơ thể | mọi loại từ | có |
| `clothes` | Quần áo | mọi loại từ | có |
| `house` | Trong nhà | mọi loại từ | - |
| `school` | Trường học | mọi loại từ | - |
| `toy` | Đồ chơi | mọi loại từ | - |
| `tech` | Máy móc, công nghệ | mọi loại từ | - |
| `thing` | Đồ vật | mọi loại từ | - |
| `transport` | Phương tiện | mọi loại từ | có |
| `place` | Địa điểm | mọi loại từ | - |
| `nature` | Thiên nhiên | mọi loại từ | - |
| `weather` | Thời tiết | mọi loại từ | - |
| `space` | Vũ trụ | mọi loại từ | - |
| `sport` | Thể thao | mọi loại từ | có |
| `hobby` | Sở thích | mọi loại từ | - |
| `music` | Âm nhạc | mọi loại từ | - |
| `celebration` | Lễ hội | mọi loại từ | - |
| `fantasy` | Truyện thần tiên | mọi loại từ | - |
| `color` | Màu sắc | mọi loại từ | có |
| `number` | Số | mọi loại từ | có |
| `shape` | Hình khối | mọi loại từ | - |
| `feeling` | Cảm xúc | mọi loại từ | - |
| `time` | Thời gian | mọi loại từ | - |
| `action` | Hành động | mọi loại từ | - |
| `describe` | Từ miêu tả | mọi loại từ | - |
| `health` | Sức khoẻ | n | - |
| `material` | Chất liệu | n | có |
| `subject` | Môn học | n | có |
| `study` | Học tập | n | - |
| `work` | Công việc | n | - |
| `money` | Tiền, mua bán | n | - |
| `travel` | Du lịch | n | - |
| `media` | Truyền thông, giải trí | n | - |
| `environment` | Môi trường | n | - |
| `measure` | Đo lường | n | có |
| `country` | Quốc gia, châu lục | n | có |
| `nationality` | Quốc tịch, ngôn ngữ | adj n | - |
| `abstract` | Từ trừu tượng | n | - |
| `character` | Tính cách | adj | - |
| `opinion` | Nhận xét | adj | - |
| `manner` | Cách thức | adv phr | - |
| `motion` | Di chuyển | v | - |
| `speech` | Nói, giao tiếp | v | - |
| `mind` | Suy nghĩ | v | - |
| `daily` | Việc hằng ngày | v | - |
| `function` | Từ chức năng | other prep pron adv phr | - |

Chọn nhãn:
- **Danh từ**: nhãn cụ thể nếu có (animal, food, job, place, transport, clothes, tech, house...). Nếu không có thì health / material / subject / study / work / money / travel / media / environment / measure. **Chỉ khi không nhãn nào hợp mới dùng `abstract`.**
- **Động từ**: động tác thân thể (run, jump, clap) -> `action`; di chuyển, đi lại -> `motion`; nói, viết, hỏi, giải thích -> `speech`; nghĩ, biết, nhớ, quyết định, thích -> `mind`; việc nhà, mua sắm, nấu, dùng, làm -> `daily`.
- **Tính từ**: cảm xúc -> `feeling`; tính cách -> `character`; đánh giá (amazing, awful, boring) -> `opinion`; màu -> `color`; còn lại (hình dáng, kích thước, tính chất vật lý) -> `describe`. Quốc tịch -> `nationality`.
- **Trạng từ**: tần suất/thời gian (always, already, soon) -> `time`; cách thức -> `manner`. Cụm phr chỉ cách làm/tình huống (by accident, by hand, on purpose, in pencil) -> `manner`; cụm chỉ lúc nào (at once, at first, in advance) -> `time`.
- **Từ chức năng** (a, the, and, my, which, in, at least, excuse me): `function`. Cụm cố định không chức năng: chọn theo nghĩa (cụm chỉ cách như "by ..." -> `manner`).
- Muốn đề xuất nhãn mới thì ghi vào `note`, không tự thêm.

## Lệnh kiểm (chạy đến khi 0 lỗi mới xong)
```
node tools/wordbank/check.mjs new-NN          # đối chiếu với in/new-NN.txt
node tools/wordbank/check.mjs --file <file.json>   # kiểm 1 file bất kỳ (không đối chiếu in/)
```
Lỗi = thoát mã 1 (phải sửa hết). "Lưu ý" chỉ để cân nhắc (vi dài, ex bắt đầu bằng chính từ, trùng nghĩa trong cùng nhóm, quá khứ bất quy tắc ở S/M, nhiều check:true).

## Prompt mẫu cho điều phối viên (thay `<LV>`, `<NN>`, khối ngữ cảnh)
```
Bạn là agent dữ liệu cho ESL Game Hub (~/Documents/esl-game-hub). Việc: đọc
tools/wordbank/in/new-<NN>.txt (cột: word, kpos, level, sense, alt, pl, display, cpos) và ghi
tools/wordbank/parts/new-<NN>.json: mảng JSON, mỗi dòng in-file đúng 1 mục, cùng thứ tự,
theo đúng schema và quy tắc trong tools/wordbank/README-AGENT-LEVELS.md (đọc hết trước khi làm).
KHÔNG sửa tệp nào khác. KHÔNG mở thư mục tools/wordbank/src/ (tài liệu Cambridge có bản quyền).
KHÔNG chép câu ví dụ từ bất kỳ tài liệu nào: tự viết.
Chép y nguyên word/pos(=kpos)/level/alt/pl/display/sense. levelCheck luôn false.
Ngữ cảnh cấp: <khối theo cấp, bên dưới>
Nhãn cat: chỉ dùng 58 nhãn trong README-AGENT-LEVELS.md, đúng loại từ cho phép.
check:true chỉ khi thật sự không chắc nghĩa/nhóm (không đánh vì từ khó).
Chạy: node tools/wordbank/check.mjs new-<NN> cho đến khi 0 lỗi. Xem các "Lưu ý" và sửa nếu hợp lý.
Báo lại (tối đa 8 dòng): số mục, số check:true kèm lý do ngắn, các từ đa nghĩa đã chọn nghĩa nào.
```
Khối "Ngữ cảnh cấp":
- **movers / starters**: "Người học 6-10 tuổi. Nghĩa đơn giản, cụ thể. Câu 4-9 từ (Starters) hoặc 4-10 từ (Movers), thì hiện tại, chủ đề nhà, trường, động vật, đồ chơi, gia đình. Từ chức năng (a, the, and, my, which...): nghĩa ngắn, câu rất đơn giản."
- **flyers**: "Người học 9-12 tuổi. Câu 4-12 từ, được dùng quá khứ đơn, going to, will. Chủ đề trường lớp, thiên nhiên, du lịch gia đình, nghề nghiệp, sức khoẻ cơ bản."
- **ket**: "Người học 10-14 tuổi (A2 Key for Schools). Câu 5-12 từ, được dùng hiện tại hoàn thành, if loại 1. Chủ đề mua sắm, du lịch, thể thao, công nghệ, trường học, đồ ăn, nhà cửa, cảm xúc. Danh từ trừu tượng: nghĩa Việt thông dụng, không thêm 'sự' thừa."
- **pet**: "Người học 12-16 tuổi (B1 Preliminary for Schools). Câu 5-14 từ (tối đa 90 ký tự), được dùng mệnh đề quan hệ, câu điều kiện, bị động. Ngữ cảnh thiếu niên: môn học, kỳ thi, mạng xã hội, công nghệ, du lịch, sức khoẻ, môi trường, việc làm thêm, sở thích, cảm xúc. Từ Hán Việt phổ thông được dùng. Từ nhạy cảm (crime, prison, arrest...): nghĩa trung tính, câu kiểu bản tin, note 'PET nhạy cảm'. Cụm động từ: nghĩa của cả cụm, câu dùng đúng nghĩa đó."
- **sets**: "Số, thứ tự, thứ, tháng, nước, quốc tịch, châu lục. vi: 'số mười hai', 'thứ Hai', 'tháng Một', 'nước Pháp', 'người Pháp, tiếng Pháp'. display viết hoa đã có sẵn trong in-file. Câu ngắn theo cấp của dòng."

## Giới hạn điều phối
Tối đa 5 agent cùng lúc; mỗi agent chỉ ghi 1 tệp out; Opus duyệt riêng sau mỗi đợt (mẫu 15 từ mỗi phần cộng toàn bộ mục `check:true`, mục có `sense`, cat `abstract`/`function`, mục PET nhạy cảm).

## Nguồn cấp độ
Cấp độ từ vựng tham chiếu danh sách từ Cambridge English (Pre A1 Starters, A1 Movers, A2 Flyers 2025; A2 Key; B1 Preliminary). ESL Game Hub không liên kết và không được Cambridge chứng nhận.
