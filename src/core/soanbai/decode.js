// Đọc byte của file văn bản thành chuỗi (PLAN-SOANBAI E1). Thuần, không DOM.
// Thứ tự: BOM UTF-16 -> UTF-8 (nghiêm ngặt) -> windows-1258 (CSV cũ của Excel tiếng Việt).
export function decodeText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), legacyEncoding: false };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), legacyEncoding: false };
  }
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const body = start ? bytes.subarray(start) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), legacyEncoding: false };
  } catch (err) {
    let text;
    try {
      text = new TextDecoder('windows-1258').decode(body);
    } catch (err2) {
      text = new TextDecoder('latin1').decode(body);
    }
    return { text: text.replace(/^﻿/, ''), legacyEncoding: true };
  }
}
