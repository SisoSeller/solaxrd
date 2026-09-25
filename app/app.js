const $ = (id) => document.getElementById(id);
const RELEASE_NAME = "1.0.0 release";
const bootAt = Date.now();

const els = {
  boot: $("boot"),
  authWrap: $("auth-wrap"),
  authForm: $("auth-form"),
  username: $("username"),
  password: $("password"),
  authError: $("auth-error"),
  login: $("login"),
  register: $("register"),
  shell: $("shell"),
  net: $("net"),
  openForm: $("open-form"),
  openName: $("open-name"),
  listError: $("list-error"),
  chatList: $("chat-list"),
  welcome: $("welcome"),
  thread: $("thread"),
  settings: $("settings"),
  threadName: $("thread-name"),
  messages: $("messages"),
  composer: $("composer"),
  composerText: $("composer-text"),
  composerCount: $("composer-count"),
  call: $("call"),
  update: $("update-banner"),
  meLetter: $("me-letter"),
  meStatus: $("me-status"),
  setName: $("set-name"),
  blockList: $("block-list"),
  version: $("version-label"),
  systemNote: $("system-note"),
  live: $("live"),
  status: $("status"),
  mute: $("mute"),
  camera: $("camera"),
  screen: $("screen"),
  hangup: $("hangup"),
  mic: $("mic"),
  speaker: $("speaker"),
  speakerField: $("speaker-field"),
  cam: $("cam"),
  incoming: $("incoming"),
  incomingTitle: $("incoming-title"),
  remoteVideo: $("remote-video"),
  localVideo: $("local-video"),
  remoteAudio: $("remote-audio"),
};

const state = {
  me: null,
  settings: {},
  chats: [],
  groups: [],
  active: "",
  activeKind: "dm",
  group: null,
  groupCall: null,
  groupInvite: null,
  groupDraft: [],
  view: "home",
  peer: null,
  peerReady: false,
  retries: 0,
  loggingOut: false,
  phase: "idle",
  link: null,
  incoming: null,
  voice: null,
  videoCall: null,
  localAudio: null,
  sentAudio: null,
  remotePeerId: "",
  remoteLabel: "",
  micOn: true,
  camOn: false,
  screenOn: false,
  timers: [],
  ring: 0,
  audioCtx: null,
  updating: false,
  updateSnooze: false,
  ptt: false,
  micWarm: false,
  micTask: null,
  seen: new Set(),
  pendingCall: null,
  previews: new Map(),
  openTick: 0,
  online: {},
  loopOn: false,
  loopGen: 0,
  persistGen: 0,
  avatarTick: 1,
};

function readMsg(data) {
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch (e) { return null; }
  }
  return data && typeof data === "object" ? data : null;
}

function cleanLabel(name) {
  return String(name || "Qualcuno").replace(/\s+/g, " ").trim().slice(0, 24) || "Qualcuno";
}

async function api(path, body) {
  try {
    const options = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "GET" };
    const res = await fetch(path, options);
    const text = await res.text();
    if (!text) return { ok: false, error: "SolaxRD non risponde." };
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "SolaxRD non risponde." };
  }
}

function clampNum(value, low, high, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(low, Math.min(high, Math.round(number)));
}

function frameSize(height) {
  const h = clampNum(height, 360, 1440, 720);
  return { width: Math.round(h * 16 / 9), height: h };
}

function videoBitrate(height, fps) {
  const size = frameSize(height);
  const pixels = size.width * size.height;
  const rate = Math.round(2500000 * (pixels / (1280 * 720)) * (clampNum(fps, 30, 160, 30) / 30));
  return Math.max(800000, Math.min(rate, 25000000));
}

function quietNow() {
  return state.settings.status === "dnd" || !!state.deaf;
}

function soundsOn() {
  return !quietNow() && state.settings.notifyMode !== "none";
}

function liveVolume() {
  if (quietNow()) return 0;
  return (state.settings.outputVolume ?? 100) / 100;
}

function applyOutputVolume() {
  const volume = liveVolume();
  if (els.remoteAudio) els.remoteAudio.volume = volume;
  const host = $("call-audios");
  if (host) [...host.querySelectorAll("audio")].forEach((audio) => { audio.volume = volume; });
}

function statusLabel() {
  const status = state.settings.status || "online";
  return state.settings.customStatus || ({ online: "Online", away: "Assente", dnd: "Non disturbare" }[status] || "Online");
}

function statusDotClass() {
  const status = state.settings.status || "online";
  return status === "online" ? "dot" : `dot ${status}`;
}

function isBlocked(name) {
  const key = String(name || "").trim().toLocaleLowerCase("it");
  return (state.settings.blocked || []).some((item) => item.toLocaleLowerCase("it") === key);
}

const THEMES = ["dark", "light", "purple", "blue", "green", "rose", "orange", "gold", "teal", "crimson", "indigo"];

function blankSettings() {
  return {
    theme: "dark",
    micId: "",
    speakerId: "",
    camId: "",
    fontSize: 15,
    zoom: 100,
    micVolume: 100,
    outputVolume: 100,
    streamVolume: 100,
    cameraQuality: "low",
    screenFps: 30,
    screenRes: 720,
    status: "online",
    notifyMode: "all",
    timestamps: true,
    compact: false,
    enterSend: true,
    messageSound: true,
    callSound: true,
    echoCancellation: true,
    noiseSuppression: true,
    autoGain: true,
    alwaysOnTop: false,
    startWithWindows: false,
    reduceMotion: true,
    showPreview: true,
    confirmCall: false,
    pushToTalk: false,
    badge: true,
    openLastChat: true,
    clock24: true,
    lastChat: "",
    customStatus: "",
    blocked: [],
  };
}

function takeSettings(raw) {
  const next = blankSettings();
  if (!raw || typeof raw !== "object") return next;
  for (const key of Object.keys(next)) {
    if (raw[key] !== undefined) next[key] = raw[key];
  }
  next.blocked = Array.isArray(raw.blocked) ? raw.blocked.slice() : [];
  return next;
}

function setTheme(theme) {
  const picked = THEMES.includes(theme) ? theme : "dark";
  THEMES.forEach((name) => document.body.classList.toggle(`theme-${name}`, name === picked));
  document.body.classList.toggle("light", picked === "light");
  document.body.classList.toggle("dark", picked === "dark");
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === picked);
  });
  const select = $("set-theme");
  if (select) select.value = picked;
}

function applyLocal() {
  const settings = state.settings && typeof state.settings === "object" ? state.settings : blankSettings();
  state.settings = settings;
  document.body.style.fontSize = `${settings.fontSize || 15}px`;
  document.body.style.zoom = `${settings.zoom || 100}%`;
  document.body.classList.toggle("compact", !!settings.compact);
  document.body.classList.toggle("reduce", settings.reduceMotion !== false);
  applyOutputVolume();
  applyStreamVolume();
  const status = settings.status || "online";
  const mine = statusDotClass();
  if (els.meStatus) els.meStatus.className = mine;
  const dockDot = $("dock-dot");
  if (dockDot) dockDot.className = mine;
  const dockStatus = $("dock-status");
  if (dockStatus) dockStatus.textContent = statusLabel();
  const custom = $("set-custom");
  if (custom && document.activeElement !== custom) custom.value = settings.customStatus || "";
  paintSwitches();
  const theme = $("set-theme");
  if (theme) theme.value = settings.theme || "dark";
  setTheme(settings.theme || "dark");
  const font = $("set-font");
  if (font) font.value = String(settings.fontSize || 15);
  const zoom = $("set-zoom");
  if (zoom) zoom.value = String(settings.zoom || 100);
  const statusSel = $("set-status");
  if (statusSel) statusSel.value = status;
  const notify = $("set-notify");
  if (notify) notify.value = settings.notifyMode || "all";
  const screenFps = $("set-screen-fps");
  if (screenFps && document.activeElement !== screenFps) screenFps.value = String(clampNum(settings.screenFps, 30, 160, 30));
  const screenRes = $("set-screen-res");
  if (screenRes && document.activeElement !== screenRes) screenRes.value = String(clampNum(settings.screenRes, 360, 1440, 720));
  const micVol = $("set-mic-vol");
  if (micVol) micVol.value = String(settings.micVolume ?? 100);
  const outVol = $("set-out-vol");
  const streamVol = $("set-stream-vol");
  if (streamVol) streamVol.value = String(settings.streamVolume ?? 100);
  const liveStream = $("stream-vol");
  if (liveStream) liveStream.value = String(settings.streamVolume ?? 100);
  if (outVol) outVol.value = String(settings.outputVolume ?? 100);
  renderBlocked();
}

const switches = {
  "set-compact": "compact",
  "set-motion": "reduceMotion",
  "set-time": "timestamps",
  "set-clock": "clock24",
  "set-echo": "echoCancellation",
  "set-noise": "noiseSuppression",
  "set-gain": "autoGain",
  "set-ptt": "pushToTalk",
  "set-preview": "showPreview",
  "set-confirm": "confirmCall",
  "set-call-sound": "callSound",
  "set-enter": "enterSend",
  "set-msg-sound": "messageSound",
  "set-badge": "badge",
  "set-last": "openLastChat",
  "set-top": "alwaysOnTop",
  "set-startup": "startWithWindows",
};

function paintSwitches() {
  Object.entries(switches).forEach(([id, key]) => {
    const el = $(id);
    if (el) el.setAttribute("aria-pressed", state.settings[key] ? "true" : "false");
  });
}

async function persist() {
  const gen = state.persistGen;
  const who = state.me && state.me.name;
  if (!who) return;
  const payload = takeSettings(state.settings);
  payload._name = who;
  const data = await api("/api/settings", payload);
  if (gen !== state.persistGen || !state.me || state.me.name !== who) return;
  if (!data.ok) return;
  if (data.settings) state.settings = takeSettings(data.settings);
  applyLocal();
  setTheme(state.settings.theme || "dark");
  const saved = $("settings-saved");
  if (saved) {
    saved.hidden = false;
    saved.textContent = "Salvato";
    window.clearTimeout(state.savedTick);
    state.savedTick = window.setTimeout(() => { saved.hidden = true; }, 1200);
  }
}

let persistWait = 0;
function persistSoon() {
  window.clearTimeout(persistWait);
  if (!state.me) return;
  persistWait = window.setTimeout(() => persist(), 280);
}

function phoneLayout() {
  return document.documentElement.classList.contains("phone") || document.body.classList.contains("android");
}

function revealShell(next) {
  const wait = phoneLayout() ? 0 : Math.max(0, 1100 - (Date.now() - bootAt));
  window.setTimeout(next, wait);
}

function showApp() {
  els.boot.hidden = true;
  els.authWrap.hidden = true;
  els.shell.hidden = false;
}

function showAuth() {
  els.boot.hidden = true;
  els.shell.hidden = true;
  els.authWrap.hidden = false;
}

function resetSettingsPanel() {
  document.querySelectorAll(".set-nav [data-panel]").forEach((item) => {
    item.classList.toggle("active", item.dataset.panel === "account");
  });
  document.querySelectorAll("#settings .panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== "account";
  });
  ["rename-name", "rename-pass", "block-name", "set-custom", "composer-text", "open-name"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });
  if (els.composerCount) els.composerCount.textContent = "0/80";
  const saved = $("settings-saved");
  if (saved) saved.hidden = true;
  const renameError = $("rename-error");
  if (renameError) renameError.textContent = "";
}

function resetSessionState() {
  window.clearTimeout(persistWait);
  state.persistGen += 1;
  destroyPeer();
  state.loggingOut = false;
  state.me = null;
  state.chats = [];
  state.groups = [];
  state.active = "";
  state.activeKind = "dm";
  state.group = null;
  state.groupCall = null;
  state.groupInvite = null;
  state.groupDraft = [];
  state.view = "home";
  state.loopOn = false;
  state.loopGen += 1;
  state.seen = new Set();
  state.online = {};
  state.rev = 0;
  state.previews = new Map();
  state.openTick += 1;
  state.deaf = false;
  state.micMuted = false;
  state.micOn = true;
  state.avatarPublished = false;
  state.avatarTick = Date.now();
  state.settings = blankSettings();
  applyLocal();
  resetSettingsPanel();
  if (els.messages) els.messages.replaceChildren();
  if (els.chatList) els.chatList.replaceChildren();
  if (els.listError) els.listError.textContent = "";
  if (els.threadName) els.threadName.textContent = "Chat";
  if (els.settings) els.settings.hidden = true;
  if (els.thread) els.thread.hidden = true;
  if (els.welcome) els.welcome.hidden = true;
  showPeople(false);
  const navChats = $("nav-chats");
  const navSet = $("nav-settings");
  if (navChats) navChats.classList.add("active");
  if (navSet) navSet.classList.remove("active");
  showAvatar("");
  applyPresence(true).catch(() => {});
}

function showPeople(on) {
  const pane = $("people");
  const shell = $("shell");
  if (pane) pane.hidden = !on;
  if (shell) shell.classList.toggle("has-people", !!on);
}

function activeKey() {
  return state.activeKind === "group" && state.active ? `g:${state.active}` : (state.active || "");
}

function setView(view) {
  if (state.view === "settings" && view !== "settings" && state.me) persist();
  state.view = view;
  if (els.welcome) els.welcome.hidden = true;
  els.thread.hidden = view !== "thread";
  els.settings.hidden = view !== "settings";
  $("nav-chats").classList.toggle("active", view !== "settings");
  $("nav-settings").classList.toggle("active", view === "settings");
  const peopleToggle = $("people-toggle");
  if (view === "thread" && state.activeKind === "group") {
    if (phoneLayout()) {
      showPeople(false);
      if (peopleToggle) {
        peopleToggle.hidden = false;
        peopleToggle.textContent = "⌄";
      }
    } else {
      showPeople(true);
      if (peopleToggle) peopleToggle.hidden = true;
    }
    paintPeople();
  } else {
    if (peopleToggle) peopleToggle.hidden = true;
    showPeople(false);
  }
  if (view === "settings") primeDevices(false).catch(() => {});
}

function onlineOf(name) {
  const key = String(name || "").toLocaleLowerCase("it");
  const map = state.online || {};
  for (const [label, info] of Object.entries(map)) {
    if (label.toLocaleLowerCase("it") === key) return info;
  }
  return null;
}

