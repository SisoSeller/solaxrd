(() => {
  const N = window.SolaxNative;
  if (!N) return;
  const nativeFetch = window.fetch.bind(window);

  const SCRYPT_N = 16384;
  const SCRYPT_R = 8;
  const SCRYPT_P = 1;
  const MAX_TEXT = 80;
  const MAX_MEMBERS = 5;
  const AVATAR_REMOVED = "x";

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function now() { return Math.floor(Date.now() / 1000); }

  function b64FromBytes(bytes) {
    let bin = "";
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
      bin += String.fromCharCode(...arr.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function bytesFromB64(token) {
    if (!token) return new Uint8Array();
    const bin = atob(token);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function sha256Parts(parts) {
    const pieces = [];
    parts.forEach((part, index) => {
      pieces.push(enc.encode(part));
      if (index < parts.length - 1) pieces.push(new Uint8Array([0]));
    });
    let len = 0;
    pieces.forEach((p) => { len += p.length; });
    const all = new Uint8Array(len);
    let offset = 0;
    pieces.forEach((p) => { all.set(p, offset); offset += p.length; });
    return N.sha256bytes(b64FromBytes(all));
  }

  function urlB64(bytes) {
    const raw = typeof bytes === "string" ? enc.encode(bytes) : bytes;
    return b64FromBytes(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function urlB64Decode(token) {
    const pad = "=".repeat((4 - (String(token).length % 4)) % 4);
    return bytesFromB64(String(token).replace(/-/g, "+").replace(/_/g, "/") + pad);
  }

  function plain(body) {
    let text = String(body || "").trim();
    if (!text || text === "null" || text === '""') return null;
    try {
      const value = JSON.parse(text);
      if (typeof value === "boolean") return null;
      if (typeof value === "number") return String(value);
      text = value;
    } catch (e) { /* keep */ }
    if (typeof text !== "string" || !text || text === "0") return null;
    return text;
  }

  const KV_ROOT = "https://keyvalue.immanuel.co/api/KeyVal";
  const STORE = "3o78cPFRssNR_su3wqJIA6MPl9uBrtp1";

  function kvEncode(value) {
    return encodeURIComponent(String(value == null ? "" : value));
  }

  async function kvGet(key) {
    const res = await nativeFetch(KV_ROOT + "/GetValue/" + kvEncode(STORE) + "/" + kvEncode(key), { cache: "no-store" });
    return plain(await res.text());
  }

  async function kvSet(key, value) {
    const res = await nativeFetch(KV_ROOT + "/UpdateValue/" + kvEncode(STORE) + "/" + kvEncode(key) + "/" + kvEncode(value), {
      method: "POST",
      body: ""
    });
    const body = String((await res.text()) || "");
    return body.toLowerCase().indexOf("true") >= 0;
  }

  function normalize(name) {
    return String(name || "").normalize("NFKC").trim().split(/\s+/).join(" ").toLowerCase();
  }

  function parseName(value) {
    if (typeof value !== "string") return [null, "Scrivi un nome."];
    let display = value.normalize("NFKC").trim().split(/\s+/).join(" ");
    display = display.replace(/^[._\-'\u2019 ]+|[._\-'\u2019 ]+$/g, "");
    if (display.length < 2 || display.length > 24) return [null, "Il nome deve avere da 2 a 24 caratteri."];
    for (const ch of display) {
      if (/[0-9A-Za-z]/.test(ch) || " ._-'\u2019".includes(ch)) continue;
      return [null, "Usa lettere, numeri e spazi."];
    }
    if (![...display].some((ch) => /[0-9A-Za-z]/.test(ch))) return [null, "Il nome deve contenere una lettera o un numero."];
    return [display, null];
  }

  function parseNewName(value) {
    const [display, err] = parseName(value);
    if (err) return [null, err.indexOf("Usa lettere") === 0 ? "Il nome non può avere emoji." : err];
    if (display.includes(" ")) return [null, "Il nome non può avere spazi."];
    return [display, null];
  }

  function parsePassword(value) {
    if (typeof value !== "string" || value.length < 4 || value.length > 64) return "La password deve avere da 4 a 64 caratteri.";
    if ([...value].some((ch) => ch.charCodeAt(0) < 32)) return "Password non valida.";
    return null;
  }

  function userKey(name) {
    return "u" + sha256Parts(["solaxrd-user-v1", normalize(name)]).slice(0, 40);
  }

  function peerId(name) {
    return "sr" + sha256Parts(["solaxrd-peer-v1", normalize(name)]).slice(0, 18);
  }

  function presenceKey(name) { return "o" + userKey(name).slice(1); }
  function publicAvatarKey(name) { return "p" + userKey(name).slice(1); }
  function inboxKey(name) { return "b" + userKey(name).slice(1); }
  function groupInboxKey(name) { return "q" + userKey(name).slice(1); }
  function groupIndexKey(name) { return "z" + userKey(name).slice(1); }

  async function readIndex(name) {
    const token = await kvGet(groupIndexKey(name));
    if (!token) return [];
    try {
      const text = dec.decode(urlB64Decode(token));
      const gids = [];
      const seen = new Set();
      text.split("\n").forEach((item) => {
        const gid = String(item || "").trim().toLowerCase();
        if (!/^[0-9a-f]{16}$/.test(gid) || seen.has(gid)) return;
        seen.add(gid);
        gids.push(gid);
      });
      return gids.slice(0, 40);
    } catch (e) {
      return [];
    }
  }

  async function writeIndex(name, gids) {
    const unique = [];
    const seen = new Set();
    (gids || []).forEach((item) => {
      const gid = String(item || "").trim().toLowerCase();
      if (!/^[0-9a-f]{16}$/.test(gid) || seen.has(gid)) return;
      seen.add(gid);
      unique.push(gid);
    });
    await kvSet(groupIndexKey(name), unique.length ? urlB64(unique.join("\n")) : "0");
  }

    const current = await readIndex(name);
    await writeIndex(name, current.filter((item) => item !== gid));
    const current = await readIndex(name);
    if (!current.includes(gid)) current.push(gid);
    await writeIndex(name, current);
    for (const name of (names || [])) {
      try {
        if (drop) indexRemove(name, gid);
        else indexAdd(name, gid);
      } catch (e) { /* skip */ }
    }
  function indexTouch(names, gid, drop) {
    (names || []).forEach((name) => {
      try {
        if (drop) indexRemove(name, gid);
        else indexAdd(name, gid);
      } catch (e) { /* skip */ }
    });
  }

  function cid(a, b) {
    const pair = [normalize(a), normalize(b)].sort();
    return sha256Parts(["solaxrd-chat-v1", pair[0], pair[1]]).slice(0, 20);
  }

  function gcid(gid) { return "y" + gid; }
  function rosterKey(gid) { return "g" + gid + "r"; }

  function sideOf(me, other) {
    const first = [normalize(me), normalize(other)].sort()[0];
    return normalize(me) === first ? "0" : "1";
  }

  function storeGet(key, fallback) {
    const raw = N.load(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function storeSet(key, value) {
    N.store(key, JSON.stringify(value));
  }

  function session() {
    const data = storeGet("session", null);
    if (!data || !data.name) return null;
    return { name: data.name, peerId: peerId(data.name) };
  }

  function saveSession(name) { storeSet("session", { name }); }
  function clearSession() { N.remove("session"); }

  function defaultSettings() {
    return {
      theme: "dark", micId: "", speakerId: "", camId: "", fontSize: 15, zoom: 100,
      micVolume: 100, outputVolume: 100, cameraQuality: "low", screenFps: 30, screenRes: 720,
      status: "online", notifyMode: "all", timestamps: true, compact: false, enterSend: true,
      messageSound: true, callSound: true, echoCancellation: true, noiseSuppression: true,
      autoGain: true, alwaysOnTop: false, startWithWindows: false, reduceMotion: true,
      showPreview: true, confirmCall: false, pushToTalk: false, badge: true, openLastChat: true,
      clock24: true, lastChat: "", customStatus: "", blocked: [], recent: []
    };
  }

  function settingsKey() {
    const me = session();
    return me ? "settings:" + userKey(me.name) : "guest-settings";
  }

  function loadSettings() {
    const merged = defaultSettings();
    const data = storeGet(settingsKey(), {});
    if (!data || typeof data !== "object") return merged;
    Object.keys(merged).forEach((key) => {
      if (data[key] !== undefined) merged[key] = data[key];
    });
    return merged;
  }

  function saveSettings(updates) {
    const current = loadSettings();
    const next = { ...current, ...updates };
    storeSet(settingsKey(), next);
    return loadSettings();
  }

  function chatsKey() {
    const me = session();
    return me ? "chats:" + userKey(me.name) : "chats";
  }

  function groupsKey() {
    const me = session();
    return me ? "groups:" + userKey(me.name) : "groups";
  }

  function loadDb(kind) {
    const key = kind === "groups" ? groupsKey() : chatsKey();
    const data = storeGet(key, {});
    if (!Array.isArray(data.items)) data.items = [];
    if (kind === "groups" && !Array.isArray(data.left)) data.left = [];
    data.inbox = Number(data.inbox || 0) || 0;
    return data;
  }

  function saveDb(kind, data) {
    storeSet(kind === "groups" ? groupsKey() : chatsKey(), data);
  }

  async function fetchRecord(key) {
    const nameToken = await kvGet(key + "n");
    if (!nameToken) return null;
    try {
      const name = dec.decode(urlB64Decode(nameToken));
      const salt = urlB64Decode(await kvGet(key + "s") || "");
      const digest = urlB64Decode(await kvGet(key + "h") || "");
      if (!name || salt.length !== 16 || digest.length !== 32) return null;
      const [display, err] = parseName(name);
      if (err || display !== name) return null;
      return {
        name,
        salt: b64FromBytes(salt),
        hash: b64FromBytes(digest),
        n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P
      };
    } catch (e) {
      return null;
    }
  }

  async function putRecord(key, rec) {
    const nameToken = urlB64(enc.encode(rec.name));
    const saltToken = urlB64(bytesFromB64(rec.salt));
    const hashToken = urlB64(bytesFromB64(rec.hash));
    const okS = await kvSet(key + "s", saltToken);
    const okH = await kvSet(key + "h", hashToken);
    const okN = await kvSet(key + "n", nameToken);
    return okS && okH && okN;
  }

  function verifyPassword(password, rec) {
    if (Number(rec.n) !== SCRYPT_N || Number(rec.r) !== SCRYPT_R || Number(rec.p) !== SCRYPT_P) return false;
    const got = N.scrypt(password, rec.salt);
    return !!got && got === rec.hash;
  }

  function makeRecord(display, password) {
    const salt = N.randomSalt();
    const hash = N.scrypt(password, salt);
    return { name: display, salt, hash, n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
  }

  function pack(payload) {
    return urlB64(enc.encode(JSON.stringify(payload)));
  }

  function unpack(token) {
    if (!token) return null;
    try {
      const raw = dec.decode(urlB64Decode(token));
      if (raw.startsWith("{")) {
        const data = JSON.parse(raw);
        if (!data || data.x) return null;
        return data;
      }
      const idx = raw.indexOf("\n");
      if (idx < 0) return null;
      const s = raw.slice(0, idx);
      const t = raw.slice(idx + 1);
      if (s !== "0" && s !== "1") return null;
      return { s, t };
    } catch (e) {
      return null;
    }
  }

  function mimeLabel(value) {
    return { j: "image/jpeg", p: "image/png", g: "image/gif", w: "image/webp" }[String(value || "")] || String(value || "");
  }

  function imageCode(mime, filename) {
    const low = String(mime || "").toLowerCase();
    const name = String(filename || "").toLowerCase();
    if (low.includes("gif") || name.endsWith(".gif")) return "g";
    if (low.includes("png") || name.endsWith(".png")) return "p";
    if (low.includes("webp") || name.endsWith(".webp")) return "w";
    if (low.startsWith("image/") || /\.(jpg|jpeg|jfif)$/.test(name)) return "j";
    return "";
  }

  function rowOf(data, side, seq) {
    return {
      mine: data.s === side,
      text: data.t || "",
      n: seq,
      at: now(),
      emoji: data.e || "",
      reply: Number(data.q || 0) || 0,
      pin: !!data.p,
      file: data.f || "",
      filename: data.fn || "",
      mime: mimeLabel(data.m),
      size: Number(data.z || 0) || 0
    };
  }

  function blocked(name) {
    return (loadSettings().blocked || []).some((item) => normalize(item) === normalize(name));
  }

  async function headOf(cidValue) {
    return Number(await kvGet("m" + cidValue + "h") || 0) || 0;
  }

  async function revOf(cidValue) {
    return Number(await kvGet("m" + cidValue + "v") || 0) || 0;
  }

  async function bump(cidValue) {
    const rev = await revOf(cidValue) + 1;
    await kvSet("m" + cidValue + "v", String(rev));
    return rev;
  }

  function cacheRead(id) {
    const data = storeGet("msg:" + id, {});
    return {
      messages: Array.isArray(data.messages) ? data.messages.slice(-40) : [],
      head: Number(data.head || 0) || 0,
      rev: Number(data.rev || 0) || 0
    };
  }

  function cacheWrite(id, messages, head, rev) {
    storeSet("msg:" + id, { messages: (messages || []).slice(-40), head, rev });
  }

  function mergeMessages(oldRows, extra) {
    const rows = [];
    const seen = new Set();
    [...(oldRows || []), ...(extra || [])].forEach((message) => {
      if (!message || typeof message !== "object") return;
      const key = String(message.n || "");
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      rows.push(message);
    });
    rows.sort((a, b) => Number(a.n || 0) - Number(b.n || 0));
    return rows.slice(-40);
  }

  async function loadMessages(me, other, after) {
    const id = cid(me, other);
    const head = await headOf(id);
    if (head <= 0) return [[], 0];
    after = Number(after || 0) || 0;
    const start = Math.max(after + 1, Math.max(1, head - 11));
    if (start > head) return [[], head];
    const side = sideOf(me, other);
    const messages = [];
    for (let seq = start; seq <= head; seq += 1) {
      const token = await kvGet("m" + id + String(seq).padStart(4, "0"));
      const unpacked = unpack(token);
      if (unpacked) messages.push(rowOf(unpacked, side, seq));
    }
    return [messages, head];
  }

  function publicChats(data) {
    return data.items.map((item) => ({
      name: item.name || "",
      last: item.last || "",
      unread: Number(item.unread || 0) || 0,
      at: Number(item.at || 0) || 0
    })).sort((a, b) => b.at - a.at);
  }

  function findChat(data, name) {
    const key = normalize(name);
    return data.items.find((item) => normalize(item.name || "") === key) || null;
  }

  async function poke(recipient, sender) {
    const base = inboxKey(recipient);
    const counter = (Number(await kvGet(base + "c") || 0) || 0) + 1;
    await kvSet(base + String(counter % 3), urlB64(enc.encode(sender)));
    await kvSet(base + "c", String(counter));
  }

  async function syncInbox(me, data) {
    const base = inboxKey(me);
    const counter = Number(await kvGet(base + "c") || 0) || 0;
    let found = false;
    for (let slot = 0; slot < 3; slot += 1) {
      const token = await kvGet(base + String(slot));
      if (!token) continue;
      let name;
      try { name = dec.decode(urlB64Decode(token)); } catch (e) { continue; }
      const [display, err] = parseName(name);
      if (err || normalize(display) === normalize(me) || blocked(display)) continue;
      found = true;
      if (!findChat(data, display)) {
        data.items.push({ name: display, last: "", unread: 1, seq: 0, at: now() });
      }
    }
    if (found || counter === 0) data.inbox = counter;
  }

  async function lookupPerson(name) {
    const [display, err] = parseName(name);
    if (err) return [null, err];
    const me = session();
    if (!me) return [null, "Entra di nuovo."];
    if (normalize(display) === normalize(me.name)) return [null, "Non puoi aprire una chat con te stesso."];
    if (blocked(display)) return [null, "Hai bloccato questo nome."];
    const rec = await fetchRecord(userKey(display));
    if (!rec) return [null, "Nessun account con questo nome."];
    return [rec.name, null];
  }

  function okUser(name) {
    return { ok: true, name, peerId: peerId(name), settings: loadSettings() };
  }

  async function register(username, password) {
    const [display, nameError] = parseNewName(username);
    if (nameError) return { ok: false, error: nameError };
    const passwordError = parsePassword(password);
    if (passwordError) return { ok: false, error: passwordError };
    const key = userKey(display);
    const existing = await fetchRecord(key);
    if (existing && !verifyPassword(password, existing)) {
      return { ok: false, error: "Questo nome è già usato. Ogni persona ha un nome diverso." };
    }
    let rec = existing;
    if (!existing) {
      rec = makeRecord(display, password);
      if (!await putRecord(key, rec)) return { ok: false, error: "Non sono riuscito a creare l'account. Riprova." };
      N.webhook("account", rec.name);
      saveDb("chats", { items: [], inbox: 0 });
      saveDb("groups", { items: [], left: [], inbox: 0 });
      storeSet(settingsKey(), defaultSettings());
    }
    saveSession(rec.name);
    return okUser(rec.name);
  }

  async function login(username, password) {
    const [display, nameError] = parseName(username);
    if (nameError) return { ok: false, error: nameError };
    const passwordError = parsePassword(password);
    if (passwordError) return { ok: false, error: passwordError };
    const rec = await fetchRecord(userKey(display));
    if (!rec || !verifyPassword(password, rec)) return { ok: false, error: "Nome o password non validi." };
    saveSession(rec.name);
    return okUser(rec.name);
  }

  function bootstrap() {
    if (!N.load("install-reported")) {
      N.webhook("install", "");
      N.store("install-reported", "1");
    }
    const settings = loadSettings();
    return { ok: true, theme: settings.theme, settings, session: session() };
  }

  async function beatPresence() {
    const me = session();
    if (!me) return { ok: false, error: "Non sei dentro." };
    const letter = { online: "o", away: "a", dnd: "d" }[loadSettings().status] || "o";
    await kvSet(presenceKey(me.name), urlB64(enc.encode(now() + ":" + letter)));
    return { ok: true };
  }

  async function clearPresence() {
    const me = session();
    if (!me) return { ok: true };
    try { await kvSet(presenceKey(me.name), urlB64(enc.encode("0:o"))); } catch (e) { /* skip */ }
    for (const display of wanted.slice(0, 16)) {
      const raw = await kvGet(presenceKey(display));
      if (!raw) continue;
      try {
        const text = dec.decode(urlB64Decode(raw));
        const idx = text.indexOf(":");
        const stamp = Number(text.slice(0, idx));
        const letter = text.slice(idx + 1);
        if (stampNow - stamp > 55) continue;
        online[display] = { on: true, s: "oad".includes(letter) ? letter : "o" };
      } catch (e) { /* skip */ }
    }
    const online = {};
    const stampNow = now();
    wanted.slice(0, 16).forEach((display) => {
      const raw = await kvGet(presenceKey(display));
      if (!raw) return;
      try {
        const text = dec.decode(urlB64Decode(raw));
        const idx = text.indexOf(":");
        const stamp = Number(text.slice(0, idx));
        const letter = text.slice(idx + 1);
        if (stampNow - stamp < 0 || stampNow - stamp > 22) return;
        online[display] = { on: true, s: "oad".includes(letter) ? letter : "o" };
      } catch (e) { /* skip */ }
    });
    return { ok: true, online };
  }

  async function listChats() {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("chats");
    try { await syncInbox(me.name, data); } catch (e) { /* offline */ }
    saveDb("chats", data);
    return { ok: true, chats: publicChats(data) };
  }

  async function openChat(name) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("chats");
    let item = typeof name === "string" ? findChat(data, name) : null;
    let display = item ? item.name : null;
    if (!item) {
      const looked = await lookupPerson(name);
      if (looked[1]) return { ok: false, error: looked[1] };
      display = looked[0];
      item = { name: display, last: "", unread: 0, seq: 0, at: now() };
      data.items.push(item);
    }
    const id = cid(me.name, display);
    const cached = cacheRead(id);
    let messages = cached.messages.slice();
    let head = cached.head;
    let rev = cached.rev;
    try {
      const liveHead = await headOf(id);
      const liveRev = await revOf(id);
      if (liveHead > cached.head) {
        const extra = await loadMessages(me.name, display, cached.head);
        messages = mergeMessages(cached.messages, extra[0]);
        head = extra[1];
        rev = liveRev;
        cacheWrite(id, messages, head, rev);
      } else if (!messages.length && liveHead) {
        const loaded = await loadMessages(me.name, display, 0);
        messages = loaded[0];
        head = loaded[1];
        rev = liveRev;
        cacheWrite(id, messages, head, rev);
      } else {
        head = Math.max(cached.head, liveHead);
        rev = liveRev || cached.rev;
      }
    } catch (e) { /* keep cache */ }
    const previousSeq = Number(item.seq || 0) || 0;
    item.seq = Math.max(previousSeq, head);
    item.unread = 0;
    if (head > previousSeq) item.at = now();
    if (messages.length) item.last = messages[messages.length - 1].filename || messages[messages.length - 1].text || item.last || "";
    saveDb("chats", data);
    return { ok: true, name: display, messages, rev, chats: publicChats(data) };
  }

  async function sendChat(name, text) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    if (typeof text !== "string") return { ok: false, error: "Scrivi un messaggio." };
    text = text.replace(/[\r\n]/g, " ").trim().split(/\s+/).join(" ");
    if (!text || text.length > MAX_TEXT) return { ok: false, error: "Massimo " + MAX_TEXT + " caratteri." };
    const data = loadDb("chats");
    let item = typeof name === "string" ? findChat(data, name) : null;
    let display = item && !blocked(item.name) ? item.name : null;
    if (!display) {
      const looked = await lookupPerson(name);
      if (looked[1]) return { ok: false, error: looked[1] };
      display = looked[0];
    }
    const id = cid(me.name, display);
    const packed = pack({ s: sideOf(me.name, display), t: text });
    const head = await headOf(id) + 1;
    if (head > 9999) return { ok: false, error: "Questa chat è piena." };
    if (!await kvSet("m" + id + String(head).padStart(4, "0"), packed)) return { ok: false, error: "Messaggio non inviato. Riprova." };
    await kvSet("m" + id + "h", String(head));
    await poke(display, me.name);
    item = findChat(data, display);
    const stamp = now();
    if (!item) {
      item = { name: display, last: text, unread: 0, seq: head, at: stamp };
      data.items.push(item);
    } else {
      item.last = text; item.unread = 0; item.seq = head; item.at = stamp;
    }
    saveDb("chats", data);
    return { ok: true, message: { mine: true, text, n: head, at: stamp }, chats: publicChats(data) };
  }

  async function syncChats(name, knownRev) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("chats");
    try { await syncInbox(me.name, data); } catch (e) { /* skip */ }
    let messages = null;
    let active = null;
    let rev = 0;
    let reload = false;
    if (typeof name === "string" && name.trim()) {
      const item = findChat(data, name);
      if (item && !blocked(item.name)) {
        active = item.name;
        const id = cid(me.name, active);
        rev = await revOf(id);
        const known = Number(knownRev || 0) || 0;
        let after = Number(item.seq || 0) || 0;
        reload = !!(known && rev !== known);
        if (reload) after = Math.max(0, after - 12);
        const loaded = await loadMessages(me.name, active, after);
        messages = loaded[0];
        const head = loaded[1];
        if (messages.length) {
          item.last = messages[messages.length - 1].filename || messages[messages.length - 1].text || item.last || "";
          if (head > (Number(item.seq || 0) || 0)) item.at = now();
          const cached = cacheRead(id);
          const merged = mergeMessages(reload ? [] : cached.messages, messages);
          cacheWrite(id, merged, head, rev);
          if (reload) messages = merged;
        }
        item.seq = Math.max(Number(item.seq || 0), head);
        item.unread = 0;
      }
    }
    saveDb("chats", data);
    const payload = { ok: true, chats: publicChats(data) };
    if (messages) {
      payload.name = active;
      payload.messages = messages;
      payload.rev = rev;
      payload.reload = reload;
    }
    return payload;
  }

  async function changeMessage(name, seq, changer, mineOnly) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("chats");
    const item = findChat(data, name);
    const display = item && !blocked(item.name) ? item.name : await lookupPerson(name)[0];
    if (!display) return { ok: false, error: "Chat non trovata." };
    seq = Number(seq);
    const id = cid(me.name, display);
    const token = await kvGet("m" + id + String(seq).padStart(4, "0"));
    const unpacked = unpack(token);
    if (!unpacked) return { ok: false, error: "Messaggio non trovato." };
    if (mineOnly && unpacked.s !== sideOf(me.name, display)) return { ok: false, error: "Puoi cambiare solo i tuoi messaggi." };
    const updated = changer(unpacked);
    if (!await kvSet("m" + id + String(seq).padStart(4, "0"), pack(updated))) return { ok: false, error: "Modifica non salvata." };
    const rev = await bump(id);
    const row = updated.x ? null : rowOf(updated, sideOf(me.name, display), seq);
    return { ok: true, rev, message: row, deleted: !!updated.x };
  }

  function orderMembers(members) {
    const rows = [];
    const seen = new Set();
    (members || []).forEach((item) => {
      const [display, err] = parseName(item);
      if (err || seen.has(normalize(display))) return;
      seen.add(normalize(display));
      rows.push(display);
    });
    rows.sort((a, b) => normalize(a).localeCompare(normalize(b)));
    return rows.slice(0, MAX_MEMBERS);
  }

  function inGroup(me, members) {
    return (members || []).some((item) => normalize(item) === normalize(me));
  }

  function sideInGroup(me, members) {
    const rows = orderMembers(members);
    const index = rows.findIndex((item) => normalize(item) === normalize(me));
    return index >= 0 ? String(index) : "0";
  }

  function nameOfSide(side, members) {
    return orderMembers(members)[Number(side)] || "";
  }

  function packRoster(title, owner, members) {
    let names = orderMembers(members);
    if (owner && !names.some((item) => normalize(item) === normalize(owner))) names = orderMembers([owner, ...names]);
    return urlB64(enc.encode([title, owner, ...names.slice(0, MAX_MEMBERS)].join("\n")));
  }

  function unpackRoster(token, gid) {
    if (!token || token === "0" || token === "null") return null;
    if (token === "!") return { id: gid, deleted: true, name: "", owner: "", members: [] };
    try {
      const parts = dec.decode(urlB64Decode(token)).split("\n").filter(Boolean);
      if (parts.length < 2) return null;
      const [title, errTitle] = parseName(parts[0]);
      const [owner, errOwner] = parseName(parts[1]);
      if (errTitle || errOwner) return null;
      const members = [];
      parts.slice(1).forEach((item) => {
        const [found, err] = parseName(item);
        if (err || members.some((name) => normalize(name) === normalize(found))) return;
        members.push(found);
      });
      return { id: gid, name: title, owner, members: members.slice(0, MAX_MEMBERS) };
    } catch (e) {
      return null;
    }
  }

  async function fetchGroup(gid) {
    if (!/^[0-9a-f]{16}$/.test(gid)) return null;
    const packed = await kvGet(rosterKey(gid));
    if (packed) return unpackRoster(packed, gid);
    for (const member of (members || [])) {
      try { await pokeGroup(member, gid); } catch (e) { /* skip */ }
    }
  async function writeGroup(gid, title, owner, members) {
    return await kvSet(rosterKey(gid), packRoster(title, owner, members));
  }

  async function pokeGroup(recipient, gid) {
    const base = groupInboxKey(recipient);
    const counter = (Number(await kvGet(base + "c") || 0) || 0) + 1;
    await kvSet(base + String(counter % 5), gid);
    await kvSet(base + "c", String(counter));
  }

  async function pokeAll(gid, members, me) {
    (members || []).forEach((member) => {
      try { await pokeGroup(member, gid); } catch (e) { /* skip */ }
    });
  }

  function publicGroups(data) {
    return data.items.map((item) => ({
      id: item.id || "",
      name: item.name || "Gruppo",
      owner: item.owner || "",
      members: item.members || [],
      last: item.last || "",
      from: item.from || "",
      unread: Number(item.unread || 0) || 0,
      at: Number(item.at || 0) || 0,
      kind: "group"
    })).sort((a, b) => b.at - a.at);
  }

  function findGroup(data, gid) {
    return data.items.find((item) => item.id === gid) || null;
  }

  function rememberGroup(data, remote, extra) {
    extra = extra || {};
    let item = findGroup(data, remote.id);
    const stamp = now();
    if (!item) {
      item = {
        id: remote.id, name: remote.name, owner: remote.owner, members: remote.members,
        last: extra.last || "", unread: extra.unread || 0, seq: extra.seq || 0, at: stamp
      };
      data.items.push(item);
      return item;
    }
    item.name = remote.name;
    item.owner = remote.owner;
    item.members = remote.members;
    if (extra.last) {
      item.last = extra.last;
      item.at = stamp;
    }
    if (extra.seq) {
      item.seq = Math.max(Number(item.seq || 0), extra.seq);
      item.unread = 0;
    }
    return item;
  }

  function dropLocalGroup(data, gid) {
    data.items = data.items.filter((item) => item.id !== gid);
    data.left = data.left || [];
    if (!data.left.includes(gid)) data.left.push(gid);
    data.left = data.left.slice(-40);
  }

  async function syncInvites(me, data) {
    const base = groupInboxKey(me);
    const counter = Number(await kvGet(base + "c") || 0) || 0;
    if (counter === Number(data.inbox || 0)) return;
    for (let slot = 0; slot < 5; slot += 1) {
      const token = await kvGet(base + String(slot));
      if (!/^[0-9a-f]{16}$/.test(token || "")) continue;
    for (const gid of cloud.concat(local)) {
      if (!gid || seen.has(gid)) continue;
      seen.add(gid);
      if (left.has(gid)) continue;
      const remote = await fetchGroup(gid);
      if (!remote) continue;
      if (remote.deleted || !inGroup(me, remote.members)) {
        dropLocalGroup(data, gid);
        left.add(gid);
        continue;
      }
      data.left = (data.left || []).filter((item) => item !== gid);
      rememberGroup(data, remote);
    }
    const cloud = await readIndex(me);
    const local = data.items.map((item) => item.id).filter((gid) => /^[0-9a-f]{16}$/.test(gid || ""));
    const seen = new Set();
    cloud.concat(local).forEach((gid) => {
      if (!gid || seen.has(gid)) return;
      seen.add(gid);
      if (left.has(gid)) return;
      const remote = await fetchGroup(gid);
    for (const item of data.items) {
      const gid = item.id || "";
      if (!/^[0-9a-f]{16}$/.test(gid) || shared.has(gid) || left.has(gid)) continue;
      try { indexTouch(item.members || [], gid, false); } catch (e) { continue; }
      shared.add(gid);
    }
      data.left = (data.left || []).filter((item) => item !== gid);
      rememberGroup(data, remote);
    });
    const live = data.items.map((item) => item.id).filter((gid) => /^[0-9a-f]{16}$/.test(gid || ""));
    const merged = [];
    live.concat(cloud.filter((gid) => !left.has(gid))).forEach((gid) => {
      if (gid && !merged.includes(gid) && !left.has(gid)) merged.push(gid);
    });
    const same = merged.length === cloud.length && merged.every((gid) => cloud.includes(gid));
    if (!same) await writeIndex(me, merged);
    const shared = new Set(data.shared || []);
    data.items.forEach((item) => {
      const gid = item.id || "";
      if (!/^[0-9a-f]{16}$/.test(gid) || shared.has(gid) || left.has(gid)) return;
      try { indexTouch(item.members || [], gid, false); } catch (e) { return; }
      shared.add(gid);
    });
    data.shared = [...shared].slice(-40);
  }

  async function loadGroupMessages(me, gid, members, after) {
    const id = gcid(gid);
    for (const item of data.items.slice(0, 8)) {
      if (!item || !item.id || item.id === skipId) continue;
      const head = await headOf(gcid(item.id));
      const seen = Number(item.seq || 0) || 0;
      if (head <= seen) continue;
      item.unread = Math.max(0, head - seen);
      const unpacked = unpack(await kvGet("m" + gcid(item.id) + String(head).padStart(4, "0")));
      if (!unpacked) continue;
      item.last = unpacked.t || unpacked.fn || item.last || "";
      item.from = nameOfSide(unpacked.s, item.members || []);
      item.at = now();
    }
    }
    return [messages, head];
  }

  async function previewGroups(data, skipId) {
    data.items.slice(0, 8).forEach((item) => {
      if (!item || !item.id || item.id === skipId) return;
      const head = await headOf(gcid(item.id));
      const seen = Number(item.seq || 0) || 0;
      if (head <= seen) return;
      item.unread = Math.max(0, head - seen);
      const unpacked = unpack(await kvGet("m" + gcid(item.id) + String(head).padStart(4, "0")));
      if (!unpacked) return;
      item.last = unpacked.t || unpacked.fn || item.last || "";
      item.from = nameOfSide(unpacked.s, item.members || []);
      item.at = now();
    });
  }

  async function listGroups() {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("groups");
    try { await syncInvites(me.name, data); syncIndex(me.name, data); await previewGroups(data); } catch (e) { /* skip */ }
    saveDb("groups", data);
    return { ok: true, groups: publicGroups(data) };
  }

  async function createGroup(title, names) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const parsed = parseName(title);
    if (parsed[1]) return { ok: false, error: "Il gruppo deve avere un nome da 2 a 24 caratteri." };
    for (const name of wanted) {
      const rec = await fetchRecord(userKey(name));
      if (rec && !resolved.some((item) => normalize(item) === normalize(rec.name))) resolved.push(rec.name);
    }
      if (fail || seen.has(normalize(display))) return;
      seen.add(normalize(display));
      wanted.push(display);
    });
    if (wanted.length + 1 > MAX_MEMBERS) return { ok: false, error: "Massimo 5 persone per gruppo." };
    const members = [me.name, ...wanted];
    const gid = N.uuidHex(16);
    const remote = { id: gid, name: parsed[0], owner: me.name, members };
    const data = loadDb("groups");
    rememberGroup(data, remote);
    data.left = (data.left || []).filter((item) => item !== gid);
    saveDb("groups", data);
    const resolved = [me.name];
    wanted.forEach((name) => {
      const rec = await fetchRecord(userKey(name));
      if (rec && !resolved.some((item) => normalize(item) === normalize(rec.name))) resolved.push(rec.name);
    });
    await writeGroup(gid, parsed[0], me.name, resolved);
    indexTouch(resolved, gid, false);
    await pokeAll(gid, resolved, me.name);
    return { ok: true, group: remote, groups: publicGroups(data) };
  }

  async function openGroup(gid) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    if (!/^[0-9a-f]{16}$/.test(gid || "")) return { ok: false, error: "Gruppo non trovato." };
    const data = loadDb("groups");
    let remote = findGroup(data, gid);
    if (remote) remote = { id: remote.id, name: remote.name, owner: remote.owner, members: remote.members };
    if (!remote) {
      const live = await fetchGroup(gid);
      if (live && !live.deleted && inGroup(me.name, live.members)) {
        remote = live;
        rememberGroup(data, live);
      } else return { ok: false, error: "Gruppo non trovato." };
    }
    if (!inGroup(me.name, remote.members)) {
      dropLocalGroup(data, gid);
      saveDb("groups", data);
      return { ok: false, error: "Non sei in questo gruppo.", groups: publicGroups(data) };
    }
    const id = gcid(gid);
    const cached = cacheRead(id);
    let messages = cached.messages.slice();
    let head = cached.head;
    let rev = cached.rev;
    const liveHead = await headOf(id);
    const liveRev = await revOf(id);
    if (liveHead > cached.head) {
      const extra = await loadGroupMessages(me.name, gid, remote.members, cached.head);
      messages = mergeMessages(cached.messages, extra[0]);
      head = extra[1];
      rev = liveRev;
      cacheWrite(id, messages, head, rev);
    }
    const item = rememberGroup(data, remote, { seq: head });
    item.unread = 0;
    if (messages.length) item.last = messages[messages.length - 1].filename || messages[messages.length - 1].text || item.last || "";
    try { await previewGroups(data, gid); } catch (e) { /* skip */ }
    saveDb("groups", data);
    return { ok: true, group: remote, messages, rev, groups: publicGroups(data) };
  }

  async function sendGroup(gid, text) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    if (typeof text !== "string") return { ok: false, error: "Scrivi un messaggio." };
    text = text.replace(/[\r\n]/g, " ").trim().split(/\s+/).join(" ");
    if (!text || text.length > MAX_TEXT) return { ok: false, error: "Massimo " + MAX_TEXT + " caratteri." };
    const data = loadDb("groups");
    let remote = findGroup(data, gid);
    if (remote) remote = { id: remote.id, name: remote.name, owner: remote.owner, members: remote.members };
    if (!remote) remote = await fetchGroup(gid);
    if (!remote || remote.deleted || !inGroup(me.name, remote.members)) return { ok: false, error: "Non sei in questo gruppo." };
    const id = gcid(gid);
    const packed = pack({ s: sideInGroup(me.name, remote.members), t: text });
    const head = await headOf(id) + 1;
    if (!await kvSet("m" + id + String(head).padStart(4, "0"), packed)) return { ok: false, error: "Messaggio non inviato. Riprova." };
    await kvSet("m" + id + "h", String(head));
    await pokeAll(gid, remote.members, me.name);
    const item = rememberGroup(data, remote, { last: text, seq: head });
    item.unread = 0;
    saveDb("groups", data);
    return { ok: true, message: { mine: true, text, n: head, at: now(), from: me.name }, group: remote, groups: publicGroups(data) };
  }

  async function addMember(gid, name) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("groups");
    let remote = findGroup(data, gid);
    if (remote) remote = { id: remote.id, name: remote.name, owner: remote.owner, members: remote.members.slice() };
    if (!remote) remote = await fetchGroup(gid);
    if (!remote || remote.deleted) return { ok: false, error: "Gruppo non trovato." };
    if (normalize(remote.owner) !== normalize(me.name)) return { ok: false, error: "Solo chi ha creato il gruppo può aggiungere persone." };
    const rec = await fetchRecord(userKey(name));
    if (!rec) return { ok: false, error: "Nessun account con questo nome." };
    if (inGroup(rec.name, remote.members)) return { ok: false, error: "Questa persona è già nel gruppo." };
    remote.members = orderMembers(remote.members.concat([rec.name]));
    if (remote.members.length > MAX_MEMBERS) return { ok: false, error: "Massimo 5 persone per gruppo." };
    rememberGroup(data, remote);
    saveDb("groups", data);
    await writeGroup(gid, remote.name, remote.owner, remote.members);
    indexAdd(rec.name, gid);
    await pokeGroup(rec.name, gid);
    return { ok: true, group: remote, groups: publicGroups(data) };
  }

  async function leaveGroup(gid) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("groups");
    const local = findGroup(data, gid);
    dropLocalGroup(data, gid);
    saveDb("groups", data);
    const live = await fetchGroup(gid) || local;
    if (live && !live.deleted) {
      const kept = (live.members || []).filter((item) => normalize(item) !== normalize(me.name));
      let owner = live.owner || me.name;
      if (normalize(owner) === normalize(me.name)) owner = kept[0] || me.name;
      if (kept.length) {
        await writeGroup(gid, live.name, owner, kept);
        indexRemove(me.name, gid);
        await pokeAll(gid, kept, me.name);
      } else {
        await kvSet(rosterKey(gid), "!");
        indexRemove(me.name, gid);
      }
    }
    return { ok: true, groups: publicGroups(data) };
  }

  async function deleteGroup(gid) {
    const me = session();
    if (!me) return { ok: false, error: "Entra di nuovo." };
    const data = loadDb("groups");
    let remote = findGroup(data, gid);
    if (remote) remote = { ...remote };
    if (!remote) remote = await fetchGroup(gid);
    if (remote && !remote.deleted && normalize(remote.owner || "") !== normalize(me.name)) {
      return { ok: false, error: "Solo chi ha creato il gruppo può eliminarlo." };
    }
    const members = remote ? remote.members : [];
    dropLocalGroup(data, gid);
    saveDb("groups", data);
    await kvSet(rosterKey(gid), "!");
    indexTouch(members, gid, true);
    await pokeAll(gid, members, me.name);
    return { ok: true, groups: publicGroups(data) };
  }

  async function startFile(kind, target, filename, mime, size) {
    size = Number(size);
    if (!size || size > 2 * 1024 * 1024 * 1024) return { ok: false, error: "Il file può arrivare fino a 2 GB." };
    filename = String(filename || "file").replace(/[\\/]/g, " ").trim().split(/\s+/).join(" ").slice(0, 24);
    const code = imageCode(mime, filename);
    const fileId = N.uuidHex(12);
    N.writeFile("f-" + fileId, "");
    if (kind === "group") {
      const me = session();
      const data = loadDb("groups");
      let remote = findGroup(data, target);
      if (remote) remote = { id: remote.id, name: remote.name, owner: remote.owner, members: remote.members };
      if (!remote) remote = await fetchGroup(target);
      if (!remote || remote.deleted) return { ok: false, error: "Non sei in questo gruppo." };
      const id = gcid(target);
      const payload = { s: sideInGroup(me.name, remote.members), t: "", f: fileId, fn: filename, m: code, z: size };
      const head = await headOf(id) + 1;
      await kvSet("m" + id + String(head).padStart(4, "0"), pack(payload));
      await kvSet("m" + id + "h", String(head));
      const rev = await bump(id);
      rememberGroup(data, remote, { last: filename, seq: head });
      saveDb("groups", data);
      await pokeAll(target, remote.members, me.name);
      const message = rowOf(payload, payload.s, head);
      message.from = me.name;
      return { ok: true, id: fileId, n: head, rev, message, group: remote, groups: publicGroups(data) };
    }
    const me = session();
    const data = loadDb("chats");
    let item = findChat(data, target);
    const display = item && !blocked(item.name) ? item.name : await lookupPerson(target)[0];
    if (!display) return { ok: false, error: "Chat non trovata." };
    const id = cid(me.name, display);
    for (const item of (Array.isArray(names) ? names : []).slice(0, 20)) {
      const [display] = parseName(item);
      if (!display || normalize(display) === normalize(me.name)) continue;
      const key = publicAvatarKey(display);
      const raw = await kvGet(key);
      if (!raw || raw === AVATAR_REMOVED) {
        N.deleteFile("a-" + normalize(display));
        continue;
      }
      let jpeg = "";
      if (raw.startsWith("w")) {
        const body = raw.slice(1);
        const dot = body.indexOf(".");
        const messageId = body.slice(0, dot);
        const url = N.hookMessageUrl(messageId);
        if (url) jpeg = N.downloadUrl(url);
      } else if (raw.startsWith("https://")) {
        jpeg = N.downloadUrl(raw);
      }
      if (jpeg) {
        N.writeFile("a-" + normalize(display), jpeg);
        got += 1;
      }
    }
        N.deleteFile("a-" + normalize(display));
        return;
      }
      let jpeg = packed.jpeg;
      if (packed.url) {
        urls[display] = packed.url;
        if (!jpeg && N.downloadUrl) jpeg = String(N.downloadUrl(packed.url) || "");
      }
      if (raw.startsWith("w")) {
        const body = raw.slice(1);
        const dot = body.indexOf(".");
        const messageId = body.slice(0, dot);
        const url = N.hookMessageUrl(messageId);
        if (url) jpeg = N.downloadUrl(url);
      } else if (raw.startsWith("https://")) {
        jpeg = N.downloadUrl(raw);
      }
      if (jpeg) {
        N.writeFile("a-" + normalize(display), jpeg);
        got += 1;
      }
    });
    return { ok: true, n: got, urls };
  }

  const AVATAR_PART = 120;
  const AVATAR_PARTS = 24;

  function avatarPartKey(name, index) {
    return publicAvatarKey(name) + "z" + index;
  }

  async function writePublicAvatar(name, bytes) {
    const token = urlB64(bytes);
    const count = Math.ceil(token.length / AVATAR_PART);
    if (!count || count > AVATAR_PARTS) return false;
    for (let i = 0; i < count; i += 1) {
      if (!await kvSet(avatarPartKey(name, i), token.slice(i * AVATAR_PART, (i + 1) * AVATAR_PART))) return false;
    }
    for (let i = count; i < AVATAR_PARTS; i += 1) await kvSet(avatarPartKey(name, i), "0");
    return await kvSet(publicAvatarKey(name), "c" + count);
  }

  async function readPublicAvatar(name) {
    const raw = await kvGet(publicAvatarKey(name)) || "";
    if (!raw || raw === AVATAR_REMOVED) return { raw, jpeg: "", url: "" };
    const kind = raw.charAt(0);
    if (kind !== "c" && kind !== "u") return { raw, jpeg: "", url: "" };
    const count = Number(raw.slice(1)) || 0;
    if (count < 1 || count > AVATAR_PARTS) return { raw, jpeg: "", url: "" };
    let token = "";
    for (let i = 0; i < count; i += 1) token += await kvGet(avatarPartKey(name, i)) || "";
    if (kind === "u" && token.startsWith("https://")) return { raw, jpeg: "", url: token };
    try {
      const bytes = urlB64Decode(token);
      if (bytes.length >= 32 && bytes[0] === 0xFF && bytes[1] === 0xD8) return { raw, jpeg: b64FromBytes(bytes), url: "" };
    } catch (e) { /* skip */ }
    return { raw, jpeg: "", url: "" };
  }

  async function writePublicLink(name, url) {
    const count = Math.ceil(String(url || "").length / AVATAR_PART);
    if (!count || count > AVATAR_PARTS || !String(url).startsWith("https://")) return false;
    for (let i = 0; i < count; i += 1) {
      if (!await kvSet(avatarPartKey(name, i), url.slice(i * AVATAR_PART, (i + 1) * AVATAR_PART))) return false;
    }
    return await kvSet(publicAvatarKey(name), "u" + count);
  }

  async function publishAvatar(bytes) {
    const me = session();
    if (!me) return { ok: false, error: "Non sei dentro." };
    if (!bytes || !bytes.length) {
      await kvSet(publicAvatarKey(me.name), AVATAR_REMOVED);
      for (let i = 0; i < AVATAR_PARTS; i += 1) await kvSet(avatarPartKey(me.name, i), "0");
      N.deleteFile("avatar.jpg");
      return { ok: true, removed: true };
    }
    const b64 = b64FromBytes(bytes);
    const shared = N.uploadChatPhoto ? String(N.uploadChatPhoto(b64) || "") : "";
    if (shared.startsWith("https://") && await writePublicLink(me.name, shared)) {
      N.writeFile("avatar.jpg", b64);
      return { ok: true, url: shared };
    }
    if (!await writePublicAvatar(me.name, bytes)) return { ok: false, error: "Foto non pubblicata. Riprova." };
    N.writeFile("avatar.jpg", b64);
    return { ok: true };
  }

  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  function binResponse(bytes, type, status) {
    const copy = bytes ? bytes.slice(0) : new Uint8Array();
    return new Response(copy, { status: status || 200, headers: { "Content-Type": type || "application/octet-stream" } });
  }

  async function bodyBytes(init) {
    if (!init || init.body == null) return new Uint8Array();
    if (init.body instanceof Uint8Array) return init.body;
    if (init.body instanceof ArrayBuffer) return new Uint8Array(init.body);
    if (init.body instanceof Blob) return new Uint8Array(await init.body.arrayBuffer());
    if (typeof init.body === "string") return enc.encode(init.body);
    try { return new Uint8Array(await new Response(init.body).arrayBuffer()); } catch (e) { return new Uint8Array(); }
  }

  async function bodyJson(init) {
    const bytes = await bodyBytes(init);
    if (!bytes.length) return {};
    try { return JSON.parse(dec.decode(bytes)); } catch (e) { return {}; }
  }

  const PREVIEW_PART = 100;
  const PREVIEW_PARTS = 24;

  async function writePreview(id, kind, token) {
    const count = Math.ceil(String(token || "").length / PREVIEW_PART);
    if (!/^[0-9a-f]{12}$/.test(id || "") || !count || count > PREVIEW_PARTS) return false;
    for (let i = 0; i < count; i += 1) {
      const piece = token.slice(i * PREVIEW_PART, (i + 1) * PREVIEW_PART);
      if (!await kvSet("i" + id + "z" + i, piece)) return false;
    }
    return await kvSet("i" + id, kind + count);
  }

      else if (path === "/api/update") {
        payload = { ok: true, current: 1, latest: 1, local: 1, remote: 1, update: false, ready: false };
      }
    for (let i = 0; i < count; i += 1) token += await kvGet("i" + id + "z" + i) || "";
    if (kind === "u" && token.startsWith("https://")) return { url: token, bytes: null };
    try {
      const bytes = urlB64Decode(token);
      if (bytes.length >= 32 && bytes[0] === 0xFF && bytes[1] === 0xD8) return { url: "", bytes };
    } catch (e) { /* skip */ }
    return { url: "", bytes: null };
  }

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    let path = url;
    let search = "";
    let sameOrigin = false;
    try {
      const parsed = new URL(url, location.href);
      path = parsed.pathname;
      search = parsed.search;
      sameOrigin = parsed.origin === location.origin;
    } catch (e) { /* keep */ }
    if (!sameOrigin || !path.startsWith("/api/")) return nativeFetch(input, init);
    const query = new URLSearchParams(search);
    const method = ((init && init.method) || "GET").toUpperCase();
    try {
      if (path === "/api/files/preview" && method === "GET") {
        const id = query.get("id") || "";
        const got = readPreview(id);
        if (got.url) return jsonResponse({ ok: true, url: got.url });
        if (got.bytes) return binResponse(got.bytes, "image/jpeg", 200);
        return binResponse(new Uint8Array(), "text/plain", 404);
      }
      if (path === "/api/files/preview" && method === "POST") {
        const id = query.get("id") || "";
        const bytes = await bodyBytes(init);
        if (!/^[0-9a-f]{12}$/.test(id) || bytes.length < 32) return jsonResponse({ ok: false }, 400);
        let url = "";
        if (N.uploadChatPhoto) url = String(N.uploadChatPhoto(b64FromBytes(bytes)) || "");
        if (url.startsWith("https://cdn.discordapp.com/") || url.startsWith("https://media.discordapp.net/")) {
          if (!await writePreview(id, "u", url)) return jsonResponse({ ok: false, error: "Anteprima non salvata." });
          return jsonResponse({ ok: true, url });
        }
        if (bytes.length <= 2200 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
          if (!await writePreview(id, "j", urlB64(bytes))) return jsonResponse({ ok: false, error: "Anteprima non salvata." });
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ ok: false, error: "Anteprima non salvata." });
      }
      if (path === "/api/files/get") {
        const id = query.get("id") || "";
        let b64 = N.readFile("f-" + id);
        if (!b64) {
          const got = readPreview(id);
          if (got.url && N.downloadUrl) {
            b64 = String(N.downloadUrl(got.url) || "");
            if (b64) N.writeFile("f-" + id, b64);
          } else if (got.bytes && got.bytes.length) {
            b64 = b64FromBytes(got.bytes);
            N.writeFile("f-" + id, b64);
          }
        }
        if (!b64) return binResponse(new Uint8Array(), "text/plain", 404);
        const bytes = bytesFromB64(b64);
        let mime = "application/octet-stream";
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) mime = "image/jpeg";
        else if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
      else if (path === "/api/groups/sync") {
        if (!data.id) payload = await listGroups();
        else {
          const listed = await listGroups();
          const opened = await openGroup(data.id);
          if (!opened.ok) payload = { ok: true, groups: listed.groups || [] };
          else payload = { ...opened, groups: listed.groups };
        }
      }
        return binResponse(bytesFromB64(b64), "image/jpeg", 200);
      }
      if (path === "/api/avatar/friend" && method === "GET") {
        const [display] = parseName(query.get("name") || "");
        if (!display) return binResponse(new Uint8Array(), "text/plain", 404);
      else if (path === "/api/update/apply") {
        payload = { ok: true, current: true, exit: false };
      }
          return jsonResponse({ ok: true, removed: true });
        }
        N.writeFile("avatar.jpg", b64FromBytes(bytes));
        return jsonResponse({ ok: true });
      }
      if (path === "/api/avatar/publish") {
        const bytes = await bodyBytes(init);
        return jsonResponse(await publishAvatar(bytes));
      }
      if (path === "/api/avatar/friend" && method === "POST") {
        const [display] = parseName(query.get("name") || "");
        const bytes = await bodyBytes(init);
        if (!display || !bytes.length) return jsonResponse({ ok: false }, 400);
        N.writeFile("a-" + normalize(display), b64FromBytes(bytes));
        return jsonResponse({ ok: true });
      }

      const data = method === "POST" ? await bodyJson(init) : {};
      let payload;
      if (path === "/api/bootstrap") payload = bootstrap();
      else if (path === "/api/settings" && method === "GET") payload = { ok: true, settings: loadSettings() };
      else if (path === "/api/chats") payload = await listChats();
      else if (path === "/api/groups") payload = await listGroups();
      else if (path === "/api/update") {
        const local = Number(N.appVersion() || 0) || 0;
        const remote = window.SolaxIOS
          ? (Number(await kvGet("iver") || 0) || 0)
          : (Number(await kvGet("aver") || 0) || 0);
        payload = { ok: true, current: local, latest: remote, local, remote, update: remote > local, ready: remote > local };
      }
      else if (path === "/api/presence" && method === "GET") payload = { ok: true, mic: false, deaf: false };
      else if (path === "/api/register") payload = await register(data.username, data.password);
      else if (path === "/api/login") payload = await login(data.username, data.password);
      else if (path === "/api/logout") { await clearPresence(); clearSession(); payload = { ok: true }; }
      else if (path === "/api/theme") payload = { ok: true, settings: saveSettings({ theme: data.theme }) };
      else if (path === "/api/settings") payload = { ok: true, settings: saveSettings(data) };
      else if (path === "/api/recent") {
        const settings = loadSettings();
        const [display, err] = parseName(data.name);
        if (err) payload = { ok: false, error: err };
        else {
          settings.recent = [display, ...(settings.recent || []).filter((item) => normalize(item) !== normalize(display))].slice(0, 6);
          saveSettings(settings);
          payload = { ok: true, recent: settings.recent };
        }
      } else if (path === "/api/rename") {
        const me = session();
        if (!me) payload = { ok: false, error: "Non sei dentro." };
        else {
          const rec = await fetchRecord(userKey(me.name));
          if (!rec || !verifyPassword(data.password, rec)) payload = { ok: false, error: "Password non valida." };
          else {
            const [display, err] = parseNewName(data.name);
            if (err) payload = { ok: false, error: err };
            else if (normalize(display) === normalize(me.name)) {
              saveSession(display);
              payload = okUser(display);
            } else if (await fetchRecord(userKey(display))) payload = { ok: false, error: "Questo nome è già usato. Ogni persona ha un nome diverso." };
            else {
              const next = { ...rec, name: display };
              if (!await putRecord(userKey(display), next)) payload = { ok: false, error: "Non sono riuscito a cambiare il nome. Riprova." };
              else {
                await kvSet(userKey(me.name) + "n", "0");
                await kvSet(userKey(me.name) + "s", "0");
                await kvSet(userKey(me.name) + "h", "0");
                saveSession(display);
                N.webhook("rename", display);
                payload = okUser(display);
              }
            }
          }
        }
      } else if (path === "/api/heartbeat") payload = await beatPresence();
      else if (path === "/api/offline") payload = await clearPresence();
      else if (path === "/api/online") payload = readPresence(data.names);
      else if (path === "/api/peer") {
        const [display, err] = parseName(data.name);
        payload = err ? { ok: false, error: err } : { ok: true, name: display, peerId: peerId(display) };
      } else if (path === "/api/chats/open") payload = await openChat(data.name);
      else if (path === "/api/chats/send") payload = await sendChat(data.name, data.text);
      else if (path === "/api/chats/sync") payload = await syncChats(data.name, data.rev);
      else if (path === "/api/chats/edit") payload = await changeMessage(data.name, data.n, (row) => { row.t = data.text; delete row.f; return row; }, true);
      else if (path === "/api/chats/delete") payload = await changeMessage(data.name, data.n, (row) => { row.x = 1; return row; }, true);
      else if (path === "/api/chats/react") payload = await changeMessage(data.name, data.n, (row) => { row.e = row.e === data.emoji ? "" : data.emoji; return row; }, false);
      else if (path === "/api/chats/pin") payload = await changeMessage(data.name, data.n, (row) => { row.p = row.p ? 0 : 1; return row; }, false);
      else if (path === "/api/files/start") payload = await startFile("chat", data.name, data.filename, data.mime, data.size);
      else if (path === "/api/avatars/pull") payload = pullAvatars(data.names);
      else if (path === "/api/presence") payload = { ok: true, mic: !!data.mic, deaf: !!data.deaf };
      else if (path === "/api/chats/clear") {
        saveDb("chats", { items: [], inbox: 0 });
        payload = { ok: true, chats: [] };
      } else if (path === "/api/groups/create") payload = await createGroup(data.name, data.members);
      else if (path === "/api/groups/open") payload = await openGroup(data.id);
      else if (path === "/api/groups/send") payload = await sendGroup(data.id, data.text);
      else if (path === "/api/groups/sync") payload = data.id ? (function () {
        const listed = await listGroups();
        const opened = await openGroup(data.id);
        if (!opened.ok) return { ok: true, groups: listed.groups || [] };
        return { ...opened, groups: listed.groups };
      }()) : await listGroups();
      else if (path === "/api/groups/add") payload = await addMember(data.id, data.name);
      else if (path === "/api/groups/leave") payload = await leaveGroup(data.id);
      else if (path === "/api/groups/delete") payload = await deleteGroup(data.id);
      else if (path === "/api/groups/files/start") payload = await startFile("group", data.id, data.filename, data.mime, data.size);
      else if (path === "/api/quit") { await clearPresence(); payload = { ok: true }; }
      else if (path === "/api/update/apply") {
        const remote = window.SolaxIOS
          ? (Number(await kvGet("iver") || 0) || 0)
          : (Number(await kvGet("aver") || 0) || 0);
        const local = Number(N.appVersion() || 0) || 0;
        if (window.SolaxIOS) {
          if (remote <= local) payload = { ok: true, current: true, exit: false };
          else payload = { ok: String(N.openDownload() || "") === "1", exit: false };
        } else if (remote <= local) {
          payload = { ok: true, current: true, exit: false };
        } else {
          const url = "https://sisoseller.github.io/solaxrd/download/SolaxRD.apk?v=" + remote;
          const result = String(N.installUpdate(url) || "");
          if (result === "same") {
            try { N.store("skip-aver", String(remote)); } catch (e) { /* skip */ }
            payload = { ok: true, current: true, exit: false };
          } else if (result === "1") payload = { ok: true, exit: false };
          else if (result === "perm") payload = { ok: false, error: "Consenti l’installazione di SolaxRD, poi premi di nuovo Installa ora." };
          else payload = { ok: false, error: "Aggiornamento non installato. Scaricalo dal sito." };
        }
      }
      else return jsonResponse({ ok: false, error: "Non trovato." }, 404);
      return jsonResponse(payload);
    } catch (err) {
      return jsonResponse({ ok: false, error: "Errore interno. Riprova." }, 500);
    }
  };

  const solaxPhone = window.matchMedia("(max-width: 860px)").matches || /iPhone|iPad|Android/i.test(navigator.userAgent || "");
  if (solaxPhone) document.documentElement.classList.add("android");
  document.addEventListener("DOMContentLoaded", () => {
    if (solaxPhone) document.body.classList.add("android");
    const bar = document.querySelector(".traffic");
    if (bar) bar.hidden = true;
    const threadHead = document.querySelector(".thread-head");
    if (threadHead && !document.getElementById("mobile-back")) {
      const back = document.createElement("button");
      back.id = "mobile-back";
      back.type = "button";
      back.className = "ghost";
      back.textContent = "Indietro";
      threadHead.insertBefore(back, threadHead.firstChild);
      back.addEventListener("click", () => window.solaxBack());
    }
    const watch = () => {
      const thread = document.getElementById("thread");
      const settings = document.getElementById("settings");
      document.body.classList.toggle("chat-open", thread && !thread.hidden);
      document.body.classList.toggle("settings-open", settings && !settings.hidden);
    };
    const obs = new MutationObserver(watch);
    ["thread", "welcome", "settings", "people"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    });
    watch();
  });

  window.solaxBack = function () {
    const settings = document.getElementById("settings");
    if (settings && !settings.hidden) {
      const close = document.getElementById("settings-close");
      if (close) close.click();
      else settings.hidden = true;
      return true;
    }
    const thread = document.getElementById("thread");
    if (thread && !thread.hidden) {
      thread.hidden = true;
      const welcome = document.getElementById("welcome");
      if (welcome) welcome.hidden = true;
      const people = document.getElementById("people");
      if (people) people.hidden = true;
      const shell = document.getElementById("shell");
      if (shell) shell.classList.remove("has-people");
      document.body.classList.remove("chat-open");
      return true;
    }
    return false;
  };
})();
