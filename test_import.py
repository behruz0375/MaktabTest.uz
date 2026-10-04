"""Fayldan (Excel/CSV/Word/PDF) test savollarini o'qish.

Excel/CSV format (ustunlar): Savol | A | B | C | D | To'g'ri javob
Word/PDF format (matn):
    1. Savol matni?
    A) birinchi variant
    B) ikkinchi variant
    C) uchinchi variant
    D) to'rtinchi variant
    Javob: A
"""
import io
import re
import csv


def _clean(s):
    return (str(s) if s is not None else "").strip()


def _detect_letter(correct_raw, a, b, c, d):
    """To'g'ri javobni turli yozilish uslublaridan aniqlaydi:
    - faqat harf: "A", "b)", " C ", "d."
    - gap bilan: "Javob: B", "to'g'ri javob - C", "answer: D"
    - yoki katakchada javobning TO'LIQ matni yozilgan bo'lsa (harf emas),
      uni A/B/C/D variantlari bilan solishtirib topadi.
    Eski usuldagi kabi so'z ICHIDAN harf qidirmaydi (masalan "Dushanba"
    so'zidagi "d" ni D deb noto'g'ri qabul qilib olmasligi uchun)."""
    raw = _clean(correct_raw)
    if not raw:
        return ""
    # 1) Katakcha deyarli faqat bitta harf (eng keng tarqalgan holat)
    m = re.fullmatch(r"[ABCDabcd]\s*[\.\)\-:]?", raw)
    if m:
        return raw[0].upper()
    # 2) "Javob: B", "to'g'ri javob - C" kabi — kalit so'zdan keyingi harf
    m2 = re.search(
        r"(?:javob|to'?g'?ri|answer|correct|key|kalit)\D{0,15}?\b([ABCDabcd])\b",
        raw, re.I,
    )
    if m2:
        return m2.group(1).upper()
    # 3) Qatorning o'zi faqat bitta harfdan iborat bo'lsa (masalan alohida katak)
    m3 = re.fullmatch(r"\s*([ABCDabcd])\s*", raw)
    if m3:
        return m3.group(1).upper()
    # 4) Katakchada to'g'ri javobning TO'LIQ matni yozilgan bo'lishi mumkin
    norm = raw.strip().lower()
    for letter, val in (("A", a), ("B", b), ("C", c), ("D", d)):
        if val and val.strip().lower() == norm:
            return letter
    return ""


def _q(text, a, b, c, d, correct):
    text, a, b, c, d = _clean(text), _clean(a), _clean(b), _clean(c), _clean(d)
    letter = _detect_letter(correct, a, b, c, d)
    if text and a and b and c and d and letter in ("A", "B", "C", "D"):
        return {"text": text, "option_a": a, "option_b": b, "option_c": c,
                "option_d": d, "correct_option": letter}
    return None


def _looks_header(cells):
    joined = " ".join(_clean(c).lower() for c in cells[:6])
    return "savol" in joined or "javob" in joined or "question" in joined or "answer" in joined


def parse_excel(data):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    out = []
    for ws in wb.worksheets:
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            cells = list(row) + [None] * 6
            if i == 0 and _looks_header(cells):
                continue
            q = _q(cells[0], cells[1], cells[2], cells[3], cells[4], cells[5])
            if q:
                out.append(q)
    return out


def parse_csv(data):
    text = data.decode("utf-8-sig", errors="replace")
    # ; yoki , ajratgichni aniqlaymiz
    delim = ";" if text.count(";") > text.count(",") else ","
    out = []
    for i, cells in enumerate(csv.reader(io.StringIO(text), delimiter=delim)):
        cells = list(cells) + [None] * 6
        if i == 0 and _looks_header(cells):
            continue
        q = _q(cells[0], cells[1], cells[2], cells[3], cells[4], cells[5])
        if q:
            out.append(q)
    return out


def parse_docx(data):
    import docx
    doc = docx.Document(io.BytesIO(data))
    lines = [p.text for p in doc.paragraphs]
    # Jadval bo'lsa — har qatorni ustunlar bo'yicha savol deb sinaymiz
    table_qs = []
    for t in doc.tables:
        for r in t.rows:
            cells = [c.text for c in r.cells] + [None] * 6
            if _looks_header(cells):
                continue
            q = _q(cells[0], cells[1], cells[2], cells[3], cells[4], cells[5])
            if q:
                table_qs.append(q)
    if table_qs:
        return table_qs
    return parse_text_lines(lines)


def parse_pdf(data):
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(data))
    lines = []
    for page in reader.pages:
        txt = page.extract_text() or ""
        lines.extend(txt.splitlines())
    return parse_text_lines(lines)


