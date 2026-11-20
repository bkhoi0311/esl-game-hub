// Lịch âm Việt Nam theo thuật toán Hồ Ngọc Đức (múi giờ UTC+7). Chỉ dùng để KIỂM bảng âm lịch trong public/shared/holiday.js.
const PI = Math.PI;
const INT = Math.floor;

export function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

function newMoon(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const dt = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Jd1 + C1 - dt;
}

function sunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  const omega = 125.04 - 1934.136 * T;
  L = L - 0.00569 - 0.00478 * Math.sin(omega * dr);
  L *= dr;
  return L - PI * 2 * INT(L / (PI * 2));
}

const sunLong = (day, tz) => INT(sunLongitude(day - 0.5 - tz / 24) / PI * 6);
const newMoonDay = (k, tz) => INT(newMoon(k) + 0.5 + tz / 24);

function lunarMonth11(yy, tz) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = newMoonDay(k, tz);
  if (sunLong(nm, tz) >= 9) nm = newMoonDay(k - 1, tz);
  return nm;
}

function leapMonthOffset(a11, tz) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = sunLong(newMoonDay(k + i, tz), tz);
  do { last = arc; i++; arc = sunLong(newMoonDay(k + i, tz), tz); } while (arc !== last && i < 14);
  return i - 1;
}

// [ngày, tháng, năm, nhuận] âm lịch của ngày dương dd/mm/yy.
export function solarToLunar(dd, mm, yy, tz = 7) {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1, tz);
  if (monthStart > dayNumber) monthStart = newMoonDay(k, tz);
  let a11 = lunarMonth11(yy, tz);
  let b11 = a11, lunarYear;
  if (a11 >= monthStart) { lunarYear = yy; a11 = lunarMonth11(yy - 1, tz); }
  else { lunarYear = yy + 1; b11 = lunarMonth11(yy + 1, tz); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let leap = 0, lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const lm = leapMonthOffset(a11, tz);
    if (diff >= lm) { lunarMonth = diff + 10; if (diff === lm) leap = 1; }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return [lunarDay, lunarMonth, lunarYear, leap];
}

// Ngày dương 'YYYY-MM-DD' của âm lịch (ld/lm, KHÔNG nhuận) trong năm âm lịch ly.
export function lunarToSolarISO(ld, lm, ly) {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(Date.UTC(ly, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      const [a, b, c, leap] = solarToLunar(d, m, ly);
      if (a === ld && b === lm && c === ly && !leap) return `${ly}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}
