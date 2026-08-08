/* ===== OTA-ONA paneli: faollik tarixi (qizil/yashil) ===== */
const Parent = {
  bind() {
    document.getElementById("pr-exit").onclick = async () => {
      await API.post("/api/parent/logout");
      UI.showView("view-login");
    };
    const rf = document.getElementById("pr-refresh");
    if (rf) rf.onclick = async () => {
      const res = await API.get("/api/parent/activity");
      if (res.ok) { this.render(res); UI.toast("Yangilandi ✓", "ok", 1500); }
      else UI.toast(res.error || "Xatolik", "err");
    };
  },

  fmtDur(sec) {
    sec = sec || 0;
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} daq ${s} s` : `${s} s`;
  },

  fmtDurLong(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + " s";
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + " daq" + (s ? " " + s + "s" : "");
    const h = Math.floor(m / 60), rm = m % 60;
    return h + " soat" + (rm ? " " + rm + " daq" : "");
  },

  async enter() {
    const res = await API.get("/api/parent/activity");
    if (!res.ok) { UI.toast(res.error || "Xatolik", "err"); return; }
    this.render(res);
    UI.showView("view-parent");
  },

  bahoOf(pct) { return pct >= 87 ? 5 : pct >= 71 ? 4 : pct >= 55 ? 3 : 2; },
  bahoCls(b) { return b >= 5 ? "#23c483" : b >= 4 ? "#3ca6ff" : b >= 3 ? "#f8a928" : "#e94b4b"; },
  _todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
  _dateLabel(dateStr) {
    const today = this._todayStr();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yStr = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    if (dateStr === today) return "Bugun (" + dateStr + ")";
    if (dateStr === yStr) return "Kecha (" + dateStr + ")";
    return dateStr;
  },

  render(res) {
    const st = res.student;
    document.getElementById("pr-student").textContent =
      `${st.first_name} ${st.last_name} • ${st.class_name}`;
    document.getElementById("pr-coins").textContent = st.coins || 0;

    // Shu oylik baho; agar shu oy test bo'lmasa — umumiy (eng yaxshi) baho
    const mbaho = st.monthly_baho || st.overall_baho;
    const bahoIsMonthly = !!st.monthly_baho;
    const bahoBadge = mbaho ? `<span style="display:inline-block;background:${this.bahoCls(mbaho)};color:#fff;border-radius:8px;padding:0 10px;font-weight:900;margin-left:6px">${mbaho}</span>` : "";
    const bahoLabel = bahoIsMonthly ? "📅 Shu oy o'zlashtirish (baho)" : (st.overall_baho ? "📊 Umumiy o'zlashtirish (baho)" : "📅 Shu oy o'zlashtirish (baho)");
    const pctShown = bahoIsMonthly ? st.monthly_pct : (st.overall_baho ? st.overall_pct : st.monthly_pct);
    const daily = res.daily || [];
    const dailyHtml = daily.length
      ? `<h3 style="margin:6px 0 8px">📆 Kunlik bilim olish vaqti</h3>
         <div class="daily-time-list" style="margin-bottom:16px">${daily.map((d) => `
           <div class="daily-time-row${d.date === this._todayStr() ? " today" : ""}">
             <span class="d-date">${this._dateLabel(d.date)}</span>
             <span class="d-secs">⏱ ${this.fmtDurLong(d.seconds)}</span>
           </div>`).join("")}</div>`
      : "";
    document.getElementById("parent-summary").innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><div class="num">${pctShown != null ? pctShown + "%" : "—"} ${bahoBadge}</div><div class="lbl">${bahoLabel}</div></div>
        <div class="stat-tile"><div class="num">⏱ ${this.fmtDurLong(st.today_duration_seconds)}</div><div class="lbl">Bugun bilim olgan vaqt</div></div>
        <div class="stat-tile"><div class="num">🗓 ${this.fmtDurLong(st.month_duration_seconds)}</div><div class="lbl">Shu oy jami vaqt</div></div>
        <div class="stat-tile"><div class="num">🪙 ${st.coins || 0}</div><div class="lbl">Coinlar</div></div>
      </div>
      <p class="muted" style="margin-bottom:14px">🎬 ${st.videos || 0} video • 🎧 ${st.audios || 0} audio • 📖 ${st.texts || 0} matn • ⏱ jami: ${this.fmtDurLong(st.total_duration_seconds)} • 📝 ${st.tests_count || 0} test topshirgan.</p>
      ${dailyHtml}`;

    const tbox = document.getElementById("parent-tests");
    if (!res.tests.length) {
      tbox.innerHTML = '<p class="muted">Farzandingiz hali test topshirmagan.</p>';
    } else {
      tbox.innerHTML = "";
      res.tests.forEach((t) => {
        const bad = t.status === "terminated";
        const baho = bad ? null : this.bahoOf(t.percentage);
        const bahoBadge = baho ? `<span style="display:inline-block;background:${this.bahoCls(baho)};color:#fff;border-radius:8px;padding:2px 10px;font-weight:900;font-size:1.15rem">${baho}</span>` : "";
        const row = document.createElement("div");
        row.className = "act-row " + (bad ? "bad" : "good");
        row.innerHTML = `
          <div class="act-info">
            <div class="t">${UI.esc(t.test_title)} <span class="muted">(${UI.esc(t.subject)})</span></div>
            <div class="s">${UI.esc(t.submitted_at || "")} • ${this.fmtDur(t.duration_seconds)}</div>
          </div>
          <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            ${bahoBadge}
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
        const durTxt = a.duration_seconds > 0 ? ` • ⏱ ${this.fmtDur(a.duration_seconds)}` : "";
        row.innerHTML = `
          <div class="act-info">
            <div class="t">${icons[a.type] || ""} ${UI.esc(a.title)} <span class="muted">(${UI.esc(a.subject)})</span></div>
            <div class="s">${UI.esc(a.completed_at || "")}${durTxt}</div>
          </div>
          <div style="font-weight:800">🪙 +${a.coins}</div>`;
        lbox.appendChild(row);
      });
    }
  },
};
