/* =========================================================
   i18n — Interfeys tilini almashtirish:
   - uz-lat (standart lotin)
   - uz-cyr (kirill — avtomatik transliteratsiya)
   - ru (ruscha — asosiy matnlar lug'ati, qolgani tegilmaydi)
   ========================================================= */
const I18N = {
  _lang: "uz-lat",
  _origMap: new WeakMap(),   // har bir text/attribute node uchun asl matn

  LAT_TO_CYR: {
    "yo'":"ё","Yo'":"Ё","YO'":"Ё",
    "o'":"ў","O'":"Ў","OʻQ":"ЎҚ","Oʻ":"Ў",
    "g'":"ғ","G'":"Ғ","q":"қ","Q":"Қ","h":"ҳ","H":"Ҳ",
    "sh":"ш","Sh":"Ш","SH":"Ш","ch":"ч","Ch":"Ч","CH":"Ч",
    "ya":"я","Ya":"Я","YA":"Я","yu":"ю","Yu":"Ю","YU":"Ю",
    "yo":"ё","Yo":"Ё","YO":"Ё",
    "a":"а","A":"А","b":"б","B":"Б","v":"в","V":"В","g":"г","G":"Г",
    "d":"д","D":"Д","e":"е","E":"Е","j":"ж","J":"Ж","z":"з","Z":"З",
    "i":"и","I":"И","y":"й","Y":"Й","k":"к","K":"К","l":"л","L":"Л",
    "m":"м","M":"М","n":"н","N":"Н","o":"о","O":"О","p":"п","P":"П",
    "r":"р","R":"Р","s":"с","S":"С","t":"т","T":"Т","u":"у","U":"У",
    "f":"ф","F":"Ф","x":"х","X":"Х","c":"ц","C":"Ц","'":"ъ",
  },
  _CYR_PATTERNS: [
    [/yo'/g,"ё"],[/Yo'/g,"Ё"],[/YO'/g,"Ё"],
    [/o'/g,"ў"],[/O'/g,"Ў"],
    [/g'/g,"ғ"],[/G'/g,"Ғ"],
    [/sh/g,"ш"],[/Sh/g,"Ш"],[/SH/g,"Ш"],
    [/ch/g,"ч"],[/Ch/g,"Ч"],[/CH/g,"Ч"],
    [/ya/g,"я"],[/Ya/g,"Я"],[/YA/g,"Я"],
    [/yu/g,"ю"],[/Yu/g,"Ю"],[/YU/g,"Ю"],
    [/yo/g,"ё"],[/Yo/g,"Ё"],[/YO/g,"Ё"],
    [/ye/g,"е"],[/Ye/g,"Е"],
    [/[q]/g,"қ"],[/Q/g,"Қ"],[/h/g,"ҳ"],[/H/g,"Ҳ"],
    [/x/g,"х"],[/X/g,"Х"],
    [/a/g,"а"],[/A/g,"А"],[/b/g,"б"],[/B/g,"Б"],[/v/g,"в"],[/V/g,"В"],
    [/g/g,"г"],[/G/g,"Г"],[/d/g,"д"],[/D/g,"Д"],[/e/g,"е"],[/E/g,"Е"],
    [/j/g,"ж"],[/J/g,"Ж"],[/z/g,"з"],[/Z/g,"З"],[/i/g,"и"],[/I/g,"И"],
    [/y/g,"й"],[/Y/g,"Й"],[/k/g,"к"],[/K/g,"К"],[/l/g,"л"],[/L/g,"Л"],
    [/m/g,"м"],[/M/g,"М"],[/n/g,"н"],[/N/g,"Н"],[/o/g,"о"],[/O/g,"О"],
    [/p/g,"п"],[/P/g,"П"],[/r/g,"р"],[/R/g,"Р"],[/s/g,"с"],[/S/g,"С"],
    [/t/g,"т"],[/T/g,"Т"],[/u/g,"у"],[/U/g,"У"],[/f/g,"ф"],[/F/g,"Ф"],
    [/c/g,"ц"],[/C/g,"Ц"],
  ],

  // Rus tiliga eng ko'p uchraydigan UZ -> RU lug'ati (kalit so'z/jumlalar)
  // Ko'p o'rinda to'liq ruscha emas — asosiy menyu/tugmalar.
  RU: {
    "Tizimga kirish":"Войти в систему","O'quvchi":"Ученик","O'qituvchi":"Учитель",
    "Zavuch":"Завуч","Boshqaruv":"Руководство","Ota-ona":"Родитель",
    "Test yechish":"Решить тест","Bilim olish":"Обучение","Ism":"Имя","Familiya":"Фамилия",
    "Sinfingizni tanlang":"Выберите класс","Kirish kodi":"Код входа","Testga kirish":"Войти в тест",
    "Login":"Логин","Parol":"Пароль","Panelga kirish":"Войти в панель","Kirish":"Войти",
    "Bosh sahifa":"Главная","Haqida":"О сайте","Qulayliklar":"Возможности","Kimlar uchun":"Для кого",
    "Qanday ishlaydi":"Как работает","Bog'lanish":"Контакты","Imkoniyatlar":"Возможности",
    "Saytning qulayliklari":"Преимущества сайта","Reyting":"Рейтинг","Natijalar":"Результаты",
    "Testlarim":"Мои тесты","Darslar":"Уроки","Mutolaa natijalari":"Результаты обучения",
    "O'quvchilar ro'yxati":"Список учеников","O'qituvchilar":"Учителя","Profil":"Профиль",
    "Sozlamalar":"Настройки","Chiqish":"Выход","Jonli kuzatuv":"Онлайн-наблюдение",
    "Yangilash":"Обновить","Saqlash":"Сохранить","Bekor qilish":"Отмена","Yopish":"Закрыть",
    "Testni yakunlaysizmi?":"Завершить тест?","Davom etaman":"Продолжить","Ha, yakunlayman":"Да, завершить",
    "Xatolar ustida ishlash":"Работа над ошибками","Bosh sahifaga qaytish":"На главную",
    "To'g'ri":"Верно","Xato":"Ошибка","Javob bermagansiz":"Нет ответа",
    "Iltimos kuting":"Пожалуйста, подождите","Yuklanmoqda":"Загрузка","Tekshirilmoqda":"Проверка",
    "O'yinlar":"Игры","Fanlar":"Предметы","Coin":"Монеты","Baho":"Оценка",
  },

  toCyr(s) {
    if (!s) return s;
    let out = s;
    for (const [re, r] of this._CYR_PATTERNS) out = out.replace(re, r);
    return out;
  },
  toRu(s) {
    if (!s) return s;
    // Uzun jumlalarni ham lug'atdan topa olmaymiz; faqat aniq moslanishni almashtiramiz
    if (this.RU[s]) return this.RU[s];
    // Qisman: kalit so'zni so'z bo'yicha almashtiramiz (butun matnni emas)
    let out = s;
    for (const k of Object.keys(this.RU).sort((a, b) => b.length - a.length)) {
      out = out.split(k).join(this.RU[k]);
    }
    return out;
  },

  /* Hamma matn/placeholder/alt/title/value'ni asl holida eslab qolamiz */
  _snapshot() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentNode;
      if (!p) continue;
      const tag = (p.tagName || "").toLowerCase();
      if (tag === "script" || tag === "style") continue;
      if (!this._origMap.has(node)) this._origMap.set(node, node.nodeValue);
    }
    document.querySelectorAll("[placeholder]").forEach((el) => {
      const key = el; // use element with special marker
      if (!el.dataset.i18nPh) el.dataset.i18nPh = el.getAttribute("placeholder") || "";
    });
    document.querySelectorAll("[title]").forEach((el) => {
      if (!el.dataset.i18nTitle) el.dataset.i18nTitle = el.getAttribute("title") || "";
    });
    document.querySelectorAll("input[type=submit],input[type=button],button").forEach((el) => {
      if (el.value && !el.dataset.i18nVal) el.dataset.i18nVal = el.value;
    });
  },

  apply(lang) {
    this._lang = lang;
    try { localStorage.setItem("mt-lang", lang); } catch (e) {}
    document.documentElement.setAttribute("lang", lang === "ru" ? "ru" : (lang === "uz-cyr" ? "uz-Cyrl" : "uz"));
    this._snapshot();
    const conv = lang === "uz-cyr" ? (s) => this.toCyr(s) : lang === "ru" ? (s) => this.toRu(s) : (s) => s;
    // Matn tugunlari
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentNode;
      if (!p) continue;
      const tag = (p.tagName || "").toLowerCase();
      if (tag === "script" || tag === "style") continue;
      const orig = this._origMap.get(node);
      if (orig != null) node.nodeValue = conv(orig);
    }
    // placeholder/title/value
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => el.setAttribute("placeholder", conv(el.dataset.i18nPh)));
    document.querySelectorAll("[data-i18n-title]").forEach((el) => el.setAttribute("title", conv(el.dataset.i18nTitle)));
    document.querySelectorAll("[data-i18n-val]").forEach((el) => { el.value = conv(el.dataset.i18nVal); });
  },

  init() {
    const saved = (() => { try { return localStorage.getItem("mt-lang") || "uz-lat"; } catch (e) { return "uz-lat"; } })();
    // DOM to'ldirilib bo'lgandan keyin birinchi apply (meta, dynamic lists ulgurgach)
    setTimeout(() => this.apply(saved), 400);
    // Dinamik render qilingan ro'yxatlar uchun — DOM o'zgarishida qayta tatbiq etamiz (debounce)
    let t = null;
    new MutationObserver(() => {
      if (this._lang === "uz-lat") return;
      clearTimeout(t); t = setTimeout(() => this.apply(this._lang), 150);
    }).observe(document.body, { childList: true, subtree: true });
  },

  current() { return this._lang; },
};
