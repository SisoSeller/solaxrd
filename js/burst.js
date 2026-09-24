(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const boot = document.getElementById("boot");
  const fill = document.getElementById("boot-fill");
  const burger = document.getElementById("burger");
  const sheet = document.getElementById("sheet");

  if (!reduced && boot && fill) {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 900);
      fill.style.width = `${Math.round(t * 100)}%`;
      if (t < 1) requestAnimationFrame(tick);
      else setTimeout(() => boot.classList.add("go"), 180);
    };
    requestAnimationFrame(tick);
  } else if (boot) boot.classList.add("go");

  if (burger && sheet) {
    burger.addEventListener("click", () => {
      const open = sheet.hasAttribute("hidden");
      if (open) sheet.removeAttribute("hidden");
      else sheet.setAttribute("hidden", "");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    sheet.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        sheet.setAttribute("hidden", "");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  const cursor = document.getElementById("cursor");
  if (cursor && !reduced && matchMedia("(pointer: fine)").matches) {
    document.body.classList.add("aim");
    window.addEventListener("pointermove", (event) => {
      cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    }, { passive: true });
  }

  const canvas = document.getElementById("dust");
  if (canvas && !reduced) {
    const ctx = canvas.getContext("2d");
    let dots = [];
    const resize = () => {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      const count = Math.min(80, Math.floor((innerWidth * innerHeight) / 18000));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: 1 + Math.random() * 2.4,
        v: 0.3 + Math.random() * 0.8,
        c: ["#ff2bd6", "#3dfff2", "#ffe14a"][Math.floor(Math.random() * 3)],
      }));
    };
    resize();
    window.addEventListener("resize", resize);
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const dot of dots) {
        dot.y -= dot.v;
        if (dot.y < -4) dot.y = canvas.height + 4;
        ctx.fillStyle = dot.c;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    draw();
  }

  const size = (url, selector) => {
    fetch(url, { method: "HEAD" }).then((res) => {
      const n = Number(res.headers.get("content-length"));
      if (!n) return;
      const label = `${(n / (1024 * 1024)).toFixed(1)} MB`;
      document.querySelectorAll(selector).forEach((el) => { el.textContent = label; });
    }).catch(() => {});
  };
  size("download/SolaxRD-Setup.exe", "[data-size]");
  size("download/SolaxRD.apk", "[data-size-apk]");
  size("download/SolaxRD.ipa", "[data-size-ipa]");
})();
