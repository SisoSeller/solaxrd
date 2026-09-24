(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function splitTitles() {
    $$("[data-split]").forEach((el) => {
      const text = el.textContent;
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
        const t = Math.min(1, (now - start) / 1100);
        const eased = 1 - Math.pow(1 - t, 3);
        const n = Math.round(eased * 100);
        if (fill) fill.style.width = `${n}%`;
        if (count) count.textContent = String(n).padStart(2, "0");
        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }
        wrap.classList.add("out");
        setTimeout(resolve, 420);
      };
      requestAnimationFrame(tick);
    });
  }

  function cursor() {
    const dot = $("#cursor");
    const ring = $("#cursor-ring");
    if (!dot || !ring || reduced || window.matchMedia("(pointer: coarse)").matches) return;
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let rx = x;
    let ry = y;
    window.addEventListener("pointermove", (e) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }, { passive: true });
    const grow = (on) => document.body.classList.toggle("cursor-grow", on);
    $$("a, button").forEach((el) => {
      el.addEventListener("pointerenter", () => grow(true));
      el.addEventListener("pointerleave", () => grow(false));
    });
    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  function magnetic() {
    if (reduced || window.matchMedia("(pointer: coarse)").matches) return;
    $$(".magnetic").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.28}px)`;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transform = "";
      });
    });
  }

  function field() {
    const canvas = $("#field");
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let points = [];
    const mouse = { x: -9999, y: -9999 };
    const resize = () => {
      w = canvas.width = innerWidth * devicePixelRatio;
      h = canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const n = Math.floor((innerWidth * innerHeight) / 18000);
      points = Array.from({ length: Math.max(40, Math.min(110, n)) }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
      }));
    };
    window.addEventListener("pointermove", (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });
    resize();
    window.addEventListener("resize", resize);
    const draw = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > innerWidth) p.vx *= -1;
        if (p.y < 0 || p.y > innerHeight) p.vy *= -1;
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 18000) {
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
          if (dist > 130) continue;
          ctx.strokeStyle = `rgba(210,210,214,${(1 - dist / 130) * 0.16})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(230,230,235,0.55)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  function tilt() {
    const device = $("#device");
    if (!device || reduced) return;
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
      if (!lines[i]) i = 0;
      if (box.children.length > 5) box.firstChild.remove();
      const row = document.createElement("div");
      row.className = `bubble${lines[i].mine ? " mine" : ""}`;
      row.textContent = lines[i].text;
      box.append(row);
      i += 1;
    };
    add();
    setInterval(add, reduced ? 4000 : 2200);
  }

  function reveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach((el, i) => {
      el.style.animationDelay = `${(i % 6) * 0.06}s`;
      io.observe(el);
    });
  }

  function progress() {
    const bar = $("#progress");
    if (!bar) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max <= 0 ? 0 : scrollY / max;
      bar.style.width = `${p * 100}%`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
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
    const map = {
      dark: "#070707",
      light: "#e8e8ea",
      purple: "#140f1c",
      blue: "#0c1218",
      green: "#0d1410",
      rose: "#1a1014",
    };
    $$(".swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".swatch").forEach((item) => item.classList.toggle("on", item === btn));
        document.documentElement.style.setProperty("--bg", map[btn.dataset.tone] || map.dark);
      });
    });
  }

  function smooth() {
    if (reduced) return;
    $$('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = $(id === "#top" ? "main" : id);
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + scrollY - 72;
        window.scrollTo({ top, behavior: "smooth" });
      });
    });
  }

  splitTitles();
  cursor();
  magnetic();
  field();
  tilt();
  bubbles();
  reveal();
  progress();
  counters();
  swatches();
  smooth();
  loader();
})();
