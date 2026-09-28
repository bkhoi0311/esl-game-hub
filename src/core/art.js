// Hình minh hoạ tự vẽ cho 9 thẻ game (SVG, nét đậm, màu tươi để các bé dễ nhận ra).
// Màu lấy từ bảng shape-* / brand-* của Design-ClassIn-2026.
const C = {
  ink: '#1c1f25',
  green: '#04bc09',
  lime: '#bbee23',
  yellow: '#ffea00',
  orange: '#ff9800',
  red: '#ff5a00',
  pink: '#fd3cc6',
  cyan: '#00e1f3',
  blue: '#00a2fd',
  cobalt: '#0c6bed',
  white: '#ffffff',
  skin: '#ffc98f',
};

const S = `stroke="${C.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`;

const ART = {
  // Đèn giao thông + bạn nhỏ đứng im
  'statue-freeze': `
    <circle cx="80" cy="80" r="72" fill="#e7f9e7"/>
    <rect x="22" y="26" width="40" height="96" rx="14" fill="${C.ink}"/>
    <circle cx="42" cy="50" r="13" fill="${C.red}"/>
    <circle cx="42" cy="50" r="5" fill="#ffb199"/>
    <circle cx="42" cy="84" r="13" fill="#39414f"/>
    <circle cx="42" cy="84" r="13" fill="${C.green}" opacity=".25"/>
    <rect x="37" y="122" width="10" height="18" fill="${C.ink}"/>
    <circle cx="106" cy="48" r="15" fill="${C.skin}" ${S}/>
    <circle cx="101" cy="46" r="2.5" fill="${C.ink}"/><circle cx="111" cy="46" r="2.5" fill="${C.ink}"/>
    <path d="M100 55h12" ${S} stroke-width="3"/>
    <path d="M106 63v38M106 72l-22-10M106 72l22-10M106 101l-14 30M106 101l14 30" ${S} stroke-width="7"/>
    <path d="M106 72v29" stroke="${C.cobalt}" stroke-width="14" stroke-linecap="round"/>
    <path d="M132 30l8-8M138 42l10-2M126 22l2-10" ${S} stroke-width="3"/>`,

  // Bạn nhỏ giơ tay + bong bóng lời nói
  'simon-pose': `
    <circle cx="80" cy="80" r="72" fill="#fff5d6"/>
    <path d="M14 22h66a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10H40l-12 12v-12H14a10 10 0 0 1-10-10V32a10 10 0 0 1 10-10z" fill="${C.white}" ${S}/>
    <path d="M22 41h48" stroke="${C.orange}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="112" cy="66" r="16" fill="${C.skin}" ${S}/>
    <path d="M106 64h.1M118 64h.1" ${S} stroke-width="6"/>
    <path d="M106 73q6 5 12 0" ${S} stroke-width="3"/>
    <path d="M112 84v36" stroke="${C.red}" stroke-width="18" stroke-linecap="round"/>
    <path d="M104 88l-18-30M120 88l18-30" ${S} stroke-width="7"/>
    <circle cx="85" cy="55" r="7" fill="${C.skin}" ${S} stroke-width="3"/>
    <circle cx="139" cy="55" r="7" fill="${C.skin}" ${S} stroke-width="3"/>
    <path d="M106 120l-8 26M118 120l8 26" ${S} stroke-width="7"/>`,

  // Khuôn mặt nghiêng + 2 đáp án A/B
  'head-tilt': `
    <circle cx="80" cy="80" r="72" fill="#e3f4ff"/>
    <g transform="rotate(-16 80 88)">
      <circle cx="80" cy="88" r="36" fill="${C.skin}" ${S}/>
      <path d="M50 70q30-34 60 0" fill="#6b4226" ${S}/>
      <circle cx="68" cy="88" r="4.5" fill="${C.ink}"/><circle cx="92" cy="88" r="4.5" fill="${C.ink}"/>
      <path d="M68 104q12 9 24 0" ${S} stroke-width="3.5"/>
      <circle cx="60" cy="99" r="5" fill="${C.pink}" opacity=".55"/><circle cx="100" cy="99" r="5" fill="${C.pink}" opacity=".55"/>
    </g>
    <rect x="6" y="18" width="40" height="36" rx="10" fill="${C.green}" ${S}/>
    <path d="M18 45l8-20 8 20M21 38h10" stroke="${C.white}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="114" y="18" width="40" height="36" rx="10" fill="${C.white}" ${S}/>
    <path d="M127 25v20h8a5 5 0 0 0 0-10h-8 7a5 5 0 0 0 0-10z" stroke="${C.ink}" stroke-width="3.5" fill="none" stroke-linejoin="round"/>
    <path d="M40 132q40 16 80 0" stroke="${C.blue}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="2 10"/>`,

  // Thẻ từ bị chém đôi + vệt sáng
  'word-ninja': `
    <circle cx="80" cy="80" r="72" fill="#ffe8f7"/>
    <g transform="rotate(-12 60 70)">
      <rect x="22" y="42" width="72" height="44" rx="10" fill="${C.yellow}" ${S}/>
      <path d="M36 58h44M36 70h28" ${S} stroke-width="5"/>
    </g>
    <g transform="rotate(18 106 104)">
      <rect x="72" y="86" width="68" height="40" rx="10" fill="${C.cyan}" ${S}/>
      <path d="M86 100h40M86 112h22" ${S} stroke-width="5"/>
    </g>
    <path d="M18 138L146 18" stroke="${C.white}" stroke-width="16" stroke-linecap="round"/>
    <path d="M18 138L146 18" stroke="${C.pink}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="146" cy="18" r="6" fill="${C.white}" ${S} stroke-width="3"/>
    <path d="M30 22l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="${C.yellow}" ${S} stroke-width="2.5"/>`,

  // Rương báu + đồng vàng
  'gold-heist': `
    <circle cx="80" cy="80" r="72" fill="#fff3d1"/>
    <path d="M28 76h104v50a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" fill="#c8711e" ${S}/>
    <path d="M28 76q0-38 52-38t52 38z" fill="#e98b2a" ${S}/>
    <path d="M28 76h104" ${S}/>
    <path d="M54 40v94M106 40v94" stroke="${C.ink}" stroke-width="4" opacity=".35"/>
    <rect x="68" y="70" width="24" height="24" rx="5" fill="${C.yellow}" ${S}/>
    <circle cx="80" cy="82" r="3.5" fill="${C.ink}"/>
    <circle cx="36" cy="30" r="14" fill="${C.yellow}" ${S}/>
    <path d="M36 23v14" ${S} stroke-width="3"/>
    <circle cx="128" cy="28" r="11" fill="${C.yellow}" ${S}/>
    <circle cx="140" cy="54" r="8" fill="${C.yellow}" ${S} stroke-width="3"/>
    <path d="M14 58l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${C.white}" ${S} stroke-width="2"/>`,

  // 4 thẻ giống nhau + 1 thẻ lạ và kính lúp
  impostor: `
    <circle cx="80" cy="80" r="72" fill="#eaf0ff"/>
    <rect x="14" y="30" width="34" height="44" rx="8" fill="${C.green}" ${S}/>
    <rect x="56" y="30" width="34" height="44" rx="8" fill="${C.green}" ${S}/>
    <rect x="14" y="84" width="34" height="44" rx="8" fill="${C.green}" ${S}/>
    <rect x="56" y="84" width="34" height="44" rx="8" fill="${C.green}" ${S}/>
    <rect x="102" y="56" width="40" height="50" rx="9" fill="${C.pink}" ${S}/>
    <path d="M116 72q0-8 8-8t8 8q0 6-8 8v5M124 94v.1" stroke="${C.white}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <circle cx="112" cy="116" r="17" fill="${C.white}" fill-opacity=".6" ${S} stroke-width="5"/>
    <path d="M124 128l18 18" ${S} stroke-width="9"/>`,

  // Ô chữ xanh / vàng / xám
  wordle: `
    <circle cx="80" cy="80" r="72" fill="#eafbe9"/>
    <g font-family="Gilroy, 'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="26" text-anchor="middle">
      <rect x="10" y="26" width="42" height="42" rx="9" fill="${C.green}" ${S}/>
      <text x="31" y="57" fill="${C.white}">F</text>
      <rect x="59" y="26" width="42" height="42" rx="9" fill="${C.yellow}" ${S}/>
      <text x="80" y="57" fill="${C.ink}">O</text>
      <rect x="108" y="26" width="42" height="42" rx="9" fill="#b8bec7" ${S}/>
      <text x="129" y="57" fill="${C.white}">O</text>
      <rect x="10" y="80" width="42" height="42" rx="9" fill="${C.green}" ${S}/>
      <text x="31" y="111" fill="${C.white}">F</text>
      <rect x="59" y="80" width="42" height="42" rx="9" fill="${C.green}" ${S}/>
      <text x="80" y="111" fill="${C.white}">O</text>
      <rect x="108" y="80" width="42" height="42" rx="9" fill="${C.white}" ${S}/>
      <text x="129" y="111" fill="${C.ink}">?</text>
    </g>
    <path d="M24 138h112" stroke="${C.lime}" stroke-width="7" stroke-linecap="round"/>`,

  // Sợi dây kéo co + 2 tay
  'tug-of-war': `
    <circle cx="80" cy="80" r="72" fill="#fff0e6"/>
    <path d="M80 34v92" stroke="${C.ink}" stroke-width="4" stroke-dasharray="6 7"/>
    <path d="M8 84q36-14 72 0t72 0" stroke="#b77a2d" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M8 84q36-14 72 0t72 0" stroke="#e7b36a" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="7 7"/>
    <rect x="72" y="72" width="16" height="24" rx="5" fill="${C.red}" ${S} stroke-width="3"/>
    <circle cx="28" cy="80" r="14" fill="${C.skin}" ${S}/>
    <path d="M18 76h20M18 84h20" ${S} stroke-width="3"/>
    <circle cx="132" cy="82" r="14" fill="${C.skin}" ${S}/>
    <path d="M122 78h20M122 86h20" ${S} stroke-width="3"/>
    <path d="M22 40l-12 10 12 10M138 40l12 10-12 10" stroke="${C.cobalt}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M52 124h56" stroke="${C.green}" stroke-width="7" stroke-linecap="round"/>`,

  // Bút chì vẽ + dấu hỏi
  'draw-guess': `
    <circle cx="80" cy="80" r="72" fill="#f1ecff"/>
    <rect x="14" y="36" width="96" height="84" rx="12" fill="${C.white}" ${S}/>
    <path d="M30 96q10-34 24-12t26-16" stroke="${C.blue}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="62" r="8" fill="${C.orange}"/>
    <g transform="rotate(40 118 88)">
      <rect x="108" y="44" width="22" height="64" rx="4" fill="${C.yellow}" ${S}/>
      <path d="M108 108l11 20 11-20z" fill="${C.skin}" ${S}/>
      <path d="M116 122l3 6 3-6z" fill="${C.ink}"/>
      <rect x="108" y="36" width="22" height="12" rx="4" fill="${C.pink}" ${S}/>
    </g>
    <circle cx="130" cy="30" r="18" fill="${C.green}" ${S}/>
    <path d="M124 25q0-7 6-7t6 7q0 5-6 6v3M130 40v.1" stroke="${C.white}" stroke-width="4" stroke-linecap="round" fill="none"/>`,
};

export function gameArt(id) {
  const body = ART[id] || '';
  const wrap = document.createElement('span');
  wrap.className = 'game-art';
  wrap.innerHTML = `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  return wrap;
}