function paintDot(dot, info) {
  if (!dot) return;
  dot.hidden = false;
  if (!info || !info.on) {
    dot.className = "dot offline";
    return;
  }
  const mark = info.s === "a" ? " away" : info.s === "d" ? " dnd" : "";
  dot.className = `dot${mark}`;
}

function paintOnline() {
  document.querySelectorAll(".chat-row").forEach((row) => {
    paintDot(row.querySelector(".dot"), onlineOf(row.dataset.who || row.dataset.name));
  });
  document.querySelectorAll(".people-row").forEach((row) => {
    paintDot(row.querySelector(".dot"), onlineOf(row.dataset.name));
  });
  if (state.activeKind === "group" && state.group) {
    const members = state.group.members || [];
    const live = members.filter((name) => {
      const info = onlineOf(name);
      return info && info.on;
    }).length;
    const sub = $("thread-sub");
    if (sub) sub.textContent = `${members.length} persone` + (live ? ` · ${live} in linea` : "");
    const threadDot = $("thread-online");
    if (threadDot) threadDot.className = live ? "dot" : "dot offline";
    return;
  }
  if (state.active) {
    const info = onlineOf(state.active);
    paintDot($("thread-online"), info);
    const sub = $("thread-sub");
    if (sub) {
      if (!info || !info.on) sub.textContent = "Offline";
      else if (info.s === "a") sub.textContent = "Assente";
      else if (info.s === "d") sub.textContent = "Non disturbare";
      else sub.textContent = "Online";
    }
  }
}

function paintPeople() {
  const list = $("people-list");
  const count = $("people-count");
  const form = $("add-member");
  if (!list || !state.group) return;
  const members = state.group.members || [];
  if (count) count.textContent = `${members.length}/5`;
  list.replaceChildren();
  members.forEach((name) => {
    const row = document.createElement("div");
    row.className = "people-row";
    row.dataset.name = name;
    const pic = document.createElement("span");
    pic.className = "who-pic";
    const photo = document.createElement("img");
    photo.className = "row-avatar";
    photo.alt = "";
    photo.hidden = true;
    const letter = document.createElement("span");
    letter.className = "row-letter";
    letter.textContent = (name || "?").slice(0, 1).toUpperCase();
    const dot = document.createElement("span");
    dot.className = "dot offline";
    bindAvatar(photo, letter, name);
    pic.append(photo, letter, dot);
    const text = document.createElement("span");
    text.className = "who-text";
    const title = document.createElement("strong");
    title.textContent = name + (state.me && name.toLocaleLowerCase("it") === state.me.name.toLocaleLowerCase("it") ? " (tu)" : "");
    const status = document.createElement("span");
    const info = onlineOf(name);
    status.textContent = !info || !info.on ? "Offline" : info.s === "a" ? "Assente" : info.s === "d" ? "Non disturbare" : "Online";
    text.append(title, status);
    row.append(pic, text);
    list.append(row);
  });
  const owner = (state.group.owner || "").toLocaleLowerCase("it");
  const mine = (state.me && state.me.name || "").toLocaleLowerCase("it");
  if (form) form.hidden = !(mine && owner === mine && members.length < 5);
  const del = $("delete-group");
  if (del) del.hidden = !(mine && owner === mine);
  const leaveBtn = $("leave-group");
  if (leaveBtn) leaveBtn.hidden = false;
  paintOnline();
}

function renderChats() {
  if (!els.chatList) return;
  els.chatList.replaceChildren();
  const rows = [];
  (state.chats || []).forEach((chat) => rows.push({ ...chat, kind: chat.kind || "dm" }));
  (state.groups || []).forEach((group) => rows.push({ ...group, kind: "group" }));
  rows.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  rows.forEach((chat) => {
    const isGroup = chat.kind === "group";
    const key = isGroup ? `g:${chat.id}` : (chat.name || "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-row${isGroup ? " group" : ""}${key === activeKey() ? " active" : ""}`;
    button.dataset.name = key;
    button.dataset.who = isGroup ? (chat.name || "") : (chat.name || "");
    const wrap = document.createElement("span");
    wrap.className = "who";
    const pic = document.createElement("span");
    pic.className = "who-pic";
    const photo = document.createElement("img");
    photo.className = "row-avatar";
    photo.alt = "";
    photo.hidden = true;
    const letter = document.createElement("span");
    letter.className = "row-letter";
    letter.textContent = isGroup ? "#" : (chat.name || "?").slice(0, 1).toUpperCase();
    const dot = document.createElement("span");
    dot.className = "dot offline";
    if (!isGroup) bindAvatar(photo, letter, chat.name);
    pic.append(photo, letter, dot);
    const text = document.createElement("span");
    text.className = "who-text";
    const title = document.createElement("strong");
    title.textContent = chat.name;
    const last = document.createElement("span");
    last.textContent = isGroup
      ? (chat.last || `${(chat.members || []).length} persone`)
      : (chat.last || "Nessun messaggio");
    text.append(title, last);
    wrap.append(pic, text);
    button.append(wrap);
    if (state.settings.badge !== false && chat.unread) {
      const badge = document.createElement("span");
      badge.className = "unread";
      badge.textContent = `${chat.unread} nuovi`;
      button.append(badge);
    }
    button.addEventListener("click", () => {
      if (isGroup) openGroup(chat.id);
      else openChat(chat.name);
    });
    els.chatList.append(button);
  });
  paintOnline();
}

function markActiveChat(name) {
  const key = name || activeKey();
  document.querySelectorAll(".chat-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.name === key);
  });
}

function formatTime(at) {
  if (!at || state.settings.timestamps === false) return "";
  const date = new Date(at * 1000);
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: !state.settings.clock24 });
}

function addBubble(message) {
  if (!message || !els.messages) return null;
  try {
  const key = message.n ? String(message.n) : "";
  if (key && state.seen.has(key)) return null;
  if (key && message.mine) {
    const pending = [...els.messages.children].find((row) => {
      if (row.dataset.pending !== "1") return false;
      if (message.file) return row.dataset.filename === (message.filename || "") && !row.dataset.n;
      return row.dataset.text === (message.text || "");
    });
    if (pending) {
      pending.dataset.n = key;
      pending.dataset.pending = "";
      pending.dataset.file = message.file || pending.dataset.file || "";
      if (message.size) pending.dataset.size = String(message.size);
      const img = pending.querySelector("img");
      if (img && message.file) img.dataset.file = message.file;
      const link = pending.querySelector("a");
      if (link && message.file) link.href = `/api/files/get?id=${encodeURIComponent(message.file)}`;
      const known = message.preview || (message.file && state.previews.get(message.file));
      if (img && known) img.src = known;
      state.seen.add(key);
      return pending;
    }
  }
  const row = document.createElement("article");
  row.className = `bubble${message.mine ? " mine" : ""}`;
  row.dataset.n = key;
  row.dataset.pending = key ? "" : "1";
  row.dataset.text = message.text || "";
  row.dataset.file = message.file || "";
  row.dataset.filename = message.filename || "";
  row.dataset.size = String(message.size || "");
  if (message.from && !message.mine) {
    const from = document.createElement("div");
    from.className = "from";
    from.textContent = message.from;
    row.append(from);
  }
  if (message.pin) {
    const pin = document.createElement("div");
    pin.className = "pin";
    pin.textContent = "Attaccato";
    row.append(pin);
  }
  if (message.reply) {
    const quote = document.createElement("div");
    quote.className = "quote";
    quote.textContent = `Risposta al messaggio ${message.reply}`;
    row.append(quote);
  }
  if (message.file || message.preview) {
    if (message.preview || isImageFile(message.filename, message.mime)) {
      const img = document.createElement("img");
      img.alt = message.filename || "immagine";
      img.dataset.file = message.file || "";
      const known = message.preview || (message.file && state.previews.get(message.file));
      if (known) img.src = known;
      else {
        img.hidden = true;
        if (message.file) loadStoredPreview(img, message.file);
      }
      bindPhoto(img, message.file || "", message.filename || "immagine");
      row.append(img);
    }
    const actions = document.createElement("div");
    actions.className = "file-actions";
    if (message.preview || isImageFile(message.filename, message.mime)) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "ghost";
      openBtn.textContent = "Apri";
      openBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const img = row.querySelector("img");
        openLightbox(img && img.src, message.file || "", message.filename || "immagine");
      });
      actions.append(openBtn);
    }
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ghost";
    saveBtn.textContent = "Scarica";
    saveBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadFile(message.file || "", message.filename || "file");
    });
    actions.append(saveBtn);
    row.append(actions);
    const link = document.createElement("a");
    if (message.file) {
      link.href = fileUrl(message.file, message.filename, true);
      link.download = message.filename || "file";
    } else {
      link.href = "#";
    }
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadFile(message.file || "", message.filename || "file");
    });
    const size = Number(message.size || 0);
    const label = size ? `${message.filename || "File"} · ${formatSize(size)}` : (message.filename || "File");
    link.textContent = label;
    row.append(link);
  } else {
    const text = document.createElement("div");
    text.textContent = message.text || "";
    row.append(text);
  }
  if (message.emoji) {
    const emoji = document.createElement("div");
    emoji.className = "emoji";
    emoji.textContent = message.emoji;
    row.append(emoji);
  }
  const stamp = formatTime(message.at);
  if (stamp) {
    const time = document.createElement("time");
    time.textContent = stamp;
    row.append(time);
  }
  if (key) state.seen.add(key);
  els.messages.append(row);
  els.messages.scrollTop = els.messages.scrollHeight;
  return row;
  } catch (e) {
    return null;
  }
}

function isImageFile(name, mime) {
  const type = String(mime || "").toLowerCase();
  const file = String(name || "").toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|gif|webp|jfif)$/.test(file);
}

function fileUrl(id, name, download) {
  if (!id) return "";
  let url = `/api/files/get?id=${encodeURIComponent(id)}`;
  if (name) url += `&name=${encodeURIComponent(name)}`;
  if (download) url += "&download=1";
  return url;
}

function bindPhoto(img, fileId, filename) {
  if (!img) return;
  img.addEventListener("click", (event) => {
    event.stopPropagation();
    openLightbox(img.src, fileId, filename);
  });
}

function openLightbox(src, fileId, filename) {
  const box = $("lightbox");
  const image = $("lightbox-img");
  const label = $("lightbox-name");
  if (!box || !image) return;
  image.src = src || fileUrl(fileId, filename, false);
  if (label) label.textContent = filename || "";
  box.dataset.file = fileId || "";
  box.dataset.name = filename || "file";
  box.hidden = false;
}

function closeLightbox() {
  const box = $("lightbox");
  if (box) box.hidden = true;
}

async function downloadFile(id, name) {
  if (!id) return;
  try {
    const res = await fetch(fileUrl(id, name, true));
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = name || "file";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 2000);
  } catch (e) { /* keep chat usable */ }
}

function rememberPreview(id, src) {
  if (!id || !src) return;
  state.previews.set(id, src);
  document.querySelectorAll("img").forEach((img) => {
    if (img.dataset.file === id) {
      img.hidden = false;
      img.src = src;
    }
  });
}

function loadStoredPreview(img, id) {
  if (!img || !id) return;
  img.hidden = false;
  img.onerror = () => { img.hidden = true; };
  img.src = `/api/files/get?id=${encodeURIComponent(id)}&t=${Date.now()}`;
}

function revealFile(id) {
  document.querySelectorAll("img").forEach((img) => {
    if (img.dataset.file === id) loadStoredPreview(img, id);
  });
}

function bytesToBase64(bytes) {
  const parts = [];
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(bytes.length, i + chunk)))));
  }
  return btoa(parts.join(""));
}

