/* ===== O'QUVCHI: BILIM OLISH (video/audio/matn) + coin ===== */
const Learning = {
  student: null,
  lessons: [],
  completed: new Set(),

  bind() {
    document.querySelectorAll(".learn-tab").forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll(".learn-tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        document.querySelectorAll(".learn-pane").forEach((p) => p.classList.remove("active"));
        document.getElementById("learn-" + t.dataset.ltab).classList.add("active");
        if (t.dataset.ltab === "subjects") this.renderSubjects();
      };
    });
    document.getElementById("subj-back").onclick = () => this.renderSubjects();
    document.getElementById("lr-exit").onclick = () => { this.student = null; UI.showView("view-login"); };
  },

  enter(payload) {
    this.student = payload.student;
    this.lessons = payload.lessons || [];
    this.completed = new Set(payload.completed || []);
    document.getElementById("lr-student").textContent =
      `${payload.student.first_name} ${payload.student.last_name} • ${payload.student.class_name}`;
    document.getElementById("lr-coins").textContent = payload.student.coins || 0;
    this.currentSubject = null;
    this.renderSubjects();
    Games.renderGrid(document.getElementById("games-grid"));
    UI.showView("view-learning");
  },

  /* Avval FANLAR ro'yxati */
  renderSubjects() {
    this.currentSubject = null;
    const grid = document.getElementById("subjects-grid");
    document.getElementById("subject-detail").style.display = "none";
    grid.style.display = "";
    const bySubj = {};
    this.lessons.forEach((l) => { (bySubj[l.subject] = bySubj[l.subject] || []).push(l); });
    const subjects = Object.keys(bySubj).sort();
    if (!subjects.length) {
      grid.innerHTML = '<p class="muted">Hozircha bu sinf uchun dars qo\'shilmagan.</p>';
      return;
    }
    grid.innerHTML = "";
    subjects.forEach((subj) => {
      const items = bySubj[subj];
      const v = items.filter((l) => l.type === "video").length;
      const a = items.filter((l) => l.type === "audio").length;
      const t = items.filter((l) => l.type === "text").length;
      const done = items.filter((l) => this.completed.has(l.id)).length;
      const card = document.createElement("div");
      card.className = "lesson-card";
      card.innerHTML = `
        <span class="l-icon">📚</span>
        <h3>${UI.esc(subj)}</h3>
        <div class="chips">
          ${v ? `<span class="chip">🎬 ${v}</span>` : ""}
          ${a ? `<span class="chip">🎧 ${a}</span>` : ""}
          ${t ? `<span class="chip">📖 ${t}</span>` : ""}
        </div>
        <div class="muted" style="margin-top:6px">${items.length} ta dars${done ? ` • ${done} tugatilgan ✔` : ""}</div>`;
      card.onclick = () => this.openSubject(subj);
      grid.appendChild(card);
    });
  },

  /* Fan ichidagi darslar (video / audio / matn) */
  openSubject(subj) {
    this.currentSubject = subj;
    document.getElementById("subjects-grid").style.display = "none";
    document.getElementById("subject-detail").style.display = "";
    document.getElementById("subj-title").textContent = "📚 " + subj;
    const lessons = this.lessons.filter((l) => l.subject === subj);
    [["video", "subj-video"], ["audio", "subj-audio"], ["text", "subj-text"]].forEach(([type, id]) => {
      const items = lessons.filter((l) => l.type === type);
      document.getElementById(id + "-sec").style.display = items.length ? "" : "none";
      if (items.length) this._renderTypeGroup(id, items, type);
    });
    window.scrollTo(0, 0);
  },

  _renderTypeGroup(containerId, lessons, type) {
    const box = document.getElementById(containerId);
    const icons = { video: "🎬", audio: "🎧", text: "📖" };
    box.innerHTML = "";
    lessons.forEach((l) => {
      const card = document.createElement("div");
      card.className = "lesson-card" + (this.completed.has(l.id) ? " done" : "");
      card.innerHTML = `
        <span class="l-icon">${icons[l.type] || "📘"}</span>
        <h3>${UI.esc(l.title)}</h3>
        <div class="chips">
          <span class="chip">🪙 ${l.coins_reward}</span>
          ${l.file_size_mb ? `<span class="chip">💾 ${l.file_size_mb} MB</span>` : ""}
          ${l.related_test ? '<span class="chip">📝 test bor</span>' : ""}
        </div>`;
      card.onclick = () => this.openLesson(l);
      box.appendChild(card);
    });
  },

  /* Modal yopilганда joriy ko'rinishни yangilaydi (tugatilgan belgisi uchun) */
  refreshLearning() {
    if (this.currentSubject) this.openSubject(this.currentSubject);
    else this.renderSubjects();
  },

  openLesson(l) {
    if (l.type === "text") this.openText(l);
    else this.openMedia(l);
  },

  /* Modal yopilganда ovozни butunlay to'xtatadi (orqada davom etmasin) */
  stopMedia() {
    const m = document.getElementById("lesson-media");
    if (m) {
      try { m.pause(); m.removeAttribute("src"); m.load(); } catch (e) {}
    }
  },

  openMedia(l) {
    const isVideo = l.type === "video";
    const tag = isVideo ? "video" : "audio";
    UI.modal(`
      <h2 style="text-align:center">${isVideo ? "🎬" : "🎧"} ${UI.esc(l.title)}</h2>
      <div class="player-wrap">
        <div class="player-media-box">
          <${tag} id="lesson-media" playsinline></${tag}>
          <div class="spinner" id="media-spinner"></div>
        </div>
        <div class="player-bar"><div class="player-fill" id="player-fill"></div></div>
        <div class="player-controls">
          <button class="btn btn-secondary btn-sm" id="pl-play">▶️ Boshlash</button>
          <button class="btn rewind-btn btn-sm" id="pl-rewind">⏪ 10s orqaga</button>
          <span class="player-note" id="pl-time">0%</span>
        </div>
        <p class="player-note">⚠️ Darsni oldinga o'tkazib yoki tezlashtirib bo'lmaydi. Faqat 10 soniya orqaga qaytarish mumkin.</p>
        <div id="pl-done-area"></div>
      </div>`, { large: true, onClose: () => { this.stopMedia(); this.refreshLearning(); } });

    const media = document.getElementById("lesson-media");
    const spin = document.getElementById("media-spinner");
    const showSpin = () => spin && spin.classList.add("on");
    const hideSpin = () => spin && spin.classList.remove("on");
    ["waiting", "loadstart", "stalled", "seeking"].forEach((ev) => media.addEventListener(ev, showSpin));
    ["playing", "canplay", "canplaythrough", "pause", "ended", "error"].forEach((ev) => media.addEventListener(ev, hideSpin));
    media.src = `/api/lessons/${l.id}/media`;
    media.controls = false;
    media.playbackRate = 1;
    let maxWatched = 0;
    media.addEventListener("ratechange", () => { if (media.playbackRate !== 1) media.playbackRate = 1; });
    media.addEventListener("timeupdate", () => {
      if (media.currentTime > maxWatched) maxWatched = media.currentTime;
      const pct = media.duration ? Math.min(100, (maxWatched / media.duration) * 100) : 0;
      const f = document.getElementById("player-fill"); if (f) f.style.width = pct + "%";
      const t = document.getElementById("pl-time"); if (t) t.textContent = Math.floor(pct) + "%";
    });
    media.addEventListener("seeking", () => {
      if (media.currentTime > maxWatched + 1.0) media.currentTime = maxWatched;
    });
    media.addEventListener("ended", () => this.showComplete(l));
    media.oncontextmenu = (e) => e.preventDefault();

    const btn = document.getElementById("pl-play");
    btn.onclick = () => {
      if (media.paused) { media.play(); btn.textContent = "⏸️ To'xtatish"; }
      else { media.pause(); btn.textContent = "▶️ Davom etish"; }
    };
    document.getElementById("pl-rewind").onclick = () => {
      media.currentTime = Math.max(0, media.currentTime - 10);
    };
  },

  openText(l) {
    const img = l.has_image ? `<img src="/api/lessons/${l.id}/image" alt="rasm">` : "";
    UI.modal(`
      <h2 style="text-align:center">📖 ${UI.esc(l.title)}</h2>
      <div class="text-reader" id="text-reader">${img}${UI.esc(l.text_content || "")}</div>
      <div style="text-align:center;margin-top:14px">
        <button class="btn btn-success" id="txt-done" disabled>Iltimos o'qing...</button>
      </div>
      <div id="pl-done-area"></div>`, { large: true, onClose: () => { this.stopMedia(); this.refreshLearning(); } });

    const btn = document.getElementById("txt-done");
    let sec = 6;
    btn.textContent = `Iltimos o'qing... (${sec}s)`;
    const iv = setInterval(() => {
      const b = document.getElementById("txt-done");
      if (!b) { clearInterval(iv); return; }
      sec--;
      if (sec <= 0) { clearInterval(iv); b.disabled = false; b.textContent = "✅ O'qib bo'ldim"; }
      else b.textContent = `Iltimos o'qing... (${sec}s)`;
    }, 1000);
    btn.onclick = () => this.showComplete(l);
  },

  async showComplete(l) {
    const res = await API.post("/api/learning/complete", { student_id: this.student.id, lesson_id: l.id });
    let msg = "";
    if (res.ok) {
      this.completed.add(l.id);
      if (res.already) msg = "Bu darsni avval tugatgansiz.";
      else {
        msg = `🪙 +${res.coins} coin!`;
        this.student.coins = res.total_coins;
        document.getElementById("lr-coins").textContent = res.total_coins;
        Fireworks.start(2500);
      }
    }
    const area = document.getElementById("pl-done-area");
    if (!area) return;
    const testBtn = l.related_test ? `<button class="btn btn-success" id="pl-test">📝 Darsga oid testni yechish</button>` : "";
    area.innerHTML = `
      <div style="text-align:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--card-border)">
        <h3>✅ Dars tugadi! ${msg}</h3>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap">
          ${testBtn}
          <button class="btn btn-ghost" id="pl-close">Darslarga qaytish</button>
        </div>
      </div>`;
    document.getElementById("pl-close").onclick = () => { UI.closeModal(); this.refreshLearning(); };
    if (l.related_test) document.getElementById("pl-test").onclick = () => this.startRelatedTest(l);
  },

  async startRelatedTest(l) {
    const res = await API.post("/api/learning/start-test", { student_id: this.student.id, lesson_id: l.id });
    if (!res.ok) { UI.toast(res.error || "Xatolik", "err"); return; }
    UI.closeModal();
    Student.start(res);
  },
};
