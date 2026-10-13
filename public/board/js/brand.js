// Hằng số thương hiệu. Chờ HQ/EEO xác nhận cho dùng logo/tên ClassIn:
// đổi 1 dòng ở đây là tắt (logo:false hoặc wordmark:false), không sửa chỗ khác.
export const BRAND = {
  logo: true,                          // false: ẩn ảnh logo, thay bằng chữ "ClassIn"
  wordmark: true,                      // false: ẩn cả chữ "ClassIn" lẫn pill "Dành cho ClassIn X" (chế độ trung tính)
  labelKey: 'common.forClassinX',      // chữ pill và dòng tuyên bố nằm trong public/i18n (VI/EN)
  disclaimerKey: 'common.disclaimer',
  accent: '#04BC09',
  accentHover: '#0EE516',
};
