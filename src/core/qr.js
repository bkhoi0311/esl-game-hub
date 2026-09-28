// Tạo mã QR (chế độ byte, mức sửa lỗi M, phiên bản 1-6: đủ cho chuỗi tới ~100 byte).
// Tự viết để không cần thêm thư viện; thuật toán theo chuẩn ISO/IEC 18004 (tham khảo cách làm của Nayuki, MIT).

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4];
const FORMAT_BITS_M = 0;

function rawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
  }
  return result;
}

function dataCodewords(ver) {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver];
}

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = Array(degree - 1).fill(0).concat([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

function utf8(text) {
  return Array.from(new TextEncoder().encode(text));
}

// Trả về ma trận boolean [y][x] (true = ô đen), hoặc ném lỗi nếu chuỗi quá dài.
export function qrMatrix(text) {
  const bytes = utf8(text);
  let ver = 1;
  while (ver <= 6 && 4 + 8 + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
  if (ver > 6) throw new Error('QR text too long');

  // ----- Dữ liệu -----
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4); // chế độ byte
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) data.push(pad);

  // ----- Chia khối + mã sửa lỗi + xen kẽ -----
  const numBlocks = BLOCKS_M[ver];
  const eccLen = ECC_PER_BLOCK_M[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(block[i]);
    });
  }

  // ----- Vẽ các mẫu cố định -----
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const isFn = Array.from({ length: size }, () => Array(size).fill(false));
  const setFn = (x, y, dark) => {
    modules[y][x] = dark;
    isFn[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  if (ver >= 2) {
    const pos = [6, size - 7];
    const last = pos.length - 1;
    pos.forEach((x, i) =>
      pos.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
  }

  const drawFormat = (mask) => {
    const val = (FORMAT_BITS_M << 3) | mask;
    let rem = val;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((val << 10) | rem) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // giữ chỗ

  // ----- Đặt dữ liệu theo đường zic-zac -----
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  // ----- Chọn mặt nạ có điểm phạt thấp nhất -----
  const maskFn = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && maskFn[m](x, y)) modules[y][x] = !modules[y][x];
  };
  const penalty = () => {
    let p = 0;
    for (let a = 0; a < size; a++) {
      for (const line of [modules[a], modules.map((r) => r[a])]) {
        let run = 1;
        for (let k = 1; k <= size; k++) {
          if (k < size && line[k] === line[k - 1]) run++;
          else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
      }
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3;
      }
    }
    const dark = modules.flat().filter(Boolean).length;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const score = penalty();
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
    applyMask(m); // bỏ mặt nạ (XOR 2 lần)
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

// SVG mã QR, có viền trắng 4 ô.
export function qrSvg(text, { dark = '#1c1f25', light = '#ffffff' } = {}) {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let path = '';
  m.forEach((row, y) => row.forEach((on, x) => on && (path += `M${x + 4} ${y + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
