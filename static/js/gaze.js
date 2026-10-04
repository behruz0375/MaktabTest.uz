/* =========================================================
   GAZE — kamera orqali o'quvchi ekranga qarab turibdimi tekshiradi.
   MediaPipe FaceLandmarker (CDN'dan lazy yuklanadi).
   Kamera yo'q / ruxsat berilmasa — dars oddiy ishlaydi (onFail).
   ========================================================= */
const Gaze = {
  _running: false,
  _stream: null,
  _landmarker: null,
  _timer: null,
  _video: null,
  _lastState: true,     // oxirgi barqaror holat: true = qarayapti
  _awaySince: 0,
  _backSince: 0,
  _onAway: null,
  _onBack: null,
  _onState: null,
  _onFail: null,

  // MediaPipe manzillari
  _VISION: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
  _WASM: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  _MODEL: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",

  async start(previewVideo, { onAway, onBack, onState, onFail } = {}) {
    this._onAway = onAway; this._onBack = onBack; this._onState = onState; this._onFail = onFail;
    this._lastState = true; this._awaySince = 0; this._backSince = 0;

    // 1) Kamera
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" }, audio: false,
      });
    } catch (e) {
      this._fail("Kameraga ruxsat berilmadi — nazorat o'chirilgan");
      return false;
    }
    this._video = previewVideo;
    try {
      previewVideo.srcObject = this._stream;
      previewVideo.muted = true; previewVideo.playsInline = true;
      await previewVideo.play().catch(() => {});
    } catch (e) {}

    // 2) MediaPipe FaceLandmarker (lazy)
    try {
      const vision = await import(this._VISION);
      const { FaceLandmarker, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(this._WASM);
      this._landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: this._MODEL },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    } catch (e) {
      this._fail("Yuz aniqlash yuklanmadi (internet?) — nazorat o'chirilgan");
      this._stopStream();
      return false;
    }

    this._running = true;
    this._loop();
    return true;
  },

  _loop() {
    if (!this._running) return;
    const now = performance.now();
    let looking = this._lastState;
    try {
      if (this._video && this._video.readyState >= 2 && this._landmarker) {
        const res = this._landmarker.detectForVideo(this._video, now);
        looking = this._evaluate(res);
      }
    } catch (e) { /* bitta kadr xatosi — e'tiborsiz */ }
    if (this._onState) { try { this._onState(looking); } catch (e) {} }
    this._apply(looking, now);
    this._timer = setTimeout(() => this._loop(), 170);  // ~6 kadr/sek
  },

  /* Natijadan "ekranga qarayaptimi" ni aniqlaymiz */
  _evaluate(res) {
    if (!res || !res.faceLandmarks || !res.faceLandmarks.length) return false; // yuz yo'q
    const cat = res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
    if (cat) {
      const g = (n) => { const c = cat.find((x) => x.categoryName === n); return c ? c.score : 0; };
      // Ikkala ko'z yumuq bo'lsa — qaramayapti
      if (g("eyeBlinkLeft") > 0.6 && g("eyeBlinkRight") > 0.6) return false;
      // Ko'z qorachig'i markazdan uzoqqa ketgan bo'lsa — chetga qarayapti
      const gazeAway = Math.max(
        g("eyeLookOutLeft"), g("eyeLookOutRight"), g("eyeLookInLeft"), g("eyeLookInRight"),
        g("eyeLookUpLeft"), g("eyeLookUpRight"), g("eyeLookDownLeft"), g("eyeLookDownRight")
      );
      if (gazeAway > 0.72) return false;
    }
    // Bosh burilishi: burun (1) ikki ko'z (33, 263) orasida markazdami?
    const lm = res.faceLandmarks[0];
    if (lm && lm[1] && lm[33] && lm[263]) {
      const nx = lm[1].x, lx = lm[33].x, rx = lm[263].x;
      const lo = Math.min(lx, rx), span = Math.abs(rx - lx) || 1e-4;
      const ratio = (nx - lo) / span; // ~0.5 to'g'ri qaraganda
      if (ratio < 0.28 || ratio > 0.72) return false;
    }
    return true;
  },

  /* Debounce: ketganini ~1.5s, qaytganini ~0.4s kutamiz (noto'g'ri to'xtash bo'lmasin) */
  _apply(looking, now) {
    if (!looking) {
      this._backSince = 0;
      if (this._lastState) {
        if (!this._awaySince) this._awaySince = now;
        if (now - this._awaySince > 1500) {
          this._lastState = false; this._awaySince = 0;
          if (this._onAway) { try { this._onAway(); } catch (e) {} }
        }
      }
    } else {
      this._awaySince = 0;
      if (!this._lastState) {
        if (!this._backSince) this._backSince = now;
        if (now - this._backSince > 400) {
          this._lastState = true; this._backSince = 0;
          if (this._onBack) { try { this._onBack(); } catch (e) {} }
        }
      } else { this._backSince = 0; }
    }
  },

  _fail(msg) { if (this._onFail) { try { this._onFail(msg); } catch (e) {} } },

  _stopStream() {
    if (this._stream) { try { this._stream.getTracks().forEach((t) => t.stop()); } catch (e) {} this._stream = null; }
    if (this._video) { try { this._video.srcObject = null; } catch (e) {} }
  },

  stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._stopStream();
    try { if (this._landmarker && this._landmarker.close) this._landmarker.close(); } catch (e) {}
    this._landmarker = null;
    this._video = null;
    this._lastState = true; this._awaySince = 0; this._backSince = 0;
  },
};
