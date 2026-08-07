"""
MaktabTest.uz — Onlayn test tizimi (backend)
Flask + SQLite. Ikkita panel: o'quvchi va o'qituvchi.
"""
import os
import io
import csv
import json
import secrets
import functools
from datetime import datetime

from flask import Flask, request, jsonify, session, send_from_directory, send_file, Response, abort
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

import db
from db import (get_conn, now_iso, SUBJECTS, CLASSES, UPLOAD_DIR,
                COIN_TEST_PER_CORRECT, COIN_VIDEO, COIN_AUDIO, COIN_TEXT)

app = Flask(__name__, static_folder="static", static_url_path="/static")


def _get_secret():
    """Maxfiy kalit: env'dan yoki faylдан (server qayta yuklanганда sessiya saqlanadi)."""
    env = os.environ.get("SECRET_KEY")
    if env:
        return env
    path = os.path.join(os.path.dirname(db.DB_PATH), "secret.key")
    try:
        if os.path.exists(path):
            with open(path) as f:
                return f.read().strip()
        key = secrets.token_hex(32)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(key)
        return key
    except Exception:
        return secrets.token_hex(32)


app.secret_key = _get_secret()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    JSON_AS_ASCII=False,
    MAX_CONTENT_LENGTH=300 * 1024 * 1024,   # yuklanadigan fayl uchun 300 MB limit
)

# Ma'lumotlar bazasini ishga tushiramiz
db.init_db()


# --------------------------------------------------------------------------
# Yordamchi funksiyalar
# --------------------------------------------------------------------------
def gen_code():
    """Kahoot uslubidagi 6 xonali raqamli kod (masalan: 483920)."""
    return "".join(secrets.choice("0123456789") for _ in range(6))


def unique_code(conn):
    """Bazada takrorlanmaydigan faol kod."""
    for _ in range(50):
        code = gen_code()
        row = conn.execute(
            "SELECT 1 FROM tests WHERE code = ? AND is_active = 1", (code,)
        ).fetchone()
        if not row:
            return code
    return gen_code()


def teacher_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("teacher_id"):
            return jsonify({"ok": False, "error": "Avval tizimga kiring"}), 401
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("teacher_id"):
            return jsonify({"ok": False, "error": "Avval tizimga kiring"}), 401
        if not session.get("is_admin"):
            return jsonify({"ok": False, "error": "Bu bo'lim faqat asosiy o'qituvchi (admin) uchun"}), 403
        return f(*args, **kwargs)
    return wrapper


ROLE_LABELS = {"owner": "Boshqaruv (egasi)", "director": "Direktor", "zavuch": "Zavuch", "teacher": "O'qituvchi"}


def is_owner():
    return session.get("role") == "owner"


def scope_school_id():
    """Ma'lumotlarni filtrlash uchun maktab id.
    Owner uchun: u 'kirgan' maktab (view_school_id) yoki None (platforma darajasi=hammasi).
    Boshqalar uchun: o'z maktabi."""
    if is_owner():
        return session.get("view_school_id")
    return session.get("school_id")


def school_clause(alias=None):
    """(sql_fragment, params) — maktab bo'yicha filtr. Owner platforma darajasida bo'lsa bo'sh."""
    sid = scope_school_id()
    if sid is None:
        return "", []
    col = ((alias + ".") if alias else "") + "school_id"
    return f" AND {col} = ? ", [sid]


def role_required(*roles):
    def deco(f):
        @functools.wraps(f)
        def wrapper(*a, **k):
            if not session.get("teacher_id"):
                return jsonify({"ok": False, "error": "Avval tizimga kiring"}), 401
            if session.get("role") not in roles:
                return jsonify({"ok": False, "error": "Sizda bu amal uchun ruxsat yo'q"}), 403
            return f(*a, **k)
        return wrapper
    return deco


def baho_from_pct(pct):
    """Foizni 5 ballik bahoga aylantiradi (5/4/3/2)."""
    if pct is None:
        return None
    if pct >= 87:
        return 5
    if pct >= 71:
        return 4
    if pct >= 55:
        return 3
    return 2


def norm(s):
    return (s or "").strip()


def check_work_hours():
    """8:00–21:00 dan tashqarida kirish taqiqlanadi."""
    hour = datetime.now().hour
    if hour < 8 or hour >= 21:
        return jsonify({"ok": False, "error": "Tizim faqat soat 8:00–21:00 orasida ishlaydi. Kechroq urinib ko'ring."}), 403
    return None


