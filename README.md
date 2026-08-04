# 📚 MaktabTest.uz — Maktab uchun onlayn test tizimi

Qog'ozdagi testlarni raqamlashtirish uchun to'liq tayyor sayt.
Ikkita panel: **O'quvchi** va **O'qituvchi (direktor)**. Backend — **Python (Flask)**, ma'lumotlar bazasi — **SQLite**.

---

## ✨ Imkoniyatlar

**O'qituvchi (direktor) paneli:**
- 🔐 Login/parol bilan kirish (parolni istalgan vaqt yangilash mumkin)
- ➕ Test qo'shish: **16 ta fan**, **22 ta sinf** (1-A dan 11-B gacha), vaqt (daqiqa) belgilash
- 📝 Nechta savol kerak — o'zi kiritadi, shuncha joy ochiladi (avtomatik ochilmaydi)
- 🗑️ Har bir savolni alohida o'chirish — qolganlari avtomatik qayta raqamlanadi
- 🔤 Har variant ustida **A B C D** yozuvi, to'g'ri javob **dropdown** orqali tanlanadi
- 💾 Saqlaganda **modal** oynada: nechta savol, qaysi fan, qaysi sinf, necha daqiqa va **kirish kodi** chiqadi
- 🎲 Har testga **tasodifiy 6 xonali kod** (masalan: 483920). Har o'quvchi **1 marta** kira oladi
- 📊 Natijalar va xavfsizlik: sinf → o'quvchilar → har birining ballari, foizi, vaqti
- ❓ Topshirmagan o'quvchida "Hali topshirmagan" belgisi turadi
- ⚠️ Chetlashtirilgan (nazoratni buzgan) o'quvchida "Xavf" belgisi
- 🔁 Kerak bo'lsa bitta o'quvchiga **qayta topshirish** ruxsatini berish
- 👥 O'quvchilar ro'yxatini yuritish: qo'shish / o'chirish

**O'quvchi paneli:**
- 🎓 Ism, familiya, sinf va kirish kodi bilan kiradi (Kahoot uslubida)
- ❌ Kod noto'g'ri bo'lsa yoki test allaqachon topshirilgan bo'lsa — kiritmaydi
- 🧭 Savollar jadvali (belgilangan savol — ko'k, bo'sh — oq), istalgan savolga o'tish
- ⏱️ Vaqt sanog'i; **30 soniya** qolganda ogohlantirish; vaqt tugasa avtomatik yakunlash
- 🛡️ **Nazorat (anti-cheat):** boshqa oyna/ilovaga o'tsa, sahifani yopsa — "Xavf" chiqib, testdan chetlashtiriladi (bu o'qituvchi panelida ham ko'rinadi)
- 🎉 Yakunlaganda: "Tabriklaymiz!", ball va foiz, orqa fonda **salyutlar**

**📚 Bilim olish (o'quvchi):**
- Kirishda 2 rejim: **Test yechish** yoki **Bilim olish** (bilim olishда kod shart emas, faqat ism/familiya/sinf)
- O'qituvchi **video, audio va matn (kitob)** darslar joylaydi
- Video/audioni **tez o'tkazib yoki tezlashtirib bo'lmaydi** — to'liq ko'rish shart
- Har bir tugatilgan dars uchun **coin** beriladi (bir marta)
- Darsdan keyin unga biriktirilgan **testni** yechish mumkin

**🎮 O'yinlar (o'quvchi):** 2048, Sudoku, Tic-Tac-Toe (X-O), Memory, Math Sprint

