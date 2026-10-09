/* ===== O'QUVCHI: test topshirish, taймер, anti-cheat ===== */
const Student = {
  graceTimer: null,

  /* Boshqaruv tugmalarini bir marta ulash */
  bindControls() {
    document.getElementById("btn-prev").onclick = () => {
      if (State.exam) this.renderQuestion(Math.max(0, State.exam.index - 1));
    };
    document.getElementById("btn-next").onclick = () => {
      if (State.exam) this.renderQuestion(Math.min(State.exam.questions.length - 1, State.exam.index + 1));
    };
    document.getElementById("btn-finish").onclick = () => this.finish(false);
    document.getElementById("btn-finish-2").onclick = () => this.finish(false);
  },

  /* ---------- Kutish xonasi: ustoz "Start" bermaguncha ---------- */
  enterWaitingRoom(payload) {
    this._waitPayload = payload;
    this._waitTries = 0;
    this.renderWaitingModal();
    this._waitInterval = setInterval(() => this.pollWaitingRoom(), 3000);
  },

  renderWaitingModal() {
    UI.modal(`
      <style>
        @keyframes wait-spin { to { transform: rotate(360deg); } }
        .wait-spinner {
          width: 46px; height: 46px; margin: 20px auto;
          border: 4px solid rgba(124,58,237,.15);
          border-top-color: #7c3aed;
          border-radius: 50%;
          animation: wait-spin 1s linear infinite;
        }
      </style>
      <span class="modal-icon">⏳</span>
      <h2 style="text-align:center">Iltimos, o'qituvchingiz testga start berishini kuting</h2>
      <p style="text-align:center">Siz testga kirdingiz. Ustozingiz <b>"Start berish"</b>ni bosishi bilan test avtomatik boshlanadi — hech narsa qilish shart emas.</p>
      <div class="wait-spinner"></div>
      <p class="muted" id="wait-status" style="text-align:center;font-size:.85rem">Tekshirilmoqda...</p>
      <div style="text-align:center;margin-top:10px">
        <button class="btn btn-ghost" id="wait-cancel">Bekor qilish</button>
      </div>
    `, { closable: false });
    const cancelBtn = document.getElementById("wait-cancel");
    if (cancelBtn) cancelBtn.onclick = () => this.cancelWaitingRoom();
  },

  async pollWaitingRoom() {
    if (!this._waitPayload) return;
    this._waitTries++;
    const res = await API.post("/api/student/start", this._waitPayload);
    if (!this._waitPayload) return; // shu orada bekor qilingan bo'lishi mumkin
    if (res.ok) {
      this.stopWaitingPoll();
      UI.closeModal();
      this.start(res);
      return;
    }
    if (res.waiting) {
      const statusEl = document.getElementById("wait-status");
      if (statusEl) statusEl.textContent = `Tekshirilmoqda... (${this._waitTries})`;
      return;
    }
    // Kutish davomida boshqa (haqiqiy) xato yuz berdi — masalan kod bekor qilindi
    this.stopWaitingPoll();
    UI.modal(`
      <span class="modal-icon">⚠️</span>
      <h2 style="text-align:center;color:var(--danger-1)">Kirib bo'lmadi</h2>
      <p style="text-align:center">${UI.esc(res.error || "Xatolik yuz berdi")}</p>
      <div style="text-align:center;margin-top:18px">
        <button class="btn btn-primary" id="wait-err-ok">Tushunarli</button>
      </div>
    `, { closable: false });
    const okBtn = document.getElementById("wait-err-ok");
    if (okBtn) okBtn.onclick = () => UI.closeModal();
  },

  cancelWaitingRoom() {
    this.stopWaitingPoll();
    UI.closeModal();
  },

  stopWaitingPoll() {
    if (this._waitInterval) { clearInterval(this._waitInterval); this._waitInterval = null; }
    this._waitPayload = null;
  },

  /* Testni boshlash (server javobidan) */
  start(payload) {
    const t = payload.test;
    State.exam = {
      submissionId: payload.submission_id,
      token: payload.token,
      test: t,
      questions: t.questions,
      answers: {},
      index: 0,
      active: true,
      finished: false,
      remaining: t.duration_minutes * 60,
      warned30: false,
      timerId: null,
    };
    document.getElementById("st-subject").textContent = t.subject;
    document.getElementById("st-title").textContent = t.title;
    document.getElementById("st-student").textContent =
      `${payload.student.first_name} ${payload.student.last_name} • ${payload.student.class_name}`;
    document.getElementById("q-total").textContent = t.questions.length;

    UI.showView("view-student");
    this.renderQuestion(0);
    this.startTimer();
    this.trapBack();
    this.startStatusPoll();
    // Anti-cheat'ni 1 soniyadan keyin yoqamiz (kirish bosilishi bilan yolg'on ishlamasin)
    setTimeout(() => this.enableAntiCheat(), 1000);
  },

  /* O'qituvchi testni to'xtatганини sezish (har 10s) */
  startStatusPoll() {
    this._statusPoll = setInterval(async () => {
      const ex = State.exam;
      if (!ex || !ex.active) return;
      const res = await API.post("/api/student/status", { submission_id: ex.submissionId, token: ex.token, answers: ex.answers });
      if (res.ok && res.status && res.status !== "in_progress" && ex.active) {
        this.teacherStopped();
      }
    }, 10000);
  },
  stopStatusPoll() {
    if (this._statusPoll) { clearInterval(this._statusPoll); this._statusPoll = null; }
  },
  teacherStopped() {
    const ex = State.exam;
    if (!ex || !ex.active) return;
    ex.active = false; ex.finished = true;
    this.stopTimer(); this.stopStatusPoll(); this.disableAntiCheat();
    UI.modal(`
      <span class="modal-icon">⏸️</span>
      <h2 style="text-align:center;color:var(--danger-1)">Test to'xtatildi</h2>
      <p style="text-align:center">Siz <b>o'qituvchi tomonidan</b> to'xtatildingiz.<br>Iltimos kuting yoki ustozingizga murojaat qiling.</p>
      <div style="text-align:center;margin-top:18px">
        <button class="btn btn-primary" id="stopped-home">Bosh sahifaga qaytish</button>
      </div>
    `, { closable: false });
    document.getElementById("stopped-home").onclick = () => { UI.closeModal(); this.reset(); UI.showView("view-login"); };
  },

  renderQuestion(i) {
    const ex = State.exam;
    if (!ex) return;
    ex.index = i;
    const q = ex.questions[i];
    document.getElementById("q-current").textContent = i + 1;
    const qTextEl = document.getElementById("q-text");
    qTextEl.innerHTML = "";
    if (q.image) {
      const img = document.createElement("img");
      img.src = q.image; img.className = "q-image"; img.alt = "savol rasmi";
      qTextEl.appendChild(img);
    }
    const tx = document.createElement("div");
    tx.textContent = q.text; qTextEl.appendChild(tx);

    const optsBox = document.getElementById("q-options");
    optsBox.innerHTML = "";
    const letters = ["A", "B", "C", "D"];
    const vals = [q.option_a, q.option_b, q.option_c, q.option_d];
    letters.forEach((L, idx) => {
      const div = document.createElement("div");
      div.className = "opt" + (ex.answers[q.id] === L ? " selected" : "");
      div.innerHTML = `<span class="opt-letter">${L}</span><span>${UI.esc(vals[idx])}</span>`;
      div.onclick = () => this.selectOption(q.id, L);
      optsBox.appendChild(div);
    });

    document.getElementById("btn-prev").disabled = i === 0;
    const isLast = i === ex.questions.length - 1;
    document.getElementById("btn-next").style.display = isLast ? "none" : "";
    document.getElementById("btn-finish").style.display = isLast ? "" : "none";

    this.renderNavigator();
  },

  selectOption(qid, L) {
    State.exam.answers[qid] = L;
    this.renderQuestion(State.exam.index);
  },

  renderNavigator() {
    const ex = State.exam;
    const grid = document.getElementById("nav-grid");
    grid.innerHTML = "";
    ex.questions.forEach((q, i) => {
      const cell = document.createElement("div");
      cell.className = "nav-cell";
      if (ex.answers[q.id]) cell.classList.add("answered");
      if (i === ex.index) cell.classList.add("current");
      cell.textContent = i + 1;
      cell.onclick = () => this.renderQuestion(i);
      grid.appendChild(cell);
    });
  },

  /* ---------- Taймер ---------- */
  startTimer() {
    const ex = State.exam;
    this.updateTimerDisplay();
    ex.timerId = setInterval(() => {
      ex.remaining--;
      this.updateTimerDisplay();
      if (ex.remaining === 30 && !ex.warned30) { ex.warned30 = true; this.warn30(); }
      if (ex.remaining <= 0) this.timeUp();
    }, 1000);
  },
  stopTimer() {
    if (State.exam && State.exam.timerId) clearInterval(State.exam.timerId);
  },
  updateTimerDisplay() {
    const ex = State.exam;
    const r = Math.max(ex.remaining, 0);
    const m = Math.floor(r / 60), s = r % 60;
    const el = document.getElementById("timer");
    el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("warn", ex.remaining <= 30);
  },
  warn30() {
    const b = document.createElement("div");
    b.className = "time-warn-modal";
    b.innerHTML = "⏰ <span>Diqqat! 30 soniya vaqtingiz qoldi — shoshiling!</span>";
    document.body.appendChild(b);
    setTimeout(() => {
      b.style.transition = "opacity .5s, transform .5s";
      b.style.opacity = "0";
      b.style.transform = "translate(-50%, -60px)";
      setTimeout(() => b.remove(), 520);
    }, 5000);
  },
  timeUp() {
    this.stopTimer();
    UI.toast("Vaqt tugadi! Test yakunlanmoqda...", "warn");
    this.doSubmit();
  },

  /* ---------- Yakunlash ---------- */
  finish(auto) {
    const ex = State.exam;
    if (!ex || ex.finished) return;
    if (auto) { this.doSubmit(); return; }
    const answered = Object.keys(ex.answers).length;
    const total = ex.questions.length;
    UI.modal(`
      <span class="modal-icon">📤</span>
      <h2 style="text-align:center">Testni yakunlaysizmi?</h2>
      <p style="text-align:center">Siz <b>${answered}</b> / ${total} ta savolga javob berdingiz.
      ${answered < total ? "<br>Javobsiz savollar <b>xato</b> hisoblanadi." : ""}</p>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="cancel-finish">Yo'q, davom etaman</button>
        <button class="btn btn-success" id="confirm-finish">Ha, yakunlayman ✓</button>
      </div>
    `);
    document.getElementById("cancel-finish").onclick = () => UI.closeModal();
    document.getElementById("confirm-finish").onclick = () => this.doSubmit();
  },

  async doSubmit() {
    const ex = State.exam;
    if (!ex || ex.finished) return;
    ex.finished = true;
    ex.active = false;
    this.stopTimer();
    this.stopStatusPoll();
    this.disableAntiCheat();
    UI.closeModal();
    const res = await API.post("/api/student/submit", {
      submission_id: ex.submissionId, token: ex.token, answers: ex.answers,
    });
    if (!res.ok) { UI.toast(res.error || "Yuborishda xatolik", "err"); return; }
    this.showResult(res.result);
  },

  showResult(r, noFx) {
    if (!noFx) Fireworks.start(6500);
    const hasReview = Array.isArray(r.review) && r.review.length;
    const canCert = r.percentage >= 85 && State.exam;
    // Yangi yutuqlar — toast ko'rinishida
    if (!noFx && Array.isArray(r.achievements) && r.achievements.length) {
      r.achievements.forEach((a, i) => {
        setTimeout(() => UI.toast(`${a.icon} ${a.title} • +${a.coins} coin`, "ok", 5500), 800 + i * 1800);
      });
    }
    UI.modal(`
      <span class="modal-icon">🎉</span>
      <h2 style="text-align:center">Tabriklaymiz! Siz testni tugatdingiz</h2>
      <div class="result-score">${r.score} / ${r.total}</div>
      <div class="result-bars">
        <span class="result-chip ok">✔ To'g'ri: ${r.correct_count}</span>
        <span class="result-chip no">✘ Xato: ${r.wrong_count}</span>
        <span class="result-chip pct">📊 ${r.percentage}%</span>
      </div>
      <div style="text-align:center;margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${canCert ? '<button class="btn btn-success" id="get-cert">🎓 Sertifikat olish</button>' : ""}
        ${hasReview ? '<button class="btn btn-secondary" id="show-review">📝 Xatolar ustida ishlash</button>' : ""}
        <button class="btn btn-primary btn-lg" id="go-home">🏠 Bosh sahifaga qaytish</button>
      </div>
    `, { closable: false });
    if (canCert) document.getElementById("get-cert").onclick = () => this.openCertificate(r);
    if (hasReview) document.getElementById("show-review").onclick = () => this.showReview(r);
    document.getElementById("go-home").onclick = () => {
      UI.closeModal(); Fireworks.stop(); this.reset(); UI.showView("view-login");
    };
  },

  /* PDF sertifikat — chop etilganda bir sahifali A4 (gorizontal) sertifikat */
  openCertificate(r) {
    const t = State.exam && State.exam.test;
    const studentName = document.getElementById("st-student").textContent.split("•")[0].trim() || "O'quvchi";
    const className = (document.getElementById("st-student").textContent.split("•")[1] || "").trim();
    const subject = t ? t.subject : "";
    const title = t ? t.title : "Test";
    const date = new Date().toLocaleDateString("uz-UZ");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sertifikat</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  body { margin:0; font-family: 'Georgia', serif; background:#f0f0f5; }
  .cert { width: 297mm; height: 210mm; padding: 20mm; box-sizing: border-box;
    background: #fff; position: relative; margin: 0 auto;
    background-image:
      radial-gradient(circle at 10% 10%, rgba(124,92,255,.08), transparent 40%),
      radial-gradient(circle at 90% 90%, rgba(255,92,174,.08), transparent 40%); }
  .border { position:absolute; inset: 10mm; border: 3px double #6d4bff; border-radius: 6mm; }
  .ribbon { font-size: 42pt; color: #ffb400; letter-spacing: 2pt; text-align:center; margin-top: 6mm; font-weight: 900; }
  .h1 { text-align:center; font-size: 36pt; color: #1a1a3a; margin: 10mm 0 2mm; letter-spacing: 1pt; }
  .sub { text-align:center; color:#5a5a7a; font-size: 14pt; margin-bottom: 14mm; }
  .name { text-align:center; font-size: 32pt; color: #6d4bff; font-weight: 700; text-decoration: underline; text-decoration-color: #ff5cae; text-underline-offset: 8pt; margin-bottom: 8mm; }
  .about { text-align:center; font-size: 14pt; color:#333; line-height:1.6; max-width: 180mm; margin: 0 auto; }
  .score { text-align:center; font-size: 28pt; color:#23c483; font-weight:800; margin-top: 10mm; }
  .foot { position:absolute; left:20mm; right:20mm; bottom: 20mm; display:flex; justify-content:space-between; font-size: 11pt; color:#444; }
  .foot b { display:block; border-top: 1px solid #777; padding-top: 3mm; font-size: 10pt; }
  .seal { position:absolute; right:30mm; bottom:40mm; width: 42mm; height: 42mm; border: 4px solid #c8213f;
    border-radius: 50%; display:grid; place-items:center; text-align:center; color:#c8213f; font-weight:800;
    font-size: 9pt; transform: rotate(-12deg); }
</style></head><body><div class="cert">
  <div class="border"></div>
  <div class="ribbon">★ ★ ★</div>
  <div class="h1">SERTIFIKAT</div>
  <div class="sub">— MaktabTest.uz —</div>
  <div class="about">Ushbu sertifikat</div>
  <div class="name">${this._htmlEsc(studentName)}</div>
  <div class="about">${this._htmlEsc(className)} o'quvchisiga <b>"${this._htmlEsc(title)}"</b> (${this._htmlEsc(subject)}) testini yuqori darajada muvaffaqiyatli topshirgani uchun berildi.</div>
  <div class="score">★ ${r.correct_count} / ${r.total} • ${r.percentage}% ★</div>
  <div class="seal">MaktabTest.uz<br>TASDIQLANDI</div>
  <div class="foot">
    <div><b>Sana: ${this._htmlEsc(date)}</b></div>
    <div><b>Imzo: ______________</b></div>
  </div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return UI.toast("Popup bloklangan — brauzer ruxsat berishini so'rang", "err", 5000);
    w.document.write(html); w.document.close();
  },
  _htmlEsc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); },

  /* Xatolar ustida ishlash — har savolda to'g'ri va o'quvchi javobi */
  showReview(r) {
    const rows = (r.review || []).map((q, i) => {
      const opts = ["A", "B", "C", "D"].map((L) => {
        const text = q.options[L] || "";
        const isCorrect = L === q.correct;
        const isChosen = L === q.chosen;
        let cls = "rv-opt";
        if (isCorrect) cls += " rv-correct";
        else if (isChosen) cls += " rv-wrong";
        const tag = isCorrect ? " ✔" : (isChosen ? " ✘" : "");
        return `<div class="${cls}"><b>${L})</b> ${UI.esc(text)}${tag}</div>`;
      }).join("");
      const ok = q.is_correct;
      return `<div class="rv-q ${ok ? "ok" : "bad"}">
        <div class="rv-qhead"><span>${i + 1}. ${UI.esc(q.text)}</span><span class="rv-badge ${ok ? "ok" : "bad"}">${ok ? "To'g'ri" : "Xato"}</span></div>
        ${q.image ? `<img src="${q.image}" class="rv-image" alt="savol rasmi">` : ""}
        ${opts}
        ${!q.chosen ? '<div class="rv-note">Javob bermagansiz</div>' : ""}
      </div>`;
    }).join("");
    UI.modal(`
      <h2 style="text-align:center">📝 Xatolar ustida ishlash</h2>
      <p class="muted" style="text-align:center">🟢 Yashil — to'g'ri javob • 🔴 Qizil — sizning xato javobingiz</p>
      <div class="review-list">${rows}</div>
      <div style="text-align:center;margin-top:16px">
        <button class="btn btn-primary" id="rv-back">← Natijaga qaytish</button>
      </div>
    `, { large: true, closable: false });
    document.getElementById("rv-back").onclick = () => this.showResult(r, true);
  },

  /* ---------- Anti-cheat (nazorat) ---------- */
  enableAntiCheat() {
    if (!State.exam || !State.exam.active) return;

    this._onVis = () => {
      if (document.hidden) this.violation("Boshqa oyna yoki ilovaga o'tishga urindingiz");
    };
    this._onBlur = () => {
      if (this.graceTimer) clearTimeout(this.graceTimer);
      this.graceTimer = setTimeout(() => {
        if (!document.hasFocus()) this.violation("Sayt oynasidan chiqib ketdingiz");
      }, 500);
    };
    this._onFocus = () => {
      if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
    };
    this._onCtx = (e) => {
      e.preventDefault();
      UI.toast("Bu amal test vaqtida taqiqlangan", "warn", 1500);
    };
    this._onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      if (e.key === "F12" ||
          (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k)) ||
          (e.ctrlKey && k === "u")) {
        e.preventDefault();
        UI.toast("Bu amal taqiqlangan", "warn", 1500);
      }
    };
    this._onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    this._onPageHide = () => {
      if (State.exam && State.exam.active) {
        const payload = JSON.stringify({
          submission_id: State.exam.submissionId, token: State.exam.token,
          answers: State.exam.answers, reason: "Sahifani yopdi yoki yangiladi",
        });
        try {
          navigator.sendBeacon("/api/student/violation", new Blob([payload], { type: "application/json" }));
        } catch (e) {}
      }
    };

    document.addEventListener("visibilitychange", this._onVis);
    window.addEventListener("blur", this._onBlur);
    window.addEventListener("focus", this._onFocus);
    document.addEventListener("contextmenu", this._onCtx);
    document.addEventListener("keydown", this._onKey);
    window.addEventListener("beforeunload", this._onBeforeUnload);
    window.addEventListener("pagehide", this._onPageHide);
  },

  disableAntiCheat() {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    document.removeEventListener("visibilitychange", this._onVis);
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("focus", this._onFocus);
    document.removeEventListener("contextmenu", this._onCtx);
    document.removeEventListener("keydown", this._onKey);
    window.removeEventListener("beforeunload", this._onBeforeUnload);
    window.removeEventListener("pagehide", this._onPageHide);
  },

  async violation(reason) {
    const ex = State.exam;
    if (!ex || !ex.active) return;
    ex.active = false;
    ex.finished = true;
    this.stopTimer();
    this.stopStatusPoll();
    this.disableAntiCheat();
    await API.post("/api/student/violation", {
      submission_id: ex.submissionId, token: ex.token, answers: ex.answers, reason,
    });
    UI.modal(`
      <span class="modal-icon">⚠️</span>
      <h2 style="text-align:center;color:var(--danger-1)">Xavf aniqlandi!</h2>
      <p style="text-align:center">${UI.esc(reason)}.<br><b>Siz test topshirishdan chetlashtirildingiz.</b></p>
      <div style="text-align:center;margin-top:18px">
        <button class="btn btn-danger btn-lg" id="viol-home">Bosh sahifaga qaytish</button>
      </div>
    `, { closable: false });
    document.getElementById("viol-home").onclick = () => {
      UI.closeModal(); this.reset(); UI.showView("view-login");
    };
  },

  /* Test vaqtida "orqaga" ishlamasin */
  trapBack() {
    history.pushState({ exam: true }, "");
    this._onPop = () => {
      if (State.exam && State.exam.active) {
        history.pushState({ exam: true }, "");
        UI.toast("Test vaqtida orqaga qaytib bo'lmaydi", "warn", 1800);
      }
    };
    window.addEventListener("popstate", this._onPop);
  },

  reset() {
    this.stopTimer();
    this.stopStatusPoll();
    this.disableAntiCheat();
    if (this._onPop) window.removeEventListener("popstate", this._onPop);
    State.exam = null;
  },
};
