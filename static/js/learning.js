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
        if (t.dataset.ltab === "profile") this.renderProfile();
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
      `${payload.student.first_name} ${payload.student.last_name} • ${payload.student.class_name}${payload.school_name ? " • 🏫 " + payload.school_name : ""}`;
    document.getElementById("lr-coins").textContent = payload.student.coins || 0;
    this._totalSeconds = payload.student.total_duration_seconds || 0;
    this._updateTimeBadge(this._totalSeconds);
    this.daily = payload.daily || [];
    this.todaySeconds = payload.student.today_duration_seconds || 0;
    this.monthSeconds = payload.student.month_duration_seconds || 0;
    this.schoolName = payload.school_name || "";
    this.currentSubject = null;
    this.renderSubjects();
    this.renderMyDaily();
    Games.renderGrid(document.getElementById("games-grid"));
    UI.showView("view-learning");
  },

  _fmtDur(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + " s";
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + " daq" + (s ? " " + s + "s" : "");
    const h = Math.floor(m / 60), rm = m % 60;
    return h + " soat" + (rm ? " " + rm + " daq" : "");
  },
  _updateTimeBadge(sec) {
    const el = document.getElementById("lr-time");
    if (el) el.textContent = this._fmtDur(sec);
  },

  _fmtDurLong(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + " s";
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + " daq" + (s ? " " + s + "s" : "");
    const h = Math.floor(m / 60), rm = m % 60;
    return h + " soat" + (rm ? " " + rm + " daq" : "");
  },
  _todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
  _dateLabel(dateStr) {
    const today = this._todayStr();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yStr = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    if (dateStr === today) return "Bugun";
    if (dateStr === yStr) return "Kecha";
    return dateStr;
  },
  /* O'quvchining o'ziga: kunlik/oylik sarflagan vaqti */
  renderMyDaily() {
    const box = document.getElementById("my-daily-time");
    if (!box) return;
    const daily = this.daily || [];
    const rows = daily.length
      ? daily.map((d) => `<div class="daily-time-row${d.date === this._todayStr() ? " today" : ""}">
          <span class="d-date">${this._dateLabel(d.date)} <span class="muted" style="font-size:.8rem">${d.date}</span></span>
          <span class="d-secs">⏱ ${this._fmtDurLong(d.seconds)}</span></div>`).join("")
      : '<p class="muted" style="margin:6px 0">Hali vaqt yozilmagan. Video/audio ko\'rsangiz vaqtingiz shu yerda ko\'rinadi.</p>';
    box.innerHTML = `
      <div class="my-time-card">
        <div class="my-time-head">
          <b>⏱ Bilim olishga sarflagan vaqtingiz</b>
          <span class="muted">Bugun: <b>${this._fmtDurLong(this.todaySeconds)}</b> • Shu oy: <b>${this._fmtDurLong(this.monthSeconds)}</b> • Jami: <b>${this._fmtDurLong(this._totalSeconds)}</b></span>
        </div>
        <div class="daily-time-list">${rows}</div>
      </div>`;
  },

  /* O'quvchi profili — to'liq ma'lumot */
  renderProfile() {
    const box = document.getElementById("profile-content");
    if (!box) return;
    const s = this.student || {};
    const initials = ((s.first_name ? s.first_name[0] : "") + (s.last_name ? s.last_name[0] : "")).toUpperCase();
    const totalLessons = this.lessons.length;
    const done = this.lessons.filter((l) => this.completed.has(l.id)).length;
    const faollik = totalLessons ? Math.round(done / totalLessons * 100) : 0;
    const v = this.lessons.filter((l) => l.type === "video").length;
    const a = this.lessons.filter((l) => l.type === "audio").length;
    const t = this.lessons.filter((l) => l.type === "text").length;
    const dailyRows = (this.daily || []).length
      ? (this.daily.map((d) => `<div class="daily-time-row${d.date === this._todayStr() ? " today" : ""}">
          <span class="d-date">${this._dateLabel(d.date)} <span class="muted" style="font-size:.8rem">${d.date}</span></span>
          <span class="d-secs">⏱ ${this._fmtDurLong(d.seconds)}</span></div>`).join(""))
      : '<p class="muted">Hali vaqt yozilmagan.</p>';
    box.innerHTML = `
      <div class="profile-card">
        <div class="profile-head">
          <div class="student-avatar" style="width:64px;height:64px;font-size:1.6rem">${UI.esc(initials)}</div>
          <div>
            <h2 style="margin:0">${UI.esc(s.first_name)} ${UI.esc(s.last_name)}</h2>
            <div class="muted">${UI.esc(s.class_name)}${this.schoolName ? " • 🏫 " + UI.esc(this.schoolName) : ""}</div>
          </div>
        </div>
        <div class="stat-tiles" style="margin-top:16px">
          <div class="stat-tile"><div class="num">🪙 ${s.coins || 0}</div><div class="lbl">Coinlar</div></div>
          <div class="stat-tile"><div class="num">📈 ${faollik}%</div><div class="lbl">Faollik (${done}/${totalLessons})</div></div>
          <div class="stat-tile"><div class="num">⏱ ${this._fmtDurLong(this._totalSeconds)}</div><div class="lbl">Jami vaqt</div></div>
          <div class="stat-tile"><div class="num">📅 ${this._fmtDurLong(this.todaySeconds)}</div><div class="lbl">Bugun</div></div>
        </div>
        <p class="muted" style="margin:12px 0">📚 Sinfingizda ${totalLessons} ta dars: 🎬 ${v} video • 🎧 ${a} audio • 📖 ${t} matn. Shu oy: ⏱ ${this._fmtDurLong(this.monthSeconds)}.</p>
        ${UI.chart7(this.daily)}
        <h3 style="margin:10px 0 8px">📆 Kunlik vaqtim</h3>
        <div class="daily-time-list">${dailyRows}</div>
      </div>`;
  },

  /* Avval FANLAR ro'yxati */
  renderSubjects() {
    this.currentSubject = null;
    const grid = document.getElementById("subjects-grid");
    document.getElementById("subject-detail").style.display = "none";
    const dt = document.getElementById("my-daily-time"); if (dt) dt.style.display = "";
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
    const dt = document.getElementById("my-daily-time"); if (dt) dt.style.display = "none";
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

  /* ===== KO'RILGAN VAQTNI HISOBLASH (video/audio) ===== */
  _fmtClock(s) { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60), ss = s % 60; return m + ":" + String(ss).padStart(2, "0"); },
  _startWatch(lessonId) {
    this._watchLesson = lessonId;
    this._watchUnflushed = 0;   // serverga hali yuborilmagan soniyalar
    this._watchTotal = 0;       // shu sessiyada ko'rilgan jami soniya (ekranda)
    this._watchPlaying = false; // hozir o'ynayaptimi
    this._stopWatchTimer();
    // Har soniya: agar o'ynayotgan bo'lsa vaqtni sanaymiz; to'xtasa — sanamaymiz
    this._watchTimer = setInterval(() => {
      if (!this._watchPlaying) return;
      this._watchUnflushed++;
      this._watchTotal++;
      const c = document.getElementById("watch-clock");
      if (c) c.textContent = "⏱ " + this._fmtClock(this._watchTotal);
      // Tepadagi umumiy vaqtni ham jonli oshirib boramiz
      this._totalSeconds = (this._totalSeconds || 0) + 1;
      this._updateTimeBadge(this._totalSeconds);
      if (this._watchUnflushed >= 10) this._flushWatch();  // har 10s da serverga yozamiz
    }, 1000);
  },
  async _flushWatch() {
    const secs = this._watchUnflushed || 0;
    if (secs <= 0 || !this._watchLesson || !this.student) return;
    this._watchUnflushed = 0;
    try { await API.post("/api/learning/watch", { student_id: this.student.id, lesson_id: this._watchLesson, seconds: secs }); } catch (e) {}
  },
  _stopWatchTimer() { if (this._watchTimer) { clearInterval(this._watchTimer); this._watchTimer = null; } this._watchPlaying = false; },

  openMedia(l) {
    const isVideo = l.type === "video";
    const tag = isVideo ? "video" : "audio";
    UI.modal(`
      <h2 style="text-align:center">${isVideo ? "🎬" : "🎧"} ${UI.esc(l.title)}</h2>
      <div class="player-wrap">
        <div class="player-media-box" id="media-box">
          <${tag} id="lesson-media" playsinline preload="none"></${tag}>
          <div class="spinner" id="media-spinner"></div>
          <button class="media-load-btn" id="media-load" type="button">
            <span class="mlb-icon">${isVideo ? "▶" : "🎧"}</span>
            <span class="mlb-text">${isVideo ? "Videoni yuklab ko'rish" : "Audioni yuklab tinglash"}</span>
            <span class="mlb-sub">${l.file_size_mb ? l.file_size_mb + " MB" : "Bosing"}</span>
          </button>
        </div>
        <div class="player-bar"><div class="player-fill" id="player-fill"></div></div>
        <div class="player-controls">
          <button class="btn btn-secondary btn-sm" id="pl-play" disabled>▶️ Boshlash</button>
          <button class="btn rewind-btn btn-sm" id="pl-rewind">⏪ 10s orqaga</button>
          <span class="player-note" id="pl-time">0%</span>
          <span class="watch-clock" id="watch-clock">⏱ 0:00</span>
        </div>
        <p class="player-note">⚠️ Darsni oldinga o'tkazib yoki tezlashtirib bo'lmaydi. To'xtatsangiz vaqt ham to'xtaydi.</p>
        <div id="pl-done-area"></div>
      </div>`, { large: true, onClose: () => { this._flushWatch(); this._stopWatchTimer(); this.stopMedia(); this.refreshLearning(); } });

    this._startWatch(l.id);
    const media = document.getElementById("lesson-media");
    const spin = document.getElementById("media-spinner");
    const loadBtn = document.getElementById("media-load");
    const playBtn = document.getElementById("pl-play");
    const showSpin = () => spin && spin.classList.add("on");
    const hideSpin = () => spin && spin.classList.remove("on");

    // Vaqt hisoblash o'ynash/to'xtash hodisalariga bog'liq (ishonchli)
    media.addEventListener("playing", () => { this._watchPlaying = true; hideSpin(); playBtn.textContent = "⏸️ To'xtatish"; });
    media.addEventListener("play", () => { playBtn.textContent = "⏸️ To'xtatish"; });
    media.addEventListener("pause", () => { this._watchPlaying = false; hideSpin(); this._flushWatch(); playBtn.textContent = "▶️ Davom etish"; });
    media.addEventListener("waiting", () => { this._watchPlaying = false; showSpin(); });
    media.addEventListener("stalled", showSpin);
    media.addEventListener("ended", () => { this._watchPlaying = false; hideSpin(); this.showComplete(l); });
    media.addEventListener("error", () => { hideSpin(); if (media.src) UI.toast("Faylni yuklashda xatolik", "err"); });

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
    media.oncontextmenu = (e) => e.preventDefault();

    // Telegram uslubi: faqat bosilganda yuklanadi va o'ynaydi
    const loadAndPlay = () => {
      if (loadBtn) loadBtn.style.display = "none";
      showSpin();
      if (!media.src) media.src = `/api/lessons/${l.id}/media`;
      playBtn.disabled = false;
      media.play().catch(() => { hideSpin(); playBtn.textContent = "▶️ Boshlash"; });
    };
    loadBtn.onclick = loadAndPlay;
    playBtn.onclick = () => {
      if (!media.src) { loadAndPlay(); return; }
      if (media.paused) media.play(); else media.pause();
    };
    document.getElementById("pl-rewind").onclick = () => {
      if (media.src) media.currentTime = Math.max(0, media.currentTime - 10);
    };
  },

  openText(l) {
    const img = l.has_image ? `<img src="/api/lessons/${l.id}/image" alt="rasm" class="reader-img">` : "";
    const reader = document.getElementById("learn-reader");
    document.querySelectorAll(".learn-pane").forEach((p) => p.classList.remove("active"));
    document.querySelector(".learn-tabs").style.display = "none";
    reader.style.display = "block";
    reader.innerHTML = `
      <button class="btn btn-ghost" id="reader-back" style="margin-bottom:14px">← Darslarga qaytish</button>
      <h2 style="margin-bottom:12px">📖 ${UI.esc(l.title)}</h2>
      ${img}
      <div class="text-reader">${UI.esc(l.text_content || "")}</div>
      <div style="text-align:center;margin-top:16px">
        <button class="btn btn-success" id="txt-done" disabled>Iltimos o'qing...</button>
      </div>
      <div id="pl-done-area"></div>`;
    this._closeReader = () => {
      reader.style.display = "none"; reader.innerHTML = "";
      document.querySelector(".learn-tabs").style.display = "";
      this._closeReader = null; this.refreshLearning();
    };
    document.getElementById("reader-back").onclick = () => this._closeReader();

    this._lessonStartTime = Date.now();
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
    let duration_seconds = 0;
    if (l.type === "text") {
      // Matn: o'qishga ketgan vaqt
      duration_seconds = this._lessonStartTime ? Math.round((Date.now() - this._lessonStartTime) / 1000) : 0;
      this._lessonStartTime = null;
    } else {
      // Video/audio: vaqt heartbeat orqali yozilgan — qolganini yuboramiz
      await this._flushWatch();
      this._stopWatchTimer();
    }
    const res = await API.post("/api/learning/complete", { student_id: this.student.id, lesson_id: l.id, duration_seconds });
    let msg = "";
    if (res.ok) {
      this.completed.add(l.id);
      if (res.already) msg = "Bu darsni avval tugatgansiz.";
      else {
        msg = `🪙 +${res.coins} coin!`;
        this.student.coins = res.total_coins;
        document.getElementById("lr-coins").textContent = res.total_coins;
        if (res.total_duration_seconds != null) { this._totalSeconds = res.total_duration_seconds; this._updateTimeBadge(this._totalSeconds); }
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
    document.getElementById("pl-close").onclick = () => {
      if (this._closeReader) this._closeReader();
      else { UI.closeModal(); this.refreshLearning(); }
    };
    if (l.related_test) document.getElementById("pl-test").onclick = () => this.startRelatedTest(l);
  },

  async startRelatedTest(l) {
    const res = await API.post("/api/learning/start-test", { student_id: this.student.id, lesson_id: l.id });
    if (!res.ok) { UI.toast(res.error || "Xatolik", "err"); return; }
    UI.closeModal();
    Student.start(res);
  },
};