def get_teacher_classes(conn, teacher_id):
    """O'qituvchiga biriktirilgan sinflar (bo'sh = hammasi)."""
    row = conn.execute("SELECT assigned_classes FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
    if not row or not row["assigned_classes"]:
        return []
    return [c.strip() for c in row["assigned_classes"].split(",") if c.strip()]


def monthly_pct(conn, student_id):
    """Joriy oydagi o'rtacha o'zlashtirish foizi (test natijalari bo'yicha)."""
    ym = datetime.now().strftime("%Y-%m")
    rows = conn.execute(
        "SELECT percentage FROM submissions WHERE student_id = ? AND status = 'completed' AND substr(submitted_at,1,7) = ?",
        (student_id, ym),
    ).fetchall()
    if not rows:
        return None
    return round(sum(r["percentage"] for r in rows) / len(rows), 1)


def row_to_test(r, extra=None):
    d = {
        "id": r["id"],
        "title": r["title"],
        "subject": r["subject"],
        "class_name": r["class_name"],
        "duration_minutes": r["duration_minutes"],
        "code": r["code"],
        "is_active": bool(r["is_active"]),
        "created_at": r["created_at"],
    }
    if extra:
        d.update(extra)
    return d


# --------------------------------------------------------------------------
# Statik sahifa (frontend)
# --------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/favicon.ico")
def favicon():
    return ("", 204)


@app.route("/api/meta")
def meta():
    """Fanlar va sinflar ro'yxati (dropdownlar uchun)."""
    return jsonify({"ok": True, "subjects": SUBJECTS, "classes": CLASSES})


# --------------------------------------------------------------------------
# O'qituvchi (admin) autentifikatsiyasi
# --------------------------------------------------------------------------
@app.route("/api/teacher/login", methods=["POST"])
def teacher_login():
    data = request.get_json(force=True, silent=True) or {}
    username = norm(data.get("username"))
    password = data.get("password") or ""
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM teachers WHERE username = ?", (username,)).fetchone()
        if not r or not check_password_hash(r["password_hash"], password):
            return jsonify({"ok": False, "error": "Login yoki parol noto'g'ri"}), 401
        if r["suspended"]:
            return jsonify({"ok": False, "error": "Hisobingiz vaqtinchalik to'xtatilgan. Zavuch/boshqaruv bilan bog'laning."}), 403
        role = r["role"] or ("director" if r["is_admin"] else "teacher")
        school_id = r["school_id"]
        school_name = None
        if school_id:
            srow = conn.execute("SELECT name FROM schools WHERE id = ?", (school_id,)).fetchone()
            school_name = srow["name"] if srow else None
        session["teacher_id"] = r["id"]
        session["teacher_name"] = r["username"]
        session["is_admin"] = bool(r["is_admin"])
        session["role"] = role
        session["school_id"] = school_id
        session["school_name"] = school_name
        return jsonify({"ok": True, "teacher": {"id": r["id"], "username": r["username"],
                                                "is_admin": bool(r["is_admin"]), "role": role,
                                                "role_label": ROLE_LABELS.get(role, "O'qituvchi"),
                                                "school_id": school_id, "school_name": school_name}})
    finally:
        conn.close()


@app.route("/api/teacher/logout", methods=["POST"])
def teacher_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/teacher/me")
def teacher_me():
    if not session.get("teacher_id"):
        return jsonify({"ok": False}), 401
    role = session.get("role") or "teacher"
    view_sid = session.get("view_school_id")
    view_name = None
    if view_sid:
        conn = get_conn()
        try:
            srow = conn.execute("SELECT name FROM schools WHERE id = ?", (view_sid,)).fetchone()
            view_name = srow["name"] if srow else None
        finally:
            conn.close()
    conn2 = get_conn()
    try:
        ac_row = conn2.execute("SELECT assigned_classes FROM teachers WHERE id = ?", (session["teacher_id"],)).fetchone()
        ac = ac_row["assigned_classes"] if ac_row else ""
    finally:
        conn2.close()
    return jsonify({"ok": True, "teacher": {"id": session["teacher_id"], "username": session.get("teacher_name"),
                                            "is_admin": bool(session.get("is_admin")), "role": role,
                                            "role_label": ROLE_LABELS.get(role, "O'qituvchi"),
                                            "school_id": session.get("school_id"), "school_name": session.get("school_name"),
                                            "view_school_id": view_sid, "view_school_name": view_name,
                                            "assigned_classes": ac or ""}})


@app.route("/api/teacher/credentials", methods=["POST"])
@teacher_required
def teacher_credentials():
    """Login/parolni yangilash."""
    data = request.get_json(force=True, silent=True) or {}
    current = data.get("current_password") or ""
    new_user = norm(data.get("new_username"))
    new_pass = data.get("new_password") or ""
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM teachers WHERE id = ?", (session["teacher_id"],)).fetchone()
        if not r or not check_password_hash(r["password_hash"], current):
            return jsonify({"ok": False, "error": "Joriy parol noto'g'ri"}), 400
        if not new_user:
            return jsonify({"ok": False, "error": "Yangi login bo'sh bo'lmasin"}), 400
        if len(new_pass) < 4:
            return jsonify({"ok": False, "error": "Yangi parol kamida 4 ta belgidan iborat bo'lsin"}), 400
        # Login band emasligini tekshiramiz
        exists = conn.execute(
            "SELECT 1 FROM teachers WHERE username = ? AND id != ?", (new_user, r["id"])
        ).fetchone()
        if exists:
            return jsonify({"ok": False, "error": "Bu login band"}), 400
        conn.execute(
            "UPDATE teachers SET username = ?, password_hash = ? WHERE id = ?",
            (new_user, generate_password_hash(new_pass), r["id"]),
        )
        conn.commit()
        session["teacher_name"] = new_user
        return jsonify({"ok": True, "teacher": {"id": r["id"], "username": new_user}})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Testlar (o'qituvchi)
# --------------------------------------------------------------------------
@app.route("/api/tests", methods=["GET"])
@teacher_required
def list_tests():
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        rows = conn.execute("SELECT * FROM tests WHERE 1=1" + sc_ + " ORDER BY created_at DESC, id DESC", sp_).fetchall()
        out = []
        for r in rows:
            qc = conn.execute("SELECT COUNT(*) AS c FROM questions WHERE test_id = ?", (r["id"],)).fetchone()["c"]
            sc = conn.execute(
                "SELECT COUNT(*) AS c FROM submissions WHERE test_id = ? AND status != 'in_progress'", (r["id"],)
            ).fetchone()["c"]
            out.append(row_to_test(r, {"question_count": qc, "submission_count": sc}))
        return jsonify({"ok": True, "tests": out})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>", methods=["GET"])
@teacher_required
def get_test(test_id):
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not r:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and r["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu test boshqa maktabniki"}), 403
        qs = conn.execute(
            "SELECT * FROM questions WHERE test_id = ? ORDER BY order_index", (test_id,)
        ).fetchall()
        questions = [{
            "id": q["id"], "text": q["text"],
            "option_a": q["option_a"], "option_b": q["option_b"],
            "option_c": q["option_c"], "option_d": q["option_d"],
            "correct_option": q["correct_option"],
        } for q in qs]
        return jsonify({"ok": True, "test": row_to_test(r, {"questions": questions})})
    finally:
        conn.close()


def _validate_test_payload(data):
    title = norm(data.get("title"))
    subject = norm(data.get("subject"))
    class_name = norm(data.get("class_name"))
    try:
        duration = int(data.get("duration_minutes"))
    except (TypeError, ValueError):
        duration = 0
    questions = data.get("questions") or []
    if not title:
        return None, "Test nomini kiriting"
    if subject not in SUBJECTS:
        return None, "Fan noto'g'ri tanlangan"
    if class_name not in CLASSES:
        return None, "Sinf noto'g'ri tanlangan"
    if duration < 1:
        return None, "Vaqtni (daqiqa) to'g'ri belgilang"
    if len(questions) < 1:
        return None, "Kamida 1 ta savol bo'lishi kerak"
    clean = []
    for i, q in enumerate(questions, start=1):
        text = norm(q.get("text"))
        a, b, c, d = norm(q.get("option_a")), norm(q.get("option_b")), norm(q.get("option_c")), norm(q.get("option_d"))
        correct = (q.get("correct_option") or "").strip().upper()
        if not text:
            return None, f"{i}-savol matni bo'sh"
        if not (a and b and c and d):
            return None, f"{i}-savolning barcha variantlarini (A,B,C,D) to'ldiring"
        if correct not in ("A", "B", "C", "D"):
            return None, f"{i}-savol uchun to'g'ri javobni (A/B/C/D) tanlang"
        clean.append({"text": text, "a": a, "b": b, "c": c, "d": d, "correct": correct})
    return {"title": title, "subject": subject, "class_name": class_name,
            "duration": duration, "questions": clean}, None


@app.route("/api/tests", methods=["POST"])
@teacher_required
def create_test():
    data = request.get_json(force=True, silent=True) or {}
    parsed, err = _validate_test_payload(data)
    if err:
        return jsonify({"ok": False, "error": err}), 400
    sid = scope_school_id()
    if sid is None:
        return jsonify({"ok": False, "error": "Avval maktabga kiring (Maktablar bo'limidan)"}), 400
    conn = get_conn()
    try:
        code = unique_code(conn)
        cur = conn.execute(
            "INSERT INTO tests (title, subject, class_name, duration_minutes, code, is_active, school_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            (parsed["title"], parsed["subject"], parsed["class_name"], parsed["duration"], code, sid, now_iso()),
        )
        test_id = cur.lastrowid
        for idx, q in enumerate(parsed["questions"], start=1):
            conn.execute(
                "INSERT INTO questions (test_id, order_index, text, option_a, option_b, option_c, option_d, correct_option) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (test_id, idx, q["text"], q["a"], q["b"], q["c"], q["d"], q["correct"]),
            )
        conn.commit()
        return jsonify({"ok": True, "test_id": test_id, "code": code,
                        "title": parsed["title"], "subject": parsed["subject"],
                        "class_name": parsed["class_name"], "duration_minutes": parsed["duration"],
                        "question_count": len(parsed["questions"])})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>", methods=["PUT"])
@teacher_required
def update_test(test_id):
    data = request.get_json(force=True, silent=True) or {}
    parsed, err = _validate_test_payload(data)
    if err:
        return jsonify({"ok": False, "error": err}), 400
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not r:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        conn.execute(
            "UPDATE tests SET title = ?, subject = ?, class_name = ?, duration_minutes = ? WHERE id = ?",
            (parsed["title"], parsed["subject"], parsed["class_name"], parsed["duration"], test_id),
        )
        conn.execute("DELETE FROM questions WHERE test_id = ?", (test_id,))
        for idx, q in enumerate(parsed["questions"], start=1):
            conn.execute(
                "INSERT INTO questions (test_id, order_index, text, option_a, option_b, option_c, option_d, correct_option) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (test_id, idx, q["text"], q["a"], q["b"], q["c"], q["d"], q["correct"]),
            )
        conn.commit()
        return jsonify({"ok": True, "test_id": test_id, "code": r["code"]})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>", methods=["DELETE"])
@teacher_required
def delete_test(test_id):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM tests WHERE id = ?", (test_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>/regenerate-code", methods=["POST"])
@teacher_required
def regenerate_code(test_id):
    """Yangi kirish kodi (qayta faollashtirish)."""
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not r:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        code = unique_code(conn)
        conn.execute("UPDATE tests SET code = ?, is_active = 1 WHERE id = ?", (code, test_id))
        conn.commit()
        return jsonify({"ok": True, "code": code})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>/toggle", methods=["POST"])
@teacher_required
def toggle_test(test_id):
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not r:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        new_state = 0 if r["is_active"] else 1
        conn.execute("UPDATE tests SET is_active = ? WHERE id = ?", (new_state, test_id))
        conn.commit()
        return jsonify({"ok": True, "is_active": bool(new_state)})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>/start", methods=["POST"])
@teacher_required
def start_test(test_id):
    """Testni ishga tushiradi (faollashtiradi) — o'quvchilar kira oladi."""
    conn = get_conn()
    try:
        t = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not t:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab testi"}), 403
        conn.execute("UPDATE tests SET is_active = 1 WHERE id = ?", (test_id,))
        conn.commit()
        return jsonify({"ok": True, "code": t["code"]})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>/stop", methods=["POST"])
@teacher_required
def stop_test(test_id):
    """Testni to'xtatadi: yopadi + hozir yechayotganlarni yakunlaydi (joriy javob bilan)."""
    conn = get_conn()
    try:
        t = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not t:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab testi"}), 403
        conn.execute("UPDATE tests SET is_active = 0 WHERE id = ?", (test_id,))
        active = conn.execute("SELECT * FROM submissions WHERE test_id = ? AND status = 'in_progress'", (test_id,)).fetchall()
        for sub in active:
            try:
                answers = json.loads(sub["answers_json"] or "{}")
            except Exception:
                answers = {}
            _grade_and_finish(conn, sub, answers, "completed")
        return jsonify({"ok": True, "stopped": len(active)})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# O'quvchilar ro'yxati (o'qituvchi boshqaradi)