# Variant: harf + belgi (). - : ]) + matn  YOKI  harf + bo'shliq + matn.
# Ya'ni harfdan keyin YO belgi (bo'shliqsiz ham: "A)3"), YO bo'shliq bo'lishi kerak.
# Shu bilan oddiy gaplar ("Answer is...") variant deb qabul qilinmaydi,
# lekin rasmdan (OCR) kelgan bo'shliqsiz "A)3" ham to'g'ri tushuniladi.
OPT_RE = re.compile(r"^\s*([ABCDabcd])\s*(?:[\).\-:\]]\s*|\s+)(.+)$")
# Javob qatori: "Javob: B", "to'g'ri javob - C", "Answer: D", "Kalit: A" va h.k.
ANS_RE = re.compile(
    r"^\s*(javob(?:i)?|to'?g'?ri\s*javob(?:i)?|to'?g'?risi|to'?g'?ri|answer(?:\s*key)?|correct(?:\s*answer)?|key|kalit(?:\s*javob)?)\s*[:\-]?\s*([ABCDabcd])\b",
    re.I,
)
# Alohida qatorda FAQAT bitta harf (variantlardan keyin ko'pincha shunday yoziladi)
BARE_ANS_RE = re.compile(r"^\s*([ABCDabcd])\s*[\.\)]?\s*$")
# Savol raqami: "1.", "1)", "#1", "Savol 1:", "Savol 1)" va h.k.
Q_RE = re.compile(r"^\s*(?:savol\s*)?#?(\d+)\s*[\).\-:]\s*(.+)$", re.I)


def _is_complete(cur):
    o = cur["opts"]
    return bool(cur["text"]) and all(o.get(L) for L in ("A", "B", "C", "D")) and cur["correct"] in ("A", "B", "C", "D")


def parse_text_lines(lines):
    out = []
    cur = {"text": "", "opts": {}, "correct": ""}

    def flush():
        o = cur["opts"]
        q = _q(cur["text"], o.get("A"), o.get("B"), o.get("C"), o.get("D"), cur["correct"])
        if q:
            out.append(q)

    for raw in lines:
        line = _clean(raw)
        if not line:
            continue
        # To'g'ri javob belgisi: variant boshida ★/✓ ("* B) ...") yoki oxirida
        mark_correct = False
        m_lead = re.match(r"^\s*[\*✓✔]+\s*([ABCDabcd])\b", line)
        if m_lead:
            mark_correct = True
            line = re.sub(r"^\s*[\*✓✔]+\s*", "", line)

        am = ANS_RE.match(line)
        om = OPT_RE.match(line)
        qm = Q_RE.match(line)
        bare = BARE_ANS_RE.match(line)

        if am:
            cur["correct"] = am.group(2).upper()
        elif om:
            L = om.group(1).upper()
            txt = om.group(2).strip()
            if re.search(r"[\*✓✔]\s*$", txt):   # variant oxiridagi belgi ham to'g'ri javob
                mark_correct = True
                txt = re.sub(r"\s*[\*✓✔]+\s*$", "", txt).strip()
            cur["opts"][L] = txt
            if mark_correct and not cur["correct"]:
                cur["correct"] = L
        elif qm:
            if cur["text"]:
                flush()
            cur = {"text": qm.group(2).strip(), "opts": {}, "correct": ""}
        elif bare and cur["opts"] and not cur["correct"]:
            # 4 ta variantdan keyin yakka o'zi turgan harf — bu javob
            cur["correct"] = bare.group(1).upper()
        elif not cur["text"]:
            cur = {"text": line, "opts": {}, "correct": ""}
        elif not cur["opts"]:
            # variantlar hali boshlanmagan — savol matnining davomi
            cur["text"] += " " + line
        elif _is_complete(cur):
            # oldingi savol allaqachon to'liq — raqamlanmagan bo'lsa ham,
            # bu ENDI YANGI savol (avval bu holatda qator butunlay
            # tashlab yuborilar edi — shu joy tuzatildi)
            flush()
            cur = {"text": line, "opts": {}, "correct": ""}
        else:
            # variantlar hali to'liq emas — oxirgi variantning davomi deb olamiz
            for L in ("D", "C", "B", "A"):
                if cur["opts"].get(L):
                    cur["opts"][L] += " " + line
                    break
            else:
                cur["text"] += " " + line
    if cur["text"]:
        flush()
    return out


def parse_file(filename, data):
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        return parse_excel(data)
    if name.endswith(".csv"):
        return parse_csv(data)
    if name.endswith(".docx"):
        return parse_docx(data)
    if name.endswith(".pdf"):
        return parse_pdf(data)
    # noma'lum — matn deb sinaymiz
    try:
        return parse_text_lines(data.decode("utf-8", errors="replace").splitlines())
    except Exception:
        return []
