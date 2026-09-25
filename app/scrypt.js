(() => {
  const root = typeof window !== "undefined" ? window : globalThis;

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function sha256(bytes) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    const bitLen = bytes.length * 8;
    const withPad = new Uint8Array(((bytes.length + 9 + 63) & ~63));
    withPad.set(bytes);
    withPad[bytes.length] = 0x80;
    const view = new DataView(withPad.buffer);
    view.setUint32(withPad.length - 4, bitLen >>> 0, false);
    view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000), false);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let off = 0; off < withPad.length; off += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i += 1) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((word, i) => ov.setUint32(i * 4, word, false));
    return out;
  }

  function hex(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i += 1) text += bytes[i].toString(16).padStart(2, "0");
    return text;
  }

  function hmac(key, message) {
    let k = key;
    if (k.length > 64) k = sha256(k);
    const block = new Uint8Array(64);
    block.set(k);
    const o = new Uint8Array(64);
    const i = new Uint8Array(64);
    for (let n = 0; n < 64; n += 1) {
      o[n] = block[n] ^ 0x5c;
      i[n] = block[n] ^ 0x36;
    }
    const inner = new Uint8Array(64 + message.length);
    inner.set(i);
    inner.set(message, 64);
    const outer = new Uint8Array(64 + 32);
    outer.set(o);
    outer.set(sha256(inner), 64);
    return sha256(outer);
  }

  function pbkdf2(password, salt, dkLen) {
    const out = new Uint8Array(dkLen);
    let filled = 0;
    let block = 1;
    while (filled < dkLen) {
      const msg = new Uint8Array(salt.length + 4);
      msg.set(salt);
      msg[salt.length] = (block >>> 24) & 255;
      msg[salt.length + 1] = (block >>> 16) & 255;
      msg[salt.length + 2] = (block >>> 8) & 255;
      msg[salt.length + 3] = block & 255;
      const chunk = hmac(password, msg);
      const take = Math.min(32, dkLen - filled);
      out.set(chunk.subarray(0, take), filled);
      filled += take;
      block += 1;
    }
    return out;
  }

  function salsa(words) {
    const x = words.slice();
    for (let round = 0; round < 4; round += 1) {
      x[4] ^= rotr(x[0] + x[12], 25); x[8] ^= rotr(x[4] + x[0], 23);
      x[12] ^= rotr(x[8] + x[4], 19); x[0] ^= rotr(x[12] + x[8], 14);
      x[9] ^= rotr(x[5] + x[1], 25); x[13] ^= rotr(x[9] + x[5], 23);
      x[1] ^= rotr(x[13] + x[9], 19); x[5] ^= rotr(x[1] + x[13], 14);
      x[14] ^= rotr(x[10] + x[6], 25); x[2] ^= rotr(x[14] + x[10], 23);
      x[6] ^= rotr(x[2] + x[14], 19); x[10] ^= rotr(x[6] + x[2], 14);
      x[3] ^= rotr(x[15] + x[11], 25); x[7] ^= rotr(x[3] + x[15], 23);
      x[11] ^= rotr(x[7] + x[3], 19); x[15] ^= rotr(x[11] + x[7], 14);
      x[1] ^= rotr(x[0] + x[3], 25); x[2] ^= rotr(x[1] + x[0], 23);
      x[3] ^= rotr(x[2] + x[1], 19); x[0] ^= rotr(x[3] + x[2], 14);
      x[6] ^= rotr(x[5] + x[4], 25); x[7] ^= rotr(x[6] + x[5], 23);
      x[4] ^= rotr(x[7] + x[6], 19); x[5] ^= rotr(x[4] + x[7], 14);
      x[11] ^= rotr(x[10] + x[9], 25); x[8] ^= rotr(x[11] + x[10], 23);
      x[9] ^= rotr(x[8] + x[11], 19); x[10] ^= rotr(x[9] + x[8], 14);
      x[12] ^= rotr(x[15] + x[14], 25); x[13] ^= rotr(x[12] + x[15], 23);
      x[14] ^= rotr(x[13] + x[12], 19); x[15] ^= rotr(x[14] + x[13], 14);
    }
    for (let i = 0; i < 16; i += 1) words[i] = (words[i] + x[i]) >>> 0;
  }

  function rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }

  function salsaBytes(block) {
    const words = new Uint32Array(16);
    const view = new DataView(block.buffer, block.byteOffset, 64);
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(i * 4, true);
    const x = new Uint32Array(words);
    for (let round = 0; round < 4; round += 1) {
      x[4] ^= rotl((x[0] + x[12]) >>> 0, 7); x[8] ^= rotl((x[4] + x[0]) >>> 0, 9);
      x[12] ^= rotl((x[8] + x[4]) >>> 0, 13); x[0] ^= rotl((x[12] + x[8]) >>> 0, 18);
      x[9] ^= rotl((x[5] + x[1]) >>> 0, 7); x[13] ^= rotl((x[9] + x[5]) >>> 0, 9);
      x[1] ^= rotl((x[13] + x[9]) >>> 0, 13); x[5] ^= rotl((x[1] + x[13]) >>> 0, 18);
      x[14] ^= rotl((x[10] + x[6]) >>> 0, 7); x[2] ^= rotl((x[14] + x[10]) >>> 0, 9);
      x[6] ^= rotl((x[2] + x[14]) >>> 0, 13); x[10] ^= rotl((x[6] + x[2]) >>> 0, 18);
      x[3] ^= rotl((x[15] + x[11]) >>> 0, 7); x[7] ^= rotl((x[3] + x[15]) >>> 0, 9);
      x[11] ^= rotl((x[7] + x[3]) >>> 0, 13); x[15] ^= rotl((x[11] + x[7]) >>> 0, 18);
      x[1] ^= rotl((x[0] + x[3]) >>> 0, 7); x[2] ^= rotl((x[1] + x[0]) >>> 0, 9);
      x[3] ^= rotl((x[2] + x[1]) >>> 0, 13); x[0] ^= rotl((x[3] + x[2]) >>> 0, 18);
      x[6] ^= rotl((x[5] + x[4]) >>> 0, 7); x[7] ^= rotl((x[6] + x[5]) >>> 0, 9);
      x[4] ^= rotl((x[7] + x[6]) >>> 0, 13); x[5] ^= rotl((x[4] + x[7]) >>> 0, 18);
      x[11] ^= rotl((x[10] + x[9]) >>> 0, 7); x[8] ^= rotl((x[11] + x[10]) >>> 0, 9);
      x[9] ^= rotl((x[8] + x[11]) >>> 0, 13); x[10] ^= rotl((x[9] + x[8]) >>> 0, 18);
      x[12] ^= rotl((x[15] + x[14]) >>> 0, 7); x[13] ^= rotl((x[12] + x[15]) >>> 0, 9);
      x[14] ^= rotl((x[13] + x[12]) >>> 0, 13); x[15] ^= rotl((x[14] + x[13]) >>> 0, 18);
    }
    for (let i = 0; i < 16; i += 1) view.setUint32(i * 4, (words[i] + x[i]) >>> 0, true);
  }

  function blockMix(block, r) {
    const blocks = 2 * r;
    const x = block.slice((blocks - 1) * 64, blocks * 64);
    const y = new Uint8Array(block.length);
    for (let i = 0; i < blocks; i += 1) {
      const piece = block.subarray(i * 64, (i + 1) * 64);
      for (let n = 0; n < 64; n += 1) x[n] ^= piece[n];
      salsaBytes(x);
      y.set(x, i * 64);
    }
    for (let i = 0; i < r; i += 1) {
      block.set(y.subarray(i * 2 * 64, (i * 2 + 1) * 64), i * 64);
      block.set(y.subarray((i * 2 + 1) * 64, (i * 2 + 2) * 64), (i + r) * 64);
    }
  }

  function integerify(block, r) {
    const off = (2 * r - 1) * 64;
    return (block[off] | (block[off + 1] << 8) | (block[off + 2] << 16) | (block[off + 3] << 24)) >>> 0;
  }

  function romix(block, n, r) {
    const v = new Array(n);
    let x = block;
    for (let i = 0; i < n; i += 1) {
      v[i] = x.slice();
      blockMix(x, r);
    }
    for (let i = 0; i < n; i += 1) {
      const j = integerify(x, r) & (n - 1);
      const pick = v[j];
      for (let nbyte = 0; nbyte < x.length; nbyte += 1) x[nbyte] ^= pick[nbyte];
      blockMix(x, r);
    }
    return x;
  }

  function scryptRaw(password, salt, n, r, p, dkLen) {
    const mf = 128 * r;
    let block = pbkdf2(password, salt, p * mf);
    const mixed = new Uint8Array(p * mf);
    for (let i = 0; i < p; i += 1) {
      const chunk = block.subarray(i * mf, (i + 1) * mf);
      const own = new Uint8Array(chunk);
      mixed.set(romix(own, n, r), i * mf);
    }
    return pbkdf2(password, mixed, dkLen);
  }

  function bytesOf(text) {
    return new TextEncoder().encode(String(text == null ? "" : text));
  }

  root.SolaxScrypt = {
    sha256,
    hex,
    scryptRaw,
    matchesTest() {
      const got = hex(scryptRaw(new Uint8Array(), new Uint8Array(), 16, 1, 1, 64));
      return got === "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906";
    },
    passwordHash(password, saltBytes) {
      return scryptRaw(bytesOf(password), saltBytes, 16384, 8, 1, 32);
    }
  };

  void salsa;
  void rotr;
})();
