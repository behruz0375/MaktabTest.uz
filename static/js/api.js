/* ===== API bilan ishlash (fetch) va umumiy holat ===== */
const API = {
  async request(path, method = "GET", body = null) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    };
    if (body !== null) opts.body = JSON.stringify(body);
    let res, data;
    // Server bir lahzaga sekinlashса — darrov xato deb baqirmaymiz, jimgina qayta urinamiz
    const maxTries = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(path, opts);
        break; // muvaffaqiyat
      } catch (e) {
        if (attempt < maxTries) {
          await new Promise((r) => setTimeout(r, attempt * 700)); // 0.7s, 1.4s
          continue;
        }
        // Bir necha urinishдан keyin ham bo'lmadi — endi xabar beramiz
        if (typeof UI !== "undefined" && UI.offlineModal) UI.offlineModal();
        return { ok: false, error: "Server javob bermadi. Biroz kutib, qayta urinib ko'ring." };
      }
    }
    try {
      data = await res.json();
    } catch (e) {
      data = { ok: false, error: "Server javobi noto'g'ri" };
    }
    if (!res.ok && data.ok === undefined) data.ok = false;
    data._status = res.status;
    return data;
  },
  get(p) { return this.request(p, "GET"); },
  post(p, b) { return this.request(p, "POST", b || {}); },
  put(p, b) { return this.request(p, "PUT", b || {}); },
  del(p) { return this.request(p, "DELETE"); },
};

/* Umumiy holat (state) */
const State = {
  meta: { subjects: [], classes: [] },
  teacher: null,
  // O'quvchi test sessiyasi
  exam: null,
};
