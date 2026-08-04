/* ===== OTA-ONA paneli: faollik tarixi (qizil/yashil) ===== */
const Parent = {
  bind() {
    document.getElementById("pr-exit").onclick = async () => {
      await API.post("/api/parent/logout");
      UI.showView("view-login");
    };
  },

  fmtDur(sec) {
    sec = sec || 0;
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} daq ${s} s` : `${s} s`;
  },

  async enter() {
    const res = await API.get("/api/parent/activity");
    if (!res.ok) { UI.toast(res.error || "Xatolik", "err"); return; }
    this.render(res);
    UI.showView("view-parent");
  },

  render(res) {
    const st = res.student;
    document.getElementById("pr-student").textContent =
      `${st.first_name} ${st.last_name} • ${st.class_name}`;
    document.getElementById("pr-coins").textContent = st.coins || 0;

    document.getElementById("parent-summary").innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><div class="num">${st.monthly_pct != null ? st.monthly_pct + "%" : "—"}</div><div class="lbl">📅 Shu oy o'zlashtirish</div></div>
        <div class="stat-tile"><div class="num">${st.tests_count || 0}</div><div class="lbl">Topshirgan testlar</div></div>
        <div class="stat-tile"><div class="num">🪙 ${st.coins || 0}</div><div class="lbl">Coinlar</div></div>
        <div class="stat-tile"><div class="num">${(st.videos || 0) + (st.audios || 0) + (st.texts || 0)}</div><div class="lbl">Ko'rilgan darslar</div></div>
      </div>
      <p class="muted" style="margin-bottom:14px">🎬 ${st.videos || 0} video • 🎧 ${st.audios || 0} audio • 📖 ${st.texts || 0} matn ko'rgan/o'qigan.</p>`;

    const tbox = document.getElementById("parent-tests");
    if (!res.tests.length) {
      tbox.innerHTML = '<p class="muted">Farzandingiz hali test topshirmagan.</p>';
    } else {
      tbox.innerHTML = "";
      res.tests.forEach((t) => {
        const bad = t.status === "terminated";
        const row = document.createElement("div");
        row.className = "act-row " + (bad ? "bad" : "good");
        row.innerHTML = `
          <div class="act-info">
            <div class="t">${UI.esc(t.test_title)} <span class="muted">(${UI.esc(t.subject)})</span></div>
            <div class="s">${UI.esc(t.submitted_at || "")} • ${this.fmtDur(t.duration_seconds)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800">${t.score}/${t.total} • ${t.percentage}%</div>
            <div class="s" style="color:${bad ? "var(--danger-1)" : "var(--success-1)"}">
              ${bad ? "⚠️ " + UI.esc(t.violation_reason || "Xavfsizlik buzilgan") : "✔ Xavfsiz topshirdi"}
            </div>
          </div>`;
        tbox.appendChild(row);
      });
    }

    const lbox = document.getElementById("parent-learning");
    if (!res.learning.length) {
      lbox.innerHTML = '<p class="muted">Farzandingiz hali dars ko\'rmagan/o\'qimagan.</p>';
    } else {
      lbox.innerHTML = "";
      const icons = { video: "🎬", audio: "🎧", text: "📖" };
      res.learning.forEach((a) => {
        const row = document.createElement("div");
        row.className = "act-row good";
        row.innerHTML = `
          <div class="act-info">
            <div class="t">${icons[a.type] || ""} ${UI.esc(a.title)} <span class="muted">(${UI.esc(a.subject)})</span></div>
            <div class="s">${UI.esc(a.completed_at || "")}</div>
          </div>
          <div style="font-weight:800">🪙 +${a.coins}</div>`;
        lbox.appendChild(row);
      });
    }
  },
};