async function makePreview(file) {
  if (!file || !isImageFile(file.name, file.type) || file.size > 8 * 1024 * 1024) return { url: "", data: "" };
  try {
    const image = await createImageBitmap(file);
    const maxWidth = 360;
    const scale = Math.min(1, maxWidth / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.62));
    if (!blob) return { url: "", data: "" };
    const url = URL.createObjectURL(blob);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = bytes.length > 70000 ? "" : `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
    return { url, data };
  } catch (e) {
    return { url: "", data: "" };
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function renderBlocked() {
  if (!els.blockList) return;
  els.blockList.replaceChildren();
  (state.settings.blocked || []).forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = `${name} ×`;
    button.addEventListener("click", async () => {
      state.settings.blocked = state.settings.blocked.filter((item) => item !== name);
      await persist();
    });
    els.blockList.append(button);
  });
}

async function reaskMedia() {
  const hint = $("media-hint");
  if (window.SolaxNative && window.SolaxNative.reaskMedia) {
    try { window.SolaxNative.reaskMedia(); } catch (e) { /* browser prompt still runs */ }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((track) => track.stop());
    if (hint) hint.textContent = "Microfono e camera consentiti.";
    await refreshDevices().catch(() => {});
  } catch (e) {
    if (hint) hint.textContent = "Compare di nuovo la richiesta. Se non esce, consenti microfono e camera nelle impostazioni del telefono.";
  }
}

function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!state.audioCtx) state.audioCtx = new Ctx();
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();
}

function beep(freq, gainValue) {
  if (!soundsOn()) return;
  unlockAudio();
  const ctx = state.audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.24);
}

function ringTone() {
  unlockAudio();
  const ctx = state.audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const play = (freq, start, stop, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + stop);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + stop + 0.02);
  };
  play(523, 0, 0.34, 0.72);
  play(659, 0.1, 0.44, 0.68);
  play(523, 0.48, 0.82, 0.72);
  play(659, 0.58, 0.92, 0.68);
}

function startRing() {
  stopRing();
  if (quietNow() || state.settings.callSound === false) return;
  ringTone();
  state.ring = window.setInterval(ringTone, 1800);
}

function stopRing() {
  if (state.ring) window.clearInterval(state.ring);
  state.ring = 0;
}

function later(fn, ms) {
  const id = window.setTimeout(fn, ms);
  state.timers.push(id);
  return id;
}

function clearTimers() {
  state.timers.forEach((id) => window.clearTimeout(id));
  state.timers = [];
}

function deviceName(device, index) {
  const label = String(device.label || "").trim();
  if (label) return label;
  const id = device.deviceId || "";
  if (id === "default") {
    if (device.kind === "audioinput") return "Microfono predefinito";
    if (device.kind === "audiooutput") return "Audio predefinito";
    return "Camera predefinita";
  }
  if (id === "communications") {
    if (device.kind === "audioinput") return "Microfono comunicazioni";
    if (device.kind === "audiooutput") return "Audio comunicazioni";
    return "Camera comunicazioni";
  }
  if (device.kind === "audioinput") return `Microfono ${index + 1}`;
  if (device.kind === "audiooutput") return `Altoparlante ${index + 1}`;
  return `Camera ${index + 1}`;
}

function listDevices(devices) {
  const seen = new Set();
  const out = [];
  for (const device of devices) {
    const id = device.deviceId || "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(device);
  }
  return out;
}

function fillSelect(select, devices, current) {
  if (!select) return;
  const previous = current || select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = devices.length ? "Predefinito" : "Nessuno trovato";
  select.appendChild(empty);
  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = deviceName(device, index);
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function setMediaHint(text) {
  const el = $("media-hint");
  if (el) el.textContent = text || "";
}

async function refreshDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const list = await navigator.mediaDevices.enumerateDevices();
  fillSelect(els.mic, listDevices(list.filter((device) => device.kind === "audioinput")), state.settings.micId);
  fillSelect(els.cam, listDevices(list.filter((device) => device.kind === "videoinput")), state.settings.camId);
  if (els.speakerField) els.speakerField.hidden = false;
  fillSelect(els.speaker, listDevices(list.filter((device) => device.kind === "audiooutput")), state.settings.speakerId);
}

async function askMedia(constraints) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("media");
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getTracks().forEach((track) => track.stop());
}

async function primeDevices(alsoVideo) {
  let error = null;
  try {
    await askMedia({ audio: true, video: false });
  } catch (e) {
    try {
      await askMedia({ audio: true });
    } catch (err) {
      error = err;
    }
  }
  if (alsoVideo) {
    try {
      await askMedia({ audio: false, video: true });
    } catch (e) { /* camera names stay generic */ }
  }
  try { await refreshDevices(); } catch (e) { /* keep defaults */ }
  await applySpeaker();
  const micCount = els.mic ? Math.max(0, els.mic.options.length - 1) : 0;
  const speakerCount = els.speaker ? Math.max(0, els.speaker.options.length - 1) : 0;
  if (error && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
    setMediaHint("Windows sta bloccando microfono o audio. In Impostazioni Windows apri Privacy > Microfono e consenti le app desktop.");
  } else if (error && error.name === "NotFoundError") {
    setMediaHint("Nessun microfono collegato.");
  } else if (!micCount && !speakerCount) {
    setMediaHint("Nessun microfono o altoparlante trovato.");
  } else {
    setMediaHint("");
  }
}

async function primeMic() {
  await primeDevices(false);
}

async function saveDevices() {
  state.settings.micId = els.mic.value;
  state.settings.speakerId = els.speaker.value;
  state.settings.camId = els.cam.value;
  await persist();
}

async function applySpeaker() {
  const id = state.settings.speakerId || "";
  const audios = [];
  if (els.remoteAudio) audios.push(els.remoteAudio);
  const host = $("call-audios");
  if (host) audios.push(...host.querySelectorAll("audio"));
  for (const audio of audios) {
    if (typeof audio.setSinkId !== "function") continue;
    try { await audio.setSinkId(id); } catch (e) { /* default output */ }
  }
}

function audioConstraints() {
  const audio = {
    echoCancellation: state.settings.echoCancellation !== false,
    noiseSuppression: state.settings.noiseSuppression !== false,
    autoGainControl: state.settings.autoGain !== false,
  };
  const micId = state.settings.micId;
  if (micId && micId !== "default" && micId !== "communications") audio.deviceId = { ideal: micId };
  return audio;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function micLive(stream) {
  return !!(stream && stream.getAudioTracks && stream.getAudioTracks().some((track) => track.readyState === "live"));
}

function hushMic() {
  if (state.localAudio) state.localAudio.getAudioTracks().forEach((track) => { track.enabled = false; });
}

function stopMic() {
  [state.localAudio, state.sentAudio].forEach((stream) => {
    if (stream) stream.getTracks().forEach((track) => track.stop());
  });
  state.localAudio = null;
  state.sentAudio = null;
}

function warmMic() {
  if (state.micWarm || !navigator.mediaDevices) return;
  state.micWarm = true;
  ensureMic().then(() => {
    if (state.phase === "idle") hushMic();
  }).catch(() => {
    state.micWarm = false;
  });
}

function micEnabled() {
  return (state.micOn && !state.settings.pushToTalk) || state.ptt || state.phase === "out" || state.phase === "live" || state.phase === "in";
}

function applyMicEnabled(stream) {
  if (!stream) return;
  const enabled = micEnabled();
  stream.getAudioTracks().forEach((track) => { track.enabled = enabled; });
}

async function grabMicOnce() {
  if (micLive(state.localAudio)) {
    applyMicEnabled(state.localAudio);
    state.sentAudio = state.localAudio;
    return state.localAudio;
  }
  let lastError = null;
  for (let round = 0; round < 5; round += 1) {
    try {
      const constraints = round < 2 ? { audio: audioConstraints(), video: false } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (micLive(stream)) {
        state.localAudio = stream;
        state.sentAudio = stream;
        applyMicEnabled(stream);
        return stream;
      }
      stream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      lastError = e;
    }
    await sleep(120 + round * 80);
  }
  if (lastError) throw lastError;
  throw new Error("mic");
}

async function ensureMic() {
  if (micLive(state.localAudio)) {
    applyMicEnabled(state.localAudio);
    state.sentAudio = state.localAudio;
    return state.localAudio;
  }
  if (!state.micTask) {
    state.micTask = grabMicOnce().finally(() => {
      state.micTask = null;
    });
  }
  return state.micTask;
}

function setStatus(text) {
  els.status.textContent = text || "";
}

function paintDirectCall() {
  const box = $("live-people");
  if (!box) return;
  const names = [];
  if (state.remoteLabel) names.push(state.remoteLabel);
  if (state.me && state.me.name && !names.some((name) => sameName(name, state.me.name))) names.push(state.me.name);
  box.hidden = false;
  box.replaceChildren();
  names.forEach((name) => {
    const tile = document.createElement("div");
    tile.className = "live-tile";
    tile.dataset.name = name;
    const pic = document.createElement("span");
    pic.className = "tile-pic";
    const photo = document.createElement("img");
    photo.className = "row-avatar";
    photo.alt = "";
    photo.hidden = true;
    const letter = document.createElement("span");
    letter.className = "tile-letter";
    letter.textContent = (name || "?").slice(0, 1).toUpperCase();
    pic.append(photo, letter);
    bindAvatar(photo, letter, name);
    const label = document.createElement("small");
    label.textContent = name;
    tile.append(pic, label);
    box.append(tile);
  });
}

function showLiveUI() {
  els.live.hidden = false;
  els.call.disabled = true;
  const people = $("live-people");
  if (people) people.hidden = false;
  if (state.groupCall) {
    setStatus(state.groupCall.name || "Gruppo");
    paintLivePeople();
  } else {
    setStatus(state.remoteLabel || "In chiamata");
    paintDirectCall();
  }
  updateToggles();
}

function showIdleUI() {
  els.call.disabled = false;
  if (state.phase === "idle") els.live.hidden = true;
  updateToggles();
}

function updateToggles() {
  const live = state.phase === "live";
  els.mute.disabled = !live || !!state.settings.pushToTalk;
  els.camera.disabled = !live;
  els.screen.disabled = !live;
  els.hangup.disabled = state.phase === "idle";
  els.mute.textContent = state.settings.pushToTalk ? (state.ptt ? "Parli" : "Tieni spazio") : (state.micOn ? "Muto" : "Riattiva");
  els.camera.textContent = state.camOn ? "Chiudi camera" : "Camera";
  els.screen.textContent = state.screenOn ? "Ferma" : "Condividi";
}

function hideRemoteVideo() {
  els.remoteVideo.srcObject = null;
  els.remoteVideo.hidden = true;
}

function streamLevel() {
  return clampNum(state.settings.streamVolume, 0, 100, 100) / 100;
}

function applyStreamVolume() {
  const volume = streamLevel();
  if (els.remoteVideo) els.remoteVideo.volume = volume;
  document.querySelectorAll(".live-tile video").forEach((video) => { video.volume = volume; });
}

function showRemoteVideo(stream) {
  els.remoteVideo.srcObject = stream;
  els.remoteVideo.hidden = false;
  els.remoteVideo.volume = streamLevel();
  const play = els.remoteVideo.play();
  if (play) play.catch(() => {});
}

function stopLocalVideo() {
  const stream = els.localVideo.srcObject;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  els.localVideo.srcObject = null;
  els.localVideo.hidden = true;
  state.camOn = false;
  state.screenOn = false;
}

function endCall(message, notify) {
  if (state.phase === "idle" && !state.voice && !state.pendingCall && !state.link && !state.incoming && !state.groupCall && !state.groupInvite) {
    if (message) setStatus(message);
    return;
  }
  const call = state.voice;
  const pending = state.pendingCall;
  const link = state.link || state.incoming;
  const wasBusy = state.phase !== "idle";
  const pack = state.groupCall;
  state.phase = "idle";
  state.voice = null;
  state.pendingCall = null;
  state.link = null;
  state.incoming = null;
  state.groupInvite = null;
  stopRing();
  clearTimers();
  els.incoming.hidden = true;
  if (window.SolaxNative && window.SolaxNative.cancelCall) {
    try { window.SolaxNative.cancelCall(); } catch (e) { /* skip */ }
  }
  if (notify !== false && wasBusy && link) {
    try { link.send({ t: "hangup" }); } catch (e) { /* already gone */ }
  }
  if (notify !== false && pack) {
    Object.values(pack.peers || {}).forEach((peer) => {
      try { peer.link && peer.link.send({ t: "hangup" }); } catch (e) { /* gone */ }
    });
  }
  try { call && call.close(); } catch (e) { /* already closed */ }
  try { pending && pending !== call && pending.close(); } catch (e) { /* already closed */ }
  try { state.videoCall && state.videoCall.close(); } catch (e) { /* already closed */ }
  try { link && link.close(); } catch (e) { /* already closed */ }
  if (pack) {
    Object.values(pack.peers || {}).forEach((peer) => {
      try { peer.call && peer.call.close(); } catch (e) { /* closed */ }
      try { peer.video && peer.video.close(); } catch (e) { /* closed */ }
      try { peer.link && peer.link.close(); } catch (e) { /* closed */ }
      if (peer.audio) {
        try { peer.audio.srcObject = null; peer.audio.remove(); } catch (e) { /* gone */ }
      }
    });
  }
  state.groupCall = null;
  state.videoCall = null;
  state.remotePeerId = "";
  state.ptt = false;
  hushMic();
  stopLocalVideo();
  els.remoteAudio.srcObject = null;
  hideRemoteVideo();
  const people = $("live-people");
  if (people) {
    people.replaceChildren();
    people.hidden = true;
  }
  const audios = $("call-audios");
  if (audios) audios.replaceChildren();
  state.micOn = !state.settings.pushToTalk;
  showIdleUI();
  setStatus(message || "");
}

function bindVoice(call) {
  if (!call || call._solaxVoice) return;
  call._solaxVoice = true;
  call.on("stream", (remote) => {
    els.remoteAudio.srcObject = remote;
    applyOutputVolume();
    const play = els.remoteAudio.play();
    if (play) play.catch(() => {});
    if (state.phase === "out" && (state.voice === call || !state.voice)) {
      state.voice = call;
      state.phase = "live";
      stopRing();
      clearTimers();
      showLiveUI();
    }
  });
  call.on("close", () => {
    if (state.voice !== call) return;
    if (state.phase === "live") endCall("Chiamata chiusa.", false);
  });
  call.on("error", () => {
    if (state.voice !== call) return;
    if (state.phase === "live") endCall("Errore nella chiamata.", false);
    else if (state.phase === "out") setStatus("Rete instabile, resto in attesa…");
  });
  const attach = () => {
    const pc = call.peerConnection;
    if (!pc || pc._solaxBound) return;
    pc._solaxBound = true;
    pc.onconnectionstatechange = () => {
      if (state.voice !== call || state.phase !== "live") return;
      if (pc.connectionState !== "failed" && pc.connectionState !== "disconnected") return;
      later(() => {
        if (state.voice === call && state.phase === "live" && (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed")) {
          endCall("Connessione persa.", false);
        }
      }, 4000);
    };
  };
  attach();
  later(attach, 400);
}

function limitSender(call, track, kind) {
  const fps = kind === "screen" ? clampNum(state.settings.screenFps, 30, 160, 30) : 60;
  const height = kind === "screen" ? clampNum(state.settings.screenRes, 360, 1440, 720) : 2160;
  const apply = () => {
    const pc = call.peerConnection;
    if (!pc) return;
    const sender = pc.getSenders().find((item) => item.track === track);
    if (!sender || !sender.getParameters) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxFramerate = fps;
      params.encodings[0].maxBitrate = videoBitrate(height, fps);
      sender.setParameters(params).catch(() => {});
    } catch (e) { /* optional */ }
  };
  later(apply, 500);
}

async function stopExtra(notify = true) {
  stopLocalVideo();
  const call = state.videoCall;
  state.videoCall = null;
  try { call && call.close(); } catch (e) { /* already closed */ }
  if (notify && state.link) {
    try { state.link.send({ t: "video-end" }); } catch (e) { /* ignore */ }
  }
  updateToggles();
}

async function publishVideo(stream, kind) {
  await stopExtra(false);
  const track = stream.getVideoTracks()[0];
  if (track) track.contentHint = kind === "screen" ? "detail" : "motion";
  els.localVideo.srcObject = stream;
  els.localVideo.hidden = false;
  els.localVideo.classList.toggle("mirror", kind === "camera");
  const localPlay = els.localVideo.play();
  if (localPlay) localPlay.catch(() => {});
  state.camOn = kind === "camera";
  state.screenOn = kind === "screen";
  updateToggles();
  if (track) track.addEventListener("ended", () => { if (state.screenOn || state.camOn) stopExtra(true); });
  try { state.link && state.link.send({ t: "video", kind }); } catch (e) { /* the track still goes out */ }
  if (state.groupCall) {
    Object.entries(state.groupCall.peers || {}).forEach(([peerId, peer]) => {
      try {
        const extra = state.peer.call(peerId, stream, {
          metadata: { kind, name: state.me.name, gid: state.groupCall.id, gname: state.groupCall.name },
        });
        if (extra && track) limitSender(extra, track, kind);
        rememberGroupPeer(peerId, { video: extra });
      } catch (e) { /* keep the rest */ }
    });
    return;
  }
  const call = state.peer.call(state.remotePeerId, stream, { metadata: { kind, name: state.me.name } });
  if (!call) { setStatus("Video non partito."); stopLocalVideo(); return; }
  state.videoCall = call;
  call.on("close", () => {
    if (state.videoCall === call) {
      state.videoCall = null;
      stopLocalVideo();
      updateToggles();
    }
  });
  if (track) limitSender(call, track, kind);
}

async function applyTrackQuality(track, kind) {
  if (kind !== "screen") {
    try {
      await track.applyConstraints({
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 60, max: 60 },
      });
    } catch (e) { /* the camera keeps its own size */ }
    return;
  }
  const fps = clampNum(state.settings.screenFps, 30, 160, 30);
  const size = frameSize(state.settings.screenRes);
  try {
    await track.applyConstraints({
      width: { ideal: size.width },
      height: { ideal: size.height },
      frameRate: { ideal: fps, max: fps },
    });
  } catch (e) { /* the device keeps its own size */ }
}

async function toggleCamera() {
  if (state.phase !== "live") return;
  if (state.camOn) { await stopExtra(true); return; }
  try {
    const video = {
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: { ideal: 60, max: 60 },
    };
    if (state.settings.camId) video.deviceId = { ideal: state.settings.camId };
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = stream.getVideoTracks()[0];
    if (track) await applyTrackQuality(track, "camera");
    await publishVideo(stream, "camera");
  } catch (e) {
    setStatus("Camera non disponibile.");
  }
}

async function toggleScreen() {
  if (state.phase !== "live") return;
  if (state.screenOn) { await stopExtra(true); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus("Su iPhone non si può condividere lo schermo. Voce e chat funzionano.");
    return;
  }
  const surface = await chooseShareSurface();
  if (!surface) return;
  const fps = clampNum(state.settings.screenFps, 30, 160, 30);
  const size = frameSize(state.settings.screenRes);
  try {
    const stream = await grabDisplay(surface, fps, size);
    const track = stream.getVideoTracks()[0];
    if (track) await applyTrackQuality(track, "screen");
    await publishVideo(stream, "screen");
  } catch (e) {
    setStatus("Condivisione annullata.");
  }
}

function chooseShareSurface() {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "incoming";
    box.innerHTML = `
      <div class="incoming-card" role="dialog" aria-modal="true">
        <p class="eyebrow">Condivisione</p>
        <h2>Cosa vuoi far vedere?</h2>
        <div class="actions">
          <button class="primary" type="button" data-surface="monitor">Schermo intero</button>
          <button class="ghost" type="button" data-surface="window">Una finestra</button>
          <button class="ghost" type="button" data-surface="">Annulla</button>
        </div>
      </div>`;
    const finish = (value) => {
      box.remove();
      resolve(value || "");
    };
    box.addEventListener("click", (event) => {
      const button = event.target.closest("[data-surface]");
      if (button) finish(button.dataset.surface || "");
      else if (event.target === box) finish("");
    });
    document.body.append(box);
  });
}

async function grabDisplay(surface, fps, size) {
  const video = {
    displaySurface: surface,
    frameRate: { ideal: fps, max: fps },
    width: { ideal: size.width },
    height: { ideal: size.height },
  };
  const options = {
    video,
    audio: true,
    monitorTypeSurfaces: surface === "window" ? "exclude" : "include",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
  };
  try {
    return await navigator.mediaDevices.getDisplayMedia(options);
  } catch (error) {
    if (error && (error.name === "NotAllowedError" || error.name === "AbortError")) throw error;
    return navigator.mediaDevices.getDisplayMedia({ video, audio: false });
  }
}

function toggleMute() {
  if (state.phase !== "live" || state.settings.pushToTalk) return;
  state.micOn = !state.micOn;
  ensureMic().then(updateToggles).catch(() => {});
}

function setTalk(down) {
  if (!state.settings.pushToTalk || state.phase !== "live") return;
  state.ptt = down;
  if (state.localAudio) state.localAudio.getAudioTracks().forEach((track) => { track.enabled = down; });
  if (state.sentAudio) state.sentAudio.getAudioTracks().forEach((track) => { track.enabled = down; });
  updateToggles();
}

function linkIsNoise(link) {
  const meta = (link && link.metadata) || {};
  return !!(meta.file || meta.avatar);
}

function phoneCallAlert(label) {
  if (!phoneLayout()) return;
  const who = String(label || "Qualcuno");
  const native = window.SolaxNative;
  if (native && native.notifyCall) {
    try { native.notifyCall(who); } catch (e) { /* banner stays */ }
  }
  try {
    if (typeof Notification === "function" && Notification.permission === "granted") {
      new Notification("SolaxRD", { body: `${who} ti sta chiamando` });
    }
  } catch (e) { /* in-app banner stays */ }
}

function showIncoming(label) {
  els.incomingTitle.textContent = `${label} ti sta chiamando`;
  els.incoming.hidden = false;
  els.hangup.disabled = false;
  phoneCallAlert(label);
  unlockAudio();
}

function whenOpen(link, ms) {
  return new Promise((resolve) => {
    if (!link) { resolve(false); return; }
    if (link.open) { resolve(true); return; }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), ms);
    link.on("open", () => finish(true));
    link.on("error", () => finish(false));
  });
}

function beginIncoming(link, name) {
  if (linkIsNoise(link)) return;
  if (state.phase === "in" && (state.incoming === link || state.link === link)) return;
  const label = cleanLabel(name);
  if (isBlocked(label) || state.settings.status === "dnd") {
    try { link.send({ t: "reject" }); } catch (e) { /* drop */ }
    return;
  }
  if (state.remotePeerId && link.peer === state.remotePeerId) {
    state.link = link;
    state.incoming = link;
    return;
  }
  if (state.phase !== "idle") {
    try { link.send({ t: "busy" }); } catch (e) { /* ignore */ }
    return;
  }
  state.incoming = link;
  state.link = link;
  state.phase = "in";
  state.remoteLabel = label;
  state.remotePeerId = link.peer;
  showIncoming(label);
  startRing();
  later(() => { if (state.phase === "in") endCall("Chiamata persa."); }, 40000);
}

function onSignal(msg) {
  if (!msg || !msg.t) return;
  if (msg.t === "accept" && state.phase === "out") {
    if (msg.name) state.remoteLabel = cleanLabel(msg.name);
    state.phase = "live";
    stopRing();
    clearTimers();
    showLiveUI();
    if (!state.voice) {
      ensureMic().then((stream) => {
        if (state.phase !== "live") return;
        const call = state.peer.call(state.remotePeerId, stream, {
          metadata: { kind: "voice", name: state.me.name },
        });
        if (!call) { endCall("Chiamata non partita. Riprova."); return; }
        state.voice = call;
        bindVoice(call);
      }).catch(() => endCall("Microfono non disponibile."));
    }
    return;
  }
  if (msg.t === "gcall") return;
  if (msg.t === "reject" && state.phase === "out" && !state.groupCall) endCall("Ha rifiutato.", false);
  if (msg.t === "busy" && state.phase === "out" && !state.voice && !state.groupCall) endCall("È già in chiamata.", false);
  if (msg.t === "hangup" && !state.groupCall) endCall("Chiamata chiusa.", false);
  if (msg.t === "video-end" && !state.groupCall) hideRemoteVideo();
}

function attachLink(link) {
  if (!link || link._solaxBound) return;
  link._solaxBound = true;
  link.on("data", (data) => {
    const msg = readMsg(data);
    if (data instanceof ArrayBuffer) {
      enqueueFile({ buf: data });
      return;
    }
    if (ArrayBuffer.isView(data)) {
      enqueueFile({ buf: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
      return;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      enqueueFile({ blob: data });
      return;
    }
    if (!msg) return;
    if (msg.t === "file-start") {
      enqueueFile({ id: msg.id });
      if (msg.preview && msg.id) rememberPreview(msg.id, msg.preview);
      return;
    }
    if (msg.t === "file-end") {
      if (msg.preview && msg.id) rememberPreview(msg.id, msg.preview);
      if (msg.id) enqueueFile({ end: msg.id });
      return;
    }
    if (msg.t === "file-preview" && msg.id && msg.preview) {
      rememberPreview(msg.id, msg.preview);
      return;
    }
    if (msg.t === "gcall") {
      beginIncomingGroup(link, msg);
      return;
    }
    if (msg.t === "ring") {
      if (linkIsNoise(link)) return;
      if (state.incoming === link || state.link === link) return;
      if (state.remotePeerId && link.peer === state.remotePeerId) {
        state.link = link;
        state.incoming = link;
        return;
      }
      if (state.phase === "idle") beginIncoming(link, msg.name || (link.metadata && link.metadata.name));
      else {
        try { link.send({ t: "busy" }); } catch (e) { /* ignore */ }
      }
      return;
    }
    if (state.groupCall && state.groupCall.peers[link.peer]) {
      if (msg.t === "hangup") return;
      if (msg.t === "accept") return;
    }
    if (state.link === link || state.incoming === link) onSignal(msg);
  });
  link.on("close", () => {
    if (linkIsNoise(link)) return;
    if (state.groupCall && state.groupCall.peers[link.peer]) return;
    if ((state.link === link || state.incoming === link) && state.phase === "live") endCall("Chiamata chiusa.", false);
  });
  link.on("error", () => {
    /* first PeerJS connect often errors; startCall retries and times out */
  });
}

function startPeer() {
  if (!window.Peer) {
    els.net.textContent = "Chiamate non disponibili";
    return;
  }
  state.loggingOut = false;
  state.peerReady = false;
  const peer = new Peer(state.me.peerId, {
    secure: true,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
          username: "peerjs",
          credential: "peerjsp",
        },
      ],
      sdpSemantics: "unified-plan",
    },
  });
  state.peer = peer;
  peer.on("open", () => {
    state.peerReady = true;
    state.retries = 0;
    els.net.textContent = "In linea";
    shareAvatars();
  });
  peer.on("disconnected", () => {
    state.peerReady = false;
    if (state.loggingOut || !state.peer || state.peer.destroyed) return;
    state.retries += 1;
    if (state.retries > 6) { els.net.textContent = "Offline"; return; }
    els.net.textContent = "Riconnessione…";
    later(() => { try { peer.reconnect(); } catch (e) { /* retry later */ } }, 1500 * state.retries);
  });
  peer.on("error", (err) => {
    const type = err && err.type;
    if (type === "peer-unavailable") {
      /* first lookup is often empty; outgoing calls retry instead of hanging up */
    }
    else if (type === "unavailable-id") els.net.textContent = "Account già aperto";
    else if (type === "network" || type === "server-error" || type === "socket-error") els.net.textContent = "Connessione assente";
  });
  peer.on("connection", (link) => {
    attachLink(link);
    link.on("data", async (payload) => {
      const msg = readMsg(payload);
      if (msg && msg.t === "avatar" && msg.name && msg.d) await saveFriendAvatar(msg.name, msg.d);
    });
    const meta = link.metadata || {};
    if (meta.solax === "gcall") {
      if (state.groupCall && state.groupCall.id === meta.gid) rememberGroupPeer(link.peer, { link, name: meta.name || "" });
      else if (state.phase === "idle") beginIncomingGroup(link, meta);
    }
    if (meta.solax === "call") {
      if (state.phase === "idle") beginIncoming(link, meta.name);
      else if (state.remotePeerId === link.peer) {
        state.link = link;
        state.incoming = link;
      }
    }
  });
  peer.on("call", (call) => {
    const kind = (call.metadata && call.metadata.kind) || "voice";
    const label = cleanLabel((call.metadata && call.metadata.name) || "Qualcuno");
    const gid = call.metadata && call.metadata.gid;
    if (kind !== "voice") {
      if (state.phase !== "live") { try { call.close(); } catch (e) { /* drop */ } return; }
      call.answer();
      if (gid && state.groupCall && state.groupCall.id === gid) {
        call.on("stream", (remote) => attachGroupStream(call.peer, label, remote));
        return;
      }
      state.videoCall = call;
      call.on("stream", showRemoteVideo);
      call.on("close", () => { if (state.videoCall === call) { state.videoCall = null; hideRemoteVideo(); } });
      return;
    }
    if (isBlocked(label) || state.settings.status === "dnd") {
      try { call.close(); } catch (e) { /* drop */ }
      return;
    }
    if (gid && state.groupCall && state.groupCall.id === gid && (state.phase === "live" || state.phase === "out")) {
      const existing = state.groupCall.peers[call.peer];
      if (existing && existing.call && existing.call !== call) {
        try { call.close(); } catch (e) { /* keep first */ }
        return;
      }
      ensureMic().then((stream) => {
        if (!state.groupCall || state.phase === "idle") return;
        call.answer(stream);
        rememberGroupPeer(call.peer, { call, name: label });
        bindGroupVoice(call, label);
      }).catch(() => {});
      return;
    }
    if (gid && state.phase === "idle") {
      state.pendingCall = call;
      beginIncomingGroup(null, call.metadata || { gid, gname: call.metadata && call.metadata.gname, name: label });
      return;
    }
    if (gid && state.phase === "in" && state.groupInvite && state.groupInvite.gid === gid) {
      state.pendingCall = call;
      return;
    }
    if (state.remotePeerId && call.peer === state.remotePeerId) {
      state.pendingCall = call;
      if (state.phase === "live") {
        ensureMic().then((stream) => {
          if (state.phase !== "live") return;
          call.answer(stream);
          state.voice = call;
          bindVoice(call);
        }).catch(() => {});
      }
      return;
    }
    if (state.phase !== "idle") {
      try { call.close(); } catch (e) { /* busy */ }
      return;
    }
    state.pendingCall = call;
    state.phase = "in";
    state.remoteLabel = label;
    state.remotePeerId = call.peer;
    showIncoming(label);
    startRing();
    later(() => { if (state.phase === "in") endCall("Chiamata persa."); }, 40000);
  });
}

function destroyPeer() {
  state.loggingOut = true;
  state.peerReady = false;
  endCall("", false);
  stopMic();
  try { state.peer && state.peer.destroy(); } catch (e) { /* already gone */ }
  state.peer = null;
}

async function waitReady() {
  if (state.peerReady) return;
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (state.peerReady) { window.clearInterval(timer); resolve(); }
      else if (Date.now() - started > 12000) { window.clearInterval(timer); reject(new Error("offline")); }
    }, 200);
  });
}

async function placeVoice(peerId, stream) {
  if (!micLive(stream) || !state.peer || state.peer.destroyed) return null;
  let call = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (state.phase !== "out" && state.phase !== "live") return state.voice;
    try {
      call = state.peer.call(peerId, stream, { metadata: { kind: "voice", name: state.me.name } });
    } catch (e) {
      call = null;
    }
    if (call) {
      state.voice = call;
      bindVoice(call);
      return call;
    }
    await sleep(180);
  }
  return null;
}

function placeVoiceSoon(peerId, micTask) {
  (async () => {
    let stream = await Promise.resolve(micTask).catch(() => null);
    if (!micLive(stream)) stream = await ensureMic().catch(() => null);
    for (let attempt = 0; attempt < 6 && !micLive(stream); attempt += 1) {
      if (state.phase !== "out") return;
      await sleep(160);
      stream = await ensureMic().catch(() => null);
    }
    if (state.phase !== "out" || !micLive(stream)) return;
    await placeVoice(peerId, stream);
  })();
}

async function connectAndRing(peerId) {
  let lastLink = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (state.phase !== "out" || !state.peer || state.peer.destroyed) return lastLink;
    let link = null;
    try {
      link = state.peer.connect(peerId, {
        reliable: true,
        metadata: { solax: "call", name: state.me.name },
      });
    } catch (e) {
      link = null;
    }
    if (!link) {
      await sleep(220);
      continue;
    }
    lastLink = link;
    state.link = link;
    attachLink(link);
    const opened = await whenOpen(link, 2800);
    if (state.phase !== "out") return link;
    if (opened) {
      try { link.send({ t: "ring", name: state.me.name }); } catch (e) { /* media still goes out */ }
      return link;
    }
    try { link.close(); } catch (e) { /* retry */ }
    if (state.link === link) state.link = null;
    await sleep(180);
  }
  return lastLink;
}

function sameName(a, b) {
  return String(a || "").toLocaleLowerCase("it") === String(b || "").toLocaleLowerCase("it");
}

function avatarSrc(name) {
  const tick = state.avatarTick || 1;
  if (state.me && sameName(name, state.me.name)) return `/api/avatar?t=${tick}`;
  return `/api/avatar/friend?name=${encodeURIComponent(name)}&t=${tick}`;
}

const avatarUrls = new Map();

function bindAvatar(img, letter, name) {
  if (!img || !name) return;
  const ticket = String(state.avatarTick || 1);
  img.dataset.avatar = name;
  img.alt = "";
  img.hidden = true;
  if (letter) letter.hidden = false;
  const key = name.toLocaleLowerCase("it") + ":" + ticket;
  const show = (url) => {
    if (img.dataset.avatar !== name || String(state.avatarTick || 1) !== ticket) return;
    img.onload = () => { img.hidden = false; if (letter) letter.hidden = true; };
    img.onerror = () => { img.hidden = true; if (letter) letter.hidden = false; };
    img.src = url;
  };
  const cached = avatarUrls.get(key);
  if (cached) { show(cached); return; }
  fetch(avatarSrc(name)).then((res) => {
    if (!res.ok) throw new Error("missing");
    return res.blob();
  }).then((blob) => {
    if (!blob || !blob.size) throw new Error("empty");
    const url = URL.createObjectURL(blob);
    avatarUrls.set(key, url);
    show(url);
  }).catch(() => {
    if (img.dataset.avatar === name) {
      img.hidden = true;
      if (letter) letter.hidden = false;
    }
  });
}

function bumpAvatars() {
  state.avatarTick = Date.now();
  document.querySelectorAll("img[data-avatar]").forEach((img) => {
    const letter = img.parentElement && img.parentElement.querySelector(".row-letter, .tile-letter");
    bindAvatar(img, letter, img.dataset.avatar);
  });
  if (state.activeKind !== "group" && state.active) {
    bindAvatar($("thread-photo"), $("thread-letter"), state.active);
  }
}

function knownAvatarNames() {
  const names = [];
  const add = (name) => {
    if (!name || names.some((item) => sameName(item, name))) return;
    if (state.me && sameName(name, state.me.name)) return;
    names.push(name);
  };
  (state.chats || []).forEach((chat) => add(chat.name));
  (state.groups || []).forEach((group) => (group.members || []).forEach(add));
  if (state.group) (state.group.members || []).forEach(add);
  if (state.active && state.activeKind !== "group") add(state.active);
  return names.slice(0, 20);
}

async function pullAvatars() {
  const names = knownAvatarNames();
  if (!names.length) {
    bumpAvatars();
    return;
  }
  const data = await api("/api/avatars/pull", { names });
  if (data && data.ok) bumpAvatars();
}

function groupPeerMeta() {
  return {
    kind: "voice",
    name: state.me && state.me.name,
    gid: state.groupCall && state.groupCall.id,
    gname: state.groupCall && state.groupCall.name,
  };
}

function rememberGroupPeer(peerId, extra) {
  if (!state.groupCall || !peerId) return null;
  const cur = state.groupCall.peers[peerId] || { name: "", call: null, link: null, audio: null, video: null };
  Object.assign(cur, extra || {});
  state.groupCall.peers[peerId] = cur;
  return cur;
}

function paintLivePeople() {
  const box = $("live-people");
  if (!box || !state.groupCall) return;
  const names = (state.groupCall.members || []).slice();
  if (state.me && !names.some((name) => sameName(name, state.me.name))) names.unshift(state.me.name);
  box.hidden = false;
  const seen = new Set();
  [...box.children].forEach((node) => {
    if (!names.some((name) => sameName(name, node.dataset.name))) node.remove();
  });
  names.forEach((name) => {
    seen.add(name);
    let tile = [...box.children].find((node) => sameName(node.dataset.name, name));
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "live-tile";
      tile.dataset.name = name;
      const pic = document.createElement("span");
      pic.className = "tile-pic";
      const photo = document.createElement("img");
      photo.className = "row-avatar";
      const letter = document.createElement("span");
      letter.className = "tile-letter";
      letter.textContent = (name || "?").slice(0, 1).toUpperCase();
      pic.append(photo, letter);
      bindAvatar(photo, letter, name);
      const label = document.createElement("small");
      label.textContent = name;
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.hidden = true;
      tile.append(pic, label, video);
      box.append(tile);
    } else {
      const photo = tile.querySelector(".row-avatar");
      const letter = tile.querySelector(".tile-letter");
      if (photo) bindAvatar(photo, letter, name);
    }
  });
}

function attachGroupStream(peerId, name, stream) {
  rememberGroupPeer(peerId, { name });
  const host = $("call-audios") || document.body;
  let audio = document.getElementById(`aud-${peerId}`);
  if (!audio) {
    audio = document.createElement("audio");
    audio.id = `aud-${peerId}`;
    audio.autoplay = true;
    host.append(audio);
  }
  audio.srcObject = stream;
  audio.volume = liveVolume();
  if (typeof audio.setSinkId === "function" && state.settings.speakerId) {
    audio.setSinkId(state.settings.speakerId).catch(() => {});
  }
  const play = audio.play();
  if (play) play.catch(() => {});
  rememberGroupPeer(peerId, { audio, name });
  const box = $("live-people");
  if (box) {
    paintLivePeople();
    const tile = [...box.children].find((node) => sameName(node.dataset.name, name));
    if (tile) {
      const video = tile.querySelector("video");
      const hasVideo = stream.getVideoTracks && stream.getVideoTracks().some((track) => track.readyState === "live");
      if (video && hasVideo) {
        video.srcObject = stream;
        video.hidden = false;
        video.volume = streamLevel();
        const go = video.play();
        if (go) go.catch(() => {});
      }
    }
  }
}

function bindGroupVoice(call, name) {
  if (!call || call._solaxGroup) return;
  call._solaxGroup = true;
  call.on("stream", (remote) => {
    attachGroupStream(call.peer, name, remote);
    if (state.phase === "out") {
      state.phase = "live";
      stopRing();
      clearTimers();
      showLiveUI();
    }
  });
  call.on("close", () => {
    if (!state.groupCall || !state.groupCall.peers[call.peer] || state.groupCall.peers[call.peer].call !== call) return;
    const peer = state.groupCall.peers[call.peer];
    if (peer.audio) {
      try { peer.audio.srcObject = null; peer.audio.remove(); } catch (e) { /* gone */ }
    }
    delete state.groupCall.peers[call.peer];
  });
  call.on("error", () => {});
}

function shouldCallMember(name) {
  if (!state.me) return false;
  return String(state.me.name || "").toLocaleLowerCase("it") < String(name || "").toLocaleLowerCase("it");
}

async function placeGroupVoice(peerId, name, stream) {
  if (!state.peer || !micLive(stream) || !peerId) return null;
  const existing = state.groupCall && state.groupCall.peers[peerId];
  if (existing && existing.call) return existing.call;
  let call = null;
  try {
    call = state.peer.call(peerId, stream, { metadata: groupPeerMeta() });
  } catch (e) {
    call = null;
  }
  if (!call) return null;
  rememberGroupPeer(peerId, { call, name });
  bindGroupVoice(call, name);
  return call;
}

async function ringGroupMember(name) {
  if (!state.peer || !state.groupCall) return;
  const data = await api("/api/peer", { name });
  if (!data.ok || data.peerId === state.me.peerId) return;
  let link = null;
  try {
    link = state.peer.connect(data.peerId, {
      reliable: true,
      metadata: {
        solax: "gcall",
        name: state.me.name,
        gid: state.groupCall.id,
        gname: state.groupCall.name,
      },
    });
  } catch (e) {
    link = null;
  }
  if (!link) return;
  rememberGroupPeer(data.peerId, { link, name: data.name });
  attachLink(link);
  const opened = await whenOpen(link, 2800);
  if (!opened || !state.groupCall) return;
  try {
    link.send({
      t: "gcall",
      name: state.me.name,
      gid: state.groupCall.id,
      gname: state.groupCall.name,
    });
  } catch (e) { /* voice may still go */ }
  if (shouldCallMember(data.name)) {
    const stream = await ensureMic().catch(() => null);
    if (micLive(stream) && state.groupCall) await placeGroupVoice(data.peerId, data.name, stream);
  }
}

function joinGroupRoom(remote, starter) {
  state.groupCall = {
    id: remote.id,
    name: remote.name,
    members: remote.members || [],
    starter: starter || (state.me && state.me.name) || "",
    peers: (state.groupCall && state.groupCall.peers) || {},
  };
  paintLivePeople();
}

async function meshGroup() {
  if (!state.groupCall || !state.me) return;
  const others = (state.groupCall.members || []).filter((name) => !sameName(name, state.me.name));
  await Promise.all(others.map((name) => ringGroupMember(name).catch(() => {})));
}

function beginIncomingGroup(link, msg) {
  if (!msg || !msg.gid) return;
  if (state.groupCall && state.groupCall.id === msg.gid) {
    rememberGroupPeer(link && link.peer, { link, name: msg.name || "" });
    return;
  }
  if (linkIsNoise(link)) return;
  if (state.phase !== "idle") {
    try { link && link.send({ t: "busy" }); } catch (e) { /* ignore */ }
    return;
  }
  state.incoming = link;
  state.link = link;
  state.phase = "in";
  state.remoteLabel = msg.gname || msg.name || "Gruppo";
  state.remotePeerId = (link && link.peer) || "";
  state.groupInvite = {
    gid: msg.gid,
    gname: msg.gname || "Gruppo",
    name: msg.name || "",
    link,
    peerId: (link && link.peer) || "",
  };
  els.incomingTitle.textContent = `${cleanLabel(msg.name)} ti chiama nel gruppo ${msg.gname || "Gruppo"}`;
  els.incoming.hidden = false;
  phoneCallAlert(cleanLabel(msg.name));
  els.hangup.disabled = false;
  startRing();
  later(() => {
    if (state.phase === "in" && state.groupInvite && state.groupInvite.gid === msg.gid) endCall("Chiamata persa.");
  }, 40000);
}

async function startGroupCall() {
  if (state.phase !== "idle" || !state.group) return;
  const members = (state.group.members || []).filter((name) => !sameName(name, state.me && state.me.name));
  if (!members.length) {
    els.listError.textContent = "Aggiungi qualcuno al gruppo per chiamare.";
    return;
  }
  unlockAudio();
  warmMic();
  if (state.settings.confirmCall && !window.confirm(`Chiamare il gruppo ${state.group.name}?`)) return;
  if (state.phase !== "idle") return;
  state.phase = "out";
  joinGroupRoom(state.group, state.me.name);
  els.live.hidden = false;
  els.hangup.disabled = false;
  els.call.disabled = true;
  setStatus(`Chiamo ${state.group.name}…`);
  try { startRing(); } catch (e) { /* optional */ }
  try {
    await waitReady();
  } catch (e) {
    endCall("Non sei in linea. Aspetta 'In linea' in alto.");
    return;
  }
  const stream = await ensureMic().catch(() => null);
  if (!micLive(stream)) {
    endCall("Microfono non disponibile.");
    return;
  }
  state.phase = "live";
  stopRing();
  showLiveUI();
  meshGroup().catch(() => {});
  later(() => {
    if (state.groupCall && state.phase === "live" && !Object.keys(state.groupCall.peers || {}).length) {
      setStatus("Nessuno ha risposto ancora. Resta in attesa…");
    }
  }, 12000);
}

async function acceptGroupCall() {
  const invite = state.groupInvite;
  if (!invite || state.phase !== "in") return;
  unlockAudio();
  warmMic();
  try {
    let stream = await ensureMic().catch(() => null);
    for (let attempt = 0; attempt < 5 && !micLive(stream); attempt += 1) {
      if (state.phase !== "in") return;
      await sleep(160);
      stream = await ensureMic().catch(() => null);
    }
    if (state.phase !== "in") return;
    if (!micLive(stream)) { endCall("Microfono non disponibile."); return; }
    const opened = await api("/api/groups/open", { id: invite.gid });
    const remote = (opened && opened.group) || { id: invite.gid, name: invite.gname, members: [] };
    try { invite.link && invite.link.send({ t: "accept", name: state.me.name }); } catch (e) { /* media */ }
    joinGroupRoom(remote, invite.name);
    rememberGroupPeer(invite.peerId, { link: invite.link, name: invite.name });
    state.groupInvite = null;
    state.phase = "live";
    els.incoming.hidden = true;
    stopRing();
    clearTimers();
    showLiveUI();
    const pending = state.pendingCall;
    if (pending) {
      pending.answer(stream);
      rememberGroupPeer(pending.peer, { call: pending, name: invite.name });
      bindGroupVoice(pending, invite.name);
      state.pendingCall = null;
    }
    meshGroup().catch(() => {});
  } catch (e) {
    endCall("Microfono non disponibile.");
  }
}

async function startCall(rawName) {
  if (state.phase !== "idle") return;
  unlockAudio();
  warmMic();
  if (state.settings.confirmCall && !window.confirm(`Chiamare ${rawName}?`)) return;
  if (state.phase !== "idle") return;
  state.phase = "out";
  state.remoteLabel = String(rawName || "").trim();
  els.live.hidden = false;
  setStatus(`Chiamo ${state.remoteLabel}…`);
  els.hangup.disabled = false;
  els.call.disabled = true;
  try { startRing(); } catch (e) { /* ring is optional */ }
  const micTask = ensureMic();
  try {
    const data = await api("/api/peer", { name: rawName });
    if (state.phase !== "out") return;
    if (!data.ok) { endCall(data.error || "Chiamata non partita."); return; }
    if (data.peerId === state.me.peerId) { endCall("Non puoi chiamare te stesso."); return; }
    if (isBlocked(data.name)) { endCall("Hai bloccato questo nome."); return; }
    state.remoteLabel = data.name;
    state.remotePeerId = data.peerId;
    setStatus(`Chiamo ${data.name}…`);
    try { await waitReady(); } catch (e) { endCall("Non sei in linea. Aspetta 'In linea' in alto."); return; }
    if (!state.peer || state.peer.disconnected || state.peer.destroyed) {
      endCall("Non sei in linea. Aspetta 'In linea' in alto.");
      return;
    }
    placeVoiceSoon(data.peerId, micTask);
    const link = await connectAndRing(data.peerId);
    if (state.phase !== "out") return;
    if (!state.voice && !link && !state.link) {
      endCall("Non raggiungibile. Deve avere SolaxRD aperto.");
      return;
    }
    later(() => { if (state.phase === "out") endCall("Nessuna risposta."); }, 40000);
  } catch (e) {
    if (state.phase === "out") endCall("Chiamata non partita. Riprova.");
  }
}

async function acceptCall() {
  if (state.groupInvite) {
    await acceptGroupCall();
    return;
  }
  if (state.phase !== "in") return;
  unlockAudio();
  warmMic();
  try {
    let stream = await ensureMic().catch(() => null);
    for (let attempt = 0; attempt < 5 && !micLive(stream); attempt += 1) {
      if (state.phase !== "in") return;
      await sleep(160);
      stream = await ensureMic().catch(() => null);
    }
    if (state.phase !== "in") return;
    if (!micLive(stream)) { endCall("Microfono non disponibile."); return; }
    try { state.link && state.link.send({ t: "accept", name: state.me.name }); } catch (e) { /* media still answers */ }
    const call = state.pendingCall;
    state.phase = "live";
    els.incoming.hidden = true;
    stopRing();
    clearTimers();
    showLiveUI();
    if (call) {
      call.answer(stream);
      state.voice = call;
      bindVoice(call);
    }
  } catch (e) {
    endCall("Microfono non disponibile.");
  }
}

async function openChat(name) {
  const tick = state.openTick + 1;
  state.openTick = tick;
  try {
    els.listError.textContent = "";
    const label = String(name || "").trim();
    if (!label) return;
    if (state.active === label && state.activeKind !== "group" && state.view === "thread") {
      setView("thread");
      return;
    }
    state.activeKind = "dm";
    state.group = null;
    state.active = label;
    markActiveChat(label);
    setView("thread");
    if (els.threadName) els.threadName.textContent = label;
    const data = await api("/api/chats/open", { name: label });
    if (tick !== state.openTick) return;
    if (!data.ok) { els.listError.textContent = data.error || "Chat non aperta."; return; }
    state.active = data.name;
    state.rev = data.rev || 0;
    state.seen = new Set();
    if (Array.isArray(data.chats)) state.chats = data.chats;
    if (els.messages) els.messages.replaceChildren();
    (data.messages || []).forEach((message) => {
      try { addBubble(message); } catch (e) { /* skip a broken row */ }
    });
    if (els.threadName) els.threadName.textContent = data.name;
    const letter = $("thread-letter");
    const photo = $("thread-photo");
    if (letter) {
      letter.textContent = (data.name || "?").slice(0, 1).toUpperCase();
      letter.hidden = false;
    }
    if (photo) {
      bindAvatar(photo, letter, data.name);
    }
    paintOnline();
    markActiveChat(data.name);
    state.settings.lastChat = data.name;
    persistSoon();
  } catch (e) {
    if (tick === state.openTick) els.listError.textContent = "Chat non aperta. Riprova.";
  }
}

async function openGroup(gid) {
  const tick = state.openTick + 1;
  state.openTick = tick;
  try {
    els.listError.textContent = "";
    if (!gid) return;
    if (state.activeKind === "group" && state.active === gid && state.view === "thread") {
      setView("thread");
      return;
    }
    state.activeKind = "group";
    state.active = gid;
    markActiveChat(`g:${gid}`);
    setView("thread");
    const data = await api("/api/groups/open", { id: gid });
    if (tick !== state.openTick) return;
    if (!data.ok) { els.listError.textContent = data.error || "Gruppo non aperto."; return; }
    if (Array.isArray(data.groups)) state.groups = data.groups;
    state.group = data.group;
    state.active = data.group.id;
    state.rev = data.rev || 0;
    state.seen = new Set();
    if (els.messages) els.messages.replaceChildren();
    (data.messages || []).forEach((message) => {
      try { addBubble(message); } catch (e) { /* skip */ }
    });
    if (els.threadName) els.threadName.textContent = data.group.name;
    const letter = $("thread-letter");
    const photo = $("thread-photo");
    if (letter) {
      letter.textContent = "#";
      letter.hidden = false;
    }
    if (photo) photo.hidden = true;
    showPeople(true);
    paintPeople();
    paintOnline();
    markActiveChat(`g:${data.group.id}`);
    renderChats();
    state.settings.lastChat = `g:${data.group.id}`;
    persistSoon();
    pullOnline();
    pullAvatars().catch(() => {});
  } catch (e) {
    if (tick === state.openTick) els.listError.textContent = "Gruppo non aperto. Riprova.";
  }
}

async function sendMessage(text) {
  if (!state.active) return;
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  els.composerText.value = "";
  els.composerCount.textContent = "0/80";
  const row = addBubble({ mine: true, text: clean.slice(0, 80), at: Math.floor(Date.now() / 1000), from: state.me && state.me.name });
  const data = state.activeKind === "group"
    ? await api("/api/groups/send", { id: state.active, text: clean })
    : await api("/api/chats/send", { name: state.active, text: clean });
  if (!data.ok) {
    if (row) row.remove();
    els.listError.textContent = data.error;
    els.composerText.value = clean;
    return;
  }
  if (data.message) addBubble(data.message);
  if (data.chats) { state.chats = data.chats; renderChats(); }
  if (data.groups) { state.groups = data.groups; renderChats(); }
  if (data.group) { state.group = data.group; paintPeople(); }
}

function phoneNotify(title, body) {
  if (!document.body.classList.contains("android")) return;
  const native = window.SolaxNative;
  if (!native || !native.notifyMessage) return;
  const name = String(title || "SolaxRD").replace(/\s+/g, " ").trim().slice(0, 80);
  const text = String(body || "Nuovo messaggio").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!name || !text) return;
  try { native.notifyMessage(name, text); } catch (e) { /* skip */ }
}

function lookingAtChat(kind, id) {
  if (document.body.classList.contains("away") || document.hidden) return false;
  if (state.view !== "thread") return false;
  if (kind === "group") return state.activeKind === "group" && state.active === id;
  return state.activeKind !== "group" && state.active === id;
}

function noteMessages(messages, kind, id, title) {
  state.noted = state.noted || new Set();
  (messages || []).forEach((message) => {
    if (!message || message.mine) return;
    const key = `${kind}:${id}:${message.n || message.text || message.filename || ""}`;
    if (state.noted.has(key)) return;
    state.noted.add(key);
    if (lookingAtChat(kind, id)) return;
    const person = message.from || title || "Qualcuno";
    const body = message.text || message.filename || "Nuovo messaggio";
    phoneNotify(person, body);
  });
}

function noteRows(before, after, kind) {
  if (!document.body.classList.contains("android")) return;
  const previous = new Map((before || []).map((item) => [kind === "group" ? item.id : item.name, item]));
  (after || []).forEach((item) => {
    const key = kind === "group" ? item.id : item.name;
    const old = previous.get(key);
    if (!old) return;
    const unread = Number(item.unread || 0);
    const was = Number(old.unread || 0);
    if (unread <= was && item.last === old.last) return;
    if (unread <= 0) return;
    if (lookingAtChat(kind, key)) return;
    const person = item.from || item.name || "Qualcuno";
    phoneNotify(person, item.last || "Nuovo messaggio");
  });
}

async function syncNow() {
  if (!state.me || state.updating) return;
  const chatReq = api("/api/chats/sync", {
    name: state.view === "thread" && state.activeKind !== "group" ? state.active : "",
    rev: state.activeKind === "group" ? 0 : (state.rev || 0),
  });
  const groupReq = api("/api/groups/sync", {
    id: state.view === "thread" && state.activeKind === "group" ? state.active : "",
    rev: state.activeKind === "group" ? (state.rev || 0) : 0,
  });
  const data = await chatReq;
  const groups = await groupReq;
  if (data && data.ok) {
    if (!Array.isArray(state.chats)) state.chats = [];
    const previousChats = state.chats;
    const previous = JSON.stringify(state.chats.map((chat) => [chat.name, chat.unread, chat.last, chat.at]));
    state.chats = Array.isArray(data.chats) ? data.chats : state.chats;
    if (state.activeKind !== "group") {
      if (data.reload && els.messages) {
        els.messages.replaceChildren();
        state.seen = new Set();
        (data.messages || []).forEach((message) => { try { addBubble(message); } catch (e) { /* skip */ } });
        noteMessages(data.messages, "dm", state.active, state.active);
      } else if (data.messages && data.messages.length) {
        data.messages.forEach((message) => { try { addBubble(message); } catch (e) { /* skip */ } });
        noteMessages(data.messages, "dm", state.active, state.active);
        if (soundsOn() && state.settings.messageSound !== false) beep(660, 0.03);
      }
      if (data.rev) state.rev = data.rev;
    }
    noteRows(previousChats, state.chats, "dm");
    const next = JSON.stringify(state.chats.map((chat) => [chat.name, chat.unread, chat.last, chat.at]));
    if (previous !== next) renderChats();
  }
  if (groups && groups.ok) {
    const beforeRows = state.groups || [];
    const before = JSON.stringify(state.groups);
    state.groups = Array.isArray(groups.groups) ? groups.groups : state.groups;
    if (groups.group) {
      state.group = groups.group;
      paintPeople();
    }
    if (state.activeKind === "group") {
      if (groups.reload && els.messages) {
        els.messages.replaceChildren();
        state.seen = new Set();
        (groups.messages || []).forEach((message) => { try { addBubble(message); } catch (e) { /* skip */ } });
        noteMessages(groups.messages, "group", state.active, state.group && state.group.name);
      } else if (groups.messages && groups.messages.length) {
        groups.messages.forEach((message) => { try { addBubble(message); } catch (e) { /* skip */ } });
        noteMessages(groups.messages, "group", state.active, state.group && state.group.name);
        if (soundsOn() && state.settings.messageSound !== false) beep(660, 0.03);
      }
      if (groups.rev) state.rev = groups.rev;
    }
    noteRows(beforeRows, state.groups, "group");
    if (JSON.stringify(state.groups) !== before) renderChats();
  }
}

function showUpdateChip(show) {
  const chip = $("update-chip");
  if (chip) chip.hidden = !show;
}

async function checkUpdate() {
  const data = await api("/api/update");
  const local = Number(data.local);
  const shown = Number.isFinite(local) ? local : 0;
  if (els.version) els.version.textContent = RELEASE_NAME;
  let pending = !!(data && data.update);
  if (pending && document.body.classList.contains("android") && window.SolaxNative && window.SolaxNative.load) {
    const skipped = Number(window.SolaxNative.load("skip-aver") || 0) || 0;
    if (skipped >= Number(data.remote || 0)) pending = false;
  }
  if ($("update-title") && pending) $("update-title").textContent = RELEASE_NAME;
  if ($("update-copy") && !state.updating && pending) {
    $("update-copy").textContent = document.body.classList.contains("android")
      ? "C’è 1.0.0 release. Premi Installa ora e conferma l’installazione sul telefono."
      : "Premi Installa ora: SolaxRD si chiude e si riapre con 1.0.0 release.";
  }
  const ready = pending;
  if (!ready) {
    if (!state.updating) {
      els.update.hidden = true;
      showUpdateChip(false);
      state.updateSnooze = false;
    }
    return;
  }
  if (state.updating) return;
  if (state.updateSnooze) {
    els.update.hidden = true;
    showUpdateChip(true);
    return;
  }
  els.update.hidden = false;
  showUpdateChip(false);
}

async function installUpdate() {
  if (state.updating) return;
  state.updating = true;
  state.updateSnooze = false;
  showUpdateChip(false);
  els.update.hidden = false;
  const later = $("update-later");
  const bar = $("update-bar");
  const copy = $("update-copy");
  const button = $("install-update");
  if (later) later.hidden = true;
  if (bar) bar.hidden = false;
  if (button) {
    button.disabled = true;
    button.textContent = "Installo…";
  }
  if (copy) {
    copy.textContent = document.body.classList.contains("android")
      ? "Scarico l’aggiornamento. Tra poco Android chiede di installarlo."
      : "Scarico la nuova versione. Tra poco SolaxRD si chiude e si riapre da solo.";
  }
  const applied = await api("/api/update/apply", {});
  if (applied.ok) {
    if (applied.current) {
      state.updating = false;
      state.updateSnooze = true;
      if (els.update) els.update.hidden = true;
      showUpdateChip(false);
      if (copy) copy.textContent = "Sei già aggiornato.";
    }
    return;
  }
  state.updating = false;
  state.updateSnooze = true;
  if (els.update) els.update.hidden = true;
  showUpdateChip(true);
  if (later) later.hidden = false;
  if (bar) bar.hidden = true;
  if (button) {
    button.disabled = false;
    button.textContent = "Installa ora";
  }
  if (copy) copy.textContent = applied.error || "Aggiornamento non installato.";
  if (els.systemNote) els.systemNote.textContent = applied.error || "Aggiornamento non installato.";
}

async function loop() {
  if (state.loopOn) return;
  state.loopOn = true;
  const gen = state.loopGen;
  let ticks = 0;
  const run = async () => {
    if (!state.me || state.loopGen !== gen) return;
    ticks += 1;
    try {
      await syncNow();
      await api("/api/heartbeat", {});
      await pullPresence();
      await pullOnline();
      if (ticks % 3 === 1) await pullAvatars();
      if (ticks % 8 === 0) await checkUpdate();
    } catch (e) { /* next round */ }
    if (!state.me || state.loopGen !== gen) return;
    window.setTimeout(run, 8000);
  };
  window.setTimeout(run, 10000);
}

function paintMe(session) {
  if (!session) return;
  state.me = session;
  const letter = (session.name || "?").slice(0, 1).toUpperCase();
  if (els.meLetter) els.meLetter.textContent = letter;
  if (els.setName) els.setName.textContent = session.name;
  const avatarLetter = $("avatar-letter");
  if (avatarLetter) avatarLetter.textContent = letter;
  const dockLetter = $("dock-letter");
  if (dockLetter) dockLetter.textContent = letter;
  const dockName = $("dock-name");
  if (dockName) dockName.textContent = session.name;
  const dockStatus = $("dock-status");
  if (dockStatus) dockStatus.textContent = statusLabel();
}

async function enterApp(session) {
  const incoming = takeSettings(session && session.settings);
  resetSessionState();
  state.settings = incoming;
  applyLocal();
  paintMe(session);
  loadAvatar();
  publishMyAvatar().catch(() => {});
  showApp();
  setView("home");
  state.micOn = !state.settings.pushToTalk;
  startPeer();
  primeDevices(false).catch(() => {});
  api("/api/heartbeat", {});
  applyPresence(true).catch(() => {});
  const list = await api("/api/chats");
  const groups = await api("/api/groups");
  if (list.ok) state.chats = list.chats || [];
  if (groups.ok) state.groups = groups.groups || [];
  renderChats();
  pullAvatars().catch(() => {});
  if (state.settings.openLastChat && state.settings.lastChat && !document.body.classList.contains("android")) {
    if (String(state.settings.lastChat).startsWith("g:")) openGroup(state.settings.lastChat.slice(2));
    else openChat(state.settings.lastChat);
  }
  checkUpdate();
  pullOnline();
  loop();
}

async function submitAuth(kind) {
  els.authError.textContent = "";
  els.login.disabled = true;
  els.register.disabled = true;
  try {
    const data = await api(kind === "login" ? "/api/login" : "/api/register", {
      username: els.username.value,
      password: els.password.value,
    });
    if (!data.ok) { els.authError.textContent = data.error; return; }
    els.password.value = "";
    await enterApp(data);
  } catch (e) {
    els.authError.textContent = "SolaxRD non risponde.";
  } finally {
    els.login.disabled = false;
    els.register.disabled = false;
  }
}

function bindNumber(id, key, low, high, fallback) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", async () => {
    state.settings[key] = clampNum(el.value, low, high, fallback);
    el.value = String(state.settings[key]);
    await persist();
  });
}

function bindSettings() {
  Object.entries(switches).forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("click", async () => {
      state.settings[key] = !state.settings[key];
      if (key === "pushToTalk") state.micOn = !state.settings.pushToTalk;
      await persist();
      updateToggles();
    });
  });
  const bindChange = (id, fn) => { const el = $(id); if (el) el.addEventListener("change", fn); };
  bindChange("set-theme", async () => { await pickTheme($("set-theme").value); });
  bindChange("set-font", async () => { state.settings.fontSize = Number($("set-font").value); await persist(); });
  bindChange("set-zoom", async () => { state.settings.zoom = Number($("set-zoom").value); await persist(); });
  bindChange("set-status", async () => {
    state.settings.status = $("set-status").value;
    await persist();
    applyOutputVolume();
    api("/api/heartbeat", {});
  });
  bindChange("set-notify", async () => { state.settings.notifyMode = $("set-notify").value; await persist(); });
  bindNumber("set-screen-fps", "screenFps", 30, 160, 30);
  bindNumber("set-screen-res", "screenRes", 360, 1440, 720);
  bindChange("set-mic-vol", async () => { state.settings.micVolume = Number($("set-mic-vol").value); await persist(); });
  bindChange("set-out-vol", async () => { state.settings.outputVolume = Number($("set-out-vol").value); await persist(); applyOutputVolume(); });
  bindChange("set-stream-vol", async () => { state.settings.streamVolume = Number($("set-stream-vol").value); await persist(); applyStreamVolume(); });
  const syncStream = (value) => {
    state.settings.streamVolume = Number(value);
    const box = $("set-stream-vol");
    const live = $("stream-vol");
    if (box) box.value = String(state.settings.streamVolume);
    if (live) live.value = String(state.settings.streamVolume);
    applyStreamVolume();
    persistSoon();
  };
  if ($("set-stream-vol")) $("set-stream-vol").addEventListener("input", () => syncStream($("set-stream-vol").value));
  if ($("stream-vol")) $("stream-vol").addEventListener("input", () => syncStream($("stream-vol").value));
  const reask = $("reask-media");
  if (reask) reask.addEventListener("click", () => { reaskMedia().catch(() => {}); });
  if ($("set-mic-vol")) $("set-mic-vol").addEventListener("input", () => {
    state.settings.micVolume = Number($("set-mic-vol").value);
    persistSoon();
  });
  if ($("set-out-vol")) $("set-out-vol").addEventListener("input", () => {
    state.settings.outputVolume = Number($("set-out-vol").value);
    persistSoon();
  });
  $("block-add").addEventListener("click", async () => {
    const name = $("block-name").value.trim();
    if (!name) return;
    state.settings.blocked = [...(state.settings.blocked || []), name];
    $("block-name").value = "";
    await persist();
  });
  $("check-update").addEventListener("click", async () => {
    els.systemNote.textContent = "Controllo…";
  await checkUpdate();
  els.systemNote.textContent = els.update.hidden ? "Sei aggiornato." : "C’è un aggiornamento. Premi Installa.";
  });
  $("clear-chats").addEventListener("click", async () => {
    const data = await api("/api/chats/clear", {});
    state.chats = data.chats || [];
    state.active = "";
    setView("home");
    renderChats();
  });
  $("quit-app").addEventListener("click", () => { api("/api/quit", {}); });
  document.querySelectorAll(".set-nav [data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".set-nav [data-panel]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll("#settings .panel").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== button.dataset.panel;
      });
      if (button.dataset.panel === "voice") primeDevices(true).catch(() => {});
    });
  });
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.addEventListener("click", () => pickTheme(button.dataset.theme));
  });
  if ($("rename-save")) $("rename-save").addEventListener("click", renameMe);
  if ($("settings-close")) $("settings-close").addEventListener("click", () => setView(state.active ? "thread" : "home"));
}

async function pickTheme(theme) {
  const picked = THEMES.includes(theme) ? theme : "dark";
  state.settings.theme = picked;
  setTheme(picked);
  if (state.me) await persist();
  else await api("/api/theme", { theme: picked });
}

async function renameMe() {
  const error = $("rename-error");
  if (error) error.textContent = "";
  const name = ($("rename-name") && $("rename-name").value) || "";
  const password = ($("rename-pass") && $("rename-pass").value) || "";
  const data = await api("/api/rename", { name, password });
  if (!data.ok) {
    if (error) error.textContent = data.error || "Nome non cambiato.";
    return;
  }
  if ($("rename-pass")) $("rename-pass").value = "";
  if ($("rename-name")) $("rename-name").value = "";
  destroyPeer();
  paintMe(data);
  startPeer();
  api("/api/heartbeat", {});
}

if ($("set-custom")) {
  $("set-custom").addEventListener("input", () => {
    state.settings.customStatus = $("set-custom").value;
    persistSoon();
  });
  $("set-custom").addEventListener("change", async () => {
    state.settings.customStatus = $("set-custom").value;
    await persist();
  });
}
if ($("install-update")) $("install-update").addEventListener("click", installUpdate);
if ($("update-chip")) $("update-chip").addEventListener("click", (event) => {
  event.stopPropagation();
  installUpdate();
});
if ($("update-later")) $("update-later").addEventListener("click", () => {
  state.updateSnooze = true;
  els.update.hidden = true;
  showUpdateChip(true);
});
$("pick-file").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", () => {
  const file = $("file-input").files && $("file-input").files[0];
  $("file-input").value = "";
  if (file) sendFile(file);
});
$("dock-mute").addEventListener("click", () => {
  state.micMuted = !state.micMuted;
  state.micOn = !state.micMuted;
  applyPresence(false);
});
$("dock-deaf").addEventListener("click", () => {
  state.deaf = !state.deaf;
  if (state.deaf) state.micMuted = true;
  state.micOn = !state.micMuted;
  applyPresence(false);
});
$("avatar-pick").addEventListener("click", () => $("avatar-file").click());
$("avatar-file").addEventListener("change", () => {
  const file = $("avatar-file").files && $("avatar-file").files[0];
  $("avatar-file").value = "";
  if (file) saveAvatar(file);
});
$("avatar-clear").addEventListener("click", clearAvatar);

function showAvatar(url) {
  ["me-photo", "dock-photo", "avatar-img"].forEach((id) => {
    const img = $(id);
    if (!img) return;
    img.hidden = !url;
    if (url) img.src = url;
  });
  ["me-letter", "dock-letter", "avatar-letter"].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = !!url;
  });
}

async function loadAvatar() {
  const res = await fetch("/api/avatar?t=" + Date.now());
  if (!res.ok) { showAvatar(""); return; }
  const blob = await res.blob();
  showAvatar(URL.createObjectURL(blob));
}

async function saveAvatar(file) {
  const image = await createImageBitmap(file);
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  let blob = null;
  for (const quality of [0.62, 0.48, 0.34]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 1400) break;
  }
  if (!blob || blob.size > 1600) { els.listError.textContent = "Foto non salvata."; return; }
  const res = await fetch("/api/avatar", { method: "POST", body: blob });
  const data = await res.json();
  if (!data.ok) { els.listError.textContent = data.error || "Foto non salvata."; return; }
  const published = await fetch("/api/avatar/publish", { method: "POST", body: blob });
  const info = await published.json().catch(() => ({}));
  if (!info.ok) { els.listError.textContent = info.error || "Foto salvata, ma gli altri non la vedono ancora."; }
  state.avatarPublished = !!info.ok;
  await loadAvatar();
  bumpAvatars();
  shareAvatars();
}

async function clearAvatar() {
  await fetch("/api/avatar", { method: "POST" });
  await fetch("/api/avatar/publish", { method: "POST" });
  state.avatarPublished = true;
  showAvatar("");
  bumpAvatars();
}

async function saveFriendAvatar(name, b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  await fetch(`/api/avatar/friend?name=${encodeURIComponent(name)}`, { method: "POST", body: bytes });
  bumpAvatars();
}

async function publishMyAvatar() {
  if (state.avatarPublished || !state.me) return;
  const mine = await fetch("/api/avatar");
  if (!mine.ok) {
    state.avatarPublished = true;
    return;
  }
  const blob = await mine.blob();
  const res = await fetch("/api/avatar/publish", { method: "POST", body: blob });
  const data = await res.json().catch(() => ({}));
  if (data && data.ok) state.avatarPublished = true;
}

async function shareAvatars() {
  if (state.sharingAvatars || !state.peer || !state.peerReady) return;
  state.sharingAvatars = true;
  try {
    let b64 = "";
    const mine = await fetch("/api/avatar");
    if (mine.ok) {
      const buf = new Uint8Array(await mine.arrayBuffer());
      if (buf.length && buf.length <= 300000) b64 = bytesToBase64(buf);
    }
    const names = knownAvatarNames();
    for (const name of names.slice(0, 8)) {
      const who = await api("/api/peer", { name });
      if (!who.ok || who.peerId === state.me.peerId || !state.peer) continue;
      const link = state.peer.connect(who.peerId, { reliable: true, metadata: { avatar: true, name: state.me.name } });
      link.on("open", () => { if (b64) link.send({ t: "avatar", name: state.me.name, d: b64 }); });
      link.on("data", (payload) => {
        const msg = readMsg(payload);
        if (msg && msg.t === "avatar") saveFriendAvatar(msg.name, msg.d);
      });
      link.on("error", () => {});
    }
  } catch (e) { /* profile photo can wait */ }
  later(() => { state.sharingAvatars = false; }, 20000);
}

async function applyPresence(fromServer) {
  $("dock-mute").setAttribute("aria-pressed", state.micMuted ? "true" : "false");
  $("dock-deaf").setAttribute("aria-pressed", state.deaf ? "true" : "false");
  $("dock-mute").textContent = state.micMuted ? "Mutato" : "Microfono";
  $("dock-deaf").textContent = state.deaf ? "Silenziato" : "Audio";
  els.remoteAudio.volume = liveVolume();
  if (state.localAudio) state.localAudio.getAudioTracks().forEach((track) => { track.enabled = state.micOn && !state.deaf; });
  if (state.sentAudio) state.sentAudio.getAudioTracks().forEach((track) => { track.enabled = state.micOn && !state.deaf; });
  updateToggles();
  if (!fromServer) await api("/api/presence", { mic: !!state.micMuted, deaf: !!state.deaf });
}

async function pullPresence() {
  const data = await api("/api/presence");
  if (!data.ok) return;
  if (!!data.mic === !!state.micMuted && !!data.deaf === !!state.deaf) return;
  state.micMuted = !!data.mic;
  state.deaf = !!data.deaf;
  state.micOn = !state.micMuted;
  await applyPresence(true);
}

async function pullOnline() {
  const names = (state.chats || []).map((chat) => chat.name).filter(Boolean);
  (state.groups || []).forEach((group) => {
    (group.members || []).forEach((name) => { if (name && !names.includes(name)) names.push(name); });
  });
  if (state.group) (state.group.members || []).forEach((name) => { if (name && !names.includes(name)) names.push(name); });
  if (state.active && state.activeKind !== "group" && !names.includes(state.active)) names.unshift(state.active);
  if (!names.length) return;
  const data = await api("/api/online", { names: names.slice(0, 16) });
  if (!data.ok) return;
  state.online = data.online || {};
  paintOnline();
  if (state.activeKind === "group") paintPeople();
}

async function refreshThread() {
  state.rev = -1;
  await syncNow();
}

async function sendFile(file) {
  if (!state.active) { els.listError.textContent = "Apri prima una chat."; return; }
  if (file.size > 2 * 1024 * 1024 * 1024) { els.listError.textContent = "Il file può arrivare fino a 2 GB."; return; }
  const preview = await makePreview(file);
  const row = addBubble({
    mine: true,
    text: "",
    filename: file.name,
    mime: file.type || (preview.url ? "image/jpeg" : "application/octet-stream"),
    size: file.size,
    preview: preview.url,
    at: Math.floor(Date.now() / 1000),
  });
  els.listError.textContent = "Invio file…";
  const started = state.activeKind === "group"
    ? await api("/api/groups/files/start", {
      id: state.active,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
    })
    : await api("/api/files/start", {
      name: state.active,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
    });
  if (!started.ok) {
    if (row) row.remove();
    els.listError.textContent = started.error;
    return;
  }
  if (row && started.message) {
    row.dataset.n = String(started.message.n || "");
    row.dataset.pending = "";
    row.dataset.file = started.message.file || "";
    const img = row.querySelector("img");
    if (img) img.dataset.file = started.message.file || "";
    if (started.message.n) state.seen.add(String(started.message.n));
    if (started.id && preview.url) rememberPreview(started.id, preview.url);
  }
  const chunk = 256 * 1024;
  for (let offset = 0; offset < file.size; offset += chunk) {
    const part = file.slice(offset, Math.min(file.size, offset + chunk));
    const res = await fetch(`/api/files/upload?id=${encodeURIComponent(started.id)}`, { method: "POST", body: part });
    const data = await res.json();
    if (!data.ok) { els.listError.textContent = data.error || "Invio interrotto."; return; }
  }
  els.listError.textContent = "";
  if (started.id) revealFile(started.id);
  deliverFile(started.id, file, preview.data).catch(() => {
    els.listError.textContent = "File salvato. L’amico lo riceve quando ha SolaxRD aperto.";
  });
}

async function deliverFile(id, file, preview) {
  await waitReady();
  const names = state.activeKind === "group"
    ? ((state.group && state.group.members) || []).filter((name) => !sameName(name, state.me && state.me.name))
    : [state.active];
  let sent = 0;
  for (const name of names) {
    try {
      const who = await api("/api/peer", { name });
      if (!who.ok) continue;
      const link = state.peer.connect(who.peerId, { reliable: true, metadata: { name: state.me.name, file: true } });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("offline")), 12000);
        link.on("open", () => { clearTimeout(timer); resolve(); });
        link.on("error", () => { clearTimeout(timer); reject(new Error("offline")); });
      });
      link.send({ t: "file-start", id, name: file.name, mime: file.type || "", size: file.size });
      if (preview) {
        try { link.send({ t: "file-preview", id, preview }); } catch (e) { /* the full photo still follows */ }
      }
      const piece = 32 * 1024;
      for (let offset = 0; offset < file.size; offset += piece) {
        const channel = link.dataChannel;
        while (channel && channel.bufferedAmount > 1024 * 1024) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        link.send(await file.slice(offset, Math.min(file.size, offset + piece)).arrayBuffer());
      }
      link.send({ t: "file-end", id });
      sent += 1;
    } catch (e) { /* next member */ }
  }
  if (!sent) throw new Error("offline");
}

const fileJobs = [];
let filePumping = false;
function enqueueFile(job) {
  fileJobs.push(job);
  if (!filePumping) pumpFiles();
}
async function pumpFiles() {
  filePumping = true;
  while (fileJobs.length) {
    const job = fileJobs.shift();
    if (job.id) state.receivingId = job.id;
    if (job.end) {
      revealFile(job.end);
      continue;
    }
    if (job.blob && state.receivingId) {
      const buf = await job.blob.arrayBuffer();
      await fetch(`/api/files/upload?id=${encodeURIComponent(state.receivingId)}`, { method: "POST", body: buf });
    }
    if (job.buf && state.receivingId) {
      await fetch(`/api/files/upload?id=${encodeURIComponent(state.receivingId)}`, { method: "POST", body: job.buf });
    }
  }
  filePumping = false;
}
els.register.addEventListener("click", () => submitAuth("register"));
els.authForm.addEventListener("submit", (event) => { event.preventDefault(); submitAuth("login"); });
$("nav-chats").addEventListener("click", () => {
  if (document.body.classList.contains("android")) setView("home");
  else setView(state.active ? "thread" : "home");
});
$("nav-settings").addEventListener("click", () => {
  setView(state.view === "settings" ? (state.active ? "thread" : "home") : "settings");
});
if ($("nav-group")) $("nav-group").addEventListener("click", () => showGroupModal(true));
function showGroupModal(on) {
  const box = $("group-modal");
  if (!box) return;
  box.hidden = !on;
  if (on) {
    state.groupDraft = [];
    if ($("group-name")) $("group-name").value = "";
    if ($("group-person")) $("group-person").value = "";
    if ($("group-error")) $("group-error").textContent = "";
    paintGroupDraft();
    if ($("group-name")) $("group-name").focus();
  }
}
function paintGroupDraft() {
  const chips = $("group-chips");
  if (!chips) return;
  chips.replaceChildren();
  state.groupDraft.forEach((name, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${name} ×`;
    btn.addEventListener("click", () => {
      state.groupDraft.splice(index, 1);
      paintGroupDraft();
    });
    chips.append(btn);
  });
}
function addGroupDraft() {
  const input = $("group-person");
  const error = $("group-error");
  const name = ((input && input.value) || "").trim();
  if (error) error.textContent = "";
  if (!name) return;
  if (state.groupDraft.length >= 4) {
    if (error) error.textContent = "Massimo 5 persone, te compreso.";
    return;
  }
  if (state.me && sameName(name, state.me.name)) {
    if (error) error.textContent = "Sei già nel gruppo.";
    return;
  }
  if (state.groupDraft.some((item) => sameName(item, name))) {
    if (input) input.value = "";
    return;
  }
  state.groupDraft.push(name);
  if (input) input.value = "";
  paintGroupDraft();
}
async function submitGroup() {
  if (state.makingGroup) return;
  state.makingGroup = true;
  const error = $("group-error");
  const btn = $("group-create");
  const title = (($("group-name") && $("group-name").value) || "").trim();
  const members = (state.groupDraft || []).slice();
  if (error) error.textContent = "";
  if (btn) { btn.disabled = true; btn.textContent = "Creo…"; }
  showGroupModal(false);
  try {
    const data = await api("/api/groups/create", { name: title, members });
    if (!data.ok) {
      showGroupModal(true);
      if ($("group-name")) $("group-name").value = title;
      state.groupDraft = members;
      paintGroupDraft();
      const again = $("group-error");
      if (again) again.textContent = data.error || "Gruppo non creato.";
      return;
    }
    state.groups = data.groups || state.groups;
    renderChats();
    if (data.group) openGroup(data.group.id);
  } finally {
    state.makingGroup = false;
    if (btn) { btn.disabled = false; btn.textContent = "Crea"; }
  }
}
if ($("group-add-person")) $("group-add-person").addEventListener("click", addGroupDraft);
if ($("group-person")) $("group-person").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); addGroupDraft(); }
});
if ($("group-create")) $("group-create").addEventListener("click", submitGroup);
if ($("group-cancel")) $("group-cancel").addEventListener("click", () => showGroupModal(false));
if ($("add-member")) $("add-member").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.group) return;
  const err = $("people-error");
  const input = $("add-member-name");
  const data = await api("/api/groups/add", { id: state.group.id, name: input && input.value });
  if (!data.ok) { if (err) err.textContent = data.error || "Non aggiunto."; return; }
  if (input) input.value = "";
  if (err) err.textContent = "";
  state.group = data.group;
  if (data.groups) state.groups = data.groups;
  paintPeople();
  renderChats();
});
async function leaveOrDeleteGroup(kind) {
  const id = (state.group && state.group.id) || (state.activeKind === "group" ? state.active : "");
  if (!id) return;
  if (kind === "delete" && !window.confirm("Eliminare il gruppo per tutti?")) return;
  const leaveBtn = $("leave-group");
  const delBtn = $("delete-group");
  if (leaveBtn) leaveBtn.disabled = true;
  if (delBtn) delBtn.disabled = true;
  state.groups = (state.groups || []).filter((group) => group.id !== id);
  state.group = null;
  state.active = "";
  state.activeKind = "dm";
  showPeople(false);
  setView("home");
  renderChats();
  const data = await api(kind === "delete" ? "/api/groups/delete" : "/api/groups/leave", { id });
  if (leaveBtn) leaveBtn.disabled = false;
  if (delBtn) delBtn.disabled = false;
  if (!data.ok) {
    if (data.groups) state.groups = data.groups;
    renderChats();
    await openGroup(id);
    const err = $("people-error");
    if (err) err.textContent = data.error || (kind === "delete" ? "Gruppo non eliminato." : "Uscita non riuscita.");
    return;
  }
  state.groups = data.groups || [];
  renderChats();
}
if ($("leave-group")) $("leave-group").addEventListener("click", () => leaveOrDeleteGroup("leave"));
if ($("delete-group")) $("delete-group").addEventListener("click", () => leaveOrDeleteGroup("delete"));
$("me-btn").addEventListener("click", () => setView("settings"));
const peopleToggle = $("people-toggle");
if (peopleToggle) peopleToggle.addEventListener("click", () => {
  const pane = $("people");
  const open = !!(pane && pane.hidden);
  showPeople(open);
  peopleToggle.textContent = open ? "⌃" : "⌄";
});
els.openForm.addEventListener("submit", (event) => { event.preventDefault(); openChat(els.openName.value); });
els.composer.addEventListener("submit", (event) => { event.preventDefault(); sendMessage(els.composerText.value); });
els.composerText.addEventListener("input", () => { els.composerCount.textContent = `${els.composerText.value.length}/80`; });
els.composerText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && state.settings.enterSend === false) event.preventDefault();
});
function pressCall(event) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  if (event.type === "pointerdown") event.preventDefault();
  if (!state.active || state.phase !== "idle") return;
  if (state.activeKind === "group") startGroupCall();
  else startCall(state.active);
}
els.call.addEventListener("pointerdown", pressCall);
els.call.addEventListener("click", pressCall);
function desktop(name) {
  try {
    const api = window.pywebview && window.pywebview.api;
    if (api && typeof api[name] === "function") {
      const result = api[name]();
      if (result && typeof result.catch === "function") result.catch(() => {});
    }
  } catch (e) { /* native window */ }
}
if ($("win-close")) $("win-close").addEventListener("click", (event) => { event.stopPropagation(); desktop("hide_win"); });
if ($("win-min")) $("win-min").addEventListener("click", (event) => { event.stopPropagation(); desktop("min_win"); });
if ($("win-max")) $("win-max").addEventListener("click", (event) => { event.stopPropagation(); desktop("max_win"); });
if ($("titlebar-drag")) $("titlebar-drag").addEventListener("dblclick", () => desktop("max_win"));
window.addEventListener("contextmenu", (event) => event.preventDefault());
els.mute.addEventListener("click", toggleMute);
els.camera.addEventListener("click", toggleCamera);
els.screen.addEventListener("click", toggleScreen);
els.hangup.addEventListener("click", () => endCall("Chiamata chiusa."));
$("accept").addEventListener("click", acceptCall);
$("reject").addEventListener("click", () => {
  try { (state.link || state.incoming) && (state.link || state.incoming).send({ t: "reject" }); } catch (e) { /* ignore */ }
  endCall("Chiamata rifiutata.", false);
});
if ($("lightbox-close")) $("lightbox-close").addEventListener("click", closeLightbox);
if ($("lightbox-save")) $("lightbox-save").addEventListener("click", () => {
  const box = $("lightbox");
  downloadFile(box && box.dataset.file, (box && box.dataset.name) || "file");
});
if ($("lightbox")) $("lightbox").addEventListener("click", (event) => {
  if (event.target.id === "lightbox") closeLightbox();
});
$("logout").addEventListener("click", async () => {
  window.clearTimeout(persistWait);
  const who = state.me && state.me.name;
  const snapshot = takeSettings(state.settings);
  if (who) {
    snapshot._name = who;
    await api("/api/settings", snapshot);
  }
  resetSessionState();
  await api("/api/logout", {});
  showAuth();
  els.username.focus();
});
els.mic.addEventListener("change", saveDevices);
els.cam.addEventListener("change", saveDevices);
els.speaker.addEventListener("change", async () => { await saveDevices(); await applySpeaker(); });
window.addEventListener("pointerdown", () => {
  unlockAudio();
  if (state.me) warmMic();
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const box = $("lightbox");
    if (box && !box.hidden) { closeLightbox(); return; }
    const groupBox = $("group-modal");
    if (groupBox && !groupBox.hidden) { showGroupModal(false); return; }
    if (state.phase === "in") endCall("Chiamata rifiutata.");
  }
  if (event.key === " " && event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA") {
    event.preventDefault();
    setTalk(true);
  }
});
window.addEventListener("keyup", (event) => { if (event.key === " ") setTalk(false); });
window.addEventListener("beforeunload", () => { try { state.link && state.link.send({ t: "hangup" }); } catch (e) { /* leaving */ } });
if (navigator.mediaDevices) navigator.mediaDevices.addEventListener("devicechange", () => { refreshDevices().catch(() => {}); });

async function boot() {
  try {
    bindSettings();
    const data = await api("/api/bootstrap");
    state.settings = takeSettings(data.settings);
    applyLocal();
    setTheme(state.settings.theme || "dark");
    revealShell(async () => {
      if (data && data.session) await enterApp({ ...data.session, settings: data.settings });
      else {
        showAuth();
        if (els.username) els.username.focus();
      }
    });
  } catch (e) {
    revealShell(() => {
      showAuth();
      if (els.authError) els.authError.textContent = "SolaxRD non risponde.";
    });
  }
}

window.setTimeout(() => {
  if (els.boot && !els.boot.hidden && els.authWrap && els.authWrap.hidden && els.shell && els.shell.hidden) {
    showAuth();
    if (els.authError && !els.authError.textContent) els.authError.textContent = "SolaxRD non risponde.";
  }
}, 5000);

boot();
