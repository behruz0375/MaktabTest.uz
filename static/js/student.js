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
    // Anti-cheat'ni 1 soniyadan keyin yoqamiz (kirish bosilishi bilan yolg'on ishlamasin)
    setTimeout(() => this.enableAntiCheat(), 1000);
  },

  renderQuestion(i) {
    const ex = State.exam;
    if (!ex) return;
    ex.index = i;
    const q = ex.questions[i];
    document.getElementById("q-current").textContent = i + 1;
    document.getElementById("q-text").textContent = q.text;

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
    this.disableAntiCheat();
    UI.closeModal();
    const res = await API.post("/api/student/submit", {
      submission_id: ex.submissionId, token: ex.token, answers: ex.answers,
    });
    if (!res.ok) { UI.toast(res.error || "Yuborishda xatolik", "err"); return; }
    this.showResult(res.result);
  },

  showResult(r) {
    Fireworks.start(6500);
    UI.modal(`
      <span class="modal-icon">🎉</span>
      <h2 style="text-align:center">Tabriklaymiz! Siz testni tugatdingiz</h2>
      <div class="result-score">${r.score} / ${r.total}</div>
      <div class="result-bars">
        <span class="result-chip ok">✔ To'g'ri: ${r.correct_count}</span>
        <span class="result-chip no">✘ Xato: ${r.wrong_count}</span>
        <span class="result-chip pct">📊 ${r.percentage}%</span>
      </div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn btn-primary btn-lg" id="go-home">🏠 Bosh sahifaga qaytish</button>
      </div>
    `, { closable: false });
    document.getElementById("go-home").onclick = () => {
      UI.closeModal(); Fireworks.stop(); this.reset(); UI.showView("view-login");
    };
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
    this.disableAntiCheat();
    if (this._onPop) window.removeEventListener("popstate", this._onPop);
    State.exam = null;
  },
};