**🎓 Mutolaa natijalari (o'qituvchi):** har o'quvchi nechta video ko'rgan, audio eshitgan, matn o'qigan va nechta coin to'plagani — coin bo'yicha reyting

**👪 Ota-ona paneli:**
- Alohida login/parol (o'qituvchi "O'quvchilar ro'yxati" bo'limidan yaratib beradi)
- Farzandining faollik tarixi: qaysi test, qachon, necha ball — **yashil** (xavfsiz) yoki **qizil** (xavfsizlik buzilgan) ranglarda
- Bilim olish faoliyati va coinlar
- O'quvchi bu bo'limga kira olmaydi (alohida parol)

**📤 Eksport (o'qituvchi):** natijalarni **Excel (CSV)** yoki **PDF** (chop etish) sifatida yuklab olish

**🏆 Reyting:** natijalar bo'limida eng yaxshi ball + eng tez vaqt bo'yicha 1-o'rin (👑), medallar 🥇🥈🥉 va yulduzchalar ⭐

**📊 Reyting / Statistika dashboard (o'qituvchi):** eng zo'r 3 o'quvchi (test + bilim), sinflar reytingi diagrammalari (o'rtacha ball va coinlar), umumiy statistika. Sinf ustiga bosilsa to'liq ro'yxat.

**🧑‍🏫 Ko'p o'qituvchi:** "O'qituvchilar" bo'limidan yangi o'qituvchi login/parol qo'shsangiz, u ham panelga kira oladi.

**👪 Ota-onalar bo'limi:** har o'quvchi uchun ota-ona login/parolini yaratib, ro'yxatda ko'rib turasiz va ota-onaga berasiz.

**📖 Bilim olish (yangilandi):** darslar alohida bo'limlarda — 🎬 Videolar / 🎧 Audio / 📖 Matnlar / 🎮 O'yinlar. Matnli darsga **rasm** qo'shsa bo'ladi. Video sekin yuklansa o'rtada **aylanuvchi belgi** chiqadi. Kartada fayl **hajmi (MB)** ko'rinadi. Video/audioni faqat **⏪ 10 soniya orqaga** qaytarish mumkin (oldinga yo'q). Darsdan keyingi test endi **qo'lda yoziladi** (tayyor testdan tanlanmaydi).

**📱 Telefon uchun:** to'liq moslashtirilgan — o'qituvchi menyusi yozuvlari ko'rinadi (surib ochiladi), tugmalar bir-birini bosmaydi.

**🔐 Boshqaruv:** faqat **asosiy o'qituvchi (admin)** yangi o'qituvchi qo'sha oladi va "O'qituvchilar" bo'limini ko'radi — keyin qo'shilganlar bir-birini ko'rmaydi. Ota-ona login/parolini o'qituvchi **o'zi yozadi** (random emas). Internet uzilsa **"Internetni tekshiring"** oynasi chiqadi. Har o'quvchining **shu oydagi o'zlashtirish foizi** ko'rinadi.

**Umumiy:**
- 🌙 Qorong'i / ☀️ yorug' rejim
- 📖 Orqa fonda uchib yuruvchi kitoblar, animatsiyalar, rangli tugmalar, hoverlar
- 💬 Hech qayerda `alert` yo'q — hammasi chiroyli **modal** oynalar
- 💾 Barcha ma'lumotlar bazada saqlanadi (chiqib ketsangiz ham yo'qolmaydi)
- 🪙 Coin tizimi: test (har to'g'ri javob), video, audio, matn uchun

---

## 🚀 1-usul: Kompyuterda ishga tushirish (eng oson)

1. **`START.bat`** faylini ikki marta bosing.
2. Birinchi marta kutubxonalar o'rnatiladi (biroz kutasiz).
3. Brauzerda oching: **http://localhost:5000**

> To'xtatish uchun ochilgan qora oynada `Ctrl + C` bosing.

**Qo'lda ishga tushirish** (agar `START.bat` ishlamasa), yangi terminal (CMD) da:
```bash
pip install -r requirements.txt
python app.py
```

---

## 🏫 2-usul: Bir sinfda ishlatish (eng foydalisi, bepul)

Butun sinf **bitta WiFi** ga ulangan bo'lsa, alohida internet/hosting shart emas:

1. O'qituvchi kompyuterida `START.bat` ni ishga tushiring.
2. O'qituvchi kompyuterining IP manzilini bilib oling (CMD da `ipconfig` → `IPv4 Address`, masalan `192.168.1.10`).
3. O'quvchilar o'z telefon/kompyuterida shu manzilni ochadi: **http://192.168.1.10:5000**
4. Ma'lumotlar o'qituvchi kompyuterida doimiy saqlanadi. ✅

---

## 🔐 Standart kirish (o'qituvchi)

| Login | Parol |
|-------|-------|
| `admin` | `admin123` |

> ⚠️ Birinchi kirishdan so'ng **Sozlamalar** bo'limidan login va parolni albatta o'zgartiring!

---

## 📋 Qanday ishlatiladi?

1. **O'qituvchi** panelga kiradi → "Test qo'shish" → fan, sinf, vaqt, savollar sonini kiritadi → savollarni to'ldiradi → **Saqlash**.
2. Ekranda **kirish kodi** chiqadi (masalan `483920`).
3. O'qituvchi bu kodni o'quvchilarga aytadi.
4. **O'quvchilar** ism, familiya, sinf va kodni kiritib testga kiradi.
5. Test tugagach ballari avtomatik hisoblanadi va o'qituvchi panelida ko'rinadi.
6. Yangi test uchun — yangi kod beriladi.

---

## 🔗 3-usul: Tezkor ommaviy havola (kompyuteringiz orqali, bepul)

Boshqa odamlarга (dunyoning istalgan joyida) darrov havola berish uchun:

1. **START.bat** ni ishga tushiring (sayt `localhost:5000` da ishlaydi).
2. **ONLINE-LINK.bat** ni ishga tushiring.
3. Ochilgan oynada `https://....trycloudflare.com` havolasi chiqadi — o'shani odamlarga yuboring.

> **Muhim:**
> - Bu havola faqat **kompyuteringiz yoniq** va ikkala oyna (START.bat + ONLINE-LINK.bat) **ochiq turганда** ishlaydi.
> - Har safar ONLINE-LINK.bat ni qayta ochsangiz **havola o'zgaradi** (yangi manzil).
> - Havolani tarqatishдан oldin **Sozlamalar**дан admin login/parolini o'zgartiring (xavfsizlik uchun).
> - Doimiy (kompyuter o'chsa ham ishlaydigan) havola kerak bo'lsa — quyidagi Render usulini ishlating.

---

## 🌐 4-usul: Doimiy joylash (Render.com — bepul, 24/7)

Saytni butun dunyoga ochiq qilish uchun:

1. Ushbu papkani **GitHub** ga yuklang:
   ```bash
   git init
   git add .
   git commit -m "MaktabTest.uz"
   git branch -M main
   git remote add origin https://github.com/FOYDALANUVCHI/maktabtest.git
   git push -u origin main
   ```
2. [render.com](https://render.com) da ro'yxatdan o'ting → **New +** → **Blueprint** → GitHub repongizni tanlang.
3. `render.yaml` avtomatik o'qiladi va sayt joylashadi. Bir necha daqiqada tayyor manzil beriladi.

> **Muhim:** Render'ning **bepul** rejasida har safar yangi versiya joylanganda baza yangilanishi mumkin (ma'lumot doimiy saqlanmaydi).
> Ma'lumot **doimiy** saqlanishi uchun `render.yaml` dagi `disk` bloki kerak (u pullik "Starter" rejada ishlaydi), yoki yuqoridagi **2-usul** (maktab kompyuterida) dan foydalaning.

---

## 🛡️ Nazorat (anti-cheat) qanday ishlaydi?

Test paytida o'quvchi:
- boshqa vkladka/oyna ochsa yoki boshqa ilovaga o'tsa,
- sahifani yopsa yoki yangilasa,
- brauzerni kichraytirsa —

tizim buni sezadi, **"Xavf aniqlandi"** oynasi chiqadi va test to'xtatiladi. Bu holat o'qituvchi panelida "Xavf" belgisi bilan ko'rinadi. O'ng tugma (kontekst menyu) va F12 ham bloklanadi.

> Eslatma: brauzerdagi himoya 100% kafolat bermaydi (bu barcha onlayn testlarda shunday). Eng ishonchli natija uchun testni sinfda, nazorat ostida o'tkazing.

---

## 🗂️ Loyiha tuzilishi

```
MaktabTest.uz/
├── app.py              # Flask backend (barcha API)
├── db.py               # Baza: jadvallar, fanlar, sinflar
├── requirements.txt    # Python kutubxonalari
├── Procfile            # Deploy uchun
├── render.yaml         # Render.com sozlamasi
├── START.bat           # Bir bosishda ishga tushirish (Windows)
├── data/               # SQLite bazasi (avtomatik yaraladi)
└── static/
    ├── index.html      # Sahifa
    ├── css/style.css   # Dizayn, animatsiyalar
    └── js/             # api, ui, student, teacher, main
```

**Texnologiyalar:** Python 3.12, Flask, SQLite, HTML/CSS/JS (kutubxonasiz).

---

Savol yoki muammo bo'lsa — kod to'liq izohlangan (o'zbekcha), o'zgartirish oson. Omad! 🎓
