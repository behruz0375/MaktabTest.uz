/* ===== O'QITUVCHI PANEL: testlar, natijalar, o'quvchilar, sozlamalar ===== */
const Teacher = {
  history: [],
  currentSection: null,
  questions: [],

  bind() {
    document.querySelectorAll(".side-btn[data-section]").forEach((btn) => {
      btn.onclick = () => this.showSection(btn.dataset.section, true);
    });
    document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => this.goBack()));
    document.getElementById("teacher-logout").onclick = () => this.logout();

    // Test qo'shish
    document.getElementById("ct-open-slots").onclick = () => this.openSlots();
    document.getElementById("ct-save").onclick = () => this.saveTest();

    // Natijalar
    document.getElementById("res-class").onchange = (e) => this.loadResults(e.target.value);
    document.getElementById("res-subject").onchange = () => { if (this.currentResClass) this.loadResults(this.currentResClass); };
    document.getElementById("res-refresh").onclick = () => { if (this.currentResClass) this.loadResults(this.currentResClass); };
    document.getElementById("exp-excel").onclick = () => this.exportExcel();
    document.getElementById("exp-pdf").onclick = () => this.exportPDF();
    // O'quvchilar
    document.getElementById("stu-class").onchange = (e) => this.loadStudents(e.target.value);
    document.getElementById("stu-add").onclick = () => this.addStudent();
    // Sozlamalar
    document.getElementById("set-save").onclick = () => this.saveCredentials();
    // Darslar (bilim olish)
    document.getElementById("ls-type").onchange = (e) => this.toggleLessonType(e.target.value);
    document.getElementById("ls-save").onclick = () => this.saveLesson();
    document.getElementById("ls-has-test").onchange = (e) => {
      document.getElementById("ls-test-builder").style.display = e.target.checked ? "" : "none";
    };
    document.getElementById("ls-open-slots").onclick = () => this.openLessonSlots();
    // Mutolaa natijalari
    document.getElementById("lrn-class").onchange = (e) => this.loadLearning(e.target.value);
    // Ota-onalar
    document.getElementById("par-class").onchange = (e) => this.loadParents(e.target.value);
    // O'qituvchilar
    document.getElementById("tch-add").onclick = () => this.addTeacher();
    // Statistika
    document.getElementById("stats-refresh").onclick = () => this.loadStats();
    // Maktablar (owner)
    document.getElementById("sch-add").onclick = () => this.addSchool();
    document.getElementById("school-exit").onclick = () => this.exitSchool();
    // Fayldan import
    document.getElementById("imp-btn").onclick = () => this.importTest();
    document.getElementById("imp-template").onclick = (e) => { e.preventDefault(); this.downloadTemplate(); };
    document.getElementById("tests-import-btn").onclick = () => {
      this.showSection("create");
      setTimeout(() => document.getElementById("import-card").scrollIntoView({ behavior: "smooth" }), 120);
    };
  },

  downloadTemplate() {
    const a = document.createElement("a");
    a.href = "/api/tests/import-template.csv"; a.download = "test_namuna.csv";
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast("Namuna fayl yuklandi. Excelда oching, to'ldiring, keyin yuklang.", "ok", 5000);
  },

  importTest() {
    const title = document.getElementById("imp-title").value.trim();
    const subject = document.getElementById("imp-subject").value;
    const cls = document.getElementById("imp-class").value;
    const duration = parseInt(document.getElementById("imp-duration").value, 10);
    const file = document.getElementById("imp-file").files[0];
    if (!title) return UI.toast("Test nomini kiriting", "err");
    if (!subject) return UI.toast("Fanni tanlang", "err");
    if (!cls) return UI.toast("Sinfni tanlang", "err");
    if (!duration || duration < 1) return UI.toast("Vaqtni (daqiqa) belgilang", "err");
    if (!file) return UI.toast("Fayl tanlang", "err");
    const fd = new FormData();
    fd.append("title", title); fd.append("subject", subject); fd.append("class_name", cls);
    fd.append("duration_minutes", duration); fd.append("file", file);
    const prog = document.getElementById("imp-progress");
    prog.textContent = "⏳ Yuklanmoqda va o'qilmoqda...";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/tests/import");
    xhr.onload = () => {
      let r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status === 200 && r.ok) {
        prog.textContent = "";
        this.showSaveModal(r);
        document.getElementById("imp-title").value = "";
        document.getElementById("imp-file").value = "";
      } else { prog.textContent = ""; UI.toast(r.error || "Import xatolik", "err", 6000); }
    };
    xhr.onerror = () => { prog.textContent = ""; UI.toast("Tarmoq xatosi", "err"); };
    xhr.send(fd);
  },

  toggleLessonType(type) {
    document.getElementById("ls-file-row").style.display = type === "text" ? "none" : "";
    document.getElementById("ls-text-row").style.display = type === "text" ? "" : "none";
    document.getElementById("ls-image-row").style.display = type === "text" ? "" : "none";
  },

  enter() {
    this.history = [];
    this.currentSection = null;
    const t = State.teacher || {};
    // Owner allaqachon maktabga kirgan bo'lishi mumkin (sessiya)
    if (t.role === "owner" && t.view_school_id) {
      this.viewSchool = { id: t.view_school_id, name: t.view_school_name };
    }
    this.applyRoleUI();
    const isOwner = t.role === "owner";
    if (isOwner && !this.viewSchool) this.showSection("schools", false);
    else this.showSection("stats", false);
    UI.showView("view-teacher");
  },

  applyRoleUI() {
    const t = State.teacher || {};
    const isOwner = t.role === "owner";
    const isAdmin = t.is_admin; // owner yoki zavuch
    const entered = isOwner ? !!this.viewSchool : true;
    const show = (sec, on) => { const b = document.querySelector(`.side-btn[data-section="${sec}"]`); if (b) b.style.display = on ? "" : "none"; };
    show("schools", isOwner);
    ["stats", "create", "tests", "lessons", "results", "live", "learning", "students"].forEach((s) => show(s, entered));
    ["teachers", "parents"].forEach((s) => show(s, isAdmin && entered));
    show("settings", true);
    const banner = document.getElementById("school-banner");
    if (isOwner && this.viewSchool) {
      banner.style.display = "flex";
      document.getElementById("school-banner-name").textContent = this.viewSchool.name;
    } else {
      banner.style.display = "none";
    }
    const brand = document.querySelector("#view-teacher .sidebar-brand span");
    if (brand) {
      const school = isOwner ? (this.viewSchool ? this.viewSchool.name : "") : (t.school_name || "");
      brand.innerHTML = `${UI.esc(t.role_label || "O'qituvchi")} paneli${school ? `<br><span style="font-size:.82rem;color:var(--muted)">🏫 ${UI.esc(school)}</span>` : ""}`;
    }
  },

  async enterSchool(school) {
    const res = await API.post("/api/owner/enter-school", { school_id: school.id });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    this.viewSchool = { id: res.school_id, name: res.school_name };
    this.applyRoleUI();
    this.showSection("stats", false);
    UI.toast(res.school_name + " boshqaruvidasiz", "ok");
  },
  async exitSchool() {
    await API.post("/api/owner/exit-school");
    this.viewSchool = null;
    this.applyRoleUI();
    this.showSection("schools", false);
  },

  async loadSchools() {
    const res = await API.get("/api/schools");
    if (!res.ok) return;
    document.getElementById("schools-count").textContent = res.count;
    const box = document.getElementById("schools-list");
    if (!res.schools.length) { box.innerHTML = '<p class="muted">Hali maktab qo\'shilmagan. Yuqoridan qo\'shing.</p>'; return; }
    box.innerHTML = "";
    res.schools.forEach((s) => {
      const card = document.createElement("div");
      card.className = "test-card";
      card.innerHTML = `
        <h3>🏫 ${UI.esc(s.name)}</h3>
        <div class="school-card-stats">
          <span>👥 ${s.students}</span><span>🧑‍🏫 ${s.teachers}</span><span>📋 ${s.tests} test</span>
        </div>
        <div class="muted">Zavuch: ${s.zavuch ? UI.esc(s.zavuch) : "—"}</div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" data-enter="${s.id}">⚙️ Boshqarish</button>
          <button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️ O'chirish</button>
        </div>`;
      card.querySelector("[data-enter]").onclick = () => this.enterSchool(s);
      card.querySelector("[data-del]").onclick = () => this.deleteSchool(s);
      box.appendChild(card);
    });
  },
  async addSchool() {
    const name = document.getElementById("sch-name").value.trim();
    const user = document.getElementById("sch-user").value.trim();
    const pass = document.getElementById("sch-pass").value;
    if (!name) return UI.toast("Maktab nomini kiriting", "err");
    if (!user) return UI.toast("Zavuch login kiriting", "err");
    if (pass.length < 4) return UI.toast("Parol kamida 4 ta belgi bo'lsin", "err");
    const res = await API.post("/api/schools", { name, username: user, password: pass });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.modal(`<span class="modal-icon">🏫</span><h2 style="text-align:center">Maktab yaratildi!</h2>
      <p style="text-align:center">"${UI.esc(name)}" uchun zavuch hisobi:</p>
      <div class="code-reveal"><div class="lbl">Login</div><div class="code" style="font-size:1.6rem;letter-spacing:2px">${UI.esc(res.username)}</div>
      <div class="lbl" style="margin-top:10px">Parol</div><div class="code" style="font-size:1.6rem;letter-spacing:2px">${UI.esc(res.password)}</div></div>
      <p class="muted" style="text-align:center">Bu ma'lumotni maktab zavuchiga bering.</p>
      <div style="text-align:center"><button class="btn btn-primary" id="sch-ok">Tushunarli 👍</button></div>`);
    document.getElementById("sch-ok").onclick = () => UI.closeModal();
    document.getElementById("sch-name").value = "";
    document.getElementById("sch-user").value = "";
    document.getElementById("sch-pass").value = "";
    this.loadSchools();
  },
  deleteSchool(s) {
    this.confirm("Maktabni o'chirish", `"${s.name}" va uning BARCHA ma'lumotlari (o'quvchilar, testlar, natijalar, o'qituvchilar) butunlay o'chiriladi!`, async () => {
      const res = await API.del(`/api/schools/${s.id}`);
      if (res.ok) { UI.toast("Maktab o'chirildi", "ok"); this.loadSchools(); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  showSection(id, push = true) {
    if (push && this.currentSection && this.currentSection !== id) {
      this.history.push(this.currentSection);
    }
    this.currentSection = id;
    document.querySelectorAll(".panel-section").forEach((s) => s.classList.remove("active"));
    const sec = document.getElementById("sec-" + id);
    if (sec) sec.classList.add("active");
    document.querySelectorAll(".side-btn[data-section]").forEach((b) =>
      b.classList.toggle("active", b.dataset.section === id)
    );
    if (id === "tests") this.loadTests();
    if (id === "results") this.renderResClassButtons();
    if (id === "lessons") this.loadLessons();
    if (id === "learning") this.renderLrnClassButtons();
    if (id === "stats") this.loadStats();
    if (id === "parents") this.renderParClassButtons();
    if (id === "teachers") this.loadTeachers();
    if (id === "live") this.startLive(); else this.stopLive();
    if (id === "schools") this.loadSchools();
    window.scrollTo(0, 0);
  },

  renderParClassButtons() {
    const box = document.getElementById("par-class-buttons");
    if (!box || box.dataset.done === "1") return;
    box.innerHTML = "";
    State.meta.classes.forEach((c) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.textContent = c;
      b.onclick = () => { document.getElementById("par-class").value = c; this.loadParents(c); };
      box.appendChild(b);
    });
    box.dataset.done = "1";
  },

  renderLrnClassButtons() {
    const box = document.getElementById("lrn-class-buttons");
    if (!box || box.dataset.done === "1") return;
    box.innerHTML = "";
    State.meta.classes.forEach((c) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.textContent = c;
      b.onclick = () => { document.getElementById("lrn-class").value = c; this.loadLearning(c); };
      box.appendChild(b);
    });
    box.dataset.done = "1";
  },

  renderResClassButtons() {
    const box = document.getElementById("res-class-buttons");
    if (!box || box.dataset.done === "1") return;
    box.innerHTML = "";
    State.meta.classes.forEach((c) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.textContent = c;
      b.onclick = () => {
        document.getElementById("res-class").value = c;
        this.loadResults(c);
      };
      box.appendChild(b);
    });
    box.dataset.done = "1";
  },

  /* ===== JONLI KUZATUV ===== */
  startLive() {
    const sel = document.getElementById("live-class");
    if (sel && sel.dataset.done !== "1") {
      State.meta.classes.forEach((c) => {
        const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o);
      });
      sel.dataset.done = "1";
      sel.onchange = () => this.loadLive();
    }
    this.loadLive();
    this.stopLive();
    this._liveTimer = setInterval(() => this.loadLive(), 4000);
    this._liveTick = setInterval(() => this.tickLive(), 1000);
  },
  stopLive() {
    if (this._liveTimer) { clearInterval(this._liveTimer); this._liveTimer = null; }
    if (this._liveTick) { clearInterval(this._liveTick); this._liveTick = null; }
  },
  fmtClock(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  },
  tickLive() {
    if (!this._live) return;
    this._live.forEach((a, i) => {
      if (a.remaining_seconds > 0) a.remaining_seconds--;
      const el = document.getElementById("live-time-" + i);
      if (el) { el.textContent = this.fmtClock(a.remaining_seconds); el.classList.toggle("warn", a.remaining_seconds <= 30); }
    });
  },
  async loadLive() {
    const selEl = document.getElementById("live-class");
    const cls = selEl ? selEl.value : "";
    const res = await API.get("/api/live" + (cls ? "?class_name=" + encodeURIComponent(cls) : ""));
    if (!res.ok) return;
    this._live = res.active;
    document.getElementById("live-count").textContent = res.count;
    document.getElementById("live-updated").textContent = "🔄 " + new Date().toLocaleTimeString();
    const box = document.getElementById("live-list");
    if (!res.active.length) {
      box.innerHTML = '<p class="muted">Hozir hech kim test yechmayapti' + (cls ? " (" + UI.esc(cls) + ")" : "") + '. O\'quvchi test boshlaganда shu yerda paydo bo\'ladi.</p>';
      return;
    }
    box.innerHTML = "";
    res.active.forEach((a, i) => {
      const initials = ((a.first_name[0] || "") + (a.last_name[0] || "")).toUpperCase();
      const row = document.createElement("div");
      row.className = "student-row";
      row.style.cursor = "default";
      row.innerHTML = `
        <div class="student-avatar" style="background:linear-gradient(135deg,#23c483,#12b8ff)">${UI.esc(initials)}</div>
        <div class="student-info">
          <div class="name">${UI.esc(a.last_name)} ${UI.esc(a.first_name)} <span class="role-tag role-teacher">${UI.esc(a.class_name)}</span></div>
          <div class="sub">📝 ${UI.esc(a.test_title)} • ${UI.esc(a.subject)} • 🔑 <b>${UI.esc(a.code)}</b> • ✍️ ${a.answered}/${a.q_total}</div>
        </div>
        <div class="live-timer">
          <span class="timer-label">Qolgan vaqt</span>
          <span class="live-time" id="live-time-${i}">${this.fmtClock(a.remaining_seconds)}</span>
        </div>`;
      box.appendChild(row);
    });
  },

  goBack() {
    if (this.history.length > 0) {
      this.showSection(this.history.pop(), false);
    } else {
      this.showSection("create", false);
    }
  },

  async logout() {
    this.stopLive();
    this.viewSchool = null;
    await API.post("/api/teacher/logout");
    State.teacher = null;
    UI.showView("view-login");
  },

  confirm(title, msg, onYes, danger = true) {
    UI.modal(`
      <span class="modal-icon">${danger ? "🗑️" : "❓"}</span>
      <h2 style="text-align:center">${UI.esc(title)}</h2>
      <p style="text-align:center">${UI.esc(msg)}</p>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="c-no">Bekor qilish</button>
        <button class="btn ${danger ? "btn-danger" : "btn-success"}" id="c-yes">Ha, davom etish</button>
      </div>
    `);
    document.getElementById("c-no").onclick = () => UI.closeModal();
    document.getElementById("c-yes").onclick = () => { UI.closeModal(); onYes(); };
  },

  /* =============== TEST QO'SHISH =============== */
  openSlots() {
    const n = parseInt(document.getElementById("ct-count").value, 10);
    if (!n || n < 1) return UI.toast("Nechta savol kerakligini kiriting", "err");
    if (n > 100) return UI.toast("Ko'pi bilan 100 ta savol bo'lsin", "err");
    this.questions = [];
    for (let i = 0; i < n; i++) this.questions.push({ text: "", a: "", b: "", c: "", d: "", correct: "" });
    this.renderSlots();
    document.getElementById("ct-save-bar").style.display = "flex";
    UI.toast(`${n} ta savol uchun joy ochildi`, "ok", 1800);
  },

  syncFromDOM() {
    const slots = document.querySelectorAll("#ct-questions .q-slot");
    this.questions = Array.from(slots).map((s) => ({
      text: s.querySelector(".qs-text").value,
      a: s.querySelector(".qs-a").value,
      b: s.querySelector(".qs-b").value,
      c: s.querySelector(".qs-c").value,
      d: s.querySelector(".qs-d").value,
      correct: s.querySelector(".qs-correct").value,
    }));
  },

  renderSlots() {
    const box = document.getElementById("ct-questions");
    box.innerHTML = "";
    this.questions.forEach((q, i) => box.appendChild(this.slotEl(q, i)));
    this.updateSaveInfo();
  },

  slotEl(q, i) {
    const el = document.createElement("div");
    el.className = "q-slot";
    el.innerHTML = `
      <div class="q-slot-head">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="q-slot-num">${i + 1}</span>
          <b>${i + 1}-savol</b>
        </div>
        <button class="q-del" title="Bu savolni o'chirish">🗑️</button>
      </div>
      <textarea class="qs-text" placeholder="Savol matnini yozing...">${UI.esc(q.text)}</textarea>
      <div class="opt-grid">
        <div class="opt-input"><span class="opt-tag">A</span><input class="qs-a" placeholder="A varianti" value="${UI.esc(q.a)}"></div>
        <div class="opt-input"><span class="opt-tag">B</span><input class="qs-b" placeholder="B varianti" value="${UI.esc(q.b)}"></div>
        <div class="opt-input"><span class="opt-tag">C</span><input class="qs-c" placeholder="C varianti" value="${UI.esc(q.c)}"></div>
        <div class="opt-input"><span class="opt-tag">D</span><input class="qs-d" placeholder="D varianti" value="${UI.esc(q.d)}"></div>
      </div>
      <div class="correct-row">
        <label>✅ To'g'ri javob:</label>
        <select class="qs-correct">
          <option value="">— tanlang —</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
    `;
    el.querySelector(".qs-correct").value = q.correct || "";
    el.querySelector(".q-del").onclick = () => {
      this.syncFromDOM();
      this.questions.splice(i, 1);
      this.renderSlots();
      if (this.questions.length === 0) {
        document.getElementById("ct-save-bar").style.display = "none";
      }
      UI.toast("Savol o'chirildi, tartib yangilandi", "info", 1500);
    };
    return el;
  },

  updateSaveInfo() {
    document.getElementById("ct-save-info").textContent =
      `Jami savollar: ${this.questions.length} ta`;
  },

  async saveTest() {
    this.syncFromDOM();
    const title = document.getElementById("ct-title").value.trim();
    const subject = document.getElementById("ct-subject").value;
    const class_name = document.getElementById("ct-class").value;
    const duration = parseInt(document.getElementById("ct-duration").value, 10);

    if (!title) return UI.toast("Test nomini kiriting", "err");
    if (!subject) return UI.toast("Fanni tanlang", "err");
    if (!class_name) return UI.toast("Sinfni tanlang", "err");
    if (!duration || duration < 1) return UI.toast("Vaqtni (daqiqa) belgilang", "err");
    if (!this.questions.length) return UI.toast("Kamida 1 ta savol qo'shing", "err");

    for (let i = 0; i < this.questions.length; i++) {
      const q = this.questions[i];
      if (!q.text.trim()) return UI.toast(`${i + 1}-savol matni bo'sh`, "err");
      if (!q.a.trim() || !q.b.trim() || !q.c.trim() || !q.d.trim())
        return UI.toast(`${i + 1}-savolning barcha variantlarini to'ldiring`, "err");
      if (!["A", "B", "C", "D"].includes(q.correct))
        return UI.toast(`${i + 1}-savol uchun to'g'ri javobni tanlang`, "err");
    }

    const payload = {
      title, subject, class_name, duration_minutes: duration,
      questions: this.questions.map((q) => ({
        text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, correct_option: q.correct,
      })),
    };
    const res = await API.post("/api/tests", payload);
    if (!res.ok) return UI.toast(res.error || "Saqlashda xatolik", "err");

    this.showSaveModal(res);
    // Formani tozalaymiz
    document.getElementById("ct-title").value = "";
    document.getElementById("ct-count").value = "";
    document.getElementById("ct-questions").innerHTML = "";
    this.questions = [];
    document.getElementById("ct-save-bar").style.display = "none";
  },

  showSaveModal(res) {
    UI.modal(`
      <span class="modal-icon">✅</span>
      <h2 style="text-align:center">Test muvaffaqiyatli saqlandi!</h2>
      <div class="modal-info-grid">
        <div class="info-box"><div class="k">Savollar</div><div class="v">${res.question_count} ta</div></div>
        <div class="info-box"><div class="k">Fan</div><div class="v" style="font-size:1.05rem">${UI.esc(res.subject)}</div></div>
        <div class="info-box"><div class="k">Sinf</div><div class="v">${UI.esc(res.class_name)}</div></div>
        <div class="info-box"><div class="k">Vaqt</div><div class="v">${res.duration_minutes} daqiqa</div></div>
      </div>
      <div class="code-reveal">
        <div class="lbl">O'quvchilar uchun kirish kodi:</div>
        <div class="code">${res.code}</div>
        <div class="lbl">⚠️ Test hali <b>boshlanmagan</b>. "Start berish"ни bosmaguningizcha o'quvchilar kira olmaydi.</div>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-ghost" id="save-ok">Keyinroq (Tushunarli)</button>
        <button class="btn btn-success btn-lg" id="save-start">▶️ Start berish</button>
      </div>
    `);
    document.getElementById("save-ok").onclick = () => { UI.closeModal(); if (this.currentSection === "tests") this.loadTests(); };
    document.getElementById("save-start").onclick = async () => {
      const r = await API.post(`/api/tests/${res.test_id}/start`);
      if (r.ok) { UI.toast("✅ Test boshlandi! O'quvchilar shu kod bilan kira oladi.", "ok", 5000); UI.closeModal(); if (this.currentSection === "tests") this.loadTests(); }
      else UI.toast(r.error || "Xatolik", "err");
    };
  },

  /* =============== TESTLARIM =============== */
  async loadTests() {
    const res = await API.get("/api/tests");
    const box = document.getElementById("tests-list");
    if (!res.ok) { box.innerHTML = '<p class="muted">Yuklashda xatolik</p>'; return; }
    if (!res.tests.length) { box.innerHTML = '<p class="muted">Hali test qo\'shilmagan. "Test qo\'shish" bo\'limiga o\'ting.</p>'; return; }
    box.innerHTML = "";
    res.tests.forEach((t) => {
      const card = document.createElement("div");
      card.className = "test-card";
      card.innerHTML = `
        <h3>${UI.esc(t.title)}</h3>
        <div class="chips">
          <span class="chip">${UI.esc(t.subject)}</span>
          <span class="chip">${UI.esc(t.class_name)}</span>
          <span class="chip">${t.duration_minutes} daq</span>
          <span class="chip">${t.question_count} savol</span>
          <span class="chip ${t.is_active ? "on" : "off"}">${t.is_active ? "Faol" : "Yopiq"}</span>
        </div>
        <div class="code-big">${t.code}</div>
        <div class="muted" style="text-align:center">Topshirganlar: ${t.submission_count} ta</div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" data-act="code">🔄 Yangi kod</button>
          <button class="btn btn-ghost btn-sm" data-act="toggle">${t.is_active ? "⏸️ Yopish" : "▶️ Ochish"}</button>
          ${t.is_active ? '<button class="btn btn-danger btn-sm" data-act="stop">⏹️ To\'xtatish</button>' : ""}
          <button class="btn btn-danger btn-sm" data-act="del">🗑️ O'chirish</button>
        </div>
      `;
      card.querySelector('[data-act="code"]').onclick = () => this.regenCode(t.id);
      card.querySelector('[data-act="toggle"]').onclick = () => this.toggleTest(t.id);
      const stopBtn = card.querySelector('[data-act="stop"]');
      if (stopBtn) stopBtn.onclick = () => this.stopTest(t.id, t.title);
      card.querySelector('[data-act="del"]').onclick = () => this.deleteTest(t.id, t.title);
      box.appendChild(card);
    });
  },

  async regenCode(id) {
    const res = await API.post(`/api/tests/${id}/regenerate-code`);
    if (res.ok) { UI.toast("Yangi kod: " + res.code, "ok", 5000); this.loadTests(); }
    else UI.toast(res.error || "Xatolik", "err");
  },
  async toggleTest(id) {
    const res = await API.post(`/api/tests/${id}/toggle`);
    if (res.ok) this.loadTests();
    else UI.toast(res.error || "Xatolik", "err");
  },
  stopTest(id, title) {
    this.confirm("Testni to'xtatish", `"${title}" testi to'xtatiladi. Hozir yechayotgan o'quvchilar tugatiladi (joriy javoblari saqlanadi) va yangi kirish yopiladi.`, async () => {
      const res = await API.post(`/api/tests/${id}/stop`);
      if (res.ok) { UI.toast(`Test to'xtatildi (${res.stopped} ta yechayotgan yakunlandi)`, "ok", 4000); this.loadTests(); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },
  deleteTest(id, title) {
    this.confirm("Testni o'chirish", `"${title}" testi va uning natijalari o'chiriladi. Davom etasizmi?`, async () => {
      const res = await API.del(`/api/tests/${id}`);
      if (res.ok) { UI.toast("Test o'chirildi", "ok"); this.loadTests(); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  /* =============== NATIJALAR VA XAVFSIZLIK =============== */
  bestStats(s) {
    if (!s.submissions.length) return null;
    const maxPct = Math.max(...s.submissions.map((x) => x.percentage));
    const minDur = Math.min(...s.submissions.filter((x) => x.percentage === maxPct).map((x) => x.duration_seconds || 0));
    return { pct: maxPct, dur: minDur, count: s.submissions.length };
  },
  bahoOf(pct) { return pct >= 87 ? 5 : pct >= 71 ? 4 : pct >= 55 ? 3 : pct >= 40 ? 2 : 1; },

  starsFor(pct) {
    const n = pct >= 90 ? 5 : pct >= 75 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : 1;
    let out = "";
    for (let i = 0; i < 5; i++) out += `<span class="${i < n ? "" : "empty"}">★</span>`;
    return `<span class="stars">${out}</span>`;
  },

  async loadResults(cls) {
    if (!cls) return;
    document.querySelectorAll("#res-class-buttons .class-btn").forEach((b) =>
      b.classList.toggle("active", b.textContent === cls)
    );
    const subj = document.getElementById("res-subject").value;
    const titleEl = document.getElementById("results-title");
    const res = await API.get("/api/results?class_name=" + encodeURIComponent(cls));
    const box = document.getElementById("results-list");
    if (!res.ok) { box.innerHTML = ""; UI.toast(res.error || "Xatolik", "err"); return; }
    titleEl.style.display = "flex";
    titleEl.innerHTML = `🏆 ${UI.esc(cls)} sinf — natijalar${subj ? " • " + UI.esc(subj) : ""}`;
    this.currentResClass = cls;
    document.getElementById("results-export").style.display = "flex";
    if (!res.students.length) {
      box.innerHTML = '<p class="muted">Bu sinfda o\'quvchi yo\'q. "O\'quvchilar ro\'yxati" bo\'limidan qo\'shing yoki o\'quvchilar test topshirsa avtomatik paydo bo\'ladi.</p>';
      return;
    }
    box.innerHTML = "";
    // Fan bo'yicha filtr (mijoz tomonида)
    const prep = res.students.map((s) => {
      const subs = subj ? s.submissions.filter((x) => x.subject === subj) : s.submissions;
      return { ...s, submissions: subs, submitted: subs.length > 0, has_violation: subs.some((x) => x.status === "terminated") };
    });
    const submitted = prep.filter((s) => s.submitted);
    const pending = prep.filter((s) => !s.submitted);
    const ranked = submitted.map((s) => ({ s, st: this.bestStats(s), baho: 0 }));
    ranked.forEach((r) => (r.baho = this.bahoOf(r.st.pct)));
    ranked.sort((a, b) => (b.st.pct - a.st.pct) || (a.st.dur - b.st.dur));
    const rankMap = new Map();
    ranked.forEach(({ s }, i) => rankMap.set(s.id, i + 1));
    // 1) BARCHA topshirgan o'quvchilar (reyting bo'yicha)
    const allG = document.createElement("div");
    allG.className = "baho-group";
    allG.innerHTML = `<div class="baho-group-title">👥 Barcha natijalar (reyting) — ${submitted.length} ta</div>`;
    const allL = document.createElement("div"); allL.className = "results-list";
    ranked.forEach(({ s, st }) => allL.appendChild(this._resultRow(s, st, rankMap.get(s.id))));
    allG.appendChild(allL); box.appendChild(allG);

    // 2) Baho bo'yicha guruhlar (5/4/3/2/1)
    const groups = [
      { baho: 5, cls: "baho-5", label: "5 baho olganlar (A'lo)" },
      { baho: 4, cls: "baho-4", label: "4 baho olganlar (Yaxshi)" },
      { baho: 3, cls: "baho-3", label: "3 baho olganlar (Qoniqarli)" },
      { baho: 2, cls: "baho-2", label: "2 baho olganlar" },
      { baho: 1, cls: "baho-2", label: "1 baho olganlar" },
    ];
    groups.forEach((g) => {
      const items = ranked.filter((r) => r.baho === g.baho);
      if (!items.length) return;
      const groupEl = document.createElement("div");
      groupEl.className = "baho-group";
      groupEl.innerHTML = `<div class="baho-group-title"><span class="baho-badge ${g.cls}">${g.baho}</span> ${g.label} — ${items.length} ta</div>`;
      const list = document.createElement("div");
      list.className = "results-list";
      items.forEach(({ s, st }) => list.appendChild(this._resultRow(s, st, rankMap.get(s.id))));
      groupEl.appendChild(list);
      box.appendChild(groupEl);
    });
    // Topshirmaganlar
    if (pending.length) {
      const groupEl = document.createElement("div");
      groupEl.className = "baho-group";
      groupEl.innerHTML = `<div class="baho-group-title"><span class="baho-badge baho-none">?</span> Hali topshirmaganlar — ${pending.length} ta</div>`;
      const list = document.createElement("div");
      list.className = "results-list";
      pending.forEach((s) => {
        const initials = ((s.first_name[0] || "") + (s.last_name[0] || "")).toUpperCase();
        const row = document.createElement("div");
        row.className = "student-row" + (s.blocked ? " blocked" : "");
        row.innerHTML = `
          <div class="student-avatar">${UI.esc(initials)}</div>
          <div class="student-info">
            <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</div>
            <div class="sub">natija yo'q</div>
          </div>
          <span class="status-pill pending">❓ Hali topshirmagan</span>`;
        row.onclick = () => this.showStudentDetail(s, null);
        list.appendChild(row);
      });
      groupEl.appendChild(list);
      box.appendChild(groupEl);
    }
  },

  _resultRow(s, st, rank) {
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
    const badgeCls = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
    const initials = ((s.first_name[0] || "") + (s.last_name[0] || "")).toUpperCase();
    const pill = s.has_violation
      ? '<span class="status-pill danger">⚠️ Xavf</span>'
      : `<span class="status-pill done">${st.count} ta test</span>`;
    const row = document.createElement("div");
    row.className = "student-row" + (rank === 1 ? " top1" : "") + (s.blocked ? " blocked" : "");
    row.innerHTML = `
      <div class="rank-badge ${badgeCls}">${medal}</div>
      <div class="student-avatar">${UI.esc(initials)}</div>
      <div class="student-info">
        <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}${s.blocked ? ' <span class="pill-blocked">bloklangan</span>' : ""}</div>
        <div class="rank-meta">
          ${this.starsFor(st.pct)}
          <span class="rank-score">Eng yaxshi: ${st.pct}% • ${this.fmtDur(st.dur)}${s.monthly_pct != null ? ` • 📅 bu oy: ${s.monthly_pct}%` : ""}</span>
        </div>
      </div>
      ${pill}`;
    row.onclick = () => this.showStudentDetail(s, rank);
    return row;
  },

  fmtDur(sec) {
    sec = sec || 0;
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} daq ${s} s` : `${s} s`;
  },

  showStudentDetail(s, rank) {
    let body, header = "";
    if (!s.submissions.length) {
      body = `<p class="muted" style="text-align:center;padding:20px">Bu o'quvchi hali biror test topshirmagan. ❓</p>`;
    } else {
      const st = this.bestStats(s);
      const rankTxt = rank ? `<span class="status-pill done">🏆 ${rank}-o'rin</span>` : "";
      header = `
        <div class="modal-info-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="info-box"><div class="k">Eng yaxshi ball</div><div class="v">${st.pct}%</div></div>
          <div class="info-box"><div class="k">Eng tez vaqt</div><div class="v" style="font-size:1.05rem">${this.fmtDur(st.dur)}</div></div>
          <div class="info-box"><div class="k">Testlar</div><div class="v">${st.count} ta</div></div>
        </div>
        <div style="text-align:center;margin:6px 0 14px;font-size:1.3rem">${this.starsFor(st.pct)} &nbsp; ${rankTxt}</div>
      `;
      const rows = s.submissions.map((sub) => {
        const status = sub.status === "terminated"
          ? `<span class="status-pill danger">⚠️ ${UI.esc(sub.violation_reason || "Xavf")}</span>`
          : `<span class="status-pill done">✔ Topshirildi</span>`;
        return `<tr>
          <td>${UI.esc(sub.submitted_at || "-")}</td>
          <td><b>${UI.esc(sub.test_title)}</b><br><span class="muted">${UI.esc(sub.subject)}</span></td>
          <td><b>${sub.score}/${sub.total}</b></td>
          <td>${sub.percentage}%</td>
          <td>${this.fmtDur(sub.duration_seconds)}</td>
          <td>${status}</td>
          <td><button class="btn btn-secondary btn-sm" data-retake="${sub.test_id}">🔁 Qayta</button></td>
        </tr>`;
      }).join("");
      body = `<div style="overflow-x:auto"><table class="sub-table">
        <thead><tr><th>Sana/vaqt</th><th>Test</th><th>Ball</th><th>Foiz</th><th>Davomiylik</th><th>Holat</th><th>Amal</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }
    UI.modal(`
      <h2>${UI.esc(s.last_name)} ${UI.esc(s.first_name)} <span class="muted" style="font-size:1rem">(${UI.esc(s.class_name)})</span></h2>
      ${header}
      <p class="muted">Topshirgan testlar tarixi:</p>
      ${body}
    `, { large: true });
    document.querySelectorAll("[data-retake]").forEach((b) => {
      b.onclick = () => this.grantRetake(b.dataset.retake, s.id);
    });
  },

  async grantRetake(testId, studentId) {
    const res = await API.post(`/api/tests/${testId}/retake`, { student_id: parseInt(studentId, 10) });
    if (res.ok) {
      UI.closeModal();
      UI.toast("Ruxsat berildi! O'quvchi shu kod bilan qayta kira oladi.", "ok", 5000);
      const cls = document.getElementById("res-class").value;
      if (cls) this.loadResults(cls);
    } else UI.toast(res.error || "Xatolik", "err");
  },

  /* =============== O'QUVCHILAR RO'YXATI =============== */
  async loadStudents(cls) {
    if (!cls) return;
    document.getElementById("stu-add-box").style.display = "flex";
    const res = await API.get("/api/students?class_name=" + encodeURIComponent(cls));
    const box = document.getElementById("students-list");
    if (!res.ok) { box.innerHTML = ""; return; }
    if (!res.students.length) { box.innerHTML = '<p class="muted">Bu sinfda hali o\'quvchi yo\'q. Yuqoridan qo\'shing.</p>'; return; }
    box.innerHTML = "";
    const isAdmin = State.teacher && State.teacher.is_admin; // direktor/zavuch
    res.students.forEach((s) => {
      const row = document.createElement("div");
      row.className = "student-row" + (s.blocked ? " blocked" : "");
      row.style.cursor = "default";
      const initials = ((s.first_name[0] || "") + (s.last_name[0] || "")).toUpperCase();
      const parentBtn = isAdmin ? `<button class="btn btn-secondary btn-sm" data-parent="${s.id}">👪 Ota-ona logini</button>` : "";
      const blockBtn = isAdmin ? `<button class="btn btn-ghost btn-sm" data-block="${s.id}">${s.blocked ? "✅ Blokdan chiqarish" : "🚫 Bloklash"}</button>` : "";
      row.innerHTML = `
        <div class="student-avatar">${UI.esc(initials)}</div>
        <div class="student-info">
          <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}${s.blocked ? ' <span class="pill-blocked">bloklangan</span>' : ""}</div>
          <div class="sub">${UI.esc(s.class_name)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${parentBtn}
          ${blockBtn}
          <button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️ O'chirish</button>
        </div>
      `;
      row.querySelector("[data-del]").onclick = () => this.deleteStudent(s.id, s, cls);
      if (isAdmin) {
        row.querySelector("[data-parent]").onclick = () => this.generateParent(s);
        row.querySelector("[data-block]").onclick = () => this.toggleBlock(s, cls);
      }
      box.appendChild(row);
    });
  },

  async toggleBlock(s, cls) {
    const res = await API.post(`/api/students/${s.id}/block`, { blocked: !s.blocked });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.toast(res.blocked ? "O'quvchi bloklandi 🚫" : "Blokdan chiqarildi ✅", "ok");
    this.loadStudents(cls);
  },

  async addStudent() {
    const cls = document.getElementById("stu-class").value;
    const first = document.getElementById("stu-first").value.trim();
    const last = document.getElementById("stu-last").value.trim();
    if (!cls) return UI.toast("Avval sinfni tanlang", "err");
    if (!first || !last) return UI.toast("Ism va familiyani kiriting", "err");
    const res = await API.post("/api/students", { first_name: first, last_name: last, class_name: cls });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.toast("O'quvchi qo'shildi ✔", "ok");
    document.getElementById("stu-first").value = "";
    document.getElementById("stu-last").value = "";
    this.loadStudents(cls);
  },

  deleteStudent(id, s, cls) {
    this.confirm("O'quvchini o'chirish", `${s.last_name} ${s.first_name} ro'yxatdan o'chiriladi.`, async () => {
      const res = await API.del(`/api/students/${id}`);
      if (res.ok) { UI.toast("O'chirildi", "ok"); this.loadStudents(cls); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  /* =============== SOZLAMALAR =============== */
  async saveCredentials() {
    const current = document.getElementById("set-current").value;
    const user = document.getElementById("set-user").value.trim();
    const pass = document.getElementById("set-pass").value;
    if (!current) return UI.toast("Joriy parolni kiriting", "err");
    if (!user) return UI.toast("Yangi login kiriting", "err");
    if (pass.length < 4) return UI.toast("Yangi parol kamida 4 ta belgi bo'lsin", "err");
    const res = await API.post("/api/teacher/credentials", {
      current_password: current, new_username: user, new_password: pass,
    });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.toast("Login va parol yangilandi! ✔", "ok");
    document.getElementById("set-current").value = "";
    document.getElementById("set-user").value = "";
    document.getElementById("set-pass").value = "";
    State.teacher = res.teacher;
  },

  /* =============== DARSLAR (BILIM OLISH) =============== */
  async loadLessons() {
    const res = await API.get("/api/lessons");
    const box = document.getElementById("lessons-admin-list");
    if (!res.ok || !res.lessons.length) { box.innerHTML = '<p class="muted">Hali dars qo\'shilmagan.</p>'; return; }
    const icons = { video: "🎬", audio: "🎧", text: "📖" };
    box.innerHTML = "";
    res.lessons.forEach((l) => {
      const card = document.createElement("div");
      card.className = "test-card";
      card.innerHTML = `
        <h3>${icons[l.type] || "📘"} ${UI.esc(l.title)}</h3>
        <div class="chips">
          <span class="chip">${UI.esc(l.subject)}</span>
          <span class="chip">${UI.esc(l.class_name)}</span>
          <span class="chip">🪙 ${l.coins_reward}</span>
          ${l.related_test ? '<span class="chip on">📝 test biriktirilgan</span>' : ""}
        </div>
        <div class="card-actions"><button class="btn btn-danger btn-sm" data-del="${l.id}">🗑️ O'chirish</button></div>`;
      card.querySelector("[data-del]").onclick = () => this.deleteLesson(l.id, l.title);
      box.appendChild(card);
    });
  },

  /* Darsdan keyingi test uchun savol joylari */
  openLessonSlots() {
    const n = parseInt(document.getElementById("ls-test-count").value, 10);
    if (!n || n < 1) return UI.toast("Nechta savol kerakligini kiriting", "err");
    if (n > 50) return UI.toast("Ko'pi bilan 50 ta savol", "err");
    this.lessonQuestions = [];
    for (let i = 0; i < n; i++) this.lessonQuestions.push({ text: "", a: "", b: "", c: "", d: "", correct: "" });
    this.renderLessonSlots();
  },
  syncLessonFromDOM() {
    const slots = document.querySelectorAll("#ls-questions .q-slot");
    this.lessonQuestions = Array.from(slots).map((s) => ({
      text: s.querySelector(".qs-text").value, a: s.querySelector(".qs-a").value,
      b: s.querySelector(".qs-b").value, c: s.querySelector(".qs-c").value,
      d: s.querySelector(".qs-d").value, correct: s.querySelector(".qs-correct").value,
    }));
  },
  renderLessonSlots() {
    const box = document.getElementById("ls-questions");
    box.innerHTML = "";
    this.lessonQuestions.forEach((q, i) => box.appendChild(this.lessonSlotEl(q, i)));
  },
  lessonSlotEl(q, i) {
    const el = document.createElement("div");
    el.className = "q-slot";
    el.innerHTML = `
      <div class="q-slot-head">
        <div style="display:flex;align-items:center;gap:12px"><span class="q-slot-num">${i + 1}</span><b>${i + 1}-savol</b></div>
        <button class="q-del" title="O'chirish">🗑️</button>
      </div>
      <textarea class="qs-text" placeholder="Savol matni...">${UI.esc(q.text)}</textarea>
      <div class="opt-grid">
        <div class="opt-input"><span class="opt-tag">A</span><input class="qs-a" placeholder="A varianti" value="${UI.esc(q.a)}"></div>
        <div class="opt-input"><span class="opt-tag">B</span><input class="qs-b" placeholder="B varianti" value="${UI.esc(q.b)}"></div>
        <div class="opt-input"><span class="opt-tag">C</span><input class="qs-c" placeholder="C varianti" value="${UI.esc(q.c)}"></div>
        <div class="opt-input"><span class="opt-tag">D</span><input class="qs-d" placeholder="D varianti" value="${UI.esc(q.d)}"></div>
      </div>
      <div class="correct-row"><label>✅ To'g'ri javob:</label>
        <select class="qs-correct"><option value="">— tanlang —</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select>
      </div>`;
    el.querySelector(".qs-correct").value = q.correct || "";
    el.querySelector(".q-del").onclick = () => {
      this.syncLessonFromDOM();
      this.lessonQuestions.splice(i, 1);
      this.renderLessonSlots();
    };
    return el;
  },

  async saveLesson() {
    const title = document.getElementById("ls-title").value.trim();
    const subject = document.getElementById("ls-subject").value;
    const cls = document.getElementById("ls-class").value;
    const type = document.getElementById("ls-type").value;
    const coins = document.getElementById("ls-coins").value || "";
    if (!title) return UI.toast("Dars nomini kiriting", "err");
    if (!subject) return UI.toast("Fanni tanlang", "err");
    if (!cls) return UI.toast("Sinfni tanlang", "err");

    // Darsdan keyingi test (qo'lda yozilgan) — avval testni yaratamiz
    let relatedTestId = null;
    if (document.getElementById("ls-has-test").checked) {
      this.syncLessonFromDOM();
      if (!this.lessonQuestions.length) return UI.toast("Test uchun savol qo'shing yoki test belgisini oching", "err");
      for (let i = 0; i < this.lessonQuestions.length; i++) {
        const q = this.lessonQuestions[i];
        if (!q.text.trim()) return UI.toast(`Test: ${i + 1}-savol matni bo'sh`, "err");
        if (!q.a.trim() || !q.b.trim() || !q.c.trim() || !q.d.trim()) return UI.toast(`Test: ${i + 1}-savol variantlarini to'ldiring`, "err");
        if (!["A", "B", "C", "D"].includes(q.correct)) return UI.toast(`Test: ${i + 1}-savol to'g'ri javobini tanlang`, "err");
      }
      const dur = parseInt(document.getElementById("ls-test-dur").value, 10) || 10;
      const tRes = await API.post("/api/tests", {
        title: title + " — dars testi", subject, class_name: cls, duration_minutes: dur,
        questions: this.lessonQuestions.map((q) => ({ text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, correct_option: q.correct })),
      });
      if (!tRes.ok) return UI.toast("Test yaratishda xato: " + (tRes.error || ""), "err");
      relatedTestId = tRes.test_id;
    }

    const fd = new FormData();
    fd.append("title", title); fd.append("subject", subject); fd.append("class_name", cls);
    fd.append("type", type); fd.append("coins_reward", coins);
    if (relatedTestId) fd.append("related_test_id", relatedTestId);
    if (type === "text") {
      const txt = document.getElementById("ls-text").value.trim();
      if (!txt) return UI.toast("Matnni kiriting", "err");
      fd.append("text_content", txt);
      const imgFile = document.getElementById("ls-image").files[0];
      if (imgFile) fd.append("image", imgFile);
    } else {
      const f = document.getElementById("ls-file").files[0];
      if (!f) return UI.toast("Video yoki audio fayl tanlang", "err");
      fd.append("file", f);
    }

    const prog = document.getElementById("ls-progress");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/lessons");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) prog.textContent = "Yuklanmoqda: " + Math.round((e.loaded / e.total) * 100) + "%";
    };
    xhr.onload = () => {
      let r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status === 200 && r.ok) {
        prog.textContent = "";
        UI.toast("Dars saqlandi ✔", "ok");
        document.getElementById("ls-title").value = "";
        document.getElementById("ls-text").value = "";
        document.getElementById("ls-file").value = "";
        document.getElementById("ls-image").value = "";
        document.getElementById("ls-coins").value = "";
        document.getElementById("ls-has-test").checked = false;
        document.getElementById("ls-test-builder").style.display = "none";
        document.getElementById("ls-questions").innerHTML = "";
        this.lessonQuestions = [];
        this.loadLessons();
      } else { prog.textContent = ""; UI.toast(r.error || "Yuklashda xatolik", "err"); }
    };
    xhr.onerror = () => { prog.textContent = ""; UI.toast("Tarmoq xatosi", "err"); };
    prog.textContent = "Yuklanmoqda...";
    xhr.send(fd);
  },

  deleteLesson(id, title) {
    this.confirm("Darsni o'chirish", `"${title}" darsi o'chiriladi.`, async () => {
      const res = await API.del(`/api/lessons/${id}`);
      if (res.ok) { UI.toast("O'chirildi", "ok"); this.loadLessons(); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  /* =============== MUTOLAA NATIJALARI =============== */
  async loadLearning(cls) {
    if (!cls) return;
    document.querySelectorAll("#lrn-class-buttons .class-btn").forEach((b) => b.classList.toggle("active", b.textContent === cls));
    const res = await API.get("/api/learning/results?class_name=" + encodeURIComponent(cls));
    const box = document.getElementById("learning-list");
    const title = document.getElementById("learning-title");
    if (!res.ok) { box.innerHTML = ""; UI.toast(res.error || "Xatolik", "err"); return; }
    title.style.display = "flex";
    title.innerHTML = `🎓 ${UI.esc(cls)} sinf — mutolaa reytingi (coin bo'yicha)`;
    if (!res.students.length) { box.innerHTML = '<p class="muted">Bu sinfda ma\'lumot yo\'q.</p>'; return; }
    box.innerHTML = "";
    res.students.forEach((s, i) => {
      const rank = i + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      const badgeCls = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
      const row = document.createElement("div");
      row.className = "student-row" + (rank === 1 && s.coins > 0 ? " top1" : "");
      row.style.cursor = "default";
      row.innerHTML = `
        <div class="rank-badge ${badgeCls}">${medal}</div>
        <div class="student-info">
          <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</div>
          <div class="sub">🎬 ${s.videos} video • 🎧 ${s.audios} audio • 📖 ${s.texts} matn</div>
        </div>
        <span class="coin-badge">🪙 ${s.coins}</span>`;
      box.appendChild(row);
    });
  },

  /* =============== EKSPORT =============== */
  exportExcel() {
    const cls = this.currentResClass;
    if (!cls) return UI.toast("Avval sinfni tanlang", "err");
    const a = document.createElement("a");
    a.href = "/api/export/results.csv?class_name=" + encodeURIComponent(cls);
    a.download = "natijalar_" + cls + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast("Excel (CSV) fayl yuklab olindi", "ok");
  },

  async exportPDF() {
    const cls = this.currentResClass;
    if (!cls) return UI.toast("Avval sinfni tanlang", "err");
    const res = await API.get("/api/results?class_name=" + encodeURIComponent(cls));
    if (!res.ok) return UI.toast("Xatolik", "err");
    const submitted = res.students.filter((s) => s.submitted).map((s) => ({ s, st: this.bestStats(s) }));
    submitted.sort((a, b) => (b.st.pct - a.st.pct) || (a.st.dur - b.st.dur));
    const pending = res.students.filter((s) => !s.submitted);
    let rows = "";
    submitted.forEach(({ s, st }, i) => {
      rows += `<tr><td>${i + 1}</td><td>${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</td><td>${st.pct}%</td><td>${this.fmtDur(st.dur)}</td><td>${st.count}</td><td>${s.has_violation ? "⚠️ Xavf" : "OK"}</td></tr>`;
    });
    pending.forEach((s) => {
      rows += `<tr><td>-</td><td>${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</td><td colspan="4">Topshirmagan</td></tr>`;
    });
    const w = window.open("", "_blank");
    if (!w) return UI.toast("Popup bloklangan — ruxsat bering", "err");
    w.document.write(`<html><head><title>Natijalar ${UI.esc(cls)}</title><meta charset="utf-8">
      <style>body{font-family:Arial,sans-serif;padding:24px}h1{color:#6a41ff}
      table{border-collapse:collapse;width:100%;margin-top:12px}
      th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#efe9ff}
      tr:nth-child(even){background:#f7f7ff}</style></head>
      <body><h1>🏆 ${UI.esc(cls)} sinf — natijalar reytingi</h1>
      <table><thead><tr><th>O'rin</th><th>O'quvchi</th><th>Foiz</th><th>Vaqt</th><th>Testlar</th><th>Holat</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="margin-top:16px;color:#888">MaktabTest.uz</p>
      <scr` + `ipt>window.onload=function(){window.print()}</scr` + `ipt></body></html>`);
    w.document.close();
  },

  /* =============== OTA-ONA LOGINI (o'quvchilar ro'yxatidan) =============== */
  generateParent(s) {
    this.genParentFor(s.id);
  },

  /* =============== OTA-ONALAR (login ro'yxati) =============== */
  async loadParents(cls) {
    if (!cls) return;
    document.querySelectorAll("#par-class-buttons .class-btn").forEach((b) => b.classList.toggle("active", b.textContent === cls));
    this.currentParClass = cls;
    const res = await API.get("/api/parents?class_name=" + encodeURIComponent(cls));
    const box = document.getElementById("parents-list");
    if (!res.ok) { box.innerHTML = ""; UI.toast(res.error || "Xatolik", "err"); return; }
    if (!res.students.length) { box.innerHTML = '<p class="muted">Bu sinfda o\'quvchi yo\'q.</p>'; return; }
    box.innerHTML = "";
    res.students.forEach((s) => {
      const row = document.createElement("div");
      row.className = "parent-cred";
      const creds = (s.parent_username && s.parent_password)
        ? `<div class="pc-creds"><span class="cred-pill">Login: <b>${UI.esc(s.parent_username)}</b></span><span class="cred-pill">Parol: <b>${UI.esc(s.parent_password)}</b></span></div>`
        : '<span class="muted">Login hali yaratilmagan</span>';
      row.innerHTML = `
        <div class="pc-info"><b>${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</b></div>
        ${creds}
        <button class="btn btn-secondary btn-sm" data-gen="${s.id}">${s.parent_username ? "🔄 Yangilash" : "➕ Yaratish"}</button>`;
      row.querySelector("[data-gen]").onclick = () => this.genParentFor(s.id, s.parent_username);
      box.appendChild(row);
    });
  },

  genParentFor(id, existingUser) {
    UI.modal(`
      <span class="modal-icon">👪</span>
      <h2 style="text-align:center">Ota-ona uchun login/parol</h2>
      <p class="muted" style="text-align:center">O'zingiz login va parol o'ylab yozing (random emas).</p>
      <div class="field-row"><label>Login</label><input id="pg-user" class="inp" value="${UI.esc(existingUser || "")}" placeholder="masalan: ota_ali"></div>
      <div class="field-row"><label>Parol</label><input id="pg-pass" class="inp" type="text" placeholder="kamida 4 ta belgi"></div>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-success" id="pg-save">💾 Saqlash</button></div>
    `);
    document.getElementById("pg-save").onclick = async () => {
      const u = document.getElementById("pg-user").value.trim();
      const p = document.getElementById("pg-pass").value;
      if (!u) return UI.toast("Login kiriting", "err");
      if (p.length < 4) return UI.toast("Parol kamida 4 ta belgi bo'lsin", "err");
      const res = await API.post(`/api/students/${id}/parent`, { username: u, password: p });
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      UI.toast("Ota-ona logini saqlandi ✔", "ok");
      if (this.currentParClass) this.loadParents(this.currentParClass);
    };
  },

  /* =============== O'QITUVCHILAR =============== */
  async loadTeachers() {
    const res = await API.get("/api/teachers");
    const box = document.getElementById("teachers-list");
    if (!res.ok) { box.innerHTML = ""; return; }
    // Rol tanlash faqat direktorда ko'rinadi (direktor zavuch/o'qituvchi qo'sha oladi)
    const roleSel = document.getElementById("tch-role");
    if (roleSel) roleSel.style.display = res.my_role === "director" ? "" : "none";
    box.innerHTML = "";
    res.teachers.forEach((t) => {
      const roleTag = `<span class="role-tag role-${t.role}">${UI.esc(t.role_label)}</span>`;
      const row = document.createElement("div");
      row.className = "parent-cred";
      row.innerHTML = `
        <div class="pc-info"><b>${UI.esc(t.username)}</b> ${roleTag} ${t.is_me ? '<span class="chip on">Siz</span>' : ""}</div>
        ${t.is_me ? '<span class="muted">(joriy hisob)</span>' : `<button class="btn btn-danger btn-sm" data-del="${t.id}">🗑️ O'chirish</button>`}`;
      const db = row.querySelector("[data-del]");
      if (db) db.onclick = () => this.deleteTeacher(t.id, t.username);
      box.appendChild(row);
    });
  },

  async addTeacher() {
    const u = document.getElementById("tch-user").value.trim();
    const p = document.getElementById("tch-pass").value;
    const roleSel = document.getElementById("tch-role");
    const role = roleSel && roleSel.style.display !== "none" ? roleSel.value : "teacher";
    if (!u) return UI.toast("Login kiriting", "err");
    if (p.length < 4) return UI.toast("Parol kamida 4 ta belgi bo'lsin", "err");
    const res = await API.post("/api/teachers", { username: u, password: p, role });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.toast("Panel qo'shildi ✔", "ok");
    document.getElementById("tch-user").value = "";
    document.getElementById("tch-pass").value = "";
    this.loadTeachers();
  },

  deleteTeacher(id, name) {
    this.confirm("O'qituvchini o'chirish", `"${name}" hisobi o'chiriladi.`, async () => {
      const res = await API.del(`/api/teachers/${id}`);
      if (res.ok) { UI.toast("O'chirildi", "ok"); this.loadTeachers(); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  /* =============== STATISTIKA / REYTING =============== */
  async loadStats() {
    const res = await API.get("/api/stats");
    const box = document.getElementById("stats-content");
    if (!res.ok) { box.innerHTML = '<p class="muted">Xatolik</p>'; return; }

    const podium = (arr, sub) => {
      if (!arr.length) return '<p class="muted">Hali ma\'lumot yo\'q</p>';
      return `<div class="podium">${arr.map((p, i) => `
        <div class="podium-item p${i + 1}">
          <div class="podium-ava">${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
          <div class="podium-bar">${i + 1}</div>
          <div class="podium-name">${UI.esc(p.name)}</div>
          <div class="podium-sub">${UI.esc(p.class_name)} • ${sub(p)}</div>
        </div>`).join("")}</div>`;
    };
    const bars = (arr, key, isCoins) => {
      if (!arr.length) return '<p class="muted">Hali ma\'lumot yo\'q</p>';
      const max = Math.max(...arr.map((c) => c[key]), 1);
      return arr.map((c) => `
        <div class="bar-row" data-cls="${UI.esc(c.class_name)}">
          <span class="bar-label">${UI.esc(c.class_name)}</span>
          <div class="bar-track"><div class="bar-fill ${isCoins ? "coins" : ""}" style="width:${Math.max(8, (c[key] / max) * 100)}%">${c[key]}${isCoins ? "" : "%"}</div></div>
        </div>`).join("");
    };

    box.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><div class="num">${res.totals.students}</div><div class="lbl">O'quvchilar</div></div>
        <div class="stat-tile"><div class="num">${res.totals.submissions}</div><div class="lbl">Topshirilgan testlar</div></div>
        <div class="stat-tile"><div class="num">${res.totals.lessons_done}</div><div class="lbl">Tugatilgan darslar</div></div>
      </div>
      <div class="dash-grid">
        <div class="dash-card"><h3>🏆 Eng zo'r 3 o'quvchi (testlar)</h3>${podium(res.top_tests, (p) => p.pct + "%")}</div>
        <div class="dash-card"><h3>📚 Eng zo'r 3 o'quvchi (bilim / coin)</h3>${podium(res.top_learning, (p) => "🪙 " + p.coins)}</div>
        <div class="dash-card"><h3>📊 Sinflar reytingi — o'rtacha ball</h3>${bars(res.classes_by_score, "avg_pct", false)}<p class="muted" style="margin-top:8px">Sinf ustiga bosing → to'liq ro'yxat</p></div>
        <div class="dash-card"><h3>🪙 Sinflar reytingi — coinlar</h3>${bars(res.classes_by_coins, "total_coins", true)}</div>
      </div>`;

    box.querySelectorAll(".bar-row[data-cls]").forEach((r) => {
      r.onclick = () => {
        const cls = r.dataset.cls;
        this.showSection("results");
        document.getElementById("res-class").value = cls;
        this.loadResults(cls);
      };
    });
  },
};
