/* ===== UI: rejim, kitoblar, modal, toast, salyut, ko'rinishlar ===== */
const UI = {
  /* --- Ko'rinishni almashtirish (login / student / teacher) --- */
  showView(id) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    window.scrollTo(0, 0);
  },

  /* --- Modal --- */
  modal(html, { closable = true, large = false, onClose = null } = {}) {
    const overlay = document.getElementById("modal-overlay");
    const content = document.getElementById("modal-content");
    const closeBtn = document.getElementById("modal-close");
    if (this._onClose) { const f = this._onClose; this._onClose = null; f(); }
    content.innerHTML = html;
    closeBtn.style.display = closable ? "" : "none";
    document.getElementById("modal-box").classList.toggle("modal-lg", large);
    overlay.classList.add("on");
    overlay.dataset.closable = closable ? "1" : "0";
    this._onClose = onClose;
  },
  closeModal() {
    document.getElementById("modal-overlay").classList.remove("on");
    if (this._onClose) { const f = this._onClose; this._onClose = null; f(); }
  },

  _offlineShown: false,
  offlineModal() {
    if (this._offlineShown) return;
    this._offlineShown = true;
    const inExam = window.State && State.exam && State.exam.active;
    this.modal(`
      <span class="modal-icon">📡</span>
      <h2 style="text-align:center;color:var(--danger-1)">Server javob bermadi</h2>
      <p style="text-align:center">Aloqa bir lahzaga uzildi. Internetingiz yaxshi bo'lsa, biroz kutib qayta urinib ko'ring.</p>
      <div style="text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-ghost" id="off-close">Yopish</button>
        ${inExam ? "" : '<button class="btn btn-primary" id="off-retry">🔄 Qayta yuklash</button>'}
      </div>`, { onClose: () => { this._offlineShown = false; } });
    document.getElementById("off-close").onclick = () => this.closeModal();
    const retry = document.getElementById("off-retry");
    if (retry) retry.onclick = () => location.reload();
  },

  /* --- Toast xabar --- */
  toast(msg, type = "info", ms = 3200) {
    const box = document.getElementById("toast-container");
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .4s, transform .4s";
      t.style.opacity = "0";
      t.style.transform = "translateY(-14px)";
      setTimeout(() => t.remove(), 420);
    }, ms);
  },

  /* --- Rejim (qorong'i/yorug') --- */
  initTheme() {
    const saved = localStorage.getItem("mt-theme") || "dark";
    this.setTheme(saved);
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      this.setTheme(cur === "dark" ? "light" : "dark");
    });
  },
  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mt-theme", theme);
    document.getElementById("theme-toggle").textContent = theme === "dark" ? "🌙" : "☀️";
  },

  /* --- Orqa fondagi uchuvchi kitoblar --- */
  spawnBooks() {
    const box = document.getElementById("bg-books");
    const emojis = ["📕", "📗", "📘", "📙", "📚", "📖", "🔖", "📓"];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const b = document.createElement("span");
      b.className = "book";
      b.textContent = emojis[i % emojis.length];
      const size = 2.6 + Math.random() * 3.6; // kattaroq kitoblar
      b.style.fontSize = size + "rem";
      b.style.left = Math.random() * 100 + "vw";
      b.style.animationDuration = 16 + Math.random() * 22 + "s";
      b.style.animationDelay = -Math.random() * 30 + "s";
      box.appendChild(b);
    }
  },

  /* --- Fanlar/sinflar ro'yxatini yuklaymiz --- */
  async loadMeta() {
    const m = await API.get("/api/meta");
    if (m.ok) {
      State.meta.subjects = m.subjects;
      State.meta.classes = m.classes;
      this.fillSelect(document.querySelector('#student-login [name="class_name"]'), m.classes, "Sinfingizni tanlang");
      this.fillSelect(document.getElementById("ct-subject"), m.subjects, "Fanni tanlang");
      this.fillSelect(document.getElementById("ct-class"), m.classes, "Sinfni tanlang");
      this.fillSelect(document.getElementById("res-class"), m.classes, "— Sinf —");
      this.fillSelect(document.getElementById("stu-class"), m.classes, "— Sinf —");
      this.fillSelect(document.getElementById("ls-subject"), m.subjects, "Fanni tanlang");
      this.fillSelect(document.getElementById("ls-class"), m.classes, "Sinfni tanlang");
      this.fillSelect(document.getElementById("lrn-class"), m.classes, "— Sinf —");
      this.fillSelect(document.getElementById("imp-subject"), m.subjects, "Fanni tanlang");
      this.fillSelect(document.getElementById("imp-class"), m.classes, "Sinfni tanlang");
      this.fillSelect(document.getElementById("par-class"), m.classes, "— Sinf —");
    }
  },
  fillSelect(sel, items, placeholder) {
    if (!sel) return;
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.disabled = true; ph.selected = true;
    ph.textContent = placeholder || "Tanlang";
    sel.appendChild(ph);
    items.forEach((it) => {
      const o = document.createElement("option");
      o.value = it; o.textContent = it;
      sel.appendChild(o);
    });
  },

  /* --- HTML xavfsiz chiqarish --- */
  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
};

/* =========================================================
   SALYUT (fireworks) — canvas
   ========================================================= */
const Fireworks = (() => {
  const canvas = document.getElementById("fireworks");
  const ctx = canvas.getContext("2d");
  let particles = [];
  let rafId = null;
  let launchTimer = null;
  let running = false;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function explode(x, y) {
    const hue = Math.floor(rand(0, 360));
    const count = 40 + Math.floor(rand(0, 40));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = rand(2, 7);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: rand(0.008, 0.022),
        color: `hsl(${hue + rand(-25, 25)}, 100%, ${rand(55, 70)}%)`,
        size: rand(2, 4),
      });
    }
  }

  function launch() {
    if (!running) return;
    explode(rand(canvas.width * 0.15, canvas.width * 0.85), rand(canvas.height * 0.15, canvas.height * 0.55));
    launchTimer = setTimeout(launch, rand(350, 750));
  }

  function frame() {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // tortishish
      p.vx *= 0.99;
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    particles = particles.filter((p) => p.life > 0);
    rafId = requestAnimationFrame(frame);
  }

  function start(duration = 6000) {
    resize();
    window.addEventListener("resize", resize);
    canvas.classList.add("on");
    running = true;
    particles = [];
    launch();
    frame();
    setTimeout(stop, duration);
  }

  function stop() {
    running = false;
    if (launchTimer) clearTimeout(launchTimer);
    // Zarralar so'ngach canvasni tozalab yopamiz
    setTimeout(() => {
      if (rafId) cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.remove("on");
    }, 2200);
  }

  return { start, stop };
})();

/* Modal overlay: tashqariga bosilganda yopish */
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  const overlay = document.getElementById("modal-overlay");
  if (e.target === overlay && overlay.dataset.closable === "1") UI.closeModal();
});
document.getElementById("modal-close").addEventListener("click", () => UI.closeModal());
