/* ===== Ishga tushirish va login formalar ===== */
document.addEventListener("DOMContentLoaded", async () => {
  UI.initTheme();
  UI.spawnBooks();
  Student.bindControls();
  Learning.bind();
  Parent.bind();
  Teacher.bind();

  await UI.loadMeta();

  // O'quvchi uchun maktablar ro'yxati (bilim olishда tanlanadi)
  const schoolRes = await API.get("/api/schools/public");
  const schoolSel = document.querySelector('#student-login [name="school_id"]');
  if (schoolRes.ok && schoolSel) {
    schoolRes.schools.forEach((s) => {
      const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; schoolSel.appendChild(o);
    });
  }

  let studentMode = "test"; // test | learn

  const clearErrors = () =>
    document.querySelectorAll(".form-error").forEach((e) => (e.textContent = ""));

  /* Login tablar (o'quvchi / o'qituvchi / ota-ona) */
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".login-form").forEach((f) => f.classList.remove("active"));
      const formId = tab.dataset.form || (tab.dataset.tab + "-login");
      document.getElementById(formId).classList.add("active");
      const hint = document.getElementById("staff-hint");
      if (hint && tab.dataset.hint) hint.textContent = tab.dataset.hint;
      clearErrors();
    };
  });

  /* O'quvchi rejimi: Test yechish / Bilim olish */
  function setStudentMode(mode) {
    studentMode = mode;
    document.querySelectorAll(".mode-btn").forEach((x) => x.classList.toggle("active", x.dataset.mode === mode));
    document.getElementById("student-code-field").style.display = mode === "learn" ? "none" : "";
    document.getElementById("student-school-field").style.display = mode === "learn" ? "" : "none";
    document.getElementById("student-submit-btn").textContent = mode === "learn" ? "Bilim olishga kirish →" : "Testga kirish →";
  }
  document.querySelectorAll(".mode-btn").forEach((mb) => {
    mb.onclick = () => { setStudentMode(mb.dataset.mode); clearErrors(); };
  });

  /* Faqat raqam — kirish kodi uchun */
  const codeInput = document.querySelector('#student-login [name="code"]');
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  });

  /* O'quvchi kirishi (test yoki bilim olish) */
  document.getElementById("student-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = document.getElementById("student-submit-btn");
    const errEl = document.querySelector('.form-error[data-for="student"]');
    errEl.textContent = "";
    const first = f.elements.first_name.value.trim();
    const last = f.elements.last_name.value.trim();
    const cls = f.elements.class_name.value;
    if (!first || !last) { errEl.textContent = "Ism va familiyangizni kiriting"; return; }
    if (!cls) { errEl.textContent = "Sinfingizni tanlang"; return; }

    if (studentMode === "learn") {
      const schoolId = f.elements.school_id.value;
      if (!schoolId) { errEl.textContent = "Maktabingizni tanlang"; return; }
      const schoolName = f.elements.school_id.selectedOptions[0] ? f.elements.school_id.selectedOptions[0].textContent : "";
      btn.disabled = true; btn.textContent = "Kirilmoqda...";
      const res = await API.post("/api/learning/enter", { first_name: first, last_name: last, class_name: cls, school_id: schoolId });
      btn.disabled = false; btn.textContent = "Bilim olishga kirish →";
      if (!res.ok) { errEl.textContent = res.error || "Xatolik"; return; }
      res.school_name = schoolName;
      f.reset();
      setStudentMode("test");
      Learning.enter(res);
      return;
    }

    const code = f.elements.code.value.trim();
    if (!code) { errEl.textContent = "Kirish kodini kiriting"; return; }
    btn.disabled = true; btn.textContent = "Tekshirilmoqda...";
    const res = await API.post("/api/student/start", { first_name: first, last_name: last, class_name: cls, code });
    btn.disabled = false; btn.textContent = "Testga kirish →";
    if (!res.ok) { errEl.textContent = res.error || "Xatolik yuz berdi"; return; }
    f.reset();
    Student.start(res);
  });

  /* O'qituvchi kirishi */
  document.getElementById("teacher-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector("button[type=submit]");
    const errEl = document.querySelector('.form-error[data-for="teacher"]');
    errEl.textContent = "";
    const data = { username: f.elements.username.value.trim(), password: f.elements.password.value };
    if (!data.username || !data.password) { errEl.textContent = "Login va parolni kiriting"; return; }
    btn.disabled = true; btn.textContent = "Kirilmoqda...";
    const res = await API.post("/api/teacher/login", data);
    btn.disabled = false; btn.textContent = "Panelga kirish →";
    if (!res.ok) { errEl.textContent = res.error || "Login yoki parol noto'g'ri"; return; }
    State.teacher = res.teacher;
    f.reset();
    Teacher.enter();
  });

  /* Ota-ona kirishi */
  document.getElementById("parent-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector("button[type=submit]");
    const errEl = document.querySelector('.form-error[data-for="parent"]');
    errEl.textContent = "";
    const data = { username: f.elements.username.value.trim(), password: f.elements.password.value };
    if (!data.username || !data.password) { errEl.textContent = "Login va parolni kiriting"; return; }
    btn.disabled = true; btn.textContent = "Kirilmoqda...";
    const res = await API.post("/api/parent/login", data);
    btn.disabled = false; btn.textContent = "Kirish →";
    if (!res.ok) { errEl.textContent = res.error || "Login yoki parol noto'g'ri"; return; }
    f.reset();
    Parent.enter();
  });

  /* Avvaldan tizimga kirgan o'qituvchi bo'lsa — to'g'ridan-to'g'ri panelga */
  const me = await API.get("/api/teacher/me");
  if (me.ok && me.teacher) {
    State.teacher = me.teacher;
    Teacher.enter();
  }
});