# --------------------------------------------------------------------------
@app.route("/api/students", methods=["GET"])
@teacher_required
def list_students():
    class_name = norm(request.args.get("class_name"))
    conn = get_conn()
    try:
        role = session.get("role", "teacher")
        if role == "teacher" and class_name:
            allowed = get_teacher_classes(conn, session["teacher_id"])
            if allowed and class_name not in allowed:
                return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
        sc_, sp_ = school_clause()
        if class_name:
            rows = conn.execute(
                "SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name",
                [class_name] + sp_,
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM students WHERE 1=1" + sc_ + " ORDER BY class_name, last_name", sp_).fetchall()
        students = [{
            "id": r["id"], "first_name": r["first_name"], "last_name": r["last_name"],
            "class_name": r["class_name"], "created_at": r["created_at"],
            "blocked": bool(r["blocked"]),
        } for r in rows]
        return jsonify({"ok": True, "students": students})
    finally:
        conn.close()


@app.route("/api/students", methods=["POST"])
@teacher_required
def add_student():
    data = request.get_json(force=True, silent=True) or {}
    first = norm(data.get("first_name"))
    last = norm(data.get("last_name"))
    class_name = norm(data.get("class_name"))
    if not first or not last:
        return jsonify({"ok": False, "error": "Ism va familiyani kiriting"}), 400
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf noto'g'ri"}), 400
    sid = scope_school_id()
    if sid is None:
        return jsonify({"ok": False, "error": "Avval maktabga kiring"}), 400
    conn = get_conn()
    try:
        dup = conn.execute(
            "SELECT 1 FROM students WHERE lower(first_name)=lower(?) AND lower(last_name)=lower(?) AND class_name=? AND school_id=?",
            (first, last, class_name, sid),
        ).fetchone()
        if dup:
            return jsonify({"ok": False, "error": "Bu o'quvchi allaqachon ro'yxatda bor"}), 400
        cur = conn.execute(
            "INSERT INTO students (first_name, last_name, class_name, school_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (first, last, class_name, sid, now_iso()),
        )
        conn.commit()
        return jsonify({"ok": True, "id": cur.lastrowid})
    finally:
        conn.close()


@app.route("/api/students/<int:student_id>", methods=["DELETE"])
@teacher_required
def delete_student(student_id):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


def _submission_summary(conn, sub):
    t = conn.execute("SELECT title, subject, class_name FROM tests WHERE id = ?", (sub["test_id"],)).fetchone()
    return {
        "id": sub["id"],
        "test_id": sub["test_id"],
        "test_title": t["title"] if t else "(o'chirilgan test)",
        "subject": t["subject"] if t else "-",
        "status": sub["status"],
        "score": sub["score"],
        "total": sub["total"],
        "correct_count": sub["correct_count"],
        "wrong_count": sub["wrong_count"],
        "percentage": round(sub["percentage"], 1),
        "violation_reason": sub["violation_reason"],
        "started_at": sub["started_at"],
        "submitted_at": sub["submitted_at"],
        "duration_seconds": sub["duration_seconds"],
    }


@app.route("/api/students/<int:student_id>/submissions", methods=["GET"])
@teacher_required
def student_submissions(student_id):
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        subs = conn.execute(
            "SELECT * FROM submissions WHERE student_id = ? AND status != 'in_progress' ORDER BY submitted_at DESC, id DESC",
            (student_id,),
        ).fetchall()
        return jsonify({
            "ok": True,
            "student": {"id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"], "class_name": s["class_name"]},
            "submissions": [_submission_summary(conn, x) for x in subs],
        })
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Natijalar va xavfsizlik (o'qituvchi)
# --------------------------------------------------------------------------
@app.route("/api/results", methods=["GET"])
@teacher_required
def results():
    """Sinf bo'yicha o'quvchilar + har birining topshirgan testlari (topshirmaganlar ham)."""
    class_name = norm(request.args.get("class_name"))
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf tanlang"}), 400
    conn = get_conn()
    try:
        role = session.get("role", "teacher")
        if role == "teacher":
            allowed = get_teacher_classes(conn, session["teacher_id"])
            if allowed and class_name not in allowed:
                return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
        sc_, sp_ = school_clause()
        students = conn.execute(
            "SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name",
            [class_name] + sp_,
        ).fetchall()
        out = []
        for s in students:
            subs = conn.execute(
                "SELECT * FROM submissions WHERE student_id = ? AND status != 'in_progress' ORDER BY submitted_at DESC, id DESC",
                (s["id"],),
            ).fetchall()
            grants = conn.execute(
                "SELECT test_id FROM retake_grants WHERE student_id = ?", (s["id"],)
            ).fetchall()
            completed = [x for x in subs if x["status"] == "completed"]
            best_pct = max([x["percentage"] for x in completed], default=None) if completed else None
            out.append({
                "id": s["id"],
                "first_name": s["first_name"],
                "last_name": s["last_name"],
                "class_name": s["class_name"],
                "submissions": [_submission_summary(conn, x) for x in subs],
                "submitted": len(subs) > 0,
                "has_violation": any(x["status"] == "terminated" for x in subs),
                "retake_test_ids": [g["test_id"] for g in grants],
                "monthly_pct": monthly_pct(conn, s["id"]),
                "best_pct": round(best_pct, 1) if best_pct is not None else None,
                "baho": baho_from_pct(best_pct),
                "blocked": bool(s["blocked"]),
            })
        return jsonify({"ok": True, "class_name": class_name, "students": out})
    finally:
        conn.close()


@app.route("/api/live", methods=["GET"])
@teacher_required
def live_monitor():
    """Hozir test yechayotgan o'quvchilar (jonli, to'liq ma'lumot bilan)."""
    class_filter = norm(request.args.get("class_name"))
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT sub.id AS sub_id, sub.started_at, sub.answers_json, s.first_name, s.last_name, s.class_name, "
            "t.title, t.subject, t.code, t.duration_minutes, "
            "(SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS q_total "
            "FROM submissions sub "
            "JOIN students s ON s.id = sub.student_id "
            "JOIN tests t ON t.id = sub.test_id "
            "WHERE sub.status = 'in_progress'" + school_clause("t")[0] + " ORDER BY sub.started_at DESC",
            school_clause("t")[1],
        ).fetchall()
        now = datetime.now()
        out = []
        all_classes = sorted(set(r["class_name"] for r in rows))
        for r in rows:
            if class_filter and r["class_name"] != class_filter:
                continue
            try:
                started = datetime.strptime(r["started_at"], "%Y-%m-%d %H:%M:%S")
                elapsed = int((now - started).total_seconds())
            except Exception:
                elapsed = 0
            remaining = max(0, r["duration_minutes"] * 60 - elapsed)
            try:
                answered = len(json.loads(r["answers_json"] or "{}"))
            except Exception:
                answered = 0
            out.append({
                "sub_id": r["sub_id"],
                "first_name": r["first_name"], "last_name": r["last_name"], "class_name": r["class_name"],
                "test_title": r["title"], "subject": r["subject"], "code": r["code"],
                "started_at": r["started_at"], "remaining_seconds": remaining,
                "duration_minutes": r["duration_minutes"], "answered": answered, "q_total": r["q_total"],
            })
        return jsonify({"ok": True, "active": out, "count": len(out), "classes": all_classes})
    finally:
        conn.close()


@app.route("/api/submissions/<int:sub_id>/stop", methods=["POST"])
@teacher_required
def stop_submission(sub_id):
    """Jonli kuzatuvдан bitta o'quvchining testini to'xtatadi."""
    conn = get_conn()
    try:
        sub = conn.execute("SELECT * FROM submissions WHERE id = ?", (sub_id,)).fetchone()
        if not sub:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        t = conn.execute("SELECT school_id FROM tests WHERE id = ?", (sub["test_id"],)).fetchone()
        sid = scope_school_id()
        if sid is not None and t and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab"}), 403
        if sub["status"] != "in_progress":
            return jsonify({"ok": True})
        try:
            answers = json.loads(sub["answers_json"] or "{}")
        except Exception:
            answers = {}
        _grade_and_finish(conn, sub, answers, "terminated", "O'qituvchi to'xtatdi")
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/submissions/<int:sub_id>", methods=["GET"])
@teacher_required
def submission_detail(sub_id):
    conn = get_conn()
    try:
        sub = conn.execute("SELECT * FROM submissions WHERE id = ?", (sub_id,)).fetchone()
        if not sub:
            return jsonify({"ok": False, "error": "Natija topilmadi"}), 404
        s = conn.execute("SELECT * FROM students WHERE id = ?", (sub["student_id"],)).fetchone()
        qs = conn.execute(
            "SELECT * FROM questions WHERE test_id = ? ORDER BY order_index", (sub["test_id"],)
        ).fetchall()
        answers = json.loads(sub["answers_json"] or "{}")
        details = []
        for q in qs:
            sel = answers.get(str(q["id"]))
            details.append({
                "text": q["text"],
                "correct_option": q["correct_option"],
                "selected": sel,
                "is_correct": sel == q["correct_option"],
            })
        summary = _submission_summary(conn, sub)
        summary["student"] = {
            "first_name": s["first_name"] if s else "?",
            "last_name": s["last_name"] if s else "?",
            "class_name": s["class_name"] if s else "?",
        }
        summary["details"] = details
        return jsonify({"ok": True, "submission": summary})
    finally:
        conn.close()


