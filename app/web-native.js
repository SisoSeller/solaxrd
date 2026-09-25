(() => {
  const root = window;
  root.SolaxWeb = true;

  function bytesFromB64(token) {
    if (!token) return new Uint8Array();
    const bin = atob(token);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function b64FromBytes(bytes) {
    let bin = "";
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) {
      bin += String.fromCharCode(...arr.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  const prefix = "solaxrd.";

  function fileKey(name) {
    return prefix + "file:" + name;
  }

  root.SolaxNative = {
    load(key) {
      try { return localStorage.getItem(prefix + key) || ""; } catch (e) { return ""; }
    },
    store(key, value) {
      try { localStorage.setItem(prefix + key, String(value == null ? "" : value)); } catch (e) { /* quota */ }
    },
    remove(key) {
      try { localStorage.removeItem(prefix + key); } catch (e) { /* skip */ }
    },
    sha256bytes(token) {
      try { return root.SolaxScrypt.hex(root.SolaxScrypt.sha256(bytesFromB64(token))); } catch (e) { return ""; }
    },
    scrypt(password, saltB64) {
      try {
        const salt = bytesFromB64(saltB64);
        if (salt.length !== 16) return "";
        return b64FromBytes(root.SolaxScrypt.passwordHash(password, salt));
      } catch (e) { return ""; }
    },
    randomSalt() {
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      return b64FromBytes(salt);
    },
    uuidHex(len) {
      const size = Math.max(1, Math.ceil(Number(len) / 2));
      const bytes = new Uint8Array(size);
      crypto.getRandomValues(bytes);
      let hex = "";
      for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, "0");
      return hex.slice(0, Number(len) || hex.length);
    },
    writeFile(name, token) {
      try { localStorage.setItem(fileKey(name), token || ""); } catch (e) { /* quota */ }
    },
    appendFile(name, token) {
      try {
        const prev = bytesFromB64(localStorage.getItem(fileKey(name)) || "");
        const next = bytesFromB64(token || "");
        const all = new Uint8Array(prev.length + next.length);
        all.set(prev);
        all.set(next, prev.length);
        localStorage.setItem(fileKey(name), b64FromBytes(all));
      } catch (e) { /* quota */ }
    },
    readFile(name) {
      try { return localStorage.getItem(fileKey(name)) || ""; } catch (e) { return ""; }
    },
    fileSize(name) {
      try { return bytesFromB64(localStorage.getItem(fileKey(name)) || "").length; } catch (e) { return 0; }
    },
    deleteFile(name) {
      try { localStorage.removeItem(fileKey(name)); } catch (e) { /* skip */ }
    },
    webhook() { return "0"; },
    uploadPhoto() { return ""; },
    hookMessageUrl() { return ""; },
    deleteHookMessage() {},
    downloadUrl() { return ""; },
    appVersion() { return "38"; },
    installUpdate() { return "same"; },
    openDownload() {
      location.href = "../";
      return "1";
    },
    notifyMessage(title, body) {
      try {
        if (typeof Notification === "function" && Notification.permission === "granted") {
          new Notification(String(title || "SolaxRD"), { body: String(body || "") });
        }
      } catch (e) { /* skip */ }
    }
  };
})();
