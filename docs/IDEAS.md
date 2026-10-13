# Ý tưởng để sau

- Number Race: game đua 2 bên dùng đề Toán sinh luật (`public/board/js/math`), tương tự Sentence Race.
- Sentence Race 3–4 làn cho màn 86 inch.
- Dọn mã Face trong `src/core/vision.js` (`createFaceDetector`, `MODELS.face`, `TIERS.face`) và `FaceLandmarker` trong `src/core/vision-worker.js` khi PLAN-CAMERA xong (Head Tilt đã gỡ 13/10/2026, không còn ai dùng; model `public/models/face_landmarker.task` đã xoá).
- Dọn `createMotionGrid` trong `vision.js` (Statue Freeze v2 không dùng nữa) cùng đợt đó.
- Dọn selector `.ht-*` thừa trong `src/styles/motion.css`.
- Ảnh bìa Sentence Race kiểu 3D (webp): đặt `src/assets/cards/sentence-race.webp` là tự thay SVG.