@app.route("/api/tests/<int:test_id>/retake", methods=["POST"])
@teacher_required
def grant_retake(test_id):
    data = request.get_json(force=True, silent=True) or {}
    student_id = data.get("student_id")
    conn = get_conn()
    try:
        t = conn.execute("SELECT 1 FROM tests WHERE id = ?", (test_id,)).fetchone()
        s = conn.execute("SELECT 1 FROM students WHERE id = ?", (student_id,)).fetchone()
        if not t or not s:
            return jsonify({"ok": False, "error": "Test yoki o'quvchi topilmadi"}), 404
        conn.execute(
            "INSERT OR IGNORE INTO retake_grants (test_id, student_id, created_at) VALUES (?, ?, ?)",
            (test_id, student_id, now_iso()),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# O'quvchi test topshirish oqimi (ochiq, kod bilan himoyalangan)
# --------------------------------------------------------------------------
@app.route("/api/student/start", methods=["POST"])
def student_start():
    data = request.get_json(force=True, silent=True) or {}
    first = norm(data.get("first_name"))
    last = norm(data.get("last_name"))
    class_name = norm(data.get("class_name"))
    code = norm(data.get("code"))
    if not first or not last:
        return jsonify({"ok": False, "error": "Ism va familiyangizni kiriting"}), 400
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinfingizni tanlang"}), 400
    if not code:
        return jsonify({"ok": False, "error": "Kirish kodini kiriting"}), 400
    err = check_work_hours()
    if err:
        return err

    conn = get_conn()
    try:
        test = conn.execute(
            "SELECT * FROM tests WHERE code = ? AND is_active = 1", (code,)
        ).fetchone()
        if not test:
            return jsonify({"ok": False, "error": "Kod noto'g'ri yoki test yopilgan"}), 400
        if test["class_name"] != class_name:
            return jsonify({"ok": False, "error": f"Bu kod {test['class_name']} sinf uchun. Sinfingizni tekshiring"}), 400

        # Maktab kod (test) orqali aniqlanadi
        t_school = test["school_id"]
        # Maktab to'xtatilganini tekshiramiz
        if t_school:
            sch = conn.execute("SELECT suspended FROM schools WHERE id = ?", (t_school,)).fetchone()
            if sch and sch["suspended"]:
                return jsonify({"ok": False, "error": "Bu maktab tizimi vaqtinchalik to'xtatilgan. Zavuch bilan bog'laning."}), 403
        # O'quvchini shu maktab kontekstида topamiz yoki yaratamiz
        student = conn.execute(
            "SELECT * FROM students WHERE lower(first_name)=lower(?) AND lower(last_name)=lower(?) AND class_name=? AND school_id IS ?",
            (first, last, class_name, t_school),
        ).fetchone()
        if not student:
            cur = conn.execute(
                "INSERT INTO students (first_name, last_name, class_name, school_id, created_at) VALUES (?, ?, ?, ?, ?)",
                (first, last, class_name, t_school, now_iso()),
            )
            student_id = cur.lastrowid
        else:
            if student["blocked"]:
                return jsonify({"ok": False, "error": "Siz bloklangansiz. Ustozingiz/zavuch bilan bog'laning."}), 403
            student_id = student["id"]

        # Avval topshirganmi? (retake ruxsati bo'lmasa — bloklaymiz)
        done = conn.execute(
            "SELECT * FROM submissions WHERE test_id = ? AND student_id = ? AND status != 'in_progress'",
            (test["id"], student_id),
        ).fetchone()
        grant = conn.execute(
            "SELECT * FROM retake_grants WHERE test_id = ? AND student_id = ?",
            (test["id"], student_id),
        ).fetchone()
        if done and not grant:
            return jsonify({"ok": False, "error": "Siz bu testni allaqachon topshirgansiz. Test yakunlangan."}), 403
        if done and grant:
            # Qayta topshirish ruxsatini ishlatamiz
            conn.execute("DELETE FROM retake_grants WHERE id = ?", (grant["id"],))

        # Eski tugatilmagan (in_progress) urinishlarni tozalaymiz
        conn.execute(
            "DELETE FROM submissions WHERE test_id = ? AND student_id = ? AND status = 'in_progress'",
            (test["id"], student_id),
        )

        qs = conn.execute(
            "SELECT * FROM questions WHERE test_id = ? ORDER BY order_index", (test["id"],)
        ).fetchall()
        token = secrets.token_hex(16)
        cur = conn.execute(
            "INSERT INTO submissions (test_id, student_id, token, status, total, started_at) "
            "VALUES (?, ?, ?, 'in_progress', ?, ?)",
            (test["id"], student_id, token, len(qs), now_iso()),
        )
        submission_id = cur.lastrowid
        conn.commit()

        questions = [{
            "id": q["id"], "text": q["text"],
            "option_a": q["option_a"], "option_b": q["option_b"],
            "option_c": q["option_c"], "option_d": q["option_d"],
        } for q in qs]

        return jsonify({
            "ok": True,
            "submission_id": submission_id,
            "token": token,
            "test": {
                "id": test["id"],
                "title": test["title"],
                "subject": test["subject"],
                "class_name": test["class_name"],
                "duration_minutes": test["duration_minutes"],
                "questions": questions,
            },
            "student": {"id": student_id, "first_name": first, "last_name": last, "class_name": class_name},
        })
    finally:
        conn.close()


def _grade_and_finish(conn, sub, answers, status, violation_reason=None):
    qs = conn.execute("SELECT id, correct_option FROM questions WHERE test_id = ?", (sub["test_id"],)).fetchall()
    total = len(qs)
    correct = 0
    for q in qs:
        sel = answers.get(str(q["id"]))
        if sel and sel == q["correct_option"]:
            correct += 1
    wrong = total - correct
    percentage = (correct / total * 100.0) if total else 0.0
    try:
        started = datetime.strptime(sub["started_at"], "%Y-%m-%d %H:%M:%S")
        duration = int((datetime.now() - started).total_seconds())
    except Exception:
        duration = 0
    conn.execute(
        "UPDATE submissions SET status=?, score=?, total=?, correct_count=?, wrong_count=?, percentage=?, "
        "answers_json=?, violation_reason=?, submitted_at=?, duration_seconds=? WHERE id=?",
        (status, correct, total, correct, wrong, percentage, json.dumps(answers),
         violation_reason, now_iso(), duration, sub["id"]),
    )
    # Coin mukofoti (faqat muvaffaqiyatli yakunlaganda, chetlashtirilganda emas)
    coins = correct * COIN_TEST_PER_CORRECT if status == "completed" else 0
    if coins:
        conn.execute("UPDATE students SET coins = COALESCE(coins,0) + ? WHERE id = ?", (coins, sub["student_id"]))
    conn.commit()
    return {"score": correct, "correct_count": correct, "wrong_count": wrong,
            "total": total, "percentage": round(percentage, 1), "duration_seconds": duration,
            "coins": coins}


@app.route("/api/student/submit", methods=["POST"])
def student_submit():
    data = request.get_json(force=True, silent=True) or {}
    sub_id = data.get("submission_id")
    token = data.get("token") or ""
    answers = data.get("answers") or {}
    answers = {str(k): str(v).strip().upper() for k, v in answers.items() if v}
    conn = get_conn()
    try:
        sub = conn.execute("SELECT * FROM submissions WHERE id = ?", (sub_id,)).fetchone()
        if not sub or sub["token"] != token:
            return jsonify({"ok": False, "error": "Sessiya topilmadi"}), 400
        if sub["status"] != "in_progress":
            # Allaqachon yakunlangan — natijani qaytaramiz
            return jsonify({"ok": True, "result": {
                "score": sub["score"], "correct_count": sub["correct_count"],
                "wrong_count": sub["wrong_count"], "total": sub["total"],
                "percentage": round(sub["percentage"], 1)}})
        result = _grade_and_finish(conn, sub, answers, "completed")
        return jsonify({"ok": True, "result": result})
    finally:
        conn.close()


@app.route("/api/student/violation", methods=["POST"])
def student_violation():
    """Anti-cheat: o'quvchi saytdan chiqishga/oyna almashtirishga urinsa."""
    data = request.get_json(force=True, silent=True) or {}
    sub_id = data.get("submission_id")
    token = data.get("token") or ""
    reason = norm(data.get("reason")) or "Boshqa oynaga o'tishga urindi"
    answers = data.get("answers") or {}
    answers = {str(k): str(v).strip().upper() for k, v in answers.items() if v}
    conn = get_conn()
    try:
        sub = conn.execute("SELECT * FROM submissions WHERE id = ?", (sub_id,)).fetchone()
        if not sub or sub["token"] != token:
            return jsonify({"ok": False, "error": "Sessiya topilmadi"}), 400
        if sub["status"] != "in_progress":
            return jsonify({"ok": True})
        _grade_and_finish(conn, sub, answers, "terminated", reason)
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/student/status", methods=["POST"])
def student_status():
    """O'quvchi test holatini tekshiradi (o'qituvchi to'xtatдими)."""
    data = request.get_json(force=True, silent=True) or {}
    conn = get_conn()
    try:
        sub = conn.execute("SELECT status FROM submissions WHERE id = ? AND token = ?",
                           (data.get("submission_id"), data.get("token") or "")).fetchone()
        return jsonify({"ok": True, "status": sub["status"] if sub else "unknown"})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# BILIM OLISH: darslar (video/audio/matn)
# --------------------------------------------------------------------------
def _lesson_public(l, conn, include_text=True):
    rt = None
    if l["related_test_id"]:
        t = conn.execute("SELECT id, title FROM tests WHERE id = ?", (l["related_test_id"],)).fetchone()
        if t:
            rt = {"id": t["id"], "title": t["title"]}
    size_mb = None
    if l["file_name"]:
        try:
            size_mb = round(os.path.getsize(os.path.join(UPLOAD_DIR, l["file_name"])) / (1024 * 1024), 1)
        except OSError:
            size_mb = None
    d = {
        "id": l["id"], "title": l["title"], "subject": l["subject"],
        "class_name": l["class_name"], "type": l["type"],
        "coins_reward": l["coins_reward"], "related_test": rt,
        "has_media": bool(l["file_name"]), "has_image": bool(l["image_name"]),
        "file_size_mb": size_mb, "created_at": l["created_at"],
    }
    if include_text and l["type"] == "text":
        d["text_content"] = l["text_content"]
    return d


def _make_submission(conn, test, student):
    """Test sessiyasini yaratadi va o'quvchiga yuboriladigan (javobsiz) ma'lumotni qaytaradi."""
    qs = conn.execute("SELECT * FROM questions WHERE test_id = ? ORDER BY order_index", (test["id"],)).fetchall()
    token = secrets.token_hex(16)
    cur = conn.execute(
        "INSERT INTO submissions (test_id, student_id, token, status, total, started_at) "
        "VALUES (?, ?, ?, 'in_progress', ?, ?)",
        (test["id"], student["id"], token, len(qs), now_iso()),
    )
    questions = [{
        "id": q["id"], "text": q["text"],
        "option_a": q["option_a"], "option_b": q["option_b"],
        "option_c": q["option_c"], "option_d": q["option_d"],
    } for q in qs]
    return {
        "ok": True, "submission_id": cur.lastrowid, "token": token,
        "test": {"id": test["id"], "title": test["title"], "subject": test["subject"],
                 "class_name": test["class_name"], "duration_minutes": test["duration_minutes"],
                 "questions": questions},
        "student": {"id": student["id"], "first_name": student["first_name"],
                    "last_name": student["last_name"], "class_name": student["class_name"]},
    }


@app.route("/api/lessons", methods=["POST"])
@teacher_required
def create_lesson():
    title = norm(request.form.get("title"))
    subject = norm(request.form.get("subject"))
    class_name = norm(request.form.get("class_name"))
    ltype = norm(request.form.get("type"))
    text_content = request.form.get("text_content") or ""
    try:
        coins = int(request.form.get("coins_reward") or 0)
    except ValueError:
        coins = 0
    related_test_id = request.form.get("related_test_id") or None
    if related_test_id:
        try:
            related_test_id = int(related_test_id)
        except ValueError:
            related_test_id = None

    if not title:
        return jsonify({"ok": False, "error": "Dars nomini kiriting"}), 400
    if subject not in SUBJECTS:
        return jsonify({"ok": False, "error": "Fan noto'g'ri"}), 400
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf noto'g'ri"}), 400
    if ltype not in ("video", "audio", "text"):
        return jsonify({"ok": False, "error": "Dars turi noto'g'ri"}), 400

    file_name = None
    image_name = None
    if ltype in ("video", "audio"):
        f = request.files.get("file")
        if not f or not f.filename:
            return jsonify({"ok": False, "error": "Video yoki audio fayl yuklang"}), 400
        safe = secure_filename(f.filename) or (ltype + ".bin")
        file_name = secrets.token_hex(8) + "_" + safe
        f.save(os.path.join(UPLOAD_DIR, file_name))
    else:
        if not text_content.strip():
            return jsonify({"ok": False, "error": "Matn (kitob) bo'sh bo'lmasin"}), 400
        img = request.files.get("image")
        if img and img.filename:
            safe = secure_filename(img.filename) or "rasm.png"
            image_name = "img_" + secrets.token_hex(8) + "_" + safe
            img.save(os.path.join(UPLOAD_DIR, image_name))

    if coins <= 0:
        coins = COIN_VIDEO if ltype == "video" else COIN_AUDIO if ltype == "audio" else COIN_TEXT

    sid = scope_school_id()
    if sid is None:
        return jsonify({"ok": False, "error": "Avval maktabga kiring"}), 400
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO lessons (title, subject, class_name, type, file_name, text_content, image_name, coins_reward, related_test_id, school_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (title, subject, class_name, ltype, file_name, text_content, image_name, coins, related_test_id, sid, now_iso()),
        )
        conn.commit()
        return jsonify({"ok": True, "id": cur.lastrowid})
    finally:
        conn.close()


@app.route("/api/lessons", methods=["GET"])
@teacher_required
def list_lessons():
    class_name = norm(request.args.get("class_name"))
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        if class_name:
            rows = conn.execute("SELECT * FROM lessons WHERE class_name = ?" + sc_ + " ORDER BY created_at DESC, id DESC", [class_name] + sp_).fetchall()
        else:
            rows = conn.execute("SELECT * FROM lessons WHERE 1=1" + sc_ + " ORDER BY created_at DESC, id DESC", sp_).fetchall()
        return jsonify({"ok": True, "lessons": [_lesson_public(l, conn, include_text=False) for l in rows]})
    finally:
        conn.close()


@app.route("/api/lessons/<int:lesson_id>", methods=["DELETE"])
@teacher_required
def delete_lesson(lesson_id):
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        if l:
            for fn in (l["file_name"], l["image_name"]):
                if fn:
                    try:
                        os.remove(os.path.join(UPLOAD_DIR, fn))
                    except OSError:
                        pass
        conn.execute("DELETE FROM lessons WHERE id = ?", (lesson_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/lessons/<int:lesson_id>/media")
def lesson_media(lesson_id):
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    finally:
        conn.close()
    if not l or not l["file_name"]:
        abort(404)
    path = os.path.join(UPLOAD_DIR, l["file_name"])
    if not os.path.exists(path):
        abort(404)
    return send_file(path, conditional=True)


@app.route("/api/learning/enter", methods=["POST"])
def learning_enter():
    data = request.get_json(force=True, silent=True) or {}
    first = norm(data.get("first_name"))
    last = norm(data.get("last_name"))
    class_name = norm(data.get("class_name"))
    try:
        school_id = int(data.get("school_id"))
    except (TypeError, ValueError):
        school_id = None
    if not first or not last:
        return jsonify({"ok": False, "error": "Ism va familiyangizni kiriting"}), 400
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinfingizni tanlang"}), 400
    err = check_work_hours()
    if err:
        return err
    conn = get_conn()
    try:
        sch_row = conn.execute("SELECT id, suspended FROM schools WHERE id=?", (school_id,)).fetchone() if school_id else None
        if not sch_row:
            return jsonify({"ok": False, "error": "Maktabingizni tanlang"}), 400
        if sch_row["suspended"]:
            return jsonify({"ok": False, "error": "Bu maktab tizimi vaqtinchalik to'xtatilgan. Zavuch bilan bog'laning."}), 403
        student = conn.execute(
            "SELECT * FROM students WHERE lower(first_name)=lower(?) AND lower(last_name)=lower(?) AND class_name=? AND school_id IS ?",
            (first, last, class_name, school_id),
        ).fetchone()
        # Faqat maktab ro'yxatidagi o'quvchi kira oladi (boshqa maktabga o'ta olmaydi)
        if not student:
            return jsonify({"ok": False, "error": "Siz bu maktab ro'yxatida yo'qsiz. O'qituvchingiz sizni ro'yxatga qo'shishi kerak."}), 403
        if student["blocked"]:
            return jsonify({"ok": False, "error": "Siz bloklangansiz. Ustozingiz/zavuch bilan bog'laning."}), 403
        lessons = conn.execute("SELECT * FROM lessons WHERE class_name = ? AND school_id = ? ORDER BY created_at DESC, id DESC", (class_name, school_id)).fetchall()
        done = [r["lesson_id"] for r in conn.execute("SELECT DISTINCT lesson_id FROM learning_activity WHERE student_id = ?", (student["id"],)).fetchall()]
        return jsonify({
            "ok": True,
            "student": {"id": student["id"], "first_name": student["first_name"], "last_name": student["last_name"],
                        "class_name": student["class_name"], "coins": student["coins"] or 0},
            "lessons": [_lesson_public(l, conn) for l in lessons],
            "completed": done,
        })
    finally:
        conn.close()


@app.route("/api/learning/complete", methods=["POST"])
def learning_complete():
    data = request.get_json(force=True, silent=True) or {}
    student_id = data.get("student_id")
    lesson_id = data.get("lesson_id")
    try:
        duration_seconds = int(data.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        duration_seconds = 0
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not l or not s:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        existing = conn.execute("SELECT * FROM learning_activity WHERE student_id = ? AND lesson_id = ?", (student_id, lesson_id)).fetchone()
        if existing:
            return jsonify({"ok": True, "already": True, "coins": 0, "total_coins": s["coins"] or 0})
        coins = l["coins_reward"] or 0
        conn.execute(
            "INSERT INTO learning_activity (student_id, lesson_id, type, coins_awarded, duration_seconds, completed_at) VALUES (?, ?, ?, ?, ?, ?)",
            (student_id, lesson_id, l["type"], coins, duration_seconds, now_iso()),
        )
        conn.execute("UPDATE students SET coins = COALESCE(coins,0) + ? WHERE id = ?", (coins, student_id))
        conn.commit()
        total = conn.execute("SELECT coins FROM students WHERE id = ?", (student_id,)).fetchone()["coins"]
        return jsonify({"ok": True, "already": False, "coins": coins, "total_coins": total})
    finally:
        conn.close()


@app.route("/api/learning/start-test", methods=["POST"])
def learning_start_test():
    """Darsga biriktirilgan testni (kodsiz) boshlash."""
    data = request.get_json(force=True, silent=True) or {}
    student_id = data.get("student_id")
    lesson_id = data.get("lesson_id")
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not l or not s or not l["related_test_id"]:
            return jsonify({"ok": False, "error": "Bu darsga test biriktirilmagan"}), 404
        test = conn.execute("SELECT * FROM tests WHERE id = ?", (l["related_test_id"],)).fetchone()
        if not test:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        done = conn.execute("SELECT * FROM submissions WHERE test_id = ? AND student_id = ? AND status != 'in_progress'", (test["id"], s["id"])).fetchone()
        grant = conn.execute("SELECT * FROM retake_grants WHERE test_id = ? AND student_id = ?", (test["id"], s["id"])).fetchone()
        if done and not grant:
            return jsonify({"ok": False, "error": "Siz bu testni allaqachon topshirgansiz."}), 403
        if done and grant:
            conn.execute("DELETE FROM retake_grants WHERE id = ?", (grant["id"],))
        conn.execute("DELETE FROM submissions WHERE test_id = ? AND student_id = ? AND status = 'in_progress'", (test["id"], s["id"]))
        payload = _make_submission(conn, test, s)
        conn.commit()
        return jsonify(payload)
    finally:
        conn.close()


@app.route("/api/learning/results", methods=["GET"])
@teacher_required
def learning_results():
    class_name = norm(request.args.get("class_name"))
    subject = norm(request.args.get("subject"))
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf tanlang"}), 400
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        # O'qituvchi sinf cheklovi
        role = session.get("role", "teacher")
        if role == "teacher":
            allowed = get_teacher_classes(conn, session["teacher_id"])
            if allowed and class_name not in allowed:
                return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
        students = conn.execute("SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name", [class_name] + sp_).fetchall()
        out = []
        for s in students:
            if subject:
                acts = conn.execute(
                    "SELECT la.type, COUNT(*) AS c, COALESCE(SUM(la.duration_seconds),0) AS dur "
                    "FROM learning_activity la JOIN lessons l ON l.id = la.lesson_id "
                    "WHERE la.student_id = ? AND l.subject = ? GROUP BY la.type",
                    (s["id"], subject),
                ).fetchall()
            else:
                acts = conn.execute(
                    "SELECT type, COUNT(*) AS c, COALESCE(SUM(duration_seconds),0) AS dur "
                    "FROM learning_activity WHERE student_id = ? GROUP BY type",
                    (s["id"],),
                ).fetchall()
            counts = {"video": 0, "audio": 0, "text": 0}
            durations = {"video": 0, "audio": 0, "text": 0}
            for a in acts:
                counts[a["type"]] = a["c"]
                durations[a["type"]] = a["dur"]
            total_dur = durations["video"] + durations["audio"] + durations["text"]
            out.append({
                "id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"],
                "coins": s["coins"] or 0, "videos": counts["video"], "audios": counts["audio"],
                "texts": counts["text"], "total": counts["video"] + counts["audio"] + counts["text"],
                "total_duration_seconds": total_dur,
            })
        out.sort(key=lambda x: -x["coins"])
        return jsonify({"ok": True, "class_name": class_name, "subject": subject, "students": out})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# OTA-ONA paneli
# --------------------------------------------------------------------------
@app.route("/api/students/<int:student_id>/parent", methods=["POST"])
@role_required("owner", "zavuch")
def set_parent(student_id):
    data = request.get_json(force=True, silent=True) or {}
    username = norm(data.get("username"))
    password = data.get("password") or ""
    if not username:
        return jsonify({"ok": False, "error": "Login kiriting"}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi bo'lsin"}), 400
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        dup = conn.execute("SELECT 1 FROM students WHERE parent_username = ? AND id != ?", (username, student_id)).fetchone()
        if dup:
            return jsonify({"ok": False, "error": "Bu login boshqa ota-onaga berilgan"}), 400
        conn.execute("UPDATE students SET parent_username = ?, parent_password_hash = ?, parent_password_plain = ? WHERE id = ?",
                     (username, generate_password_hash(password), password, student_id))
        conn.commit()
        return jsonify({"ok": True, "username": username, "password": password})
    finally:
        conn.close()


@app.route("/api/students/<int:student_id>/block", methods=["POST"])
@role_required("owner", "zavuch")
def block_student(student_id):
    """O'quvchini bloklaydi/blokdan chiqaradi (faqat direktor/zavuch)."""
    data = request.get_json(force=True, silent=True) or {}
    blocked = 1 if data.get("blocked") else 0
    conn = get_conn()
    try:
        if not conn.execute("SELECT 1 FROM students WHERE id = ?", (student_id,)).fetchone():
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        conn.execute("UPDATE students SET blocked = ? WHERE id = ?", (blocked, student_id))
        conn.commit()
        return jsonify({"ok": True, "blocked": bool(blocked)})
    finally:
        conn.close()


@app.route("/api/parent/login", methods=["POST"])
def parent_login():
    data = request.get_json(force=True, silent=True) or {}
    username = norm(data.get("username"))
    password = data.get("password") or ""
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE parent_username = ?", (username,)).fetchone()
        if not s or not s["parent_password_hash"] or not check_password_hash(s["parent_password_hash"], password):
            return jsonify({"ok": False, "error": "Login yoki parol noto'g'ri"}), 401
        session["parent_student_id"] = s["id"]
        return jsonify({"ok": True, "student": {"id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"], "class_name": s["class_name"]}})
    finally:
        conn.close()


@app.route("/api/parent/logout", methods=["POST"])
def parent_logout():
    session.pop("parent_student_id", None)
    return jsonify({"ok": True})


@app.route("/api/parent/activity", methods=["GET"])
def parent_activity():
    sid = session.get("parent_student_id")
    if not sid:
        return jsonify({"ok": False, "error": "Avval kiring"}), 401
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (sid,)).fetchone()
        if not s:
            return jsonify({"ok": False}), 404
        subs = conn.execute("SELECT * FROM submissions WHERE student_id = ? AND status != 'in_progress' ORDER BY submitted_at DESC, id DESC", (sid,)).fetchall()
        tests = [_submission_summary(conn, x) for x in subs]
        lacts = conn.execute(
            "SELECT la.type, la.coins_awarded, la.completed_at, l.title, l.subject "
            "FROM learning_activity la JOIN lessons l ON l.id = la.lesson_id "
            "WHERE la.student_id = ? ORDER BY la.completed_at DESC", (sid,)
        ).fetchall()
        learning = [{"title": a["title"], "subject": a["subject"], "type": a["type"],
                     "coins": a["coins_awarded"], "completed_at": a["completed_at"]} for a in lacts]
        counts = {"video": 0, "audio": 0, "text": 0}
        for a in lacts:
            counts[a["type"]] = counts.get(a["type"], 0) + 1
        return jsonify({
            "ok": True,
            "student": {"first_name": s["first_name"], "last_name": s["last_name"],
                        "class_name": s["class_name"], "coins": s["coins"] or 0,
                        "monthly_pct": monthly_pct(conn, sid),
                        "videos": counts["video"], "audios": counts["audio"], "texts": counts["text"],
                        "tests_count": len(tests)},
            "tests": tests, "learning": learning,
        })
    finally:
        conn.close()


# --------------------------------------------------------------------------
# EKSPORT: natijalarni Excel (CSV) formatida yuklab olish
# --------------------------------------------------------------------------
@app.route("/api/export/results.csv")
@teacher_required
def export_results_csv():
    class_name = norm(request.args.get("class_name"))
    if class_name not in CLASSES:
        abort(400)
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        students = conn.execute("SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name", [class_name] + sp_).fetchall()
        output = io.StringIO()
        output.write("﻿")  # Excel UTF-8 uchun BOM
        w = csv.writer(output)
        w.writerow(["Familiya", "Ism", "Sinf", "Test", "Fan", "Ball", "Jami", "Foiz", "Vaqt(soniya)", "Sana", "Coin", "Holat"])
        for s in students:
            subs = conn.execute("SELECT * FROM submissions WHERE student_id = ? AND status != 'in_progress' ORDER BY submitted_at", (s["id"],)).fetchall()
            if not subs:
                w.writerow([s["last_name"], s["first_name"], s["class_name"], "-", "-", "-", "-", "-", "-", "-", s["coins"] or 0, "Topshirmagan"])
            for sub in subs:
                t = conn.execute("SELECT title, subject FROM tests WHERE id = ?", (sub["test_id"],)).fetchone()
                w.writerow([
                    s["last_name"], s["first_name"], s["class_name"],
                    t["title"] if t else "-", t["subject"] if t else "-",
                    sub["score"], sub["total"], round(sub["percentage"], 1),
                    sub["duration_seconds"], sub["submitted_at"] or "-", s["coins"] or 0,
                    "XAVF (chetlashtirilgan)" if sub["status"] == "terminated" else "Topshirdi",
                ])
        return Response(
            output.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=natijalar_{class_name}.csv"},
        )
    finally:
        conn.close()


@app.route("/api/lessons/<int:lesson_id>/image")
def lesson_image(lesson_id):
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    finally:
        conn.close()
    if not l or not l["image_name"]:
        abort(404)
    path = os.path.join(UPLOAD_DIR, l["image_name"])
    if not os.path.exists(path):
        abort(404)
    return send_file(path, conditional=True)


# --------------------------------------------------------------------------
# O'QITUVCHILAR (bir nechta hisob)
# --------------------------------------------------------------------------
@app.route("/api/teachers", methods=["GET"])
@role_required("owner", "zavuch")
def list_teachers():
    sid = scope_school_id()
    conn = get_conn()
    try:
        if sid is None:
            return jsonify({"ok": True, "teachers": [], "my_role": session.get("role"), "need_school": True})
        rows = conn.execute("SELECT id, username, role, suspended, assigned_classes, created_at FROM teachers WHERE school_id = ? ORDER BY role, id", (sid,)).fetchall()
        out = [{"id": r["id"], "username": r["username"], "role": r["role"] or "teacher",
                "role_label": ROLE_LABELS.get(r["role"] or "teacher", "O'qituvchi"),
                "suspended": bool(r["suspended"]),
                "assigned_classes": r["assigned_classes"] or "",
                "is_me": r["id"] == session.get("teacher_id")} for r in rows]
        return jsonify({"ok": True, "teachers": out, "my_role": session.get("role")})
    finally:
        conn.close()


@app.route("/api/teachers", methods=["POST"])
@role_required("owner", "zavuch")
def create_teacher():
    data = request.get_json(force=True, silent=True) or {}
    username = norm(data.get("username"))
    password = data.get("password") or ""
    sid = scope_school_id()
    if sid is None:
        return jsonify({"ok": False, "error": "Avval maktabga kiring"}), 400
    if not username:
        return jsonify({"ok": False, "error": "Login kiriting"}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi bo'lsin"}), 400
    conn = get_conn()
    try:
        if conn.execute("SELECT 1 FROM teachers WHERE username = ?", (username,)).fetchone():
            return jsonify({"ok": False, "error": "Bu login band"}), 400
        conn.execute("INSERT INTO teachers (username, password_hash, role, is_admin, school_id, created_at) "
                     "VALUES (?, ?, 'teacher', 0, ?, ?)",
                     (username, generate_password_hash(password), sid, now_iso()))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/teachers/<int:teacher_id>", methods=["DELETE"])
@role_required("owner", "zavuch")
def delete_teacher(teacher_id):
    sid = scope_school_id()
    conn = get_conn()
    try:
        target = conn.execute("SELECT * FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
        if not target:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        if teacher_id == session.get("teacher_id"):
            return jsonify({"ok": False, "error": "O'zingizni o'chira olmaysiz"}), 400
        if sid is not None and target["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab hisobi"}), 403
        if (target["role"] or "teacher") != "teacher":
            return jsonify({"ok": False, "error": "Faqat o'qituvchini o'chira olasiz"}), 403
        conn.execute("DELETE FROM teachers WHERE id = ?", (teacher_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/teachers/<int:teacher_id>/classes", methods=["POST"])
@role_required("owner", "zavuch")
def set_teacher_classes(teacher_id):
    """O'qituvchiga biriktirilgan sinflarni belgilash."""
    data = request.get_json(force=True, silent=True) or {}
    classes = data.get("classes") or []
    sid = scope_school_id()
    conn = get_conn()
    try:
        t = conn.execute("SELECT * FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
        if not t:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        if sid is not None and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab hisobi"}), 403
        # Faqat CLASSES ichidagi sinflarni qabul qilamiz
        valid = [c for c in classes if c in CLASSES]
        ac = ",".join(valid)
        conn.execute("UPDATE teachers SET assigned_classes = ? WHERE id = ?", (ac, teacher_id))
        conn.commit()
        return jsonify({"ok": True, "assigned_classes": ac})
    finally:
        conn.close()


def _my_teacher(conn, teacher_id):
    """Nishon o'qituvchi (o'z maktabidagi) — yoki (None, error_response)."""
    t = conn.execute("SELECT * FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
    if not t:
        return None, (jsonify({"ok": False, "error": "Topilmadi"}), 404)
    sid = scope_school_id()
    if sid is not None and t["school_id"] != sid:
        return None, (jsonify({"ok": False, "error": "Bu boshqa maktab hisobi"}), 403)
    if (t["role"] or "teacher") != "teacher":
        return None, (jsonify({"ok": False, "error": "Bu amal faqat o'qituvchi uchun"}), 403)
    return t, None


@app.route("/api/teachers/<int:teacher_id>/password", methods=["POST"])
@role_required("owner", "zavuch")
def reset_teacher_password(teacher_id):
    data = request.get_json(force=True, silent=True) or {}
    password = data.get("password") or ""
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi bo'lsin"}), 400
    conn = get_conn()
    try:
        t, err = _my_teacher(conn, teacher_id)
        if err:
            return err
        conn.execute("UPDATE teachers SET password_hash = ? WHERE id = ?", (generate_password_hash(password), teacher_id))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/teachers/<int:teacher_id>/suspend", methods=["POST"])
@role_required("owner", "zavuch")
def suspend_teacher(teacher_id):
    conn = get_conn()
    try:
        t, err = _my_teacher(conn, teacher_id)
        if err:
            return err
        new_state = 0 if t["suspended"] else 1
        conn.execute("UPDATE teachers SET suspended = ? WHERE id = ?", (new_state, teacher_id))
        conn.commit()
        return jsonify({"ok": True, "suspended": bool(new_state)})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# OTA-ONALAR ro'yxati (login/parollarni ko'rsatish)
# --------------------------------------------------------------------------
@app.route("/api/parents", methods=["GET"])
@role_required("owner", "zavuch")
def list_parents():
    class_name = norm(request.args.get("class_name"))
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf tanlang"}), 400
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        rows = conn.execute("SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name", [class_name] + sp_).fetchall()
        return jsonify({"ok": True, "class_name": class_name, "students": [
            {"id": r["id"], "first_name": r["first_name"], "last_name": r["last_name"],
             "parent_username": r["parent_username"], "parent_password": r["parent_password_plain"]}
            for r in rows
        ]})
    finally:
        conn.close()


# --------------------------------------------------------------------------
# STATISTIKA / REYTING (dashboard)
# --------------------------------------------------------------------------
@app.route("/api/stats", methods=["GET"])
@teacher_required
def stats():
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        students = conn.execute("SELECT * FROM students WHERE 1=1" + sc_, sp_).fetchall()
        by_class = {}
        top_tests = []
        top_learning = []
        for s in students:
            subs = conn.execute(
                "SELECT * FROM submissions WHERE student_id = ? AND status = 'completed'", (s["id"],)
            ).fetchall()
            best_pct = max([x["percentage"] for x in subs], default=None)
            best_dur = None
            if best_pct is not None:
                best_dur = min([x["duration_seconds"] or 0 for x in subs if x["percentage"] == best_pct])
                top_tests.append({"name": f"{s['last_name']} {s['first_name']}", "class_name": s["class_name"],
                                  "pct": round(best_pct, 1), "dur": best_dur})
            coins = s["coins"] or 0
            if coins > 0:
                top_learning.append({"name": f"{s['last_name']} {s['first_name']}", "class_name": s["class_name"], "coins": coins})
            c = by_class.setdefault(s["class_name"], {"pcts": [], "coins": 0, "count": 0})
            if best_pct is not None:
                c["pcts"].append(best_pct)
            c["coins"] += coins
            c["count"] += 1

        top_tests.sort(key=lambda x: (-x["pct"], x["dur"]))
        top_learning.sort(key=lambda x: -x["coins"])

        classes = []
        for cls, d in by_class.items():
            avg = round(sum(d["pcts"]) / len(d["pcts"]), 1) if d["pcts"] else 0
            classes.append({"class_name": cls, "avg_pct": avg, "submitted": len(d["pcts"]),
                            "total_coins": d["coins"], "students": d["count"]})
        classes_by_score = sorted(classes, key=lambda x: -x["avg_pct"])
        classes_by_coins = sorted(classes, key=lambda x: -x["total_coins"])

        return jsonify({
            "ok": True,
            "top_tests": top_tests[:3],
            "top_learning": top_learning[:3],
            "classes_by_score": [c for c in classes_by_score if c["submitted"] > 0][:12],
            "classes_by_coins": [c for c in classes_by_coins if c["total_coins"] > 0][:12],
            "totals": {
                "students": len(students),
                "submissions": conn.execute("SELECT COUNT(*) AS c FROM submissions WHERE status='completed'").fetchone()["c"],
                "lessons_done": conn.execute("SELECT COUNT(*) AS c FROM learning_activity").fetchone()["c"],
            },
        })
    finally:
        conn.close()


# --------------------------------------------------------------------------
# FAYLDAN TEST IMPORT (Excel / CSV / Word / PDF)
# --------------------------------------------------------------------------
@app.route("/api/tests/<int:test_id>/add-questions", methods=["POST"])
@teacher_required
def add_questions_to_test(test_id):
    """Mavjud testga yangi savollar qo'shish (almashtirmaydi)."""
    data = request.get_json(force=True, silent=True) or {}
    questions = data.get("questions") or []
    conn = get_conn()
    try:
        t = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not t:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu test boshqa maktabniki"}), 403
        max_row = conn.execute("SELECT COALESCE(MAX(order_index),0) AS m FROM questions WHERE test_id = ?", (test_id,)).fetchone()
        max_idx = max_row["m"]
        clean = []
        for i, q in enumerate(questions, start=1):
            text = norm(q.get("text"))
            a = norm(q.get("option_a")); b = norm(q.get("option_b"))
            c = norm(q.get("option_c")); d = norm(q.get("option_d"))
            correct = (q.get("correct_option") or "").strip().upper()
            if not text:
                return jsonify({"ok": False, "error": f"{i}-savol matni bo'sh"}), 400
            if not (a and b and c and d):
                return jsonify({"ok": False, "error": f"{i}-savolning barcha variantlarini to'ldiring"}), 400
            if correct not in ("A", "B", "C", "D"):
                return jsonify({"ok": False, "error": f"{i}-savol uchun to'g'ri javobni tanlang"}), 400
            clean.append({"text": text, "a": a, "b": b, "c": c, "d": d, "correct": correct})
        if not clean:
            return jsonify({"ok": False, "error": "Savol kiritilmadi"}), 400
        for idx, q in enumerate(clean, start=max_idx + 1):
            conn.execute(
                "INSERT INTO questions (test_id, order_index, text, option_a, option_b, option_c, option_d, correct_option) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (test_id, idx, q["text"], q["a"], q["b"], q["c"], q["d"], q["correct"]),
            )
        conn.commit()
        total = conn.execute("SELECT COUNT(*) AS c FROM questions WHERE test_id = ?", (test_id,)).fetchone()["c"]
        return jsonify({"ok": True, "added": len(clean), "total": total})
    finally:
        conn.close()


@app.route("/api/tests/import", methods=["POST"])
@teacher_required
def import_test():
    import test_import
    title = norm(request.form.get("title"))
    subject = norm(request.form.get("subject"))
    class_name = norm(request.form.get("class_name"))
    try:
        duration = int(request.form.get("duration_minutes"))
    except (TypeError, ValueError):
        duration = 0
    if not title:
        return jsonify({"ok": False, "error": "Test nomini kiriting"}), 400
    if subject not in SUBJECTS:
        return jsonify({"ok": False, "error": "Fanni tanlang"}), 400
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinfni tanlang"}), 400
    if duration < 1:
        return jsonify({"ok": False, "error": "Vaqtni (daqiqa) belgilang"}), 400
    sid = scope_school_id()
    if sid is None:
        return jsonify({"ok": False, "error": "Avval maktabga kiring"}), 400
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "Fayl tanlang"}), 400
    data = f.read()
    try:
        questions = test_import.parse_file(f.filename, data)
    except Exception as e:
        return jsonify({"ok": False, "error": "Faylni o'qib bo'lmadi: " + str(e)}), 400
    if not questions:
        return jsonify({"ok": False, "error": "Fayldan savol topilmadi. Namuna (shablon) formatidan foydalaning."}), 400

    conn = get_conn()
    try:
        code = unique_code(conn)
        cur = conn.execute(
            "INSERT INTO tests (title, subject, class_name, duration_minutes, code, is_active, school_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            (title, subject, class_name, duration, code, sid, now_iso()),
        )
        tid = cur.lastrowid
        for idx, q in enumerate(questions, start=1):
            conn.execute(
                "INSERT INTO questions (test_id, order_index, text, option_a, option_b, option_c, option_d, correct_option) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (tid, idx, q["text"], q["option_a"], q["option_b"], q["option_c"], q["option_d"], q["correct_option"]),
            )
        conn.commit()
        return jsonify({"ok": True, "test_id": tid, "code": code, "question_count": len(questions),
                        "title": title, "subject": subject, "class_name": class_name, "duration_minutes": duration})
    finally:
        conn.close()


@app.route("/api/tests/import-template.csv")
@teacher_required
def import_template():
    output = io.StringIO()
    output.write("﻿")
    w = csv.writer(output)
    w.writerow(["Savol", "A", "B", "C", "D", "To'g'ri javob"])
    w.writerow(["2 + 2 = ?", "3", "4", "5", "6", "B"])
    w.writerow(["O'zbekiston poytaxti?", "Samarqand", "Toshkent", "Buxoro", "Xiva", "B"])
    return Response(output.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=test_namuna.csv"})


# --------------------------------------------------------------------------
# KO'P MAKTAB (multi-tenancy)
# --------------------------------------------------------------------------
@app.route("/api/schools/public", methods=["GET"])
def schools_public():
    """O'quvchi/ota-ona uchun maktablar ro'yxati (ochiq)."""
    conn = get_conn()
    try:
        rows = conn.execute("SELECT id, name FROM schools ORDER BY name").fetchall()
        return jsonify({"ok": True, "schools": [{"id": r["id"], "name": r["name"]} for r in rows]})
    finally:
        conn.close()


@app.route("/api/schools", methods=["GET"])
@role_required("owner")
def list_schools():
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM schools ORDER BY id").fetchall()
        out = []
        today = datetime.now().strftime("%Y-%m-%d")
        for s in rows:
            sid = s["id"]
            active_now = conn.execute(
                "SELECT COUNT(*) AS c FROM submissions sub JOIN tests t ON t.id=sub.test_id "
                "WHERE sub.status='in_progress' AND t.school_id=?", (sid,)
            ).fetchone()["c"]
            done_today = conn.execute(
                "SELECT COUNT(*) AS c FROM submissions sub JOIN tests t ON t.id=sub.test_id "
                "WHERE sub.status='completed' AND t.school_id=? AND substr(sub.submitted_at,1,10)=?",
                (sid, today)
            ).fetchone()["c"]
            out.append({
                "id": sid, "name": s["name"], "created_at": s["created_at"],
                "suspended": bool(s["suspended"]) if "suspended" in s.keys() else False,
                "students": conn.execute("SELECT COUNT(*) AS c FROM students WHERE school_id=?", (sid,)).fetchone()["c"],
                "teachers": conn.execute("SELECT COUNT(*) AS c FROM teachers WHERE school_id=?", (sid,)).fetchone()["c"],
                "tests": conn.execute("SELECT COUNT(*) AS c FROM tests WHERE school_id=?", (sid,)).fetchone()["c"],
                "active_now": active_now, "done_today": done_today,
                "zavuch": (conn.execute("SELECT username FROM teachers WHERE school_id=? AND role='zavuch' ORDER BY id LIMIT 1", (sid,)).fetchone() or {"username": None})["username"],
            })
        return jsonify({"ok": True, "schools": out, "count": len(out)})
    finally:
        conn.close()


@app.route("/api/schools", methods=["POST"])
@role_required("owner")
def create_school():
    """Yangi maktab + uning zavuchi (login/parol)."""
    data = request.get_json(force=True, silent=True) or {}
    name = norm(data.get("name"))
    username = norm(data.get("username"))
    password = data.get("password") or ""
    if not name:
        return jsonify({"ok": False, "error": "Maktab nomini kiriting"}), 400
    if not username:
        return jsonify({"ok": False, "error": "Zavuch uchun login kiriting"}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi bo'lsin"}), 400
    conn = get_conn()
    try:
        if conn.execute("SELECT 1 FROM teachers WHERE username=?", (username,)).fetchone():
            return jsonify({"ok": False, "error": "Bu login band"}), 400
        sid = conn.execute("INSERT INTO schools (name, created_at) VALUES (?, ?)", (name, now_iso())).lastrowid
        conn.execute("INSERT INTO teachers (username, password_hash, is_admin, role, school_id, created_at) "
                     "VALUES (?, ?, 1, 'zavuch', ?, ?)",
                     (username, generate_password_hash(password), sid, now_iso()))
        conn.commit()
        return jsonify({"ok": True, "school_id": sid, "username": username, "password": password})
    finally:
        conn.close()


@app.route("/api/schools/<int:school_id>", methods=["DELETE"])
@role_required("owner")
def delete_school(school_id):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM submissions WHERE test_id IN (SELECT id FROM tests WHERE school_id=?)", (school_id,))
        conn.execute("DELETE FROM questions WHERE test_id IN (SELECT id FROM tests WHERE school_id=?)", (school_id,))
        conn.execute("DELETE FROM learning_activity WHERE lesson_id IN (SELECT id FROM lessons WHERE school_id=?)", (school_id,))
        conn.execute("DELETE FROM tests WHERE school_id=?", (school_id,))
        conn.execute("DELETE FROM lessons WHERE school_id=?", (school_id,))
        conn.execute("DELETE FROM students WHERE school_id=?", (school_id,))
        conn.execute("DELETE FROM teachers WHERE school_id=?", (school_id,))
        conn.execute("DELETE FROM schools WHERE id=?", (school_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.route("/api/schools/<int:school_id>/suspend", methods=["POST"])
@role_required("owner")
def suspend_school(school_id):
    """Maktabni vaqtinchalik to'xtatish / faollashtirish."""
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM schools WHERE id = ?", (school_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "Maktab topilmadi"}), 404
        new_state = 0 if (s["suspended"] if "suspended" in s.keys() else 0) else 1
        conn.execute("UPDATE schools SET suspended = ? WHERE id = ?", (new_state, school_id))
        conn.commit()
        return jsonify({"ok": True, "suspended": bool(new_state)})
    finally:
        conn.close()


@app.route("/api/owner/enter-school", methods=["POST"])
@role_required("owner")
def enter_school():
    data = request.get_json(force=True, silent=True) or {}
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM schools WHERE id=?", (data.get("school_id"),)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "Maktab topilmadi"}), 404
        session["view_school_id"] = s["id"]
        return jsonify({"ok": True, "school_id": s["id"], "school_name": s["name"]})
    finally:
        conn.close()


@app.route("/api/owner/exit-school", methods=["POST"])
@role_required("owner")
def exit_school():
    session.pop("view_school_id", None)
    return jsonify({"ok": True})


# --------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
