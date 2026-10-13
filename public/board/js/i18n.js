// Cầu nối module tới lõi song ngữ (public/i18n/i18n.js, script thường nạp trước trong index.html).
const I = window.I18N;
if (!I) throw new Error('thiếu i18n.js');
export const { t, tIn, bind, bindPair, onLang, lang, setLang, withUi, flag, mountSwitch, apply } = I;
