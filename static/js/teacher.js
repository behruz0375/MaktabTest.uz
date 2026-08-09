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
    document.getElementById("res-refresh").onclick = async () => { if (this.currentResClass) { await this.loadResults(this.currentResClass); UI.toast("Natijalar yangilandi ✓", "ok", 1500); } };
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
    const lsTpl = document.getElementById("ls-test-template");
    if (lsTpl) lsTpl.onclick = (e) => { e.preventDefault(); this.downloadTemplate(); };
    // Mutolaa natijalari
    document.getElementById("lrn-class").onchange = (e) => this.loadLearning(e.target.value);
    document.getElementById("lrn-subject").onchange = () => { if (this.currentLrnClass) this.loadLearning(this.currentLrnClass); };
    document.getElementById("lrn-refresh").onclick = async () => { if (this.currentLrnClass) { await this.loadLearning(this.currentLrnClass); UI.toast("Mutolaa natijalari yangilandi ✓", "ok", 1500); } };
    // Mutolaa bo'limidan yangi o'quvchi qo'shish (zavuch/boshqaruv)
    const lrnAdd = document.getElementById("lrn-add");
    if (lrnAdd) lrnAdd.onclick = () => this.addStudentFromLearning();
    const lrnBulk = document.getElementById("lrn-bulk-add");
    if (lrnBulk) lrnBulk.onclick = () => this.bulkAddStudentsFromLearning();
    // Ota-onalar
    document.getElementById("par-class").onchange = (e) => this.loadParents(e.target.value);
    // O'qituvchilar
    document.getElementById("tch-add").onclick = () => this.addTeacher();
    // Statistika
    document.getElementById("stats-refresh").onclick = async () => { await this.loadStats(); UI.toast("Statistika yangilandi ✓", "ok", 1500); };
    // Qidirish bo'limlari (testlar, darslar, o'quvchilar)
    const wireSearch = (inputId, listId, itemSel) => {
      const el = document.getElementById(inputId);
      if (el) el.oninput = () => this._filterList(inputId, listId, itemSel);
    };
    const tsEl = document.getElementById("tests-search");
    if (tsEl) tsEl.oninput = () => this._filterTests();
    wireSearch("lessons-search", "lessons-admin-list", ".test-card");
    wireSearch("students-search", "students-list", ".student-row");
    // Maktab ma'lumotlarini tozalash (zavuch/boshqaruv)
    const clearBtn = document.getElementById("clear-data-btn");
    if (clearBtn) clearBtn.onclick = () => this.clearSchoolData();
    // Ish vaqtini sozlash (boshqaruv)
    const whBtn = document.getElementById("work-hours-btn");
    if (whBtn) whBtn.onclick = () => this.openWorkHours();
    // Telefon burger menyu
    const burger = document.getElementById("burger");
    const overlay = document.getElementById("sidebar-overlay");
    const sidebar = document.querySelector("#view-teacher .sidebar");
    const closeDrawer = () => { sidebar.classList.remove("open"); overlay.classList.remove("on"); };
    burger.onclick = () => { sidebar.classList.toggle("open"); overlay.classList.toggle("on"); };
    overlay.onclick = closeDrawer;
    document.querySelectorAll("#view-teacher .side-btn").forEach((b) => b.addEventListener("click", closeDrawer));
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

  _filterList(inputId, listId, itemSel) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    list.querySelectorAll(itemSel).forEach((el) => {
      const match = !q || el.textContent.toLowerCase().includes(q);
      el.style.display = match ? "" : "none";
      if (match) shown++;
    });
    // "Hech narsa topilmadi" xabari
    let empty = list.querySelector(".search-empty");
    if (q && shown === 0) {
      if (!empty) { empty = document.createElement("p"); empty.className = "muted search-empty"; list.appendChild(empty); }
      empty.textContent = "🔎 Qidiruv bo'yicha hech narsa topilmadi.";
      empty.style.display = "";
    } else if (empty) { empty.style.display = "none"; }
  },

  downloadTemplate() {
    const a = document.createElement("a");
    a.href = "/api/tests/import-template.xlsx"; a.download = "test_namuna.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast("Namuna Excel fayli yuklandi. Oching, to'ldiring, keyin yuklang.", "ok", 5000);
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
    this.startNotifPoll();
  },

  startNotifPoll() {
    this.stopNotifPoll();
    const tick = async () => {
      const liveBtn = document.querySelector('.side-btn[data-section="live"]');
      const badge = document.getElementById("badge-live");
      if (!badge) return;
      if (!liveBtn || liveBtn.style.display === "none") { badge.classList.remove("on"); return; }
      const res = await API.get("/api/live");
      if (res.ok) {
        if (res.count > 0) { badge.textContent = res.count > 99 ? "99+" : res.count; badge.classList.add("on"); }
        else badge.classList.remove("on");
      }
    };
    tick();
    this._notifPoll = setInterval(tick, 12000);
  },
  stopNotifPoll() { if (this._notifPoll) { clearInterval(this._notifPoll); this._notifPoll = null; } },

  applyRoleUI() {
    const t = State.teacher || {};
    const isOwner = t.role === "owner";
    const isAdmin = t.is_admin; // owner yoki zavuch
    const entered = isOwner ? !!this.viewSchool : true;
    const show = (sec, on) => { const b = document.querySelector(`.side-btn[data-section="${sec}"]`); if (b) b.style.display = on ? "" : "none"; };
    show("schools", isOwner);
    ["stats", "create", "tests", "lessons", "results", "live", "learning", "students"].forEach((s) => show(s, entered));
    ["teachers", "parents"].forEach((s) => show(s, isAdmin && entered));
    show("profile", true);
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
    // Oddiy o'qituvchi reyting/statistika va natijalarni YANGILAY olmaydi (faqat ko'radi)
    const plainTeacher = t.role === "teacher";
    const setDisp = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; };
    setDisp("stats-refresh", !plainTeacher);
    setDisp("res-refresh", !plainTeacher);
    // Maktab ma'lumotlarini tozalash — faqat zavuch/boshqaruv (maktabga kirgan holda)
    setDisp("clear-data-box", isAdmin && entered);
    // Ish vaqtini sozlash — faqat boshqaruv (egasi)
    setDisp("work-hours-box", isOwner);
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
      card.className = "test-card" + (s.suspended ? " sch-suspended" : "");
      const suspLabel = s.suspended ? '<span class="chip off">⏸️ To\'xtatilgan</span>' : '<span class="chip on">✅ Faol</span>';
      card.innerHTML = `
        <h3>🏫 ${UI.esc(s.name)} ${suspLabel}</h3>
        <div class="school-card-stats">
          <span>👥 ${s.students} o'quvchi</span><span>🧑‍🏫 ${s.teachers} o'qituvchi</span><span>📋 ${s.tests} test</span>
        </div>
        <div class="school-card-stats" style="margin-top:4px">
          ${s.active_now > 0 ? `<span style="color:var(--success-1)">🟢 Hozir yechmoqda: ${s.active_now}</span>` : '<span class="muted">🔴 Hozir hech kim</span>'}
          <span class="muted">Bugun topshirdi: ${s.done_today}</span>
        </div>
        <div class="muted">Zavuch: ${s.zavuch ? UI.esc(s.zavuch) : "—"}</div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" data-enter="${s.id}">⚙️ Boshqarish</button>
          <button class="btn btn-ghost btn-sm" data-susp="${s.id}">${s.suspended ? "▶️ Faollashtirish" : "⏸️ To'xtatish"}</button>
          <button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️ O'chirish</button>
        </div>`;
      card.querySelector("[data-enter]").onclick = () => this.enterSchool(s);
      card.querySelector("[data-susp]").onclick = () => this.suspendSchool(s);
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
  async suspendSchool(s) {
    const action = s.suspended ? "faollashtirish" : "to'xtatish";
    const msg = s.suspended
      ? `"${s.name}" maktabini faollashtirmoqchimisiz? O'quvchilar tizimga kira oladi.`
      : `"${s.name}" maktabini to'xtatmoqchimisiz? O'quvchilar kira olmay qoladi.`;
    this.confirm(s.suspended ? "Maktabni faollashtirish" : "Maktabni to'xtatish", msg, async () => {
      const res = await API.post(`/api/schools/${s.id}/suspend`);
      if (res.ok) { UI.toast(res.suspended ? "Maktab to'xtatildi ⏸️" : "Maktab faollashtirildi ✅", "ok"); this.loadSchools(); }
      else UI.toast(res.error || "Xatolik", "err");
    }, !s.suspended);
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
    if (id === "profile") this.loadProfile();
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
    const allBtn = document.createElement("button");
    allBtn.className = "class-btn";
    allBtn.dataset.cls = "__all__";
    allBtn.textContent = "🏫 Hamma";
    allBtn.onclick = () => { document.getElementById("lrn-class").value = "__all__"; this.loadLearning("__all__"); };
    box.appendChild(allBtn);
    State.meta.classes.forEach((c) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.dataset.cls = c;
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
    const allBtn = document.createElement("button");
    allBtn.className = "class-btn";
    allBtn.dataset.cls = "__all__";
    allBtn.textContent = "🏫 Hamma";
    allBtn.onclick = () => { document.getElementById("res-class").value = "__all__"; this.loadResults("__all__"); };
    box.appendChild(allBtn);
    State.meta.classes.forEach((c) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.dataset.cls = c;
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
      // O'qituvchi faqat biriktirilgan sinflarni ko'radi
      this._classesForMe().forEach((c) => {
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
    // O'qituvchi biriktirilmagan sinfni tanlasa — ruxsat xabari
    const allowed = this._allowedClasses();
    if (cls && allowed && !allowed.includes(cls)) {
      const box = document.getElementById("live-list");
      if (box) box.innerHTML = `<div class="empty-note">🚫 Sizga <b>${UI.esc(cls)}</b> sinfiga kirishga ruxsat etilmagan. Faqat biriktirilgan sinflaringizni kuzata olasiz.</div>`;
      document.getElementById("live-count").textContent = 0;
      return;
    }
    const res = await API.get("/api/live" + (cls ? "?class_name=" + encodeURIComponent(cls) : ""));
    if (!res.ok) return;
    this._live = res.active;
    const left = res.left || [];
    document.getElementById("live-count").textContent = res.count;
    document.getElementById("live-updated").textContent = "🔄 " + new Date().toLocaleTimeString();
    const box = document.getElementById("live-list");
    if (!res.active.length && !left.length) {
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
          <div class="sub">📝 ${UI.esc(a.test_title)} • ${UI.esc(a.subject)} • 🔑 <b>${UI.esc(a.code)}</b></div>
          <div class="sub">🕐 Boshladi: <b>${UI.esc(a.started_clock || "-")}</b> • ✍️ Belgiladi: <b>${a.answered}/${a.q_total}</b></div>
        </div>
        <div class="live-timer">
          <span class="timer-label">Qolgan vaqt</span>
          <span class="live-time" id="live-time-${i}">${this.fmtClock(a.remaining_seconds)}</span>
        </div>
        <button class="btn btn-danger btn-sm" data-stop-sub="${a.sub_id}">⏹️ To'xtatish</button>`;
      row.querySelector("[data-stop-sub]").onclick = () => this.stopSubmission(a.sub_id, a);
      box.appendChild(row);
    });
    if (left.length) {
      const head = document.createElement("div");
      head.className = "baho-group-title";
      head.style.cssText = "margin:18px 0 8px;color:var(--danger-1)";
      head.innerHTML = `⚠️ Test vaqtida chiqib ketganlar (so'nggi 5 daqiqa) — ${left.length} ta`;
      box.appendChild(head);
      left.forEach((a) => {
        const initials = ((a.first_name[0] || "") + (a.last_name[0] || "")).toUpperCase();
        const row = document.createElement("div");
        row.className = "student-row blocked";
        row.style.cursor = "default";
        row.innerHTML = `
          <div class="student-avatar" style="background:linear-gradient(135deg,#e94b4b,#f8a928)">${UI.esc(initials)}</div>
          <div class="student-info">
            <div class="name">${UI.esc(a.last_name)} ${UI.esc(a.first_name)} <span class="role-tag role-teacher">${UI.esc(a.class_name)}</span></div>
            <div class="sub">📝 ${UI.esc(a.test_title)} • ${UI.esc(a.subject)} • 🔑 <b>${UI.esc(a.code)}</b></div>
            <div class="sub">🕐 ${UI.esc(a.started_clock || "-")} → 🚪 ${UI.esc(a.left_clock || "-")} • ✍️ ${a.answered}/${a.q_total}</div>
          </div>
          <span class="status-pill danger">⚠️ ${UI.esc(a.reason)}</span>`;
        box.appendChild(row);
      });
    }
  },
  stopSubmission(subId, a) {
    this.confirm("O'quvchini to'xtatish", `${a.last_name} ${a.first_name} ning testi hozir to'xtatiladi.`, async () => {
      const res = await API.post(`/api/submissions/${subId}/stop`);
      if (res.ok) { UI.toast("O'quvchi to'xtatildi", "ok"); this.loadLive(); }
      else UI.toast(res.error || "Xatolik", "err");
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
    this.stopNotifPoll();
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
      card.dataset.class = t.class_name;
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
          <button class="btn btn-secondary btn-sm" data-act="edit">✏️ Tahrirlash</button>
          <button class="btn btn-secondary btn-sm" data-act="code">🔄 Yangi kod</button>
          <button class="btn btn-ghost btn-sm" data-act="toggle">${t.is_active ? "⏸️ Yopish" : "▶️ Ochish"}</button>
          ${t.is_active ? '<button class="btn btn-danger btn-sm" data-act="stop">⏹️ To\'xtatish</button>' : ""}
          <button class="btn btn-secondary btn-sm" data-act="importqs">📄 Fayldan savol</button>
          <button class="btn btn-secondary btn-sm" data-act="addqs">➕ Savol qo'shish</button>
          <button class="btn btn-danger btn-sm" data-act="del">🗑️ O'chirish</button>
        </div>
      `;
      card.querySelector('[data-act="edit"]').onclick = () => this.openTestEdit(t);
      card.querySelector('[data-act="code"]').onclick = () => this.regenCode(t.id);
      card.querySelector('[data-act="toggle"]').onclick = () => this.toggleTest(t.id);
      const stopBtn = card.querySelector('[data-act="stop"]');
      if (stopBtn) stopBtn.onclick = () => this.stopTest(t.id, t.title);
      card.querySelector('[data-act="importqs"]').onclick = () => this.openImportQuestionsModal(t.id, t.title, t.question_count);
      card.querySelector('[data-act="addqs"]').onclick = () => this.openAddQuestionsModal(t.id, t.title, t.question_count);
      card.querySelector('[data-act="del"]').onclick = () => this.deleteTest(t.id, t.title);
      box.appendChild(card);
    });
    this._populateTestsClassFilter();
    this._filterTests();
  },

  _populateTestsClassFilter() {
    const sel = document.getElementById("tests-class-filter");
    if (!sel || sel.dataset.done === "1") return;
    const classes = this._allowedClasses() || State.meta.classes || [];
    classes.forEach((c) => { const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o); });
    sel.dataset.done = "1";
    sel.onchange = () => this._filterTests();
  },

  _filterTests() {
    const search = document.getElementById("tests-search");
    const clsSel = document.getElementById("tests-class-filter");
    const q = search ? search.value.trim().toLowerCase() : "";
    const cls = clsSel ? clsSel.value : "";
    const list = document.getElementById("tests-list");
    if (!list) return;
    let shown = 0;
    list.querySelectorAll(".test-card").forEach((el) => {
      const textOk = !q || el.textContent.toLowerCase().includes(q);
      const clsOk = !cls || el.dataset.class === cls;
      const ok = textOk && clsOk;
      el.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    let empty = list.querySelector(".search-empty");
    if ((q || cls) && shown === 0) {
      if (!empty) { empty = document.createElement("p"); empty.className = "muted search-empty"; list.appendChild(empty); }
      empty.textContent = "🔎 Bu shartlarга mos test topilmadi.";
      empty.style.display = "";
    } else if (empty) { empty.style.display = "none"; }
  },

  openTestEdit(t) {
    const subjOpts = (State.meta.subjects || []).map((x) => `<option value="${UI.esc(x)}" ${x === t.subject ? "selected" : ""}>${UI.esc(x)}</option>`).join("");
    const allowed = this._allowedClasses();
    const clsList = allowed || (State.meta.classes || []);
    // Joriy sinf ro'yxatда bo'lmasa ham ko'rsatamiz (biriktirilmagan bo'lsa)
    const clsSet = clsList.includes(t.class_name) ? clsList : [t.class_name, ...clsList];
    const clsOpts = clsSet.map((c) => `<option value="${UI.esc(c)}" ${c === t.class_name ? "selected" : ""}>${UI.esc(c)}</option>`).join("");
    UI.modal(`
      <span class="modal-icon">✏️</span>
      <h2 style="text-align:center">Testni tahrirlash</h2>
      <div class="field-row"><label>Test nomi</label><input id="te-title" class="inp" value="${UI.esc(t.title)}"></div>
      <div class="grid-4">
        <div class="field-row"><label>Fan</label><select id="te-subject" class="inp">${subjOpts}</select></div>
        <div class="field-row"><label>Sinf</label><select id="te-class" class="inp">${clsOpts}</select></div>
        <div class="field-row"><label>Vaqt (daqiqa)</label><input id="te-duration" class="inp" type="number" min="1" value="${t.duration_minutes}"></div>
      </div>
      <p class="muted" style="font-size:.85rem">Savollar o'zgarmaydi. Savol qo'shish/o'chirish uchun alohida tugmalar bor.</p>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-success" id="te-save">💾 Saqlash</button></div>
    `, { large: true });
    document.getElementById("te-save").onclick = async () => {
      const payload = {
        title: document.getElementById("te-title").value.trim(),
        subject: document.getElementById("te-subject").value,
        class_name: document.getElementById("te-class").value,
        duration_minutes: parseInt(document.getElementById("te-duration").value, 10),
      };
      if (!payload.title) return UI.toast("Test nomini kiriting", "err");
      const res = await API.post(`/api/tests/${t.id}/meta`, payload);
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      UI.toast("Test yangilandi ✔", "ok");
      this.loadTests();
    };
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

  /* =============== TESTGA FAYLDAN SAVOL QO'SHISH =============== */
  openImportQuestionsModal(testId, testTitle, currentCount) {
    UI.modal(`
      <span class="modal-icon">📄</span>
      <h2 style="text-align:center">Fayldan savol qo'shish</h2>
      <p style="text-align:center" class="muted">"${UI.esc(testTitle)}" testiga. Hozir: <b>${currentCount}</b> ta savol</p>
      <p class="muted" style="text-align:center"><a href="#" id="iq-template" style="color:var(--primary-2);font-weight:700">📥 Namuna Excel faylni yuklab oling</a></p>
      <div class="field-row" style="margin-top:10px"><label>Fayl (.xlsx .csv .docx .pdf)</label>
        <input id="iq-file" class="inp" type="file" accept=".xlsx,.xlsm,.csv,.docx,.pdf"></div>
      <div style="text-align:center;margin-top:10px">
        <button class="btn btn-success" id="iq-save">📥 Fayldan qo'shish</button>
      </div>
      <div id="iq-progress" class="muted" style="text-align:center;margin-top:8px"></div>`);
    document.getElementById("iq-template").onclick = (e) => { e.preventDefault(); this.downloadTemplate(); };
    document.getElementById("iq-save").onclick = () => {
      const file = document.getElementById("iq-file").files[0];
      if (!file) return UI.toast("Fayl tanlang", "err");
      const prog = document.getElementById("iq-progress");
      prog.textContent = "⏳ Yuklanmoqda va o'qilmoqda...";
      const fd = new FormData(); fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/tests/${testId}/import-questions`);
      xhr.onload = () => {
        let r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && r.ok) {
          UI.closeModal();
          UI.toast(`✅ ${r.added} ta savol qo'shildi! Jami: ${r.total} ta`, "ok", 5000);
          this.loadTests();
        } else { prog.textContent = ""; UI.toast(r.error || "Import xatolik", "err", 6000); }
      };
      xhr.onerror = () => { prog.textContent = ""; UI.toast("Tarmoq xatosi", "err"); };
      xhr.send(fd);
    };
  },

  /* =============== TESTGA SAVOL QO'SHISH =============== */
  openAddQuestionsModal(testId, testTitle, currentCount) {
    UI.modal(`
      <span class="modal-icon">➕</span>
      <h2 style="text-align:center">Savol qo'shish</h2>
      <p style="text-align:center" class="muted">"${UI.esc(testTitle)}" testiga. Hozir: <b>${currentCount}</b> ta savol</p>
      <div class="field-row" style="max-width:220px;margin:12px auto">
        <label>Nechta yangi savol?</label>
        <input id="addqs-count" class="inp" type="number" min="1" max="100" value="10">
      </div>
      <div style="text-align:center">
        <button class="btn btn-secondary" id="addqs-open">📝 Joylarni ochish</button>
      </div>
      <div id="addqs-slots" class="questions-list" style="margin-top:14px;max-height:55vh;overflow-y:auto"></div>
      <div id="addqs-bar" style="display:none;margin-top:12px;text-align:center">
        <span id="addqs-info" class="muted"></span>
        <button class="btn btn-success" id="addqs-save">💾 Testga qo'shish</button>
      </div>
    `, { large: true });
    this._addQsData = [];
    document.getElementById("addqs-open").onclick = () => {
      const n = parseInt(document.getElementById("addqs-count").value, 10);
      if (!n || n < 1 || n > 100) return UI.toast("1–100 orasida son kiriting", "err");
      this._addQsData = Array.from({ length: n }, () => ({ text: "", a: "", b: "", c: "", d: "", correct: "" }));
      this._renderAddQsSlots();
      document.getElementById("addqs-bar").style.display = "block";
      document.getElementById("addqs-info").textContent = `${n} ta yangi savol qo'shiladi (jami: ${currentCount + n} ta)`;
    };
    document.getElementById("addqs-save").onclick = () => this._saveAddQuestions(testId, testTitle, currentCount);
  },

  _renderAddQsSlots() {
    const box = document.getElementById("addqs-slots");
    if (!box) return;
    box.innerHTML = "";
    this._addQsData.forEach((q, i) => {
      const el = document.createElement("div");
      el.className = "q-slot";
      el.innerHTML = `
        <div class="q-slot-head">
          <div style="display:flex;align-items:center;gap:10px"><span class="q-slot-num">${i + 1}</span><b>${i + 1}-savol</b></div>
          <button class="q-del" data-qi="${i}">🗑️</button>
        </div>
        <textarea class="qs-text" placeholder="Savol matni...">${UI.esc(q.text)}</textarea>
        <div class="opt-grid">
          <div class="opt-input"><span class="opt-tag">A</span><input class="qs-a" placeholder="A" value="${UI.esc(q.a)}"></div>
          <div class="opt-input"><span class="opt-tag">B</span><input class="qs-b" placeholder="B" value="${UI.esc(q.b)}"></div>
          <div class="opt-input"><span class="opt-tag">C</span><input class="qs-c" placeholder="C" value="${UI.esc(q.c)}"></div>
          <div class="opt-input"><span class="opt-tag">D</span><input class="qs-d" placeholder="D" value="${UI.esc(q.d)}"></div>
        </div>
        <div class="correct-row"><label>✅ To'g'ri javob:</label>
          <select class="qs-correct"><option value="">— tanlang —</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select>
        </div>`;
      el.querySelector(".qs-correct").value = q.correct || "";
      el.querySelector(".q-del").onclick = () => {
        this._syncAddQsFromDOM();
        this._addQsData.splice(i, 1);
        this._renderAddQsSlots();
        const info = document.getElementById("addqs-info");
        if (info) info.textContent = `${this._addQsData.length} ta savol qo'shiladi`;
      };
      box.appendChild(el);
    });
  },

  _syncAddQsFromDOM() {
    const slots = document.querySelectorAll("#addqs-slots .q-slot");
    this._addQsData = Array.from(slots).map((s) => ({
      text: s.querySelector(".qs-text").value,
      a: s.querySelector(".qs-a").value, b: s.querySelector(".qs-b").value,
      c: s.querySelector(".qs-c").value, d: s.querySelector(".qs-d").value,
      correct: s.querySelector(".qs-correct").value,
    }));
  },

  async _saveAddQuestions(testId, testTitle, prevCount) {
    this._syncAddQsFromDOM();
    for (let i = 0; i < this._addQsData.length; i++) {
      const q = this._addQsData[i];
      if (!q.text.trim()) return UI.toast(`${i + 1}-savol matni bo'sh`, "err");
      if (!q.a.trim() || !q.b.trim() || !q.c.trim() || !q.d.trim()) return UI.toast(`${i + 1}-savolning barcha variantlarini to'ldiring`, "err");
      if (!["A", "B", "C", "D"].includes(q.correct)) return UI.toast(`${i + 1}-savol uchun to'g'ri javobni tanlang`, "err");
    }
    const payload = {
      questions: this._addQsData.map((q) => ({
        text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, correct_option: q.correct,
      })),
    };
    const res = await API.post(`/api/tests/${testId}/add-questions`, payload);
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.closeModal();
    UI.toast(`✅ ${res.added} ta savol qo'shildi! Jami: ${res.total} ta`, "ok", 5000);
    this.loadTests();
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
    const isAll = cls === "__all__";
    document.querySelectorAll("#res-class-buttons .class-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.cls ? b.dataset.cls === cls : b.textContent === cls)
    );
    const subj = document.getElementById("res-subject").value;
    const titleEl = document.getElementById("results-title");
    const res = await API.get("/api/results?class_name=" + encodeURIComponent(cls));
    const box = document.getElementById("results-list");
    if (!res.ok) { box.innerHTML = ""; UI.toast(res.error || "Xatolik", "err"); return; }
    titleEl.style.display = "flex";
    titleEl.innerHTML = isAll
      ? `🏆 Barcha sinflar — natijalar${subj ? " • " + UI.esc(subj) : ""}`
      : `🏆 ${UI.esc(cls)} sinf — natijalar${subj ? " • " + UI.esc(subj) : ""}`;
    this.currentResClass = cls;
    document.getElementById("results-export").style.display = "flex";
    if (!res.students.length) {
      box.innerHTML = '<p class="muted">Bu sinfda o\'quvchi yo\'q. "O\'quvchilar ro\'yxati" bo\'limidan qo\'shing yoki o\'quvchilar test topshirsa avtomatik paydo bo\'ladi.</p>';
      return;
    }
    box.innerHTML = "";
    // Fan tanlangan bo'lsa, lekin bu fandan test qo'shilmagan bo'lsa — xabar
    if (subj && res.test_subjects && !res.test_subjects.includes(subj)) {
      box.innerHTML = `<div class="empty-note">📭 <b>${UI.esc(subj)}</b> fanidan hali test qo'shilmagan. Test qo'shsangiz, natijalar shu yerda ko'rinadi.</div>`;
      return;
    }
    // Bu sinf(lar) uchun umuman test qo'shilmagan bo'lsa — xabar (o'quvchilar ro'yxati baribir ko'rinadi)
    let noteHtml = "";
    if (!subj && res.test_subjects && res.test_subjects.length === 0) {
      noteHtml = `<div class="empty-note">📭 ${isAll ? "Sinflar" : UI.esc(cls) + " sinfi"} uchun hali test qo'shilmagan. Test qo'shsangiz, natijalar shu yerda ko'rinadi.</div>`;
    }
    if (noteHtml) box.innerHTML = noteHtml;
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

  bahoColor(b) { return b >= 5 ? "#23c483" : b >= 4 ? "#3ca6ff" : b >= 3 ? "#f8a928" : b >= 2 ? "#e94b4b" : "#c0392b"; },
  bahoBadgeHtml(b, label) {
    if (!b) return "";
    return `<span title="${label || "Baho"}" style="display:inline-block;min-width:24px;text-align:center;background:${this.bahoColor(b)};color:#fff;border-radius:7px;padding:1px 8px;font-weight:900;margin-left:6px">${b}</span>`;
  },

  _resultRow(s, st, rank) {
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
    const badgeCls = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
    const initials = ((s.first_name[0] || "") + (s.last_name[0] || "")).toUpperCase();
    const baho = this.bahoOf(st.pct);
    const needsRetake = (s.retake_test_ids && s.retake_test_ids.length) ? '<span class="status-pill" style="background:#f8a928;color:#111">🔁 Qayta topshirishi kerak</span>' : "";
    const pill = s.has_violation
      ? '<span class="status-pill danger">⚠️ Xavf</span>'
      : `<span class="status-pill done">${st.count} ta test</span>`;
    const row = document.createElement("div");
    row.className = "student-row" + (rank === 1 ? " top1" : "") + (s.blocked ? " blocked" : "");
    row.innerHTML = `
      <div class="rank-badge ${badgeCls}">${medal}</div>
      <div class="student-avatar">${UI.esc(initials)}</div>
      <div class="student-info">
        <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}${this.bahoBadgeHtml(baho, "Baho")}${s.class_name ? ` <span class="role-tag role-teacher">${UI.esc(s.class_name)}</span>` : ""}${s.blocked ? ' <span class="pill-blocked">bloklangan</span>' : ""}</div>
        <div class="rank-meta">
          ${this.starsFor(st.pct)}
          <span class="rank-score">Eng yaxshi: ${st.pct}% • ${this.fmtDur(st.dur)}${s.monthly_pct != null ? ` • 📅 bu oy: ${s.monthly_pct}%` : ""}</span>
        </div>
      </div>
      <div class="row-tail">${needsRetake}${pill}</div>`;
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
        <div class="modal-info-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
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
    const canAdd = State.teacher && State.teacher.is_admin; // faqat zavuch/boshqaruv o'quvchi qo'shadi
    document.getElementById("stu-add-box").style.display = canAdd ? "flex" : "none";
    const res = await API.get("/api/students?class_name=" + encodeURIComponent(cls));
    const box = document.getElementById("students-list");
    if (!res.ok) { box.innerHTML = ""; return; }
    if (!res.students.length) { box.innerHTML = '<p class="muted">Bu sinfda hali o\'quvchi yo\'q.' + (canAdd ? ' Yuqoridan qo\'shing.' : '') + '</p>'; return; }
    box.innerHTML = "";
    const isAdmin = State.teacher && State.teacher.is_admin; // direktor/zavuch
    res.students.forEach((s) => {
      const row = document.createElement("div");
      row.className = "student-row" + (s.blocked ? " blocked" : "");
      row.style.cursor = "default";
      const initials = ((s.first_name[0] || "") + (s.last_name[0] || "")).toUpperCase();
      const editBtn = isAdmin ? `<button class="btn btn-secondary btn-sm" data-edit="${s.id}">✏️ Tahrirlash</button>` : "";
      const parentBtn = isAdmin ? `<button class="btn btn-secondary btn-sm" data-parent="${s.id}">👪 Ota-ona logini</button>` : "";
      const learnBtn = isAdmin ? `<button class="btn btn-secondary btn-sm" data-learn="${s.id}">${s.learn_username ? "📚 Bilim login ✔" : "📚 Bilim login"}</button>` : "";
      const blockBtn = isAdmin ? `<button class="btn btn-ghost btn-sm" data-block="${s.id}">${s.blocked ? "✅ Blokdan chiqarish" : "🚫 Bloklash"}</button>` : "";
      const learnInfo = (isAdmin && s.learn_username)
        ? `<div class="sub" style="margin-top:2px">📚 Login: <b>${UI.esc(s.learn_username)}</b>${s.learn_password ? ` • Parol: <b>${UI.esc(s.learn_password)}</b>` : ""}</div>` : "";
      if (isAdmin) row.style.cursor = "pointer";
      row.innerHTML = `
        <div class="student-avatar">${UI.esc(initials)}</div>
        <div class="student-info">
          <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}${s.blocked ? ' <span class="pill-blocked">bloklangan</span>' : ""}</div>
          <div class="sub">${UI.esc(s.class_name)}</div>
          ${learnInfo}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${editBtn}
          ${learnBtn}
          ${parentBtn}
          ${blockBtn}
          ${isAdmin ? `<button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️ O'chirish</button>` : ""}
        </div>
      `;
      const editEl = row.querySelector("[data-edit]");
      if (editEl) editEl.onclick = (e) => { e.stopPropagation(); this.editStudent(s, cls); };
      const learnEl = row.querySelector("[data-learn]");
      if (learnEl) learnEl.onclick = (e) => { e.stopPropagation(); this.setLearningLogin(s, () => this.loadStudents(cls)); };
      const delEl = row.querySelector("[data-del]");
      if (delEl) delEl.onclick = (e) => { e.stopPropagation(); this.deleteStudent(s.id, s, cls); };
      if (isAdmin) {
        row.querySelector("[data-parent]").onclick = (e) => { e.stopPropagation(); this.generateParent(s); };
        row.querySelector("[data-block]").onclick = (e) => { e.stopPropagation(); this.toggleBlock(s, cls); };
        // O'quvchiga bosilganda tahrirlash ochiladi
        row.querySelector(".student-info").onclick = () => this.editStudent(s, cls);
      }
      box.appendChild(row);
    });
    this._filterList("students-search", "students-list", ".student-row");
  },

  editStudent(s, cls) {
    const classes = State.meta.classes || [];
    const opts = classes.map((c) => `<option value="${UI.esc(c)}" ${c === s.class_name ? "selected" : ""}>${UI.esc(c)}</option>`).join("");
    UI.modal(`
      <span class="modal-icon">✏️</span>
      <h2 style="text-align:center">O'quvchini tahrirlash</h2>
      <div class="field-row"><label>Ism</label><input id="es-first" class="inp" value="${UI.esc(s.first_name)}"></div>
      <div class="field-row"><label>Familiya</label><input id="es-last" class="inp" value="${UI.esc(s.last_name)}"></div>
      <div class="field-row"><label>Sinf (almashtirish)</label><select id="es-class" class="inp">${opts}</select></div>
      <div style="text-align:center;margin-top:12px"><button class="btn btn-success" id="es-save">💾 Saqlash</button></div>
    `);
    document.getElementById("es-save").onclick = async () => {
      const first = document.getElementById("es-first").value.trim();
      const last = document.getElementById("es-last").value.trim();
      const cl = document.getElementById("es-class").value;
      if (!first || !last) return UI.toast("Ism va familiyani kiriting", "err");
      const res = await API.put(`/api/students/${s.id}`, { first_name: first, last_name: last, class_name: cl });
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      UI.toast(cl !== s.class_name ? `O'quvchi ${cl} sinfga o'tkazildi ✔` : "O'zgartirildi ✔", "ok");
      // Agar sinf o'zgargan bo'lsa, joriy sinf ro'yxatidan yo'qoladi
      this.loadStudents(cls);
    };
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

  /* =============== MAKTAB MA'LUMOTLARINI TANLAB TOZALASH =============== */
  clearSchoolData() {
    const opt = (val, title, desc) => `
      <label class="chk-label" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--bg-2);border-radius:10px;margin-bottom:8px;cursor:pointer">
        <input type="checkbox" class="cd-chk" value="${val}" style="margin-top:3px">
        <span><b>${title}</b><br><span class="muted" style="font-size:.85rem">${desc}</span></span>
      </label>`;
    UI.modal(`
      <span class="modal-icon">🧹</span>
      <h2 style="text-align:center;color:var(--danger-1)">Ma'lumotlarni tanlab tozalash</h2>
      <p style="text-align:center" class="muted">Nimalarni o'chirishni belgilang. Belgilanmaganlar tegilmaydi.</p>
      <div style="margin:14px 0">
        ${opt("tests", "🗑️ Testlar (savollar + natijalari bilan)", "Barcha testlar, savollar va ularning natijalari o'chadi")}
        ${opt("results", "📊 Barcha test natijalari", "Testlar qoladi, faqat topshirilgan natijalar o'chadi")}
        ${opt("month_results", "📅 Shu oylik natijalar (oylik baho)", "Faqat shu oyда topshirilgan natijalar o'chadi")}
        ${opt("coins", "🪙 Coinlar (0 ga tushirish)", "Barcha o'quvchilar coinlari 0 bo'ladi")}
        ${opt("durations", "⏱ Sarflangan vaqtlar (0 ga tushirish)", "Bilim olishда sanalgan vaqtlar 0 bo'ladi")}
      </div>
      <p class="muted" style="text-align:center;font-size:.85rem">✅ O'quvchilar, o'qituvchilar, ota-ona loginlari va darslar har doim saqlanadi.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-ghost" id="cd-no">Bekor qilish</button>
        <button class="btn btn-danger" id="cd-yes">🧹 Belgilanganlarни tozalash</button>
      </div>
      <div style="margin-top:18px;padding-top:14px;border-top:2px dashed var(--danger-1)">
        <p style="text-align:center;color:var(--danger-1);font-weight:800;margin-bottom:4px">☢️ Maktab haqida HAMMA ma'lumotni tozalash</p>
        <p class="muted" style="text-align:center;font-size:.84rem">O'quvchilar, testlar, natijalar, darslar, coinlar va vaqtlar — <b>hammasi</b> o'chadi.<br>O'qituvchi/zavuch hisoblari (login/parol) saqlanadi.</p>
        <div style="text-align:center;margin-top:8px"><button class="btn btn-danger" id="cd-all">☢️ Hamma ma'lumotni tozalash</button></div>
      </div>`, { large: true });
    document.getElementById("cd-all").onclick = () => this._clearAllData();
    document.getElementById("cd-no").onclick = () => UI.closeModal();
    document.getElementById("cd-yes").onclick = async () => {
      const targets = Array.from(document.querySelectorAll(".cd-chk:checked")).map((c) => c.value);
      if (!targets.length) return UI.toast("Kamida bittasini belgilang", "err");
      const res = await API.post("/api/school/clear-data", { targets });
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      const r = res.report || {};
      const parts = [];
      if (r.tests_deleted != null) parts.push(`${r.tests_deleted} test`);
      if (r.results_deleted != null) parts.push(`${r.results_deleted} natija`);
      if (r.month_results_deleted != null) parts.push(`${r.month_results_deleted} oylik natija`);
      if (r.coins_reset != null) parts.push(`${r.coins_reset} coin 0 ga`);
      if (r.durations_reset) parts.push(`vaqtlar 0 ga`);
      UI.toast("Tozalandi: " + (parts.join(", ") || "tayyor") + " ✓", "ok", 5000);
      if (this.currentSection === "tests") this.loadTests();
    };
  },

  _clearAllData() {
    this.confirm("HAMMA ma'lumotni tozalash",
      "Maktabning BARCHA o'quvchilari, testlari, natijalari, darslari, coinlari va vaqtlari butunlay o'chiriladi. Faqat o'qituvchi/zavuch hisoblari qoladi. Bu amalni orqaga qaytarib bo'lmaydi!",
      async () => {
        const res = await API.post("/api/school/clear-data", { targets: ["all"] });
        if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
        const r = res.report || {};
        UI.toast(`Tozalandi: ${r.students_deleted || 0} o'quvchi, ${r.tests_deleted || 0} test, ${r.lessons_deleted || 0} dars, ${r.results_deleted || 0} natija ✓`, "ok", 6000);
        if (this.currentSection === "tests") this.loadTests();
      });
  },

  /* =============== ISH VAQTI + XODIM LOGIN/PAROL (boshqaruv) =============== */
  openWorkHours() {
    UI.modal(`
      <span class="modal-icon">🕐</span>
      <h2 style="text-align:center">Tizim ish vaqti</h2>
      <p class="muted" style="text-align:center">O'quvchilar shu soatlar orasidagina test yecha/bilim ola oladi.</p>
      <label class="chk-label" style="justify-content:center;margin:10px 0;padding:10px;background:var(--bg-2);border-radius:10px">
        <input type="checkbox" id="wh-always"> <b>♾️ Doim ishlasin (24/7, cheklovsiz)</b>
      </label>
      <div class="grid-4" style="margin-top:6px" id="wh-hours">
        <div class="field-row"><label>Boshlanish (soat)</label><input id="wh-start" class="inp" type="number" min="0" max="23" value="8"></div>
        <div class="field-row"><label>Tugash (soat)</label><input id="wh-end" class="inp" type="number" min="1" max="24" value="21"></div>
      </div>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-success" id="wh-save">💾 Saqlash</button></div>`);
    const always = document.getElementById("wh-always");
    const hoursBox = document.getElementById("wh-hours");
    const syncAlways = () => { hoursBox.style.opacity = always.checked ? ".4" : "1"; document.getElementById("wh-start").disabled = always.checked; document.getElementById("wh-end").disabled = always.checked; };
    always.onchange = syncAlways;
    API.get("/api/settings/work-hours").then((r) => {
      if (r.ok) {
        document.getElementById("wh-start").value = r.start;
        document.getElementById("wh-end").value = r.end;
        always.checked = (r.start === 0 && r.end === 24);
        syncAlways();
      }
    });
    document.getElementById("wh-save").onclick = async () => {
      let start, end;
      if (always.checked) { start = 0; end = 24; }
      else { start = parseInt(document.getElementById("wh-start").value, 10); end = parseInt(document.getElementById("wh-end").value, 10); }
      const res = await API.post("/api/settings/work-hours", { start, end });
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      UI.toast(always.checked ? "Tizim doim ishlaydi (24/7) ✓" : `Ish vaqti: ${res.start}:00–${res.end}:00 ✓`, "ok", 4000);
    };
  },

  /* =============== DARSLAR (BILIM OLISH) =============== */

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
        <div class="card-actions">
          ${l.can_edit !== false ? `<button class="btn btn-secondary btn-sm" data-edit="${l.id}">✏️ Tahrirlash</button>` : ""}
          <button class="btn btn-danger btn-sm" data-del="${l.id}">🗑️ O'chirish</button>
        </div>`;
      card.querySelector("[data-del]").onclick = () => this.deleteLesson(l.id, l.title);
      const editBtn = card.querySelector("[data-edit]");
      if (editBtn) editBtn.onclick = () => this.openLessonEdit(l);
      box.appendChild(card);
    });
    this._filterList("lessons-search", "lessons-admin-list", ".test-card");
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

    // Darsdan keyingi test — fayldan yoki qo'lda
    let relatedTestId = null;
    if (document.getElementById("ls-has-test").checked) {
      const dur = parseInt(document.getElementById("ls-test-dur").value, 10) || 10;
      const testFile = document.getElementById("ls-test-file").files[0];
      if (testFile) {
        // Fayldan (Excel/CSV/Word/PDF) test yaratamiz — xuddi test importi kabi
        const tfd = new FormData();
        tfd.append("title", title + " — dars testi"); tfd.append("subject", subject);
        tfd.append("class_name", cls); tfd.append("duration_minutes", dur); tfd.append("file", testFile);
        let tj = {};
        try { const r = await fetch("/api/tests/import", { method: "POST", body: tfd }); tj = await r.json(); } catch (e) {}
        if (!tj.ok) return UI.toast("Fayldan test yaratishda xato: " + (tj.error || ""), "err");
        relatedTestId = tj.test_id;
      } else {
        this.syncLessonFromDOM();
        if (!this.lessonQuestions.length) return UI.toast("Test uchun savol qo'shing yoki fayl yuklang", "err");
        for (let i = 0; i < this.lessonQuestions.length; i++) {
          const q = this.lessonQuestions[i];
          if (!q.text.trim()) return UI.toast(`Test: ${i + 1}-savol matni bo'sh`, "err");
          if (!q.a.trim() || !q.b.trim() || !q.c.trim() || !q.d.trim()) return UI.toast(`Test: ${i + 1}-savol variantlarini to'ldiring`, "err");
          if (!["A", "B", "C", "D"].includes(q.correct)) return UI.toast(`Test: ${i + 1}-savol to'g'ri javobini tanlang`, "err");
        }
        const tRes = await API.post("/api/tests", {
          title: title + " — dars testi", subject, class_name: cls, duration_minutes: dur,
          questions: this.lessonQuestions.map((q) => ({ text: q.text, option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, correct_option: q.correct })),
        });
        if (!tRes.ok) return UI.toast("Test yaratishda xato: " + (tRes.error || ""), "err");
        relatedTestId = tRes.test_id;
      }
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
        const lstf = document.getElementById("ls-test-file"); if (lstf) lstf.value = "";
        this.lessonQuestions = [];
        this.loadLessons();
      } else { prog.textContent = ""; UI.toast(r.error || "Yuklashda xatolik", "err"); }
    };
    xhr.onerror = () => { prog.textContent = ""; UI.toast("Tarmoq xatosi", "err"); };
    prog.textContent = "Yuklanmoqda...";
    xhr.send(fd);
  },

  openLessonEdit(l) {
    const subjOpts = (State.meta.subjects || []).map((s) => `<option value="${UI.esc(s)}" ${s === l.subject ? "selected" : ""}>${UI.esc(s)}</option>`).join("");
    const allowed = this._allowedClasses();
    const clsList = allowed || (State.meta.classes || []);
    const clsOpts = clsList.map((c) => `<option value="${UI.esc(c)}" ${c === l.class_name ? "selected" : ""}>${UI.esc(c)}</option>`).join("");
    const icons = { video: "🎬", audio: "🎧", text: "📖" };
    const isText = l.type === "text";
    UI.modal(`
      <span class="modal-icon">✏️</span>
      <h2 style="text-align:center">Darsni tahrirlash ${icons[l.type] || ""}</h2>
      <div class="field-row"><label>Dars nomi</label><input id="le-title" class="inp" value="${UI.esc(l.title)}"></div>
      <div class="grid-4">
        <div class="field-row"><label>Fan</label><select id="le-subject" class="inp">${subjOpts}</select></div>
        <div class="field-row"><label>Sinf</label><select id="le-class" class="inp">${clsOpts}</select></div>
        <div class="field-row"><label>Coin mukofoti</label><input id="le-coins" class="inp" type="number" min="0" value="${l.coins_reward}"></div>
      </div>
      ${isText ? `<div class="field-row"><label>Matn</label><textarea id="le-text" class="inp" rows="6">${UI.esc(l.text_content || "")}</textarea></div>
        <div class="field-row"><label>Rasmni almashtirish (ixtiyoriy)</label><input id="le-image" class="inp" type="file" accept="image/*"></div>`
        : `<div class="field-row"><label>${l.type === "video" ? "Video" : "Audio"} faylni almashtirish (ixtiyoriy)</label><input id="le-file" class="inp" type="file" accept="${l.type}/*"></div>`}
      <div style="text-align:center;margin-top:10px"><button class="btn btn-success" id="le-save">💾 Saqlash</button></div>
      <div id="le-progress" class="muted" style="text-align:center;margin-top:8px"></div>`, { large: true });
    document.getElementById("le-save").onclick = () => {
      const fd = new FormData();
      fd.append("title", document.getElementById("le-title").value.trim());
      fd.append("subject", document.getElementById("le-subject").value);
      fd.append("class_name", document.getElementById("le-class").value);
      fd.append("coins_reward", document.getElementById("le-coins").value || "0");
      if (isText) {
        fd.append("text_content", document.getElementById("le-text").value);
        const img = document.getElementById("le-image").files[0];
        if (img) fd.append("image", img);
      } else {
        const f = document.getElementById("le-file").files[0];
        if (f) fd.append("file", f);
      }
      const prog = document.getElementById("le-progress");
      prog.textContent = "⏳ Saqlanmoqda...";
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/lessons/${l.id}`);
      xhr.onload = () => {
        let r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && r.ok) { UI.closeModal(); UI.toast("Dars yangilandi ✓", "ok"); this.loadLessons(); }
        else { prog.textContent = ""; UI.toast(r.error || "Xatolik", "err", 5000); }
      };
      xhr.onerror = () => { prog.textContent = ""; UI.toast("Tarmoq xatosi", "err"); };
      xhr.send(fd);
    };
  },

  _allowedClasses() {
    const t = State.teacher || {};
    if (t.role !== "teacher") return null;
    const ac = (t.assigned_classes || "").split(",").map((x) => x.trim()).filter(Boolean);
    return ac.length ? ac : null;
  },
  _classesForMe() {
    // O'qituvchiga biriktirilgan sinflar; admin yoki cheklovsizga — barcha sinflar
    return this._allowedClasses() || State.meta.classes || [];
  },

  deleteLesson(id, title) {
    this.confirm("Darsni o'chirish", `"${title}" darsi o'chiriladi.`, async () => {
      const res = await API.del(`/api/lessons/${id}`);
      if (res.ok) { UI.toast("O'chirildi", "ok"); this.loadLessons(); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  /* =============== MUTOLAA NATIJALARI =============== */
  fmtDurLong(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + " s";
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + " daq" + (s ? " " + s + "s" : "");
    const h = Math.floor(m / 60), rm = m % 60;
    return h + " soat" + (rm ? " " + rm + " daq" : "");
  },

  async loadLearning(cls) {
    if (!cls) return;
    const isAll = cls === "__all__";
    this.currentLrnClass = cls;
    document.querySelectorAll("#lrn-class-buttons .class-btn").forEach((b) => b.classList.toggle("active", (b.dataset.cls || b.textContent) === cls));
    const subj = document.getElementById("lrn-subject") ? document.getElementById("lrn-subject").value : "";
    const url = "/api/learning/results?class_name=" + encodeURIComponent(cls) + (subj ? "&subject=" + encodeURIComponent(subj) : "");
    const res = await API.get(url);
    const box = document.getElementById("learning-list");
    const title = document.getElementById("learning-title");
    if (!res.ok) { box.innerHTML = ""; UI.toast(res.error || "Xatolik", "err"); return; }
    title.style.display = "flex";
    title.innerHTML = isAll
      ? `🎓 Barcha sinflar — mutolaa reytingi${subj ? " • " + UI.esc(subj) : ""}`
      : `🎓 ${UI.esc(cls)} sinf — mutolaa reytingi${subj ? " • " + UI.esc(subj) : ""}`;
    const rbox = document.getElementById("lrn-refresh-box"); if (rbox) rbox.style.display = "block";
    // Yangi o'quvchi qo'shish oynasi — faqat zavuch/boshqaruv va aniq sinf tanlanganda
    const addBox = document.getElementById("lrn-add-box");
    const isAdmin = State.teacher && State.teacher.is_admin;
    if (addBox) {
      if (isAdmin && !isAll) {
        addBox.style.display = "";
        document.getElementById("lrn-add-class").textContent = cls;
      } else {
        addBox.style.display = "none";
      }
    }
    if (!res.students.length) { box.innerHTML = '<p class="muted">Bu sinfda hali o\'quvchi yo\'q.' + (isAdmin && !isAll ? ' Yuqoridan qo\'shing.' : '') + '</p>'; return; }
    box.innerHTML = "";
    // Fan tanlangan, lekin bu fandan dars qo'shilmagan — xabar + reytingsiz ro'yxat
    const noRank = subj && res.has_content === false;
    if (noRank) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.innerHTML = `📭 <b>${UI.esc(subj)}</b> fanidan hali dars qo'shilmagan. Dars qo'shilsa, reyting shu yerda paydo bo'ladi.`;
      box.appendChild(note);
    }
    res.students.forEach((s, i) => {
      const rank = i + 1;
      const medal = noRank ? "•" : (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank);
      const badgeCls = noRank ? "" : (rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "");
      const durTxt = s.total_duration_seconds > 0 ? ` • ⏱ jami ${this.fmtDurLong(s.total_duration_seconds)}` : "";
      const monthTxt = s.month_duration_seconds > 0 ? ` • 📅 shu oy ${this.fmtDurLong(s.month_duration_seconds)}` : "";
      const faollikTxt = (s.faollik_pct != null) ? ` • 📈 faollik ${s.faollik_pct}% (${s.done_lessons}/${s.total_lessons})` : "";
      const isAdmin = State.teacher && State.teacher.is_admin; // zavuch/boshqaruv
      const loginBtn = isAdmin ? `<button class="btn btn-secondary btn-sm" data-login="${s.id}" title="Bilim olish login/parolini o'zgartirish">${s.learn_username ? "📚 Login ✔" : "📚 Login"}</button>` : "";
      const delBtn = isAdmin ? `<button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️</button>` : "";
      const loginInfo = (isAdmin && s.learn_username) ? ` • 📚 <b>${UI.esc(s.learn_username)}</b>${s.learn_password ? " / " + UI.esc(s.learn_password) : ""}` : "";
      const row = document.createElement("div");
      row.className = "student-row" + (rank === 1 && s.coins > 0 ? " top1" : "");
      row.innerHTML = `
        <div class="rank-badge ${badgeCls}">${medal}</div>
        <div class="student-info">
          <div class="name">${UI.esc(s.last_name)} ${UI.esc(s.first_name)}${this.bahoBadgeHtml(s.baho, "Oylik baho")}${isAll && s.class_name ? ` <span class="role-tag role-teacher">${UI.esc(s.class_name)}</span>` : ""}</div>
          <div class="sub">🎬 ${s.videos} video • 🎧 ${s.audios} audio • 📖 ${s.texts} matn${faollikTxt}${durTxt}${monthTxt}${loginInfo}</div>
        </div>
        <div class="row-tail"><span class="coin-badge">🪙 ${s.coins}</span>${loginBtn}${delBtn}</div>`;
      row.querySelector(".student-info").onclick = () => this.showLearningDetail(s.id);
      const lb = row.querySelector("[data-login]");
      if (lb) lb.onclick = (e) => { e.stopPropagation(); this.setLearningLogin(s, () => this.loadLearning(cls)); };
      const db = row.querySelector("[data-del]");
      if (db) db.onclick = (e) => { e.stopPropagation(); this.deleteStudentFromLearning(s, cls); };
      box.appendChild(row);
    });
  },

  async addStudentFromLearning() {
    const cls = this.currentLrnClass;
    if (!cls || cls === "__all__") return UI.toast("Avval aniq sinfni tanlang", "err");
    const first = document.getElementById("lrn-first").value.trim();
    const last = document.getElementById("lrn-last").value.trim();
    if (!first || !last) return UI.toast("Ism va familiyani kiriting", "err");
    const res = await API.post("/api/students", { first_name: first, last_name: last, class_name: cls });
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    UI.toast("O'quvchi qo'shildi ✔", "ok");
    document.getElementById("lrn-first").value = "";
    document.getElementById("lrn-last").value = "";
    this.loadLearning(cls);
  },

  async bulkAddStudentsFromLearning() {
    const cls = this.currentLrnClass;
    if (!cls || cls === "__all__") return UI.toast("Avval aniq sinfni tanlang", "err");
    const raw = document.getElementById("lrn-bulk").value;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return UI.toast("Ro'yxatni kiriting (har qatorда: Familiya Ism)", "err");
    const prog = document.getElementById("lrn-add-prog");
    let added = 0, failed = 0;
    const errors = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) { failed++; errors.push(`"${line}" — Familiya Ism kerak`); continue; }
      const last = parts[0];
      const first = parts.slice(1).join(" ");
      prog.textContent = `⏳ Qo'shilmoqda: ${added + failed + 1}/${lines.length}...`;
      const res = await API.post("/api/students", { first_name: first, last_name: last, class_name: cls });
      if (res.ok) added++;
      else { failed++; errors.push(`"${line}" — ${res.error || "xatolik"}`); }
    }
    prog.textContent = "";
    document.getElementById("lrn-bulk").value = "";
    UI.toast(`✅ ${added} ta qo'shildi${failed ? `, ${failed} ta o'tkazib yuborildi` : ""}`, added ? "ok" : "err", 5000);
    if (errors.length) console.warn("Bulk add:", errors);
    this.loadLearning(cls);
  },

  deleteStudentFromLearning(s, cls) {
    this.confirm("O'quvchini o'chirish", `${s.last_name} ${s.first_name} va uning barcha natija/faoliyati o'chiriladi.`, async () => {
      const res = await API.del(`/api/students/${s.id}`);
      if (res.ok) { UI.toast("O'quvchi o'chirildi", "ok"); this.loadLearning(cls); }
      else UI.toast(res.error || "Xatolik", "err");
    });
  },

  async showLearningDetail(studentId) {
    const res = await API.get(`/api/learning/student/${studentId}`);
    if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
    const s = res.student;
    const icons = { video: "🎬", audio: "🎧", text: "📖" };
    let rows = "";
    if (!res.items.length) {
      rows = `<tr><td colspan="4" style="text-align:center;color:var(--muted)">Hali dars ko'rmagan/o'qimagan.</td></tr>`;
    } else {
      rows = res.items.map((a) => `<tr>
        <td>${icons[a.type] || ""} <b>${UI.esc(a.title)}</b><br><span class="muted">${UI.esc(a.subject)}</span></td>
        <td>${a.duration_seconds > 0 ? this.fmtDurLong(a.duration_seconds) : "—"}</td>
        <td>🪙 ${a.coins}</td>
        <td>${UI.esc(a.completed_at || "-")}</td>
      </tr>`).join("");
    }
    const daily = (res.daily || []);
    const dailyHtml = daily.length
      ? `<p class="muted" style="margin-top:12px">📆 Kunlik sarflangan vaqt:</p>
         <div class="daily-time-list">${daily.map((d) => `
           <div class="daily-time-row${d.date === this._todayStr() ? " today" : ""}">
             <span class="d-date">${this._dateLabel(d.date)}</span>
             <span class="d-secs">⏱ ${this.fmtDurLong(d.seconds)}</span>
           </div>`).join("")}</div>`
      : "";
    UI.modal(`
      <h2>${UI.esc(s.last_name)} ${UI.esc(s.first_name)} <span class="muted" style="font-size:1rem">(${UI.esc(s.class_name)})</span></h2>
      <div class="modal-info-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
        <div class="info-box"><div class="k">🪙 Coinlar</div><div class="v">${s.coins}</div></div>
        <div class="info-box"><div class="k">📅 Bugun</div><div class="v" style="font-size:1.05rem">${this.fmtDurLong(res.today_duration_seconds)}</div></div>
        <div class="info-box"><div class="k">🗓 Shu oy</div><div class="v" style="font-size:1.05rem">${this.fmtDurLong(res.month_duration_seconds)}</div></div>
        <div class="info-box"><div class="k">⏱ Jami vaqt</div><div class="v" style="font-size:1.05rem">${this.fmtDurLong(res.total_duration_seconds)}</div></div>
      </div>
      ${UI.chart7(daily)}
      ${dailyHtml}
      <p class="muted" style="margin-top:12px">Ko'rilgan/o'qilgan darslar:</p>
      <div style="overflow-x:auto"><table class="sub-table">
        <thead><tr><th>Dars</th><th>Vaqt</th><th>Coin</th><th>Sana</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    `, { large: true });
  },

  _todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
  _dateLabel(dateStr) {
    const today = this._todayStr();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yStr = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    if (dateStr === today) return "Bugun (" + dateStr + ")";
    if (dateStr === yStr) return "Kecha (" + dateStr + ")";
    return dateStr;
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
    const subj = document.getElementById("res-subject") ? document.getElementById("res-subject").value : "";
    const prep = res.students.map((s) => {
      const subs = subj ? s.submissions.filter((x) => x.subject === subj) : s.submissions;
      return { ...s, submissions: subs, submitted: subs.length > 0 };
    });
    const submitted = prep.filter((s) => s.submitted).map((s) => ({ s, st: this.bestStats(s) }));
    submitted.sort((a, b) => (b.st.pct - a.st.pct) || (a.st.dur - b.st.dur));
    const pending = prep.filter((s) => !s.submitted);
    // Kod: bitta o'quvchi uchun birinchi test kodi (yoki eng yaxshi)
    const getCode = (s) => {
      if (!s.submissions.length) return "-";
      return s.submissions[0].test_title || "-";
    };
    let rows = "";
    submitted.forEach(({ s, st }, i) => {
      const baho = this.bahoOf(st.pct);
      const bahoCls = baho >= 5 ? "color:#23c483" : baho >= 4 ? "color:#3ca6ff" : baho >= 3 ? "color:#f8a928" : "color:#e94b4b";
      const latestCode = s.submissions[0] ? (s.submissions[0].test_id ? "#" + s.submissions[0].test_id : "-") : "-";
      rows += `<tr>
        <td>${i + 1}</td>
        <td>${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</td>
        <td><b style="${bahoCls}">${baho}</b></td>
        <td>${st.pct}%</td>
        <td>${this.fmtDur(st.dur)}</td>
        <td>${st.count}</td>
        <td>${s.has_violation ? "⚠️ Xavf" : "✔"}</td>
      </tr>`;
    });
    pending.forEach((s) => {
      rows += `<tr><td>-</td><td>${UI.esc(s.last_name)} ${UI.esc(s.first_name)}</td><td colspan="6" style="color:#999">Topshirmagan</td></tr>`;
    });
    const now = new Date().toLocaleDateString("uz-UZ");
    const w = window.open("", "_blank");
    if (!w) return UI.toast("Popup bloklangan — ruxsat bering", "err");
    w.document.write(`<html><head><title>Natijalar ${UI.esc(cls)}</title><meta charset="utf-8">
      <style>body{font-family:Arial,sans-serif;padding:24px;font-size:14px}h1{color:#6a41ff;margin-bottom:4px}
      .meta{color:#888;margin-bottom:14px;font-size:12px}
      table{border-collapse:collapse;width:100%;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#efe9ff;font-weight:700}
      tr:nth-child(even){background:#f7f7ff}
      .foot{margin-top:18px;color:#aaa;font-size:11px;text-align:right}
      @media print{body{padding:12px}}</style></head>
      <body>
      <h1>📊 ${UI.esc(cls)} sinf — natijalar${subj ? " • " + UI.esc(subj) : ""}</h1>
      <div class="meta">Sana: ${now} • MaktabTest.uz • Topshirdi: ${submitted.length} ta, topshirmadi: ${pending.length} ta</div>
      <table><thead><tr><th>#</th><th>O'quvchi</th><th>Baho</th><th>Foiz</th><th>Vaqt</th><th>Testlar</th><th>Holat</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="foot">MaktabTest.uz — ${now}</div>
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

  /* =============== BILIM OLISH LOGINI (o'quvchi uchun) =============== */
  setLearningLogin(s, onSaved) {
    const curPass = s.learn_password ? ` • Joriy parol: <b>${UI.esc(s.learn_password)}</b>` : "";
    UI.modal(`
      <span class="modal-icon">📚</span>
      <h2 style="text-align:center">Bilim olish login/paroli</h2>
      <p class="muted" style="text-align:center">${UI.esc(s.last_name)} ${UI.esc(s.first_name)} shu login/parol bilan "Bilim olish"ga kiradi.${curPass}</p>
      <div class="field-row"><label>Login</label><input id="ll-user" class="inp" value="${UI.esc(s.learn_username || "")}" placeholder="masalan: aziza5"></div>
      <div class="field-row"><label>Yangi parol</label><input id="ll-pass" class="inp" type="text" placeholder="kamida 4 ta belgi"></div>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-success" id="ll-save">💾 Saqlash</button></div>
    `);
    document.getElementById("ll-save").onclick = async () => {
      const u = document.getElementById("ll-user").value.trim();
      const p = document.getElementById("ll-pass").value;
      if (!u) return UI.toast("Login kiriting", "err");
      if (p.length < 4) return UI.toast("Parol kamida 4 ta belgi bo'lsin", "err");
      const res = await API.post(`/api/students/${s.id}/learning-login`, { username: u, password: p });
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      UI.toast("Bilim olish login/paroli saqlandi ✔", "ok");
      if (typeof onSaved === "function") onSaved();
    };
  },

  /* =============== O'QITUVCHILAR =============== */
  async loadTeachers() {
    const res = await API.get("/api/teachers");
    const box = document.getElementById("teachers-list");
    if (!res.ok) { box.innerHTML = ""; return; }
    // Rol tanlash boshqaruv/direktorда ko'rinadi (zavuch ham qo'sha oladi)
    const roleSel = document.getElementById("tch-role");
    if (roleSel) roleSel.style.display = (res.my_role === "director" || res.my_role === "owner") ? "" : "none";
    box.innerHTML = "";
    res.teachers.forEach((t) => {
      const roleTag = `<span class="role-tag role-${t.role}">${UI.esc(t.role_label)}</span>`;
      const suspTag = t.suspended ? '<span class="chip off">⏸️ to\'xtatilgan</span>' : "";
      const row = document.createElement("div");
      row.className = "parent-cred";
      let actions = "";
      const myRole = res.my_role;
      if (t.is_me) actions = '<span class="muted">(joriy hisob)</span>';
      else if (t.role === "teacher") {
        const acLabel = t.assigned_classes ? `📌 ${t.assigned_classes.split(",").length} sinf` : "📌 Hammasi";
        actions = `
          <button class="btn btn-secondary btn-sm" data-creds="${t.id}">🔑 Login/parol</button>
          <button class="btn btn-ghost btn-sm" data-susp="${t.id}">${t.suspended ? "▶️ Faollashtirish" : "⏸️ To'xtatish"}</button>
          <button class="btn btn-ghost btn-sm" data-classes="${t.id}" title="Sinflarni biriktirish">${acLabel}</button>
          <button class="btn btn-danger btn-sm" data-del="${t.id}">🗑️ O'chirish</button>`;
      } else if ((t.role === "zavuch" || t.role === "director") && myRole === "owner") {
        // Boshqaruv zavuchning login/parolini yangilaydi va zavuchni o'chira oladi
        actions = `
          <button class="btn btn-secondary btn-sm" data-creds="${t.id}">🔑 Login/parol</button>
          <button class="btn btn-danger btn-sm" data-del="${t.id}">🗑️ O'chirish</button>`;
      }
      const credLine = `<div class="pc-creds"><span class="cred-pill">Login: <b>${UI.esc(t.username)}</b></span>${t.password ? `<span class="cred-pill">Parol: <b>${UI.esc(t.password)}</b></span>` : '<span class="muted">parol ko\'rinmaydi (eski hisob)</span>'}</div>`;
      const countLine = (t.role === "teacher")
        ? `<div class="sub" style="margin-top:4px">👥 ${t.students_count} o'quvchi • 📌 ${t.classes_count ? t.classes_count + " sinf" : "barcha sinflar"} • 📋 ${t.tests_count} test</div>`
        : "";
      row.innerHTML = `
        <div class="pc-info"><b>${UI.esc(t.username)}</b> ${roleTag} ${suspTag} ${t.is_me ? '<span class="chip on">Siz</span>' : ""}${credLine}${countLine}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div>`;
      const del = row.querySelector("[data-del]"); if (del) del.onclick = () => this.deleteTeacher(t.id, t.username);
      const creds = row.querySelector("[data-creds]"); if (creds) creds.onclick = () => this.openTeacherCredentials(t);
      const susp = row.querySelector("[data-susp]"); if (susp) susp.onclick = () => this.suspendTeacher(t);
      const cls = row.querySelector("[data-classes]"); if (cls) cls.onclick = () => this.setTeacherClasses(t);
      box.appendChild(row);
    });
  },

  setTeacherClasses(t) {
    const current = t.assigned_classes ? t.assigned_classes.split(",").filter(Boolean) : [];
    const allCls = State.meta.classes || [];
    const checks = allCls.map((c) =>
      `<label class="chk-label" style="display:inline-flex;gap:6px;padding:4px 8px;margin:2px;background:var(--bg-2);border-radius:6px">
        <input type="checkbox" class="ac-chk" value="${UI.esc(c)}" ${current.includes(c) ? "checked" : ""}> ${UI.esc(c)}
      </label>`
    ).join("");
    UI.modal(`
      <span class="modal-icon">📌</span>
      <h2 style="text-align:center">${UI.esc(t.username)} — sinflar</h2>
      <p class="muted" style="text-align:center">Bo'sh qoldirsangiz, o'qituvchi barcha sinflarni ko'ra oladi.</p>
      <div style="display:flex;flex-wrap:wrap;gap:2px;max-height:300px;overflow-y:auto;margin:10px 0">${checks}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="ac-all">Hammasini belgilash</button>
        <button class="btn btn-ghost" id="ac-none">Tozalash</button>
        <button class="btn btn-success" id="ac-save">💾 Saqlash</button>
      </div>`, { large: true });
    document.getElementById("ac-all").onclick = () => document.querySelectorAll(".ac-chk").forEach((c) => (c.checked = true));
    document.getElementById("ac-none").onclick = () => document.querySelectorAll(".ac-chk").forEach((c) => (c.checked = false));
    document.getElementById("ac-save").onclick = async () => {
      const selected = Array.from(document.querySelectorAll(".ac-chk:checked")).map((c) => c.value);
      const res = await API.post(`/api/teachers/${t.id}/classes`, { classes: selected });
      if (!res.ok) return UI.toast(res.error || "Xatolik", "err");
      UI.closeModal();
      UI.toast(selected.length ? `${selected.length} ta sinf biriktirildi ✔` : "Barcha sinflar ochiq ✔", "ok");
      this.loadTeachers();
    };
  },

  openTeacherCredentials(t) {
    UI.modal(`
      <span class="modal-icon">🔑</span>
      <h2 style="text-align:center">${UI.esc(t.username)} — login/parol</h2>
      <p class="muted" style="text-align:center">Joriy parol shart emas. Faqat o'zgartirmoqchi bo'lgan maydonni to'ldiring.</p>
      <div class="field-row"><label>Yangi login (ixtiyoriy)</label><input id="tc-user" class="inp" value="${UI.esc(t.username)}"></div>
      <div class="field-row"><label>Yangi parol (ixtiyoriy)</label><input id="tc-pass" class="inp" type="text" placeholder="Kamida 4 ta belgi"></div>
      <div style="text-align:center"><button class="btn btn-success" id="tc-save">💾 Saqlash</button></div>`);
    document.getElementById("tc-save").onclick = async () => {
      const u = document.getElementById("tc-user").value.trim();
      const p = document.getElementById("tc-pass").value;
      if (!u && !p) return UI.toast("Login yoki parol kiriting", "err");
      if (p && p.length < 4) return UI.toast("Parol kamida 4 ta belgi bo'lsin", "err");
      const res = await API.post(`/api/teachers/${t.id}/credentials`, { username: u, password: p });
      if (res.ok) { UI.closeModal(); UI.toast("Login/parol yangilandi ✔", "ok"); this.loadTeachers(); }
      else UI.toast(res.error || "Xatolik", "err");
    };
  },
  async suspendTeacher(t) {
    const res = await API.post(`/api/teachers/${t.id}/suspend`);
    if (res.ok) { UI.toast(res.suspended ? "O'qituvchi to'xtatildi" : "O'qituvchi faollashtirildi", "ok"); this.loadTeachers(); }
    else UI.toast(res.error || "Xatolik", "err");
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

  /* =============== PROFIL (panel egasi) =============== */
  async loadProfile() {
    const box = document.getElementById("profile-panel-content");
    if (!box) return;
    box.innerHTML = '<p class="muted">Yuklanmoqda...</p>';
    const res = await API.get("/api/profile");
    if (!res.ok) { box.innerHTML = '<p class="muted">Xatolik</p>'; return; }
    const p = res.profile;
    const c = p.counts || {};
    const initials = (p.username || "?").slice(0, 2).toUpperCase();
    const acList = p.assigned_classes ? p.assigned_classes.split(",").filter(Boolean) : [];
    const acHtml = acList.length
      ? acList.map((x) => `<span class="chip on">${UI.esc(x)}</span>`).join(" ")
      : '<span class="muted">Barcha sinflar</span>';
    const tiles = [];
    if (p.role === "owner") tiles.push(`<div class="stat-tile"><div class="num">🏫 ${c.schools != null ? c.schools : "—"}</div><div class="lbl">Maktablar</div></div>`);
    tiles.push(`<div class="stat-tile"><div class="num">👥 ${c.students || 0}</div><div class="lbl">O'quvchilar</div></div>`);
    tiles.push(`<div class="stat-tile"><div class="num">📋 ${c.tests || 0}</div><div class="lbl">${p.role === "teacher" ? "Mening testlarim" : "Testlar"}</div></div>`);
    tiles.push(`<div class="stat-tile"><div class="num">📚 ${c.lessons || 0}</div><div class="lbl">Darslar</div></div>`);
    box.innerHTML = `
      <div class="profile-card">
        <div class="profile-head">
          <div class="student-avatar" style="width:64px;height:64px;font-size:1.6rem">${UI.esc(initials)}</div>
          <div>
            <h2 style="margin:0">${UI.esc(p.username)}</h2>
            <div><span class="role-tag role-${p.role}">${UI.esc(p.role_label)}</span>${p.school_name ? ` <span class="muted">🏫 ${UI.esc(p.school_name)}</span>` : ""}</div>
          </div>
        </div>
        <div class="stat-tiles" style="margin-top:16px">${tiles.join("")}</div>
        <div class="field-row" style="margin-top:16px"><label>📌 Biriktirilgan sinflar</label><div>${acHtml}</div></div>
        <div class="field-row"><label>🗓 Ro'yxatdan o'tgan sana</label><div>${UI.esc(p.created_at || "—")}</div></div>
        <div style="margin-top:14px"><button class="btn btn-secondary" id="prof-to-settings">⚙️ Login/parolni o'zgartirish</button></div>
      </div>`;
    const b = document.getElementById("prof-to-settings");
    if (b) b.onclick = () => this.showSection("settings");
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
