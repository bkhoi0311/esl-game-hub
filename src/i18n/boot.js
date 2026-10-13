// Khởi động song ngữ: PHẢI là import đầu tiên của main.js (lõi cần chạy trước mọi module có chữ).
// main.js: await Promise.all([initLinkedPack(), i18nReady]) trước lần dựng đầu tiên => không nháy chữ Việt khi ?ui=en.
import 'virtual:i18n-core';
import { lang, ensureEn, syncCore } from './index.js';

syncCore();
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('i18n timeout')), ms));
export let i18nFailed = false;
export const i18nReady = (lang() === 'en' ? Promise.race([ensureEn('core'), timeout(4000)]) : Promise.resolve())
  .catch((err) => {
    console.error(err);
    i18nFailed = true;
    window.I18N.setLang('vi', { persist: false, url: false });
  });
