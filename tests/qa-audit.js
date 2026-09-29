
() => {
  const W = window.__LG_W || (window.visualViewport ? window.visualViewport.width : window.innerWidth);
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return {r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1}; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  function background(el) {
    let layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: 'gradient/image behind text' };
      if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) {
        const c = parse(cs.backgroundColor); if (!c || c.a < 0.85) return { unknown: 'text on glass' }; }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const rootBg = parse(getComputedStyle(document.body).backgroundColor);
    if (rootBg && rootBg.a > 0.99) bg = rootBg;
    for (let i = layers.length - 1; i >= 0; i--) bg = mix(layers[i], bg);
    return { color: bg };
  }
  const out = { contrast: [], glassText: 0, smallTargets: [], pastEdge: [], hidden: 0 };
  const seen = new Set();
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
    if (parseFloat(cs.opacity) < 0.1 && el.textContent.trim()) out.hidden++;
    if (r.right > W + 1 && r.left < W - 1 && cs.position !== 'fixed' && !el.closest('[data-qa-scroll], .lg-scroll, table') && out.pastEdge.length < 8)
      out.pastEdge.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`);
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own && parseFloat(cs.opacity) > 0.1) {
      const fg = parse(cs.color); const b = background(el);
      if (b.unknown) { out.glassText++; }
      else if (fg) {
        const f = mix(fg, b.color); const L1 = lum(f), L2 = lum(b.color);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
        const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
        const key = el.tagName + el.className + cs.color;
        if (ratio < need && !seen.has(key)) { seen.add(key);
          out.contrast.push(`${ratio.toFixed(2)} < ${need}  "${el.textContent.trim().slice(0, 40)}"  (${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]})`); }
      }
    }
    if (el.matches('a, button, input, select, [role=button], [role=tab]')) {
      const inline = el.tagName === 'A' && cs.display === 'inline' && el.closest('p, li, td');
      if (!inline && (r.height < 44 || r.width < 44) && out.smallTargets.length < 10)
        out.smallTargets.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });
  out.overflowX = Math.max(document.documentElement.scrollWidth, window.innerWidth) - W;
  return out;
}
