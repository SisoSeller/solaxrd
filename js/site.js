(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const chats = {
    mare: { ava: "M", avaClass: "ava a1", name: "Mare", meta: "Diretta · in chiamata" },
    vento: { ava: "V", avaClass: "ava a2", name: "Vento", meta: "Online" },
    notte: { ava: "#", avaClass: "ava a3", name: "Notte", meta: "Gruppo · 3" },
  };

  function splitTitles() {
    $$("[data-split]").forEach((el) => {
      const text = el.textContent;
      el.setAttribute("aria-label", text);
      el.textContent = "";
      [...text].forEach((ch, i) => {
        const span = document.createElement("span");
        span.className = "ch";
        span.textContent = ch === " " ? "\u00a0" : ch;
        span.style.animationDelay = `${0.08 + i * 0.045}s`;
        el.append(span);
      });
    });
  }

  function loader() {
    const wrap = $("#loader");
    const fill = $("#loader-fill");
    const count = $("#loader-count");
    if (!wrap || reduced) {
      if (wrap) wrap.classList.add("out");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 1200);
        const eased = 1 - Math.pow(1 - t, 3);
        const n = Math.round(eased * 100);
        if (fill) fill.style.width = `${n}%`;
        if (count) count.textContent = String(n).padStart(2, "0");
        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }
        wrap.classList.add("out");
        setTimeout(resolve, 720);
      };
      requestAnimationFrame(tick);
    });
  }

  function cursor() {
    const dot = $("#cursor");
    const ring = $("#cursor-ring");
    if (!dot || !ring || reduced || coarse) return;
    document.body.classList.add("has-cursor");
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let rx = x;
    let ry = y;
    let running = true;
    window.addEventListener("pointermove", (e) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      document.documentElement.style.setProperty("--mx", `${(e.clientX / innerWidth - 0.5).toFixed(3)}`);
      document.documentElement.style.setProperty("--my", `${(e.clientY / innerHeight - 0.5).toFixed(3)}`);
      const grid = $("#spot-grid");
      if (grid) {
        grid.style.setProperty("--spot-x", `${e.clientX}px`);
        grid.style.setProperty("--spot-y", `${e.clientY}px`);
      }
    }, { passive: true });
    const grow = (on) => document.body.classList.toggle("cursor-grow", on);
    document.addEventListener("pointerover", (e) => {
      const hit = e.target.closest("a, button");
      grow(Boolean(hit));
    });
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) loop();
    });
    const loop = () => {
      if (!running) return;
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  function magnetic() {
    if (reduced || coarse) return;
    $$(".magnetic-inner").forEach((el) => {
      const parent = el.parentElement;
      if (!parent) return;
      parent.addEventListener("pointermove", (e) => {
        const r = parent.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.22}px)`;
      });
      parent.addEventListener("pointerleave", () => {
        el.style.transform = "";
      });
    });
  }

  function field() {
    const canvas = $("#field");
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    let w = 0;
    let h = 0;
    let points = [];
    const mouse = { x: -9999, y: -9999 };
    let running = true;
    const resize = () => {
      w = canvas.width = innerWidth * devicePixelRatio;
      h = canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const n = Math.floor((innerWidth * innerHeight) / 22000);
      points = Array.from({ length: Math.max(28, Math.min(72, n)) }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
      }));
    };
    window.addEventListener("pointermove", (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) draw();
    });
    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const glow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 180);
      glow.addColorStop(0, "rgba(210,210,220,0.07)");
      glow.addColorStop(1, "rgba(210,210,220,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > innerWidth) p.vx *= -1;
        if (p.y < 0 || p.y > innerHeight) p.vy *= -1;
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 16000) {
          p.vx -= dx * 0.00004;
          p.vy -= dy * 0.00004;
        }
      }
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 118) continue;
          ctx.strokeStyle = `rgba(210,210,214,${(1 - dist / 120) * 0.14})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(230,230,235,0.5)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  function tilt() {
    const device = $("#device");
    if (!device || reduced || coarse) return;
    const stage = device.parentElement;
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      device.style.transform = `rotateX(${12 - py * 10}deg) rotateY(${-10 + px * 16}deg)`;
    });
    stage.addEventListener("pointerleave", () => {
      device.style.transform = "rotateX(12deg) rotateY(-10deg)";
    });
  }

  function cards() {
    if (reduced || coarse) return;
    $$(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const px = x / r.width - 0.5;
        const py = y / r.height - 0.5;
        card.style.setProperty("--x", `${x}px`);
        card.style.setProperty("--y", `${y}px`);
        card.style.transform = `rotateX(${-py * 7}deg) rotateY(${px * 9}deg) translateY(-4px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }

  function bubbles() {
    const box = $("#bubbles");
    if (!box) return;
    const lines = [
      { text: "siamo dentro?", mine: false },
      { text: "sì. microfono ok", mine: true },
      { text: "metto il gruppo a tre", mine: false },
      { text: "file da 1 giga in arrivo", mine: true },
    ];
    let i = 0;
    const add = () => {
      if (document.hidden) return;
      if (!lines[i]) i = 0;
      while (box.children.length > 5) box.firstChild.remove();
      const row = document.createElement("div");
      row.className = `bubble${lines[i].mine ? " mine" : ""}`;
      row.textContent = lines[i].text;
      box.append(row);
      i += 1;
    };
    add();
    setInterval(add, reduced ? 4000 : 2200);
  }

  function mockChat() {
    const name = $("#thread-name");
    const meta = $("#thread-meta");
    const ava = $("#thread-ava");
    $$(".mock-row").forEach((row) => {
      row.addEventListener("click", () => {
        $$(".mock-row").forEach((item) => item.classList.toggle("active", item === row));
        const info = chats[row.dataset.chat];
        if (!info || !name || !meta || !ava) return;
        name.textContent = info.name;
        meta.textContent = info.meta;
        ava.textContent = info.ava;
        ava.className = info.avaClass;
      });
    });
  }

  function reveal() {
    if (reduced) {
      $$(".reveal").forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    $$(".reveal").forEach((el, i) => {
      el.style.animationDelay = `${(i % 6) * 0.06}s`;
      io.observe(el);
    });
    const splitIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("play");
        splitIo.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    $$("[data-split]").forEach((el) => splitIo.observe(el));
  }

  function progress() {
    const bar = $("#progress");
    if (!bar) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max <= 0 ? 0 : Math.max(0, Math.min(1, scrollY / max));
      bar.style.width = `${p * 100}%`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function navScroll() {
    const nav = $("#nav");
    if (!nav) return;
    let last = 0;
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      const jumping = Math.abs(y - last) > 120;
      const hide = !window.__navLock && !jumping && y > 90 && y > last && !$("#menu")?.classList.contains("open");
      nav.classList.toggle("nav-hide", hide);
      last = y;
    }, { passive: true });
  }

  function menu() {
    const toggle = $("#nav-toggle");
    const menuEl = $("#menu");
    if (!toggle || !menuEl) return;
    const setOpen = (open) => {
      menuEl.classList.toggle("open", open);
      menuEl.setAttribute("aria-hidden", open ? "false" : "true");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Chiudi il menu" : "Apri il menu");
      document.body.style.overflow = open ? "hidden" : "";
      $("#nav")?.classList.remove("nav-hide");
    };
    toggle.addEventListener("click", () => setOpen(!menuEl.classList.contains("open")));
    menuEl.addEventListener("click", (e) => {
      if (e.target === menuEl) setOpen(false);
    });
    menuEl.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  function counters() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const end = Number(el.dataset.count || 0);
        const suffix = el.dataset.suffix || "";
        const prefix = el.dataset.prefix || "";
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / 900);
          const val = Math.round((1 - Math.pow(1 - t, 3)) * end);
          el.textContent = `${prefix}${val}${suffix}`;
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.6 });
    $$("[data-count]").forEach((el) => io.observe(el));
  }

  function swatches() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const colors = {
      dark: "#070707",
      light: "#ececef",
      purple: "#120e18",
      blue: "#0a1016",
      green: "#0b120e",
      rose: "#160e12",
    };
    $$(".swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".swatch").forEach((item) => item.classList.toggle("on", item === btn));
        const tone = btn.dataset.tone || "dark";
        document.documentElement.dataset.tone = tone;
        if (meta) meta.setAttribute("content", colors[tone] || colors.dark);
      });
    });
  }

  function smooth() {
    $$('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = $(id === "#top" ? "main" : id);
        if (!target) return;
        e.preventDefault();
        window.__navLock = true;
        const top = target.getBoundingClientRect().top + scrollY - 72;
        window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
        history.replaceState(null, "", id);
        setTimeout(() => { window.__navLock = false; }, 1000);
      });
    });
  }

  function restoreHash() {
    const id = location.hash;
    if (!id || id === "#") return;
    const target = $(id === "#top" ? "main" : id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + scrollY - 72;
    window.scrollTo({ top, behavior: "auto" });
  }

  function reel() {
    const section = $("#reel");
    const track = $("#reel-track");
    if (!section || !track) return;
    const mq = window.matchMedia("(min-width: 981px)");
    let ticking = false;
    const update = () => {
      ticking = false;
      if (!mq.matches) {
        track.style.transform = "";
        return;
      }
      const max = Math.max(1, section.offsetHeight - innerHeight);
      const start = -section.getBoundingClientRect().top;
      const p = Math.max(0, Math.min(1, start / max));
      const travel = Math.max(0, track.scrollWidth - innerWidth);
      track.style.transform = `translate3d(${-p * travel}px,0,0)`;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update);
    mq.addEventListener("change", update);
    update();
  }

  function equalizer() {
    const canvas = $("#eq");
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    let running = true;
    const bars = 28;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * devicePixelRatio);
      canvas.height = Math.max(1, r.height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) draw();
    });
    const draw = (now = 0) => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const gap = 4;
      const bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i += 1) {
        const wave = (Math.sin(now / 320 + i * 0.45) + 1) / 2;
        const pulse = (Math.sin(now / 180 + i * 0.2) + 1) / 2;
        const bh = Math.max(8, (0.18 + wave * 0.55 + pulse * 0.15) * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.fillStyle = `rgba(210,210,220,${0.08 + wave * 0.18})`;
        ctx.fillRect(x, y, bw, bh);
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  function talking() {
    const faces = $$("[data-face]");
    if (!faces.length) return;
    let i = 1;
    setInterval(() => {
      if (document.hidden) return;
      faces.forEach((face) => face.classList.remove("talking"));
      i = (i + 1) % faces.length;
      faces[i].classList.add("talking");
    }, 1800);
  }

  function callControls() {
    const card = $(".call-card");
    $$("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.toggle;
        if (kind === "end") {
          card?.classList.toggle("is-ended");
          return;
        }
        const on = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", on ? "false" : "true");
      });
    });
  }

  function cookies() {
    const bar = $("#cookie");
    const box = $("#legal-box");
    const title = $("#legal-title");
    const copy = $("#legal-copy");
    const pages = {
      privacy: {
        title: "Privacy",
        html: "<p>SolaxRD non chiede la mail. Su questo sito non crei un account e non invii messaggi.</p><p>Il download è un file. Non raccogliamo un elenco di chi lo scarica da questa pagina.</p>",
      },
      cookies: {
        title: "Cookie",
        html: "<p>Questo sito non usa cookie di pubblicità o di statistica.</p><p>Se premi Accetta o Rifiuta, la scelta resta solo sul tuo dispositivo, per non mostrarti di nuovo questo avviso.</p>",
      },
      terms: {
        title: "Termini di utilizzo",
        html: "<p>Puoi scaricare SolaxRD per usarlo sul tuo dispositivo. Non rivendere il file e non spacciarlo per un altro programma.</p><p>Il nome e la password restano tuoi. SolaxRD non è Discord.</p>",
      },
      notice: {
        title: "Note legali",
        html: "<p>© 2026 SolaxRD. I testi, il segno e i file di download di questa pagina appartengono a chi pubblica SolaxRD.</p><p>SolaxRD non è Discord e non è collegato a Discord.</p>",
      },
    };
    const open = (key) => {
      const page = pages[key];
      if (!page || !box || !title || !copy) return;
      title.textContent = page.title;
      copy.innerHTML = page.html;
      box.hidden = false;
    };
    $("#open-privacy")?.addEventListener("click", () => open("privacy"));
    $("#open-terms")?.addEventListener("click", () => open("terms"));
    $("#open-cookies")?.addEventListener("click", () => open("cookies"));
    $("#legal-close")?.addEventListener("click", () => { if (box) box.hidden = true; });
    box?.addEventListener("click", (event) => { if (event.target === box) box.hidden = true; });
    const choice = localStorage.getItem("solaxrd-cookie");
    if (bar && !choice) bar.hidden = false;
    const save = (value) => {
      localStorage.setItem("solaxrd-cookie", value);
      if (bar) bar.hidden = true;
    };
    $("#cookie-yes")?.addEventListener("click", () => save("yes"));
    $("#cookie-no")?.addEventListener("click", () => save("no"));
  }

  function fileSize() {
    fetch("download/SolaxRD-Setup.exe", { method: "HEAD" }).then((res) => {
      const n = Number(res.headers.get("content-length"));
      if (!n) return;
      const mb = `${(n / (1024 * 1024)).toFixed(1)} MB`;
      $$("[data-size]").forEach((el) => { el.textContent = mb; });
    }).catch(() => {});
  }

  async function boot() {
    try {
      splitTitles();
      cursor();
      magnetic();
      field();
      tilt();
      cards();
      bubbles();
      mockChat();
      progress();
      navScroll();
      menu();
      counters();
      swatches();
      smooth();
      reel();
      equalizer();
      talking();
      callControls();
      fileSize();
      cookies();
      await loader();
      document.body.classList.add("ready");
      $(".hero-title")?.classList.add("play");
      reveal();
      restoreHash();
    } catch (err) {
      document.body.classList.add("ready");
      $("#loader")?.classList.add("out");
      $$(".reveal").forEach((el) => el.classList.add("in"));
      $$("[data-split]").forEach((el) => el.classList.add("play"));
      console.error(err);
    }
  }

  boot();
})();
