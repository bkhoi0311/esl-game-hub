// Khởi động giao diện ngày lễ cho trang tĩnh (CSP không cho script nội tuyến): <script type="module" src="../shared/holiday-boot.js" data-hol-page="start|board">
import { initHoliday } from './holiday.js';
const tag = document.querySelector('script[data-hol-page]');
initHoliday({ page: (tag && tag.dataset.holPage) || 'start' });
