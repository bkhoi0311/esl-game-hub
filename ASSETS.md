# Nguồn và giấy phép tài nguyên

| Tài nguyên | Nguồn | Giấy phép |
| --- | --- | --- |
| Hình minh hoạ 11 thẻ game, mascot Lumi, nền thế giới, bóng bay, chuột chũi, búa, thẻ từ, đèn giao thông | Vẽ bằng code (SVG / Phaser Graphics) trong dự án | Của dự án |
| Font Plus Jakarta Sans (`src/assets/fonts/PlusJakartaSans-*.woff2`) | Google Fonts | SIL Open Font License 1.1 (`src/assets/fonts/OFL.txt`) |
| Font Baloo 2 (`src/assets/fonts/Baloo2-*.woff2`) | Google Fonts | SIL Open Font License 1.1 (`src/assets/fonts/OFL-Baloo2.txt`) |
| Logo ClassIn (`src/assets/classin-logo-green.png`) | Design-ClassIn-2026 (Canva Brand Kit của ClassIn) | Thương hiệu ClassIn, dùng cho tài liệu ClassIn |
| Giọng đọc (`src/assets/voices/`) | Tạo bằng OmniVoice (k2-fsa/OmniVoice) trên máy, giọng thiết kế bằng mô tả (không nhân bản giọng người thật) | Tạo trong dự án |
| Âm hiệu đúng/sai/thắng | Tổng hợp bằng Web Audio trong `src/core/audio.js` | Của dự án |
| Model MediaPipe (`public/models/*.task`) | Google MediaPipe | Apache-2.0 |
| Icon giao diện | Lucide | ISC |

## Tranh minh hoạ thẻ game (src/assets/cards/*.webp)
- Nguồn: ảnh mẫu giao diện do chủ dự án cung cấp (28/09/2026). Cắt phần tranh của từng thẻ, xoá huy hiệu "Cần camera" cũ, làm nét x4 bằng Real-ESRGAN (model realesrgan-x4plus-anime), xuất WebP 640px.
- Dùng cho thẻ menu và màn cài đặt từng game. SVG vẽ tay trong src/core/art.js giữ làm dự phòng.

## Liquid Glass (src/styles/liquid-glass.css, src/vendor/liquid-glass.js, tests/qa-audit.js)
- Nguồn: bộ kit skill liquid-glass-design v2.2.1 (github.com/bkhoi0311/liquid-glass-design), giấy phép MIT; kit tổng hợp từ deepika-builds/liquid-glass, haider-nawaz/liquid-glass-skill, s1gmamale1/apple-design-skills (MIT).
