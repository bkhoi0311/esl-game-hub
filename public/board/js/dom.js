// Hàm DOM nhỏ dùng chung cho các module v2.
export const $ = (sel, root) => (root || document).querySelector(sel);
export function h(tag, cls, html, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
// Nhóm lựa chọn: chỉ đổi class/aria-pressed, KHÔNG dựng lại nút (PLAN-V2 mục C).
export function markSelected(group, pred) {
  const bs = group.querySelectorAll('button');
  for (let i = 0; i < bs.length; i++) {
    const on = !!pred(bs[i]);
    bs[i].classList.toggle('is-selected', on);
    bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
