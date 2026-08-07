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


def _q(text, a, b, c, d, correct):
    text, a, b, c, d = _clean(text), _clean(a), _clean(b), _clean(c), _clean(d)
    m = re.search(r"[ABCDabcd]", _clean(correct))
    correct = m.group(0).upper() if m else ""
    if text and a and b and c and d and correct in ("A", "B", "C", "D"):
        return {"text": text, "option_a": a, "option_b": b, "option_c": c,
                "option_d": d, "correct_option": correct}
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


OPT_RE = re.compile(r"^\s*([ABCDabcd])\s*[\).\-:]\s*(.+)$")
ANS_RE = re.compile(r"^\s*(javob|to'?g'?ri\s*javob|to'?g'?ri|answer|correct)\s*[:\-]?\s*([ABCDabcd])\b", re.I)
Q_RE = re.compile(r"^\s*(\d+)\s*[\).\-]\s*(.+)$")


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
        am = ANS_RE.match(line)
        om = OPT_RE.match(line)
        qm = Q_RE.match(line)
        if am:
            cur["correct"] = am.group(2).upper()
        elif om:
            cur["opts"][om.group(1).upper()] = om.group(2).strip()
        elif qm:
            if cur["text"]:
                flush()
            cur = {"text": qm.group(2).strip(), "opts": {}, "correct": ""}
        else:
            if cur["text"] and not cur["opts"]:
                cur["text"] += " " + line
            elif not cur["text"]:
                cur = {"text": line, "opts": {}, "correct": ""}
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
