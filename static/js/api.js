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
    try {
      res = await fetch(path, opts);
    } catch (e) {
      if (window.UI && UI.offlineModal) UI.offlineModal();
      return { ok: false, error: "Serverga ulanib bo'lmadi. Internetni tekshiring." };
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
