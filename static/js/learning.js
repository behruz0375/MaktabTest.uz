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
        if (t.dataset.ltab === "rank") this.renderRanking();
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
    this.gameCoins = payload.game_coins || 0;
    Games._rewarded = {};
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

  /* ===== REYTING: o'z sinfi va maktabdagi barcha o'quvchilar ===== */
  _rankRow(r, meId) {
    const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank;
    const badgeCls = r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : r.rank === 3 ? "bronze" : "";
    const initials = ((r.first_name[0] || "") + (r.last_name[0] || "")).toUpperCase();
    const me = r.id === meId;
    const baho = r.baho ? `<span class="baho-badge baho-${r.baho >= 5 ? "5" : r.baho >= 4 ? "4" : r.baho >= 3 ? "3" : "2"}">${r.baho}</span>` : "";
    return `
      <div class="student-row${me ? " rank-me" : ""}" style="cursor:default">
        <div class="rank-badge ${badgeCls}">${medal}</div>
        <div class="student-avatar">${UI.esc(initials)}</div>
        <div class="student-info">
          <div class="name">${UI.esc(r.last_name)} ${UI.esc(r.first_name)}${me ? ' <span class="role-tag role-teacher">siz</span>' : ""} ${baho}</div>
          <div class="sub">🪙 ${r.coins} coin${r.best_pct != null ? ` • 📊 eng yaxshi test: ${r.best_pct}%` : ""}</div>
        </div>
        <span class="status-pill done">${UI.esc(r.class_name)}</span>
      </div>`;
  },

  _rankBlock(title, list, meId, limit) {
    if (!list.length) return `<div class="baho-group"><div class="baho-group-title">${title}</div><p class="muted">Hozircha reyting bo'sh.</p></div>`;
    let shown = limit ? list.slice(0, limit) : list;
    let extra = "";
    if (limit && !shown.some((r) => r.id === meId)) {
      const mine = list.find((r) => r.id === meId);
      if (mine) extra = `<div class="muted" style="text-align:center;margin:6px 0">⋯</div>` + this._rankRow(mine, meId);
    }
    return `<div class="baho-group">
      <div class="baho-group-title">${title} — ${list.length} ta o'quvchi</div>
      <div class="results-list">${shown.map((r) => this._rankRow(r, meId)).join("")}${extra}</div>
    </div>`;
  },

  async renderRanking() {
    const box = document.getElementById("rank-content");
    if (!box) return;
    const s = this.student || {};
    box.innerHTML = '<p class="muted">Yuklanmoqda...</p>';
    let res = {};
    try { res = await API.get("/api/rankings/student?student_id=" + s.id); } catch (e) { res = {}; }
    if (!res || !res.ok) { box.innerHTML = '<p class="muted">Reytingni yuklab bo\'lmadi.</p>'; return; }
    const mine = (res.school_ranking || []).find((r) => r.id === s.id);
    const myClass = (res.class_ranking || []).find((r) => r.id === s.id);
    const clsPos = myClass ? myClass.rank : null;
    const clsTot = (res.class_ranking || []).length;
    // Keyingi o'rinв kimdan necha coin orqadaligimizni hisoblaymiz
    let nextMsg = "";
    if (myClass && clsPos > 1) {
      const ahead = (res.class_ranking || []).find((r) => r.rank === clsPos - 1);
      if (ahead) { const diff = Math.max(0, (ahead.coins || 0) - (s.coins || 0) + 1); nextMsg = `${clsPos - 1}-o'ringa chiqish uchun yana <b>${diff} coin</b> kerak.`; }
    } else if (myClass && clsPos === 1) { nextMsg = "Siz sinfingizda <b>1-o'rindasiz</b> — zo'r! 🎉"; }
    box.innerHTML = `
      <div class="rank-hero">
        <div class="rh-place">${clsPos ? clsPos : "—"}</div>
        <div class="rh-text">
          <div class="rh-big">Siz sinfingizda <b>${clsPos ? clsPos + "-o'rindasiz" : "— "}</b>${clsTot ? ` <span class="muted">(${clsTot} o'quvchidan)</span>` : ""}</div>
          <div class="rh-sub">🪙 <b>${s.coins || 0}</b> coin yig'gansiz${mine ? ` • 🌍 maktabda ${mine.rank}-o'rin` : ""}</div>
          ${nextMsg ? `<div class="rh-next">⬆️ ${nextMsg}</div>` : ""}
        </div>
      </div>
      <div class="rank-help">
        <b>Reyting qanday tuziladi?</b> O'rin <b>coin</b> bo'yicha beriladi — kim ko'p coin yig'sa, shuncha yuqorida.
        Coin yig'ish: 🎬 video ko'rish, 🎧 audio tinglash, 📖 matn o'qish va 🎮 o'yin o'ynash.
        Eng yaxshi 3 talik: 🥇 1-o'rin, 🥈 2-o'rin, 🥉 3-o'rin.
      </div>
      ${this._rankBlock(`🏅 ${UI.esc(res.class_name || "")} sinf reytingi`, res.class_ranking || [], s.id)}
      ${this._rankBlock("🌍 Maktabdagi barcha o'quvchilar reytingi", res.school_ranking || [], s.id, 30)}`;
  },

  /* O'quvchi profili — to'liq ma'lumot */
  async renderProfile() {
    const box = document.getElementById("profile-content");
    if (!box) return;
    const s = this.student || {};
    // Reyting va oylik o'zlashtirish (o'z-o'zi haqida)
    let ov = {};
    try { ov = await API.get("/api/learning/my-overview?student_id=" + s.id); } catch (e) { ov = {}; }
    if (!ov || !ov.ok) ov = {};
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
          <div class="stat-tile"><div class="num">🏅 ${ov.class_rank ? ov.class_rank + "/" + ov.class_total : "—"}</div><div class="lbl">Sinf reytingi</div></div>
          <div class="stat-tile"><div class="num">🌍 ${ov.overall_rank ? ov.overall_rank + "/" + ov.overall_total : "—"}</div><div class="lbl">Umumiy reyting</div></div>
          <div class="stat-tile"><div class="num">🪙 ${s.coins || 0}</div><div class="lbl">Coinlar</div></div>
          <div class="stat-tile"><div class="num">📈 ${faollik}%</div><div class="lbl">Faollik (${done}/${totalLessons})</div></div>
          <div class="stat-tile"><div class="num">⏱ ${this._fmtDurLong(this._totalSeconds)}</div><div class="lbl">Jami vaqt</div></div>
          <div class="stat-tile"><div class="num">📅 ${this._fmtDurLong(this.todaySeconds)}</div><div class="lbl">Bugun</div></div>
        </div>
        <p class="muted" style="margin:12px 0">📚 Sinfingizda ${totalLessons} ta dars: 🎬 ${v} video • 🎧 ${a} audio • 📖 ${t} matn. Shu oy: ⏱ ${this._fmtDurLong(this.monthSeconds)}.</p>
        ${UI.chart7(this.daily, { title: "📊 Haftalik faollik (oxirgi 7 kun)" })}
        ${UI.chartMonthly(ov.monthly, { title: "📈 Oylik o'zlashtirish (test natijalari)" })}
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
  _startWatch(lessonId, requireGaze) {
    this._watchLesson = lessonId;
    this._watchUnflushed = 0;   // serverga hali yuborilmagan soniyalar
    this._watchTotal = 0;       // shu sessiyada ko'rilgan jami soniya (ekranda)
    this._watchPlaying = false; // hozir o'ynayaptimi
    this._gazeRequired = !!requireGaze; // video uchun kamera majburiy
    this._gazeOk = false;       // kamera yoqilgan VA ekranga qarab turibdimi
    this._stopWatchTimer();
    // Har soniya: o'ynayotgan bo'lsa VA (video bo'lsa) kamera yoqilib ekranga
    // qarab turgan bo'lsagina vaqtni sanaymiz. Aks holda — YOZILMAYDI.
    this._watchTimer = setInterval(() => {
      if (!this._watchPlaying) return;
      if (this._gazeRequired && !this._gazeOk) return;
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
    const mb = l.file_size_mb ? l.file_size_mb + " MB" : "";
    UI.modal(`
      <div class="vplayer">
        <div class="ytp player-media-box${isVideo ? "" : " ytp-audio"}" id="media-box">
          <${tag} id="lesson-media" playsinline preload="none"></${tag}>
          <div class="spinner" id="media-spinner"></div>

          <!-- Yuqori qator: sarlavha + hajm -->
          <div class="ytp-top">
            <span class="ytp-title">${isVideo ? "🎬" : "🎧"} ${UI.esc(l.title)}</span>
            ${mb ? `<span class="ytp-size" title="Fayl hajmi">💾 ${mb}</span>` : ""}
          </div>

          ${isVideo ? `
          <div class="gaze-cam" id="gaze-cam" hidden>
            <video id="gaze-video" muted playsinline></video>
            <span class="gaze-dot" id="gaze-dot" title="Kamera nazorati"></span>
          </div>` : ""}

          <!-- Markazdagi katta tugma -->
          <button class="ytp-bigplay" id="ytp-bigplay" type="button" aria-label="O'ynatish">▶</button>

          <!-- Yuklash qoplamasi (birinchi marta) -->
          <button class="media-load-btn" id="media-load" type="button">
            <span class="mlb-icon">${isVideo ? "▶" : "🎧"}</span>
            <span class="mlb-text">${isVideo ? "Videoni yuklab ko'rish" : "Audioni yuklab tinglash"}</span>
            <span class="mlb-sub">${mb || "Bosing"}</span>
          </button>

          <!-- Pastki boshqaruv (video ustida) -->
          <div class="ytp-bottom">
            <div class="ytp-progress"><div class="player-fill" id="player-fill"></div></div>
            <div class="ytp-controls">
              <button class="ytp-btn" id="pl-play" disabled title="O'ynatish / to'xtatish">▶</button>
              <button class="ytp-btn ytp-rew" id="pl-rewind" title="10 soniya orqaga">↺<b>10</b></button>
              <span class="ytp-time" id="pl-time">0:00 / 0:00</span>
              <span class="ytp-flex"></span>
              <span class="watch-clock" id="watch-clock" title="Yozilgan vaqt">⏱ 0:00</span>
              ${isVideo ? `<button class="ytp-btn" id="pl-fs" title="To'liq ekran">⛶</button>` : ""}
            </div>
          </div>
        </div>

        ${isVideo ? `<div class="gaze-ctl" id="gaze-ctl">
          <button class="btn btn-secondary btn-sm" id="gaze-enable" type="button">📷 Kamerani yoqish</button>
          <span class="gaze-ctl-msg" id="gaze-ctl-msg">Dars vaqti yozilishi uchun kamerani yoqing — kamerasiz vaqt sanalmaydi.</span>
        </div>` : ""}
        <p class="player-note" id="gaze-note">⚠️ Darsni oldinga o'tkazib bo'lmaydi. To'xtatsangiz${isVideo ? " yoki ekrandan ko'z uzsangiz" : ""} vaqt yozilmaydi.</p>
        ${isVideo ? `<div class="gaze-warn" id="gaze-warn" hidden>👀 Ekranga qarang — video darslik vaqti yozilmayapti</div>` : ""}
        <div id="pl-done-area"></div>
      </div>`, { large: true, onClose: () => { try { Gaze.stop(); } catch (e) {} const mbx = document.getElementById("modal-box"); if (mbx) mbx.classList.remove("modal-video"); this._flushWatch(); this._stopWatchTimer(); this.stopMedia(); this.refreshLearning(); } });

    const modalBox = document.getElementById("modal-box");
    if (modalBox) modalBox.classList.add("modal-video");   // video player kengroq ko'rinsin
    this._startWatch(l.id, isVideo);
    this._gazeActive = false;
    this._gazeStarting = false;
    const media = document.getElementById("lesson-media");
    const spin = document.getElementById("media-spinner");
    const loadBtn = document.getElementById("media-load");
    const playBtn = document.getElementById("pl-play");
    const bigPlay = document.getElementById("ytp-bigplay");
    const box = document.getElementById("media-box");
    const showSpin = () => spin && spin.classList.add("on");
    const hideSpin = () => spin && spin.classList.remove("on");

    // YouTube uslubi: o'ynaganda boshqaruvlar avtomatik yashirinadi, sichqoncha tegsa chiqadi
    let ctlTimer = null;
    const scheduleHide = () => { if (ctlTimer) clearTimeout(ctlTimer); if (box.classList.contains("playing")) ctlTimer = setTimeout(() => box.classList.add("ytp-idle"), 2800); };
    const wakeControls = () => { box.classList.remove("ytp-idle"); scheduleHide(); };
    box.addEventListener("mousemove", wakeControls);
    box.addEventListener("mouseleave", () => { if (box.classList.contains("playing")) box.classList.add("ytp-idle"); });

    // Vaqt hisoblash o'ynash/to'xtash hodisalariga bog'liq (ishonchli)
    const setPlaying = (on) => {
      box.classList.toggle("playing", on);
      playBtn.textContent = on ? "⏸" : "▶";
      if (on) scheduleHide(); else box.classList.remove("ytp-idle");
    };
    media.addEventListener("playing", () => { this._watchPlaying = true; hideSpin(); setPlaying(true); });
    media.addEventListener("play", () => setPlaying(true));
    media.addEventListener("pause", () => { this._watchPlaying = false; hideSpin(); this._flushWatch(); setPlaying(false); });
    media.addEventListener("waiting", () => { this._watchPlaying = false; showSpin(); });
    media.addEventListener("stalled", showSpin);
    media.addEventListener("ended", () => { this._watchPlaying = false; hideSpin(); setPlaying(false); try { Gaze.stop(); } catch (e) {} this.showComplete(l); });
    media.addEventListener("error", () => { hideSpin(); if (media.src) UI.toast("Faylni yuklashda xatolik", "err"); });

    media.controls = false;
    media.playbackRate = 1;
    let maxWatched = 0;
    media.addEventListener("ratechange", () => { if (media.playbackRate !== 1) media.playbackRate = 1; });
    media.addEventListener("timeupdate", () => {
      if (media.currentTime > maxWatched) maxWatched = media.currentTime;
      const pct = media.duration ? Math.min(100, (maxWatched / media.duration) * 100) : 0;
      const f = document.getElementById("player-fill"); if (f) f.style.width = pct + "%";
      const t = document.getElementById("pl-time");
      if (t) t.textContent = `${this._fmtClock(media.currentTime)} / ${this._fmtClock(media.duration || 0)}`;
    });
    media.addEventListener("seeking", () => {
      if (media.currentTime > maxWatched + 1.0) media.currentTime = maxWatched;
    });
    media.oncontextmenu = (e) => e.preventDefault();

    // ===== Kamera nazorati (faqat video) =====
    // Kamera yoqilmaguncha va ekranga qaralmaguncha dars vaqti YOZILMAYDI (_gazeOk=false).
    const enableCamera = () => {
      if (!isVideo || this._gazeActive || this._gazeStarting) return;
      this._gazeStarting = true;
      const cam = document.getElementById("gaze-cam");
      const dot = document.getElementById("gaze-dot");
      const warn = document.getElementById("gaze-warn");
      const ctl = document.getElementById("gaze-ctl");
      const ctlMsg = document.getElementById("gaze-ctl-msg");
      const enableBtn = document.getElementById("gaze-enable");
      if (cam) cam.hidden = false;
      if (enableBtn) { enableBtn.disabled = true; enableBtn.textContent = "📷 Yoqilmoqda..."; }
      if (ctlMsg) ctlMsg.textContent = "Kameraga ruxsat berish oynasini tasdiqlang...";
      Gaze.start(document.getElementById("gaze-video"), {
        // Har kadrda: qarab tursa vaqt sanaladi, qaramasa sanalmaydi (video to'xtamaydi)
        onState: (looking) => { this._gazeOk = looking; if (dot) dot.classList.toggle("off", !looking); },
        onAway: () => { this._flushWatch(); if (warn) warn.hidden = false; },  // pastda kichik ogohlantirish
        onBack: () => { if (warn) warn.hidden = true; },
        onFail: (msg) => {
          this._gazeStarting = false; this._gazeActive = false; this._gazeOk = false;
          if (cam) cam.hidden = true;
          if (warn) warn.hidden = true;
          if (ctl) ctl.hidden = false;
          if (enableBtn) { enableBtn.disabled = false; enableBtn.textContent = "📷 Kamerani yoqish"; }
          if (ctlMsg) ctlMsg.textContent = "⚠️ " + UI.esc(msg) + " Kamerasiz dars vaqti yozilmaydi.";
        },
      }).then((ok) => {
        this._gazeStarting = false;
        if (ok) { this._gazeActive = true; if (ctl) ctl.hidden = true; }  // kamera yoqildi — vaqt sanala boshlaydi
      });
    };
    const enableBtn0 = document.getElementById("gaze-enable");
    if (enableBtn0) enableBtn0.onclick = enableCamera;

    // Faqat bosilganda yuklanadi va o'ynaydi
    const loadAndPlay = () => {
      if (loadBtn) loadBtn.style.display = "none";
      showSpin();
      if (!media.src) media.src = `/api/lessons/${l.id}/media`;
      playBtn.disabled = false;
      enableCamera();   // video uchun kamerani ham yoqishga urinamiz (ruxsat so'raladi)
      media.play().catch(() => { hideSpin(); setPlaying(false); });
    };
    const togglePlay = () => {
      if (!media.src) { loadAndPlay(); return; }
      if (media.paused) media.play(); else media.pause();
    };
    loadBtn.onclick = loadAndPlay;
    playBtn.onclick = togglePlay;
    bigPlay.onclick = togglePlay;
    // YouTube'dagidek: video ustiga bosilsa o'ynaydi/to'xtaydi (tugmalar bundan mustasno)
    box.addEventListener("click", (e) => {
      if (e.target.closest(".ytp-btn, .media-load-btn, .ytp-bigplay, .gaze-cam, .ytp-top")) return;
      togglePlay();
    });
    document.getElementById("pl-rewind").onclick = () => {
      if (media.src) media.currentTime = Math.max(0, media.currentTime - 10);
    };
    const toggleFs = () => {
      if (!document.fullscreenElement) { (box.requestFullscreen || box.webkitRequestFullscreen || (() => {})).call(box); }
      else { (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document); }
    };
    const fsBtn = document.getElementById("pl-fs");
    if (fsBtn) fsBtn.onclick = toggleFs;
    if (isVideo) box.addEventListener("dblclick", (e) => {   // YouTube'dagidek: ikki marta bosib to'liq ekran
      if (e.target.closest(".ytp-btn, .media-load-btn, .gaze-cam")) return;
      toggleFs();
    });
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
