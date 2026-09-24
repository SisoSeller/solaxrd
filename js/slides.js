(() => {
  const deck = document.getElementById("deck");
  const slides = [...deck.querySelectorAll("[data-slide]")];
  const pos = document.getElementById("pos");
  const dots = document.getElementById("dots");
  let index = 0;
  let lock = false;

  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Slide ${i + 1}`);
    dot.addEventListener("click", () => go(i));
    dots.append(dot);
  });

  const paint = () => {
    const width = deck.clientWidth || 1;
    index = Math.max(0, Math.min(slides.length - 1, Math.round(deck.scrollLeft / width)));
    pos.textContent = `${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    dots.querySelectorAll("button").forEach((dot, i) => dot.classList.toggle("on", i === index));
    slides.forEach((slide, i) => slide.classList.toggle("show", i === index));
  };

  const go = (next) => {
    const i = Math.max(0, Math.min(slides.length - 1, next));
    deck.scrollTo({ left: i * deck.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  document.getElementById("to-get").addEventListener("click", (event) => {
    event.preventDefault();
    go(slides.length - 1);
  });
  document.querySelector(".mark").addEventListener("click", (event) => {
    event.preventDefault();
    go(0);
  });
  document.getElementById("prev").addEventListener("click", () => go(index - 1));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => go(Number(button.dataset.go)));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") go(index + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(index - 1);
  });

  deck.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) < 12 && Math.abs(event.deltaX) < 12) return;
    if (lock) return;
    event.preventDefault();
    lock = true;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    go(index + (delta > 0 ? 1 : -1));
    setTimeout(() => { lock = false; }, 650);
  }, { passive: false });

  deck.addEventListener("scroll", () => { paint(); }, { passive: true });
  window.addEventListener("resize", paint);

  const size = (url, selector) => {
    fetch(url, { method: "HEAD" }).then((res) => {
      const n = Number(res.headers.get("content-length"));
      if (!n) return;
      document.querySelectorAll(selector).forEach((el) => {
        el.textContent = `${(n / (1024 * 1024)).toFixed(1)} MB`;
      });
    }).catch(() => {});
  };
  size("download/SolaxRD-Setup.exe", "[data-size]");
  size("download/SolaxRD.apk", "[data-size-apk]");
  size("download/SolaxRD.ipa", "[data-size-ipa]");

  paint();
})();
