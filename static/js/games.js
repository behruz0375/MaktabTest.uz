/* ===== O'YINLAR: 2048, Sudoku, Tic-Tac-Toe, Memory, Math Sprint ===== */
const Games = {
  _teardown: null,
  list: [
    { key: "g2048", emoji: "🔢", name: "2048", desc: "Raqamlarni birlashtiring" },
    { key: "sudoku", emoji: "🧩", name: "Sudoku", desc: "Mantiqiy boshqotirma" },
    { key: "ttt", emoji: "⭕", name: "Tic-Tac-Toe", desc: "X va O o'yini" },
    { key: "memory", emoji: "🃏", name: "Memory", desc: "Juft rasmlarni toping" },
    { key: "math", emoji: "➗", name: "Math Sprint", desc: "Tezkor matematika" },
  ],

  renderGrid(container) {
    container.innerHTML = "";
    this.list.forEach((g) => {
      const c = document.createElement("div");
      c.className = "game-card";
      c.innerHTML = `<span class="g-emoji">${g.emoji}</span><h3>${g.name}</h3><p class="muted">${g.desc}</p>`;
      c.onclick = () => this.open(g.key);
      container.appendChild(c);
    });
  },

  open(key) {
    this[key]();
  },

  rnd(n) { return Math.floor(Math.random() * n); },
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },

  /* ---------------- 2048 ---------------- */
  g2048() {
    const S = 4;
    let grid, score = 0;
    const T = (g) => g[0].map((_, c) => g.map((r) => r[c]));
    const empties = () => { const c = []; for (let r = 0; r < S; r++) for (let k = 0; k < S; k++) if (!grid[r][k]) c.push([r, k]); return c; };
    const add = () => { const e = empties(); if (!e.length) return; const [r, k] = e[this.rnd(e.length)]; grid[r][k] = Math.random() < 0.9 ? 2 : 4; };
    const slide = (row) => {
      let a = row.filter((x) => x);
      for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
      while (a.length < S) a.push(0);
      return a;
    };
    const draw = () => {
      const b = document.getElementById("g2048-board"); if (!b) return;
      b.innerHTML = "";
      for (let r = 0; r < S; r++) for (let k = 0; k < S; k++) {
        const v = grid[r][k]; const d = document.createElement("div"); d.className = "tile";
        if (v) { d.dataset.v = v; d.textContent = v; } b.appendChild(d);
      }
      const st = document.getElementById("game-status"); if (st) st.textContent = "Ball: " + score;
    };
    const canMove = () => {
      if (empties().length) return true;
      for (let r = 0; r < S; r++) for (let k = 0; k < S; k++) {
        if (k < S - 1 && grid[r][k] === grid[r][k + 1]) return true;
        if (r < S - 1 && grid[r][k] === grid[r + 1][k]) return true;
      }
      return false;
    };
    const move = (dir) => {
      const before = JSON.stringify(grid);
      if (dir === "ArrowLeft") grid = grid.map(slide);
      else if (dir === "ArrowRight") grid = grid.map((r) => slide(r.slice().reverse()).reverse());
      else if (dir === "ArrowUp") grid = T(T(grid).map(slide));
      else if (dir === "ArrowDown") grid = T(T(grid).map((r) => slide(r.slice().reverse()).reverse()));
      else return;
      if (JSON.stringify(grid) !== before) { add(); draw(); }
      if (grid.flat().includes(2048)) document.getElementById("game-status").textContent = "🎉 G'alaba! 2048!";
      else if (!canMove()) document.getElementById("game-status").textContent = "O'yin tugadi! Ball: " + score;
    };
    const start = () => { grid = Array.from({ length: S }, () => Array(S).fill(0)); score = 0; add(); add(); draw(); };
    const keyH = (e) => { if (e.key.startsWith("Arrow")) { e.preventDefault(); move(e.key); } };

    UI.modal(`<h2 style="text-align:center">🔢 2048</h2>
      <p class="muted" style="text-align:center">Strelka tugmalari bilan suring. Bir xil sonlarni birlashtiring.</p>
      <div class="game-status" id="game-status">Ball: 0</div>
      <div class="g2048" id="g2048-board"></div>
      <div class="game-controls">
        <button class="btn btn-secondary btn-sm" id="g-up">↑</button>
        <button class="btn btn-secondary btn-sm" id="g-left">←</button>
        <button class="btn btn-secondary btn-sm" id="g-down">↓</button>
        <button class="btn btn-secondary btn-sm" id="g-right">→</button>
        <button class="btn btn-ghost btn-sm" id="g-restart">🔄 Qayta</button>
      </div>`, { large: true, onClose: () => document.removeEventListener("keydown", keyH) });
    document.addEventListener("keydown", keyH);
    this._teardown = () => document.removeEventListener("keydown", keyH);
    document.getElementById("g-up").onclick = () => move("ArrowUp");
    document.getElementById("g-down").onclick = () => move("ArrowDown");
    document.getElementById("g-left").onclick = () => move("ArrowLeft");
    document.getElementById("g-right").onclick = () => move("ArrowRight");
    document.getElementById("g-restart").onclick = start;
    start();
  },

  /* ---------------- Sudoku ---------------- */
  sudoku() {
    const base = 3, side = 9;
    const pat = (r, c) => (base * (r % base) + Math.floor(r / base) + c) % side;
    const g3 = () => this.shuffle([0, 1, 2]);
    const rows = [].concat(...g3().map((g) => g3().map((r) => g * base + r)));
    const cols = [].concat(...g3().map((g) => g3().map((c) => g * base + c)));
    const nums = this.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const solution = rows.map((r) => cols.map((c) => nums[pat(r, c)]));
    const puzzle = solution.map((row) => row.slice());
    let removed = 44;
    while (removed > 0) { const r = this.rnd(9), c = this.rnd(9); if (puzzle[r][c]) { puzzle[r][c] = 0; removed--; } }

    UI.modal(`<h2 style="text-align:center">🧩 Sudoku</h2>
      <p class="muted" style="text-align:center">Har qator, ustun va 3×3 katakda 1–9 raqamlari bir marta bo'lsin.</p>
      <div class="game-status" id="game-status"></div>
      <div class="sudoku" id="sudoku-board"></div>
      <div class="game-controls">
        <button class="btn btn-success btn-sm" id="s-check">✔ Tekshirish</button>
        <button class="btn btn-ghost btn-sm" id="s-solve">💡 Yechim</button>
      </div>`, { large: true });
    const board = document.getElementById("sudoku-board");
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const inp = document.createElement("input");
      inp.maxLength = 1; inp.dataset.r = r; inp.dataset.c = c;
      if (r % 3 === 2 && r < 8) inp.classList.add("row3");
      if (puzzle[r][c]) { inp.value = puzzle[r][c]; inp.readOnly = true; inp.classList.add("fixed"); }
      inp.oninput = () => { inp.value = inp.value.replace(/[^1-9]/g, ""); };
      board.appendChild(inp);
    }
    document.getElementById("s-check").onclick = () => {
      let ok = true, full = true;
      board.querySelectorAll("input").forEach((inp) => {
        const r = +inp.dataset.r, c = +inp.dataset.c;
        if (!inp.value) { full = false; return; }
        if (+inp.value !== solution[r][c]) { ok = false; inp.style.color = "var(--danger-1)"; }
        else if (!inp.classList.contains("fixed")) inp.style.color = "var(--success-1)";
      });
      document.getElementById("game-status").textContent = !full ? "Hali to'ldirilmagan katakchalar bor" : ok ? "🎉 Ajoyib! To'g'ri yechildi!" : "Ba'zi katakchalar xato (qizil)";
    };
    document.getElementById("s-solve").onclick = () => {
      board.querySelectorAll("input").forEach((inp) => { inp.value = solution[+inp.dataset.r][+inp.dataset.c]; inp.style.color = "var(--muted)"; });
      document.getElementById("game-status").textContent = "Yechim ko'rsatildi";
    };
  },

  /* ---------------- Tic-Tac-Toe ---------------- */
  ttt() {
    let board = Array(9).fill("");
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const winner = (b) => { for (const w of wins) if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[1]] === b[w[2]]) return b[w[0]]; return null; };
    const aiMove = () => {
      const empt = board.map((v, i) => v ? null : i).filter((v) => v !== null);
      for (const p of empt) { const t = board.slice(); t[p] = "O"; if (winner(t) === "O") return p; }
      for (const p of empt) { const t = board.slice(); t[p] = "X"; if (winner(t) === "X") return p; }
      if (board[4] === "") return 4;
      return empt[this.rnd(empt.length)];
    };
    const draw = () => {
      const b = document.getElementById("ttt-board"); if (!b) return;
      b.innerHTML = "";
      board.forEach((v, i) => {
        const c = document.createElement("div");
        c.className = "cell" + (v === "X" ? " x" : v === "O" ? " o" : "");
        c.textContent = v; c.onclick = () => play(i); b.appendChild(c);
      });
    };
    const finish = (msg) => { document.getElementById("game-status").textContent = msg; board = board.map((v) => v || "-"); };
    const play = (i) => {
      if (board[i] || winner(board)) return;
      board[i] = "X"; draw();
      let w = winner(board); if (w) return finish("🎉 Siz yutdingiz!");
      if (!board.includes("")) return finish("Durrang!");
      const m = aiMove(); board[m] = "O"; draw();
      w = winner(board); if (w) return finish("Kompyuter yutdi 🤖");
      if (!board.includes("")) return finish("Durrang!");
    };
    UI.modal(`<h2 style="text-align:center">⭕ Tic-Tac-Toe (X-O)</h2>
      <p class="muted" style="text-align:center">Siz — X. Kompyuterni yenging!</p>
      <div class="game-status" id="game-status">Sizning navbatingiz (X)</div>
      <div class="ttt" id="ttt-board"></div>
      <div class="game-controls"><button class="btn btn-ghost btn-sm" id="t-restart">🔄 Qayta boshlash</button></div>`, { large: true });
    document.getElementById("t-restart").onclick = () => { board = Array(9).fill(""); document.getElementById("game-status").textContent = "Sizning navbatingiz (X)"; draw(); };
    draw();
  },

  /* ---------------- Memory ---------------- */
  memory() {
    const emojis = ["🍎","🚀","🌟","🎈","🐶","🌸","⚽","🎸"];
    const deck = this.shuffle([...emojis, ...emojis]);
    let flipped = [], matched = 0, moves = 0, lock = false;
    UI.modal(`<h2 style="text-align:center">🃏 Memory — juftlarni toping</h2>
      <div class="game-status" id="game-status">Harakatlar: 0</div>
      <div class="memory" id="memory-board"></div>
      <div class="game-controls"><button class="btn btn-ghost btn-sm" id="m-restart">🔄 Qayta</button></div>`, { large: true });
    const board = document.getElementById("memory-board");
    const draw = () => {
      board.innerHTML = "";
      deck.forEach((em, i) => {
        const c = document.createElement("div");
        c.className = "mcard"; c.dataset.i = i;
        c.textContent = c.classList.contains("flipped") ? em : "";
        c.onclick = () => flip(i, c, em);
        board.appendChild(c);
      });
    };
    const flip = (i, c, em) => {
      if (lock || c.classList.contains("flipped") || c.classList.contains("matched")) return;
      c.classList.add("flipped"); c.textContent = em; flipped.push({ i, c, em });
      if (flipped.length === 2) {
        moves++; document.getElementById("game-status").textContent = "Harakatlar: " + moves;
        if (flipped[0].em === flipped[1].em) {
          flipped.forEach((f) => f.c.classList.add("matched")); flipped = []; matched++;
          if (matched === emojis.length) document.getElementById("game-status").textContent = `🎉 Yakunladingiz! ${moves} harakatda!`;
        } else {
          lock = true;
          setTimeout(() => { flipped.forEach((f) => { f.c.classList.remove("flipped"); f.c.textContent = ""; }); flipped = []; lock = false; }, 800);
        }
      }
    };
    document.getElementById("m-restart").onclick = () => { this.shuffle(deck); flipped = []; matched = 0; moves = 0; document.getElementById("game-status").textContent = "Harakatlar: 0"; draw(); };
    draw();
  },

  /* ---------------- Math Sprint ---------------- */
  math() {
    let score = 0, time = 60, timer = null, answer = 0;
    const newQ = () => {
      const ops = ["+", "-", "×"]; const op = ops[this.rnd(3)];
      let a = this.rnd(20) + 1, b = this.rnd(20) + 1;
      if (op === "-") { if (b > a) [a, b] = [b, a]; answer = a - b; }
      else if (op === "+") answer = a + b;
      else { a = this.rnd(9) + 1; b = this.rnd(9) + 1; answer = a * b; }
      const q = document.getElementById("math-q"); if (q) q.textContent = `${a} ${op} ${b} = ?`;
      const inp = document.getElementById("math-inp"); if (inp) { inp.value = ""; inp.focus(); }
    };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    UI.modal(`<div class="math-sprint">
      <h2>➗ Math Sprint</h2>
      <p class="muted">60 soniyada nechta misol yechasiz?</p>
      <div class="game-status" id="game-status">⏱️ 60s • Ball: 0</div>
      <div class="math-q" id="math-q"></div>
      <input id="math-inp" inputmode="numeric" placeholder="Javob" autocomplete="off">
      <div class="game-controls"><button class="btn btn-success" id="math-go">Boshlash</button></div>
      </div>`, { large: true, onClose: stop });
    this._teardown = stop;
    const inp = document.getElementById("math-inp");
    const submit = () => {
      if (!timer) return;
      if (parseInt(inp.value, 10) === answer) { score++; }
      newQ();
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    document.getElementById("math-go").onclick = () => {
      score = 0; time = 60; newQ();
      document.getElementById("math-go").textContent = "Yangi javob (Enter)";
      document.getElementById("math-go").onclick = submit;
      stop();
      timer = setInterval(() => {
        time--;
        document.getElementById("game-status").textContent = `⏱️ ${time}s • Ball: ${score}`;
        if (time <= 0) { stop(); document.getElementById("math-q").textContent = `🎉 Tugadi! Ball: ${score}`; document.getElementById("game-status").textContent = `Yakuniy ball: ${score}`; }
      }, 1000);
    };
  },
};
