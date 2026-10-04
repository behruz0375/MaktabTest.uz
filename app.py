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
from datetime import datetime, timedelta

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


@app.after_request
def _no_cache_api(resp):
    """API javoblari keshlanmasin (eski coin/natija ko'rinib qolmasin)."""
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
    return resp


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


def fmt_dur_uz(sec):
    """Soniyani o'qishga qulay ko'rinishga aylantiradi: '3 daq 20 s'."""
    sec = int(sec or 0)
    m, s = divmod(sec, 60)
    return f"{m} daq {s} s" if m else f"{s} s"


def norm(s):
    return (s or "").strip()


def get_setting(key, default=None):
    conn = get_conn()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def set_setting(key, value):
    conn = get_conn()
    try:
        conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) "
                     "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, str(value)))
        conn.commit()
    finally:
        conn.close()


def get_work_hours():
    try:
        start = int(get_setting("work_start", "8"))
        end = int(get_setting("work_end", "21"))
    except (TypeError, ValueError):
        start, end = 8, 21
    return start, end


def check_work_hours():
    """Belgilangan soatlardan tashqarida kirish taqiqlanadi (boshqaruv sozlaydi)."""
    start, end = get_work_hours()
    hour = datetime.now().hour
    if hour < start or hour >= end:
        return jsonify({"ok": False, "error": f"Tizim faqat soat {start}:00–{end}:00 orasida ishlaydi. Kechroq urinib ko'ring."}), 403
    return None


GAME_COINS_DEFAULT = 5
# O'yinlar ro'yxati (mukofot berish uchun ruxsat etilgan kalitlar)
GAME_KEYS = ("g2048", "sudoku", "ttt", "memory", "math", "numemory", "simon", "sequence")


def game_coins_key(school_id):
    return f"game_coins:{school_id}" if school_id else "game_coins"


def get_game_coins(school_id):
    """Bitta o'yin uchun beriladigan coin (zavuch belgilaydi)."""
    val = get_setting(game_coins_key(school_id)) if school_id else None
    if val is None:
        val = get_setting("game_coins", str(GAME_COINS_DEFAULT))
    try:
        return max(0, int(val))
    except (TypeError, ValueError):
        return GAME_COINS_DEFAULT


def get_teacher_classes(conn, teacher_id):
    """O'qituvchiga biriktirilgan sinflar (bo'sh = hammasi)."""
    row = conn.execute("SELECT assigned_classes FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
    if not row or not row["assigned_classes"]:
        return []
    return [c.strip() for c in row["assigned_classes"].split(",") if c.strip()]


def teacher_allowed_classes(conn):
    """Joriy foydalanuvchi ko'ra oladigan sinflar. None = cheklovsiz (barcha sinflar)."""
    if session.get("role", "teacher") != "teacher":
        return None
    allowed = get_teacher_classes(conn, session["teacher_id"])
    return allowed or None  # bo'sh ro'yxat = cheklov yo'q


def teacher_class_denied(conn, class_name):
    """O'qituvchi shu sinfga ruxsatsiz bo'lsa xatolik javobini qaytaradi, aks holda None."""
    allowed = teacher_allowed_classes(conn)
    if allowed is not None and class_name not in allowed:
        return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
    return None


def get_teacher_subjects(conn, teacher_id):
    """O'qituvchiga biriktirilgan fanlar (bo'sh = hammasi)."""
    row = conn.execute("SELECT assigned_subjects FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
    if not row or not row["assigned_subjects"]:
        return []
    return [s.strip() for s in row["assigned_subjects"].split(",") if s.strip()]


def teacher_allowed_subjects(conn):
    """Joriy foydalanuvchi ishlata oladigan fanlar. None = cheklovsiz."""
    if session.get("role", "teacher") != "teacher":
        return None
    allowed = get_teacher_subjects(conn, session["teacher_id"])
    return allowed or None


def teacher_subject_denied(conn, subject):
    """O'qituvchi shu fanga ruxsatsiz bo'lsa xatolik javobini qaytaradi, aks holda None."""
    allowed = teacher_allowed_subjects(conn)
    if allowed is not None and subject not in allowed:
        return jsonify({"ok": False, "error": "Sizga bu fan biriktirilmagan"}), 403
    return None


def add_daily_time(conn, student_id, seconds):
    """Bugungi kunga o'quvchining sarflagan vaqtini (soniya) qo'shadi."""
    if not seconds or seconds <= 0:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    conn.execute(
        "INSERT INTO learning_daily (student_id, date, seconds) VALUES (?, ?, ?) "
        "ON CONFLICT(student_id, date) DO UPDATE SET seconds = seconds + excluded.seconds",
        (student_id, today, int(seconds)),
    )


def time_breakdown(conn, student_id, days=14):
    """Kunlik/oylik vaqt taqsimoti (soniyada)."""
    today = datetime.now().strftime("%Y-%m-%d")
    ym = datetime.now().strftime("%Y-%m")
    rows = conn.execute(
        "SELECT date, seconds FROM learning_daily WHERE student_id = ? ORDER BY date DESC LIMIT ?",
        (student_id, days),
    ).fetchall()
    daily = [{"date": r["date"], "seconds": r["seconds"] or 0} for r in rows]
    total = conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE student_id = ?", (student_id,)).fetchone()["s"]
    month = conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE student_id = ? AND substr(date,1,7) = ?", (student_id, ym)).fetchone()["s"]
    today_sec = conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE student_id = ? AND date = ?", (student_id, today)).fetchone()["s"]
    return {"daily": daily, "total_seconds": total, "month_seconds": month, "today_seconds": today_sec}


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
    expected = norm(data.get("expected_role"))  # kirish oynasi: teacher | zavuch | owner
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM teachers WHERE username = ?", (username,)).fetchone()
        if not r or not check_password_hash(r["password_hash"], password):
            return jsonify({"ok": False, "error": "Login yoki parol noto'g'ri"}), 401
        if r["suspended"]:
            return jsonify({"ok": False, "error": "Hisobingiz vaqtinchalik to'xtatilgan. Zavuch/boshqaruv bilan bog'laning."}), 403
        role = r["role"] or ("director" if r["is_admin"] else "teacher")
        # Har bir rol o'z kirish oynasidan kirsin (owner zavuch oynasidan kira olmasin va aksincha)
        if expected:
            allowed_map = {"owner": {"owner"}, "zavuch": {"zavuch", "director"}, "teacher": {"teacher"}}
            allowed_roles = allowed_map.get(expected)
            if allowed_roles and role not in allowed_roles:
                where = {"owner": "👑 Boshqaruv", "zavuch": "🏫 Zavuch", "teacher": "🧑‍🏫 O'qituvchi"}.get(role, "kerakli")
                return jsonify({"ok": False, "error": f"Bu hisob '{where}' bo'limiga tegishli. O'sha bo'limdan kiring."}), 403
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
                                                "school_id": school_id, "school_name": school_name,
                                                "assigned_classes": r["assigned_classes"] or "",
                                                "assigned_subjects": r["assigned_subjects"] or ""}})
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
        ac_row = conn2.execute("SELECT assigned_classes, assigned_subjects FROM teachers WHERE id = ?", (session["teacher_id"],)).fetchone()
        ac = ac_row["assigned_classes"] if ac_row else ""
        asub = ac_row["assigned_subjects"] if ac_row else ""
    finally:
        conn2.close()
    return jsonify({"ok": True, "teacher": {"id": session["teacher_id"], "username": session.get("teacher_name"),
                                            "is_admin": bool(session.get("is_admin")), "role": role,
                                            "role_label": ROLE_LABELS.get(role, "O'qituvchi"),
                                            "school_id": session.get("school_id"), "school_name": session.get("school_name"),
                                            "view_school_id": view_sid, "view_school_name": view_name,
                                            "assigned_classes": ac or "", "assigned_subjects": asub or ""}})


@app.route("/api/profile")
@teacher_required
def profile():
    """Panel egasining to'liq profili + sanoqlar."""
    conn = get_conn()
    try:
        tid = session["teacher_id"]
        t = conn.execute("SELECT * FROM teachers WHERE id = ?", (tid,)).fetchone()
        if not t:
            return jsonify({"ok": False}), 404
        role = session.get("role") or "teacher"
        sc_, sp_ = school_clause()
        # O'qituvchi bo'lsa faqat ruxsat etilgan sinflar bo'yicha sanoq
        allowed = teacher_allowed_classes(conn)
        acl, acp = "", []
        if allowed is not None:
            ph = ",".join("?" for _ in allowed)
            acl = " AND class_name IN (" + ph + ") "
            acp = list(allowed)
        students = conn.execute("SELECT COUNT(*) AS c FROM students WHERE 1=1" + sc_ + acl, sp_ + acp).fetchone()["c"]
        lessons = conn.execute("SELECT COUNT(*) AS c FROM lessons WHERE 1=1" + sc_ + acl, sp_ + acp).fetchone()["c"]
        if role == "teacher":
            my_tests = conn.execute("SELECT COUNT(*) AS c FROM tests WHERE created_by = ?", (tid,)).fetchone()["c"]
            tests = my_tests
        else:
            tests = conn.execute("SELECT COUNT(*) AS c FROM tests WHERE 1=1" + sc_, sp_).fetchone()["c"]
            my_tests = conn.execute("SELECT COUNT(*) AS c FROM tests WHERE created_by = ?", (tid,)).fetchone()["c"]
        school_name = session.get("view_school_name") if role == "owner" else session.get("school_name")
        schools = None
        if role == "owner":
            schools = conn.execute("SELECT COUNT(*) AS c FROM schools").fetchone()["c"]
        submissions = conn.execute("SELECT COUNT(*) AS c FROM submissions WHERE status != 'in_progress' AND " + ("1=1" if scope_school_id() is None else "test_id IN (SELECT id FROM tests WHERE school_id = ?)"),
                                   ([] if scope_school_id() is None else [scope_school_id()])).fetchone()["c"]
        # Xodimlar soni (admin uchun)
        teachers_cnt = None
        if role in ("owner", "zavuch", "director"):
            if scope_school_id() is None:
                teachers_cnt = conn.execute("SELECT COUNT(*) AS c FROM teachers WHERE role = 'teacher'").fetchone()["c"]
            else:
                teachers_cnt = conn.execute("SELECT COUNT(*) AS c FROM teachers WHERE role = 'teacher' AND school_id = ?", (scope_school_id(),)).fetchone()["c"]
        # Saytdan foydalanish vaqti (bilim olish) — kunlik/haftalik/oylik/jami
        stu_scope = "student_id IN (SELECT id FROM students WHERE 1=1" + sc_ + ")"
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=6)).strftime("%Y-%m-%d")
        ym = datetime.now().strftime("%Y-%m")
        usage = {
            "today": conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE " + stu_scope + " AND date = ?", sp_ + [today]).fetchone()["s"],
            "week": conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE " + stu_scope + " AND date >= ?", sp_ + [week_ago]).fetchone()["s"],
            "month": conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE " + stu_scope + " AND substr(date,1,7) = ?", sp_ + [ym]).fetchone()["s"],
            "total": conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE " + stu_scope, sp_).fetchone()["s"],
        }
        # Tur bo'yicha (video/audio/matn) vaqtlari
        dur_rows = conn.execute("SELECT type, COALESCE(SUM(duration_seconds),0) AS d FROM learning_activity WHERE " + stu_scope + " GROUP BY type", sp_).fetchall()
        media = {"video": 0, "audio": 0, "text": 0}
        for dr in dur_rows:
            if dr["type"] in media:
                media[dr["type"]] = dr["d"]
        return jsonify({"ok": True, "profile": {
            "username": t["username"], "role": role, "role_label": ROLE_LABELS.get(role, "O'qituvchi"),
            "is_admin": bool(session.get("is_admin")),
            "school_name": school_name,
            "assigned_classes": t["assigned_classes"] or "",
            "assigned_subjects": t["assigned_subjects"] or "",
            "created_at": t["created_at"],
            "counts": {"students": students, "tests": tests, "lessons": lessons, "my_tests": my_tests,
                       "schools": schools, "submissions": submissions, "teachers": teachers_cnt},
            "usage": usage, "media": media,
        }})
    finally:
        conn.close()


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
            "UPDATE teachers SET username = ?, password_hash = ?, password_plain = ? WHERE id = ?",
            (new_user, generate_password_hash(new_pass), new_pass, r["id"]),
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
        # O'qituvchi faqat o'zi qo'shgan testlarni ko'radi; zavuch/owner — hammasini
        mine_clause, mine_params = "", []
        if session.get("role", "teacher") == "teacher":
            allowed = get_teacher_classes(conn, session["teacher_id"])
            conds = ["created_by = ?"]
            mine_params = [session.get("teacher_id")]
            if allowed:
                # Zavuch biriktirgan sinflar testlarini ham boshqaradi
                ph = ",".join("?" for _ in allowed)
                conds.append("class_name IN (" + ph + ")")
                mine_params += allowed
            else:
                # Cheklov yo'q: egasi belgilanmagan eski testlar ham ko'rinsin
                conds.append("created_by IS NULL")
            mine_clause = " AND (" + " OR ".join(conds) + ") "
        rows = conn.execute("SELECT * FROM tests WHERE 1=1" + sc_ + mine_clause + " ORDER BY created_at DESC, id DESC",
                            sp_ + mine_params).fetchall()
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
        denied = teacher_class_denied(conn, parsed["class_name"]) or teacher_subject_denied(conn, parsed["subject"])
        if denied:
            return denied
        # Shu maktabда shu nomli test bormi?
        if conn.execute("SELECT 1 FROM tests WHERE lower(title) = lower(?) AND school_id = ?", (parsed["title"], sid)).fetchone():
            return jsonify({"ok": False, "error": "Bu nomdagi test allaqachon bor. Nomini o'zgartiring."}), 400
        code = unique_code(conn)
        cur = conn.execute(
            "INSERT INTO tests (title, subject, class_name, duration_minutes, code, is_active, school_id, created_by, created_at) "
            "VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
            (parsed["title"], parsed["subject"], parsed["class_name"], parsed["duration"], code, sid, session.get("teacher_id"), now_iso()),
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


@app.route("/api/tests/<int:test_id>/meta", methods=["POST"])
@teacher_required
def update_test_meta(test_id):
    """Testning nomi, fani, sinfi va vaqtini tahrirlaydi (savollarga tegmaydi).
    O'qituvchi sinfni faqat o'ziga biriktirilgan sinflarга o'zgartira oladi; zavuch/boshqaruv — istalganга."""
    data = request.get_json(force=True, silent=True) or {}
    conn = get_conn()
    try:
        r = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not r:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and r["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab testi"}), 403
        title = norm(data.get("title")) or r["title"]
        subject = norm(data.get("subject")) or r["subject"]
        class_name = norm(data.get("class_name")) or r["class_name"]
        try:
            duration = int(data.get("duration_minutes"))
        except (TypeError, ValueError):
            duration = r["duration_minutes"]
        if subject not in SUBJECTS:
            return jsonify({"ok": False, "error": "Fan noto'g'ri"}), 400
        if class_name not in CLASSES:
            return jsonify({"ok": False, "error": "Sinf noto'g'ri"}), 400
        if duration < 1:
            return jsonify({"ok": False, "error": "Vaqtni to'g'ri belgilang"}), 400
        # O'qituvchi begona sinf/fanга o'zgartira olmaydi
        if class_name != r["class_name"]:
            denied = teacher_class_denied(conn, class_name)
            if denied:
                return denied
        if subject != r["subject"]:
            denied = teacher_subject_denied(conn, subject)
            if denied:
                return denied
        conn.execute("UPDATE tests SET title = ?, subject = ?, class_name = ?, duration_minutes = ? WHERE id = ?",
                     (title, subject, class_name, duration, test_id))
        conn.commit()
        return jsonify({"ok": True})
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
        is_admin = session.get("role") in ("owner", "zavuch", "director")
        students = [{
            "id": r["id"], "first_name": r["first_name"], "last_name": r["last_name"],
            "class_name": r["class_name"], "created_at": r["created_at"],
            "blocked": bool(r["blocked"]),
            "learn_username": r["learn_username"] if is_admin else None,
            "learn_password": r["learn_password_plain"] if is_admin else None,
        } for r in rows]
        return jsonify({"ok": True, "students": students})
    finally:
        conn.close()


@app.route("/api/students", methods=["POST"])
@role_required("owner", "zavuch")
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


@app.route("/api/students/<int:student_id>", methods=["PUT"])
@role_required("owner", "zavuch")
def update_student(student_id):
    """O'quvchi ism/familiya/sinfini tahrirlaydi (sinfini almashtirish ham) — zavuch/boshqaruv."""
    data = request.get_json(force=True, silent=True) or {}
    first = norm(data.get("first_name"))
    last = norm(data.get("last_name"))
    class_name = norm(data.get("class_name"))
    if not first or not last:
        return jsonify({"ok": False, "error": "Ism va familiyani kiriting"}), 400
    if class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf noto'g'ri"}), 400
    sid = scope_school_id()
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        if sid is not None and s["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab o'quvchisi"}), 403
        dup = conn.execute(
            "SELECT 1 FROM students WHERE lower(first_name)=lower(?) AND lower(last_name)=lower(?) AND class_name=? AND school_id IS ? AND id != ?",
            (first, last, class_name, s["school_id"], student_id),
        ).fetchone()
        if dup:
            return jsonify({"ok": False, "error": "Bu ism-familiya shu sinfda allaqachon bor"}), 400
        conn.execute("UPDATE students SET first_name = ?, last_name = ?, class_name = ? WHERE id = ?",
                     (first, last, class_name, student_id))
        conn.commit()
        return jsonify({"ok": True, "id": student_id, "class_name": class_name})
    finally:
        conn.close()


@app.route("/api/students/<int:student_id>", methods=["DELETE"])
@role_required("owner", "zavuch")
def delete_student(student_id):
    """O'quvchini va unga bog'liq ma'lumotlarni o'chiradi (faqat zavuch/boshqaruv)."""
    sid = scope_school_id()
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        if sid is not None and s["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab o'quvchisi"}), 403
        conn.execute("DELETE FROM learning_daily WHERE student_id = ?", (student_id,))
        conn.execute("DELETE FROM learning_activity WHERE student_id = ?", (student_id,))
        conn.execute("DELETE FROM retake_grants WHERE student_id = ?", (student_id,))
        conn.execute("DELETE FROM submissions WHERE student_id = ?", (student_id,))
        conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


def _submission_summary(conn, sub):
    t = conn.execute("SELECT title, subject, class_name, code, duration_minutes FROM tests WHERE id = ?", (sub["test_id"],)).fetchone()
    return {
        "id": sub["id"],
        "test_id": sub["test_id"],
        "test_title": t["title"] if t else "(o'chirilgan test)",
        "subject": t["subject"] if t else "-",
        "code": t["code"] if t else "-",
        "duration_minutes": t["duration_minutes"] if t else None,
        "baho": baho_from_pct(sub["percentage"]) if sub["status"] == "completed" else None,
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
        "retaken": bool(sub["retaken"]) if "retaken" in sub.keys() else False,
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
    """Sinf bo'yicha o'quvchilar + har birining topshirgan testlari (topshirmaganlar ham).
    class_name='__all__' bo'lsa — barcha (ruxsat etilgan) sinflar."""
    class_name = norm(request.args.get("class_name"))
    all_classes = (class_name == "__all__")
    if not all_classes and class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf tanlang"}), 400
    conn = get_conn()
    try:
        allowed = teacher_allowed_classes(conn)
        if not all_classes and allowed is not None and class_name not in allowed:
            return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
        sc_, sp_ = school_clause()
        if all_classes:
            if allowed is not None:
                ph = ",".join("?" for _ in allowed)
                students = conn.execute(
                    "SELECT * FROM students WHERE class_name IN (" + ph + ")" + sc_ + " ORDER BY class_name, last_name, first_name",
                    list(allowed) + sp_,
                ).fetchall()
            else:
                students = conn.execute(
                    "SELECT * FROM students WHERE 1=1" + sc_ + " ORDER BY class_name, last_name, first_name", sp_,
                ).fetchall()
        else:
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
        # Shu sinf(lar)да qaysi fanlardan test bor (fan filtri uchun)
        if all_classes:
            ts_rows = conn.execute("SELECT DISTINCT subject FROM tests WHERE 1=1" + sc_, sp_).fetchall()
        else:
            ts_rows = conn.execute("SELECT DISTINCT subject FROM tests WHERE class_name = ?" + sc_, [class_name] + sp_).fetchall()
        test_subjects = [r["subject"] for r in ts_rows]
        return jsonify({"ok": True, "class_name": class_name, "students": out, "test_subjects": test_subjects})
    finally:
        conn.close()


@app.route("/api/live", methods=["GET"])
@teacher_required
def live_monitor():
    """Hozir test yechayotgan o'quvchilar (jonli, to'liq ma'lumot bilan)."""
    class_filter = norm(request.args.get("class_name"))
    conn = get_conn()
    try:
        allowed = teacher_allowed_classes(conn)  # o'qituvchi faqat biriktirilgan sinflarni ko'radi
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
        if allowed is not None:
            rows = [r for r in rows if r["class_name"] in allowed]
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
                "started_at": r["started_at"],
                "started_clock": (r["started_at"] or "")[11:16],
                "remaining_seconds": remaining,
                "duration_minutes": r["duration_minutes"], "answered": answered, "q_total": r["q_total"],
                "state": "active",
            })
        # So'nggi 5 daqiqada test vaqtida chiqib ketgan (chetlashtirilgan) o'quvchilar
        left = []
        lrows = conn.execute(
            "SELECT sub.id AS sub_id, sub.started_at, sub.submitted_at, sub.violation_reason, sub.correct_count, sub.total, "
            "s.first_name, s.last_name, s.class_name, t.title, t.subject, t.code "
            "FROM submissions sub JOIN students s ON s.id = sub.student_id JOIN tests t ON t.id = sub.test_id "
            "WHERE sub.status = 'terminated'" + school_clause("t")[0] + " ORDER BY sub.submitted_at DESC LIMIT 30",
            school_clause("t")[1],
        ).fetchall()
        for r in lrows:
            try:
                fin = datetime.strptime(r["submitted_at"], "%Y-%m-%d %H:%M:%S")
                if (now - fin).total_seconds() > 300:
                    continue
            except Exception:
                continue
            if class_filter and r["class_name"] != class_filter:
                continue
            if allowed is not None and r["class_name"] not in allowed:
                continue
            left.append({
                "sub_id": r["sub_id"], "first_name": r["first_name"], "last_name": r["last_name"],
                "class_name": r["class_name"], "test_title": r["title"], "subject": r["subject"], "code": r["code"],
                "started_clock": (r["started_at"] or "")[11:16], "left_clock": (r["submitted_at"] or "")[11:16],
                "reason": r["violation_reason"] or "Chiqib ketdi",
                "answered": r["correct_count"], "q_total": r["total"], "state": "left",
            })
        return jsonify({"ok": True, "active": out, "count": len(out), "left": left, "classes": all_classes})
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
            pending = conn.execute(
                "SELECT * FROM tests WHERE code = ? AND is_active = 0 ORDER BY created_at DESC, id DESC LIMIT 1",
                (code,),
            ).fetchone()
            if pending:
                return jsonify({"ok": False, "waiting": True,
                                "error": "Ustoz testni hali boshlamadi. Iltimos, kuting..."}), 400
            return jsonify({"ok": False, "error": "Kod noto'g'ri"}), 400
        if test["class_name"] != class_name:
            return jsonify({"ok": False, "error": f"Bu kod {test['class_name']} sinf uchun. Sinfingizni tekshiring"}), 400

        # Maktab kod (test) orqali aniqlanadi
        t_school = test["school_id"]
        # Maktab to'xtatilganini tekshiramiz
        if t_school:
            sch = conn.execute("SELECT suspended FROM schools WHERE id = ?", (t_school,)).fetchone()
            if sch and sch["suspended"]:
                return jsonify({"ok": False, "error": "Bu maktab tizimi vaqtinchalik to'xtatilgan. Zavuch bilan bog'laning."}), 403
        # O'quvchini shu maktab kontekstида topamiz yoki avtomatik ro'yxatga qo'shamiz
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
        retake_mode = False
        if done and grant:
            # Qayta topshirish ruxsatini ishlatamiz
            conn.execute("DELETE FROM retake_grants WHERE id = ?", (grant["id"],))
            retake_mode = True

        # Eski tugatilmagan (in_progress) urinishlarni tozalaymiz
        conn.execute(
            "DELETE FROM submissions WHERE test_id = ? AND student_id = ? AND status = 'in_progress'",
            (test["id"], student_id),
        )

        qs = conn.execute(
            "SELECT * FROM questions WHERE test_id = ? ORDER BY order_index", (test["id"],)
        ).fetchall()
        token = secrets.token_hex(16)
        if retake_mode and done:
            # Yangi tarix qo'shilmaydi — o'sha yozuv yangilanadi, "qayta topshirdi" belgilanadi
            conn.execute(
                "UPDATE submissions SET status='in_progress', token=?, started_at=?, submitted_at=NULL, "
                "answers_json=NULL, score=0, correct_count=0, wrong_count=0, percentage=0, "
                "violation_reason=NULL, duration_seconds=0, retaken=1, total=? WHERE id=?",
                (token, now_iso(), len(qs), done["id"]),
            )
            submission_id = done["id"]
        else:
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
    # Test yechish uchun coin BERILMAYDI (coin faqat bilim olishда)
    coins = 0
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
    """O'quvchi test holatini tekshiradi (o'qituvchi to'xtatдими) va joriy javoblarni saqlaydi.
    Shu tufayli jonli kuzatuvда o'quvchi nechta savolni belgilagani real vaqtда ko'rinadi."""
    data = request.get_json(force=True, silent=True) or {}
    conn = get_conn()
    try:
        sub = conn.execute("SELECT * FROM submissions WHERE id = ? AND token = ?",
                           (data.get("submission_id"), data.get("token") or "")).fetchone()
        if not sub:
            return jsonify({"ok": True, "status": "unknown"})
        # Joriy javoblarni (baholamasдан) saqlaymiz — faqat test davom etayotganда
        if sub["status"] == "in_progress" and isinstance(data.get("answers"), dict):
            answers = {str(k): str(v).strip().upper() for k, v in data["answers"].items() if v}
            conn.execute("UPDATE submissions SET answers_json = ? WHERE id = ?", (json.dumps(answers), sub["id"]))
            conn.commit()
        return jsonify({"ok": True, "status": sub["status"]})
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
        denied = teacher_class_denied(conn, class_name) or teacher_subject_denied(conn, subject)
        if denied:
            return denied
        cur = conn.execute(
            "INSERT INTO lessons (title, subject, class_name, type, file_name, text_content, image_name, coins_reward, related_test_id, school_id, created_by, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (title, subject, class_name, ltype, file_name, text_content, image_name, coins, related_test_id, sid, session.get("teacher_id"), now_iso()),
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
        # O'qituvchi faqat ruxsat etilgan sinflar darslarini ko'radi/tahrirlaydi
        allowed = teacher_allowed_classes(conn)
        if allowed is not None:
            rows = [r for r in rows if r["class_name"] in allowed]
        out = []
        for l in rows:
            d = _lesson_public(l, conn, include_text=True)
            d["can_edit"] = allowed is None or l["class_name"] in allowed
            out.append(d)
        return jsonify({"ok": True, "lessons": out})
    finally:
        conn.close()


@app.route("/api/lessons/<int:lesson_id>", methods=["PUT", "POST"])
@teacher_required
def update_lesson(lesson_id):
    """Darsni tahrirlash: nom, fan, sinf, coin, matn/rasm yoki media faylni almashtirish.
    O'qituvchi faqat ruxsat etilgan sinflari uchun; zavuch/owner — hammasini."""
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        if not l:
            return jsonify({"ok": False, "error": "Dars topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and l["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab darsi"}), 403
        # Mavjud sinf uchun ruxsat
        denied = teacher_class_denied(conn, l["class_name"])
        if denied:
            return denied
        title = norm(request.form.get("title")) or l["title"]
        subject = norm(request.form.get("subject")) or l["subject"]
        class_name = norm(request.form.get("class_name")) or l["class_name"]
        if subject not in SUBJECTS:
            return jsonify({"ok": False, "error": "Fan noto'g'ri"}), 400
        if class_name not in CLASSES:
            return jsonify({"ok": False, "error": "Sinf noto'g'ri"}), 400
        # Yangi sinf/fan uchun ham ruxsat (o'qituvchi begona sinf/fanга o'tkaza olmaydi)
        denied2 = teacher_class_denied(conn, class_name)
        if denied2:
            return denied2
        if subject != l["subject"]:
            denied3 = teacher_subject_denied(conn, subject)
            if denied3:
                return denied3
        try:
            coins = int(request.form.get("coins_reward") or l["coins_reward"] or 0)
        except ValueError:
            coins = l["coins_reward"] or 0
        text_content = l["text_content"]
        image_name = l["image_name"]
        file_name = l["file_name"]
        if l["type"] == "text":
            tc = request.form.get("text_content")
            if tc is not None and tc.strip():
                text_content = tc
            img = request.files.get("image")
            if img and img.filename:
                if image_name:
                    try: os.remove(os.path.join(UPLOAD_DIR, image_name))
                    except OSError: pass
                safe = secure_filename(img.filename) or "rasm.png"
                image_name = "img_" + secrets.token_hex(8) + "_" + safe
                img.save(os.path.join(UPLOAD_DIR, image_name))
        else:
            f = request.files.get("file")
            if f and f.filename:
                if file_name:
                    try: os.remove(os.path.join(UPLOAD_DIR, file_name))
                    except OSError: pass
                safe = secure_filename(f.filename) or (l["type"] + ".bin")
                file_name = secrets.token_hex(8) + "_" + safe
                f.save(os.path.join(UPLOAD_DIR, file_name))
        conn.execute(
            "UPDATE lessons SET title=?, subject=?, class_name=?, coins_reward=?, text_content=?, image_name=?, file_name=? WHERE id=?",
            (title, subject, class_name, coins, text_content, image_name, file_name, lesson_id),
        )
        conn.commit()
        return jsonify({"ok": True, "id": lesson_id})
    finally:
        conn.close()


@app.route("/api/lessons/<int:lesson_id>", methods=["DELETE"])
@teacher_required
def delete_lesson(lesson_id):
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        # O'qituvchi faqat ruxsat etilgan sinf darsini o'chira oladi
        if l:
            denied = teacher_class_denied(conn, l["class_name"])
            if denied:
                return denied
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
    """Bilim olishga o'quvchi MAKTAB + LOGIN/PAROL bilan kiradi (zavuch/boshqaruv beradi)."""
    data = request.get_json(force=True, silent=True) or {}
    username = norm(data.get("username"))
    password = data.get("password") or ""
    try:
        school_id = int(data.get("school_id"))
    except (TypeError, ValueError):
        school_id = None
    if not username or not password:
        return jsonify({"ok": False, "error": "Login va parolni kiriting"}), 400
    if not school_id:
        return jsonify({"ok": False, "error": "Maktabingizni tanlang"}), 400
    err = check_work_hours()
    if err:
        return err
    conn = get_conn()
    try:
        student = conn.execute("SELECT * FROM students WHERE learn_username = ? AND school_id = ?", (username, school_id)).fetchone()
        if not student or not student["learn_password_hash"] or not check_password_hash(student["learn_password_hash"], password):
            return jsonify({"ok": False, "error": "Login yoki parol noto'g'ri (yoki maktab noto'g'ri tanlangan)"}), 401
        if student["blocked"]:
            return jsonify({"ok": False, "error": "Siz bloklangansiz. Ustozingiz/zavuch bilan bog'laning."}), 403
        school_id = student["school_id"]
        school_name = None
        if school_id:
            sch = conn.execute("SELECT name, suspended FROM schools WHERE id=?", (school_id,)).fetchone()
            if sch and sch["suspended"]:
                return jsonify({"ok": False, "error": "Bu maktab tizimi vaqtinchalik to'xtatilgan. Zavuch bilan bog'laning."}), 403
            school_name = sch["name"] if sch else None
        class_name = student["class_name"]
        lessons = conn.execute("SELECT * FROM lessons WHERE class_name = ? AND school_id = ? ORDER BY created_at DESC, id DESC", (class_name, school_id)).fetchall()
        done = [r["lesson_id"] for r in conn.execute("SELECT DISTINCT lesson_id FROM learning_activity WHERE student_id = ? AND completed = 1", (student["id"],)).fetchall()]
        bd = time_breakdown(conn, student["id"])
        return jsonify({
            "ok": True,
            "school_name": school_name,
            "game_coins": get_game_coins(school_id),
            "student": {"id": student["id"], "first_name": student["first_name"], "last_name": student["last_name"],
                        "class_name": student["class_name"], "coins": student["coins"] or 0,
                        "total_duration_seconds": bd["total_seconds"], "month_duration_seconds": bd["month_seconds"],
                        "today_duration_seconds": bd["today_seconds"]},
            "lessons": [_lesson_public(l, conn) for l in lessons],
            "completed": done,
            "daily": bd["daily"],
        })
    finally:
        conn.close()


@app.route("/api/learning/watch", methods=["POST"])
def learning_watch():
    """Heartbeat: o'quvchi video/audio ko'rayotganда sarflagan vaqtni (delta soniya) yozib boradi.
    Dars tugatilmagan bo'lsa ham vaqt saqlanadi (coin faqat tugatganda beriladi)."""
    data = request.get_json(force=True, silent=True) or {}
    student_id = data.get("student_id")
    lesson_id = data.get("lesson_id")
    try:
        seconds = int(data.get("seconds") or 0)
    except (TypeError, ValueError):
        seconds = 0
    if seconds <= 0:
        return jsonify({"ok": True, "skipped": True})
    seconds = min(seconds, 3600)
    conn = get_conn()
    try:
        l = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        s = conn.execute("SELECT 1 FROM students WHERE id = ?", (student_id,)).fetchone()
        if not l or not s:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        existing = conn.execute("SELECT id FROM learning_activity WHERE student_id = ? AND lesson_id = ?", (student_id, lesson_id)).fetchone()
        if existing:
            conn.execute("UPDATE learning_activity SET duration_seconds = COALESCE(duration_seconds,0) + ? WHERE id = ?",
                         (seconds, existing["id"]))
        else:
            conn.execute(
                "INSERT INTO learning_activity (student_id, lesson_id, type, coins_awarded, duration_seconds, completed, completed_at) "
                "VALUES (?, ?, ?, 0, ?, 0, ?)",
                (student_id, lesson_id, l["type"], seconds, now_iso()),
            )
        add_daily_time(conn, student_id, seconds)
        conn.commit()
        return jsonify({"ok": True})
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
        coins = l["coins_reward"] or 0
        if existing:
            if existing["completed"]:
                if duration_seconds > 0:
                    conn.execute("UPDATE learning_activity SET duration_seconds = COALESCE(duration_seconds,0) + ? WHERE id = ?",
                                 (duration_seconds, existing["id"]))
                    add_daily_time(conn, student_id, duration_seconds)
                    conn.commit()
                return jsonify({"ok": True, "already": True, "coins": 0, "total_coins": s["coins"] or 0})
            # Heartbeat orqali boshlangan (tugatilmagan) — endi tugatildi, coin beriladi
            conn.execute("UPDATE learning_activity SET completed = 1, coins_awarded = ?, "
                         "duration_seconds = COALESCE(duration_seconds,0) + ?, completed_at = ? WHERE id = ?",
                         (coins, duration_seconds, now_iso(), existing["id"]))
        else:
            conn.execute(
                "INSERT INTO learning_activity (student_id, lesson_id, type, coins_awarded, duration_seconds, completed, completed_at) "
                "VALUES (?, ?, ?, ?, ?, 1, ?)",
                (student_id, lesson_id, l["type"], coins, duration_seconds, now_iso()),
            )
        add_daily_time(conn, student_id, duration_seconds)
        conn.execute("UPDATE students SET coins = COALESCE(coins,0) + ? WHERE id = ?", (coins, student_id))
        conn.commit()
        total = conn.execute("SELECT coins FROM students WHERE id = ?", (student_id,)).fetchone()["coins"]
        total_dur = conn.execute("SELECT COALESCE(SUM(duration_seconds),0) AS d FROM learning_activity WHERE student_id = ?", (student_id,)).fetchone()["d"]
        return jsonify({"ok": True, "already": False, "coins": coins, "total_coins": total, "total_duration_seconds": total_dur})
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
        # Darsdan keyingi testni qayta-qayta topshirish mumkin — yangi tarix qo'shilmaydi, o'sha yozuv yangilanadi
        conn.execute("DELETE FROM retake_grants WHERE test_id = ? AND student_id = ?", (test["id"], s["id"]))
        conn.execute("DELETE FROM submissions WHERE test_id = ? AND student_id = ? AND status = 'in_progress'", (test["id"], s["id"]))
        done = conn.execute("SELECT * FROM submissions WHERE test_id = ? AND student_id = ? AND status != 'in_progress'", (test["id"], s["id"])).fetchone()
        qs = conn.execute("SELECT * FROM questions WHERE test_id = ? ORDER BY order_index", (test["id"],)).fetchall()
        token = secrets.token_hex(16)
        if done:
            conn.execute(
                "UPDATE submissions SET status='in_progress', token=?, started_at=?, submitted_at=NULL, "
                "answers_json=NULL, score=0, correct_count=0, wrong_count=0, percentage=0, "
                "violation_reason=NULL, duration_seconds=0, retaken=1, total=? WHERE id=?",
                (token, now_iso(), len(qs), done["id"]),
            )
            submission_id = done["id"]
        else:
            cur = conn.execute(
                "INSERT INTO submissions (test_id, student_id, token, status, total, started_at) VALUES (?, ?, ?, 'in_progress', ?, ?)",
                (test["id"], s["id"], token, len(qs), now_iso()),
            )
            submission_id = cur.lastrowid
        questions = [{"id": q["id"], "text": q["text"], "option_a": q["option_a"], "option_b": q["option_b"],
                      "option_c": q["option_c"], "option_d": q["option_d"]} for q in qs]
        payload = {"ok": True, "submission_id": submission_id, "token": token,
                   "test": {"id": test["id"], "title": test["title"], "subject": test["subject"],
                            "class_name": test["class_name"], "duration_minutes": test["duration_minutes"], "questions": questions},
                   "student": {"id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"], "class_name": s["class_name"]}}
        conn.commit()
        return jsonify(payload)
    finally:
        conn.close()


@app.route("/api/learning/results", methods=["GET"])
@teacher_required
def learning_results():
    class_name = norm(request.args.get("class_name"))
    subject = norm(request.args.get("subject"))
    all_classes = (class_name == "__all__")
    if not all_classes and class_name not in CLASSES:
        return jsonify({"ok": False, "error": "Sinf tanlang"}), 400
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        # O'qituvchi sinf cheklovi
        allowed = teacher_allowed_classes(conn)
        if not all_classes and allowed is not None and class_name not in allowed:
            return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
        if all_classes:
            if allowed is not None:
                ph = ",".join("?" for _ in allowed)
                students = conn.execute(
                    "SELECT * FROM students WHERE class_name IN (" + ph + ")" + sc_ + " ORDER BY class_name, last_name, first_name",
                    list(allowed) + sp_,
                ).fetchall()
            else:
                students = conn.execute(
                    "SELECT * FROM students WHERE 1=1" + sc_ + " ORDER BY class_name, last_name, first_name", sp_,
                ).fetchall()
        else:
            students = conn.execute("SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name", [class_name] + sp_).fetchall()
        # Har sinf uchun mavjud darslar soni (faollik foizini hisoblash uchun)
        subj_l = " AND subject = ? " if subject else ""
        subj_p = [subject] if subject else []
        lt_rows = conn.execute(
            "SELECT class_name, COUNT(*) AS c FROM lessons WHERE 1=1" + sc_ + subj_l + " GROUP BY class_name",
            sp_ + subj_p,
        ).fetchall()
        lesson_totals = {r["class_name"]: r["c"] for r in lt_rows}
        is_admin = session.get("role") in ("owner", "zavuch", "director")
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
            # Shu oydagi sarflangan vaqt
            ym = datetime.now().strftime("%Y-%m")
            if subject:
                month_dur = conn.execute(
                    "SELECT COALESCE(SUM(la.duration_seconds),0) AS d FROM learning_activity la "
                    "JOIN lessons l ON l.id = la.lesson_id "
                    "WHERE la.student_id = ? AND l.subject = ? AND substr(la.completed_at,1,7) = ?",
                    (s["id"], subject, ym),
                ).fetchone()["d"]
            else:
                month_dur = conn.execute(
                    "SELECT COALESCE(SUM(duration_seconds),0) AS d FROM learning_activity "
                    "WHERE student_id = ? AND substr(completed_at,1,7) = ?",
                    (s["id"], ym),
                ).fetchone()["d"]
            mpct = monthly_pct(conn, s["id"])
            # Faollik foizi: tugatilgan darslar / sinfdagi mavjud darslar
            done_completed = conn.execute(
                "SELECT COUNT(DISTINCT la.lesson_id) AS c FROM learning_activity la "
                "JOIN lessons l ON l.id = la.lesson_id "
                "WHERE la.student_id = ? AND la.completed = 1 AND l.class_name = ?" + (" AND l.subject = ?" if subject else ""),
                ([s["id"], s["class_name"]] + ([subject] if subject else [])),
            ).fetchone()["c"]
            total_lessons = lesson_totals.get(s["class_name"], 0)
            faollik_pct = round(min(100, done_completed / total_lessons * 100), 0) if total_lessons else None
            out.append({
                "id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"],
                "coins": s["coins"] or 0, "videos": counts["video"], "audios": counts["audio"],
                "texts": counts["text"], "total": counts["video"] + counts["audio"] + counts["text"],
                "total_duration_seconds": total_dur, "month_duration_seconds": month_dur,
                "class_name": s["class_name"], "monthly_pct": mpct, "baho": baho_from_pct(mpct),
                "faollik_pct": faollik_pct, "done_lessons": done_completed, "total_lessons": total_lessons,
                "learn_username": s["learn_username"] if is_admin else None,
                "learn_password": s["learn_password_plain"] if is_admin else None,
            })
        out.sort(key=lambda x: -x["coins"])
        # Tanlangan fanda dars bor-yo'qligi (fan filtri xabari uchun)
        has_content = (sum(lesson_totals.values()) > 0) if subject else True
        return jsonify({"ok": True, "class_name": class_name, "subject": subject, "students": out, "has_content": has_content})
    finally:
        conn.close()


@app.route("/api/learning/student/<int:student_id>", methods=["GET"])
@teacher_required
def learning_student_detail(student_id):
    """Bitta o'quvchining bilim olish tafsiloti: darslar ro'yxati, vaqt, sana, oylik vaqt."""
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        role = session.get("role", "teacher")
        if role == "teacher":
            allowed = get_teacher_classes(conn, session["teacher_id"])
            if allowed and s["class_name"] not in allowed:
                return jsonify({"ok": False, "error": "Sizga bu sinf biriktirilmagan"}), 403
        acts = conn.execute(
            "SELECT la.type, la.coins_awarded, la.duration_seconds, la.completed_at, l.title, l.subject "
            "FROM learning_activity la JOIN lessons l ON l.id = la.lesson_id "
            "WHERE la.student_id = ? ORDER BY la.completed_at DESC", (student_id,)
        ).fetchall()
        ym = datetime.now().strftime("%Y-%m")
        items = []
        total_dur = 0
        month_dur = 0
        for a in acts:
            dur = a["duration_seconds"] or 0
            total_dur += dur
            if (a["completed_at"] or "")[:7] == ym:
                month_dur += dur
            items.append({
                "title": a["title"], "subject": a["subject"], "type": a["type"],
                "coins": a["coins_awarded"] or 0, "duration_seconds": dur,
                "completed_at": a["completed_at"],
            })
        bd = time_breakdown(conn, student_id)
        return jsonify({
            "ok": True,
            "student": {"id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"],
                        "class_name": s["class_name"], "coins": s["coins"] or 0},
            "items": items,
            "total_duration_seconds": bd["total_seconds"] or total_dur,
            "month_duration_seconds": bd["month_seconds"],
            "today_duration_seconds": bd["today_seconds"],
            "daily": bd["daily"],
        })
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


@app.route("/api/students/<int:student_id>/learning-login", methods=["POST"])
@role_required("owner", "zavuch")
def set_learning_login(student_id):
    """O'quvchining BILIM OLISH login/parolini o'rnatadi/yangilaydi (zavuch/boshqaruv)."""
    data = request.get_json(force=True, silent=True) or {}
    username = norm(data.get("username"))
    password = data.get("password") or ""
    if not username:
        return jsonify({"ok": False, "error": "Login kiriting"}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi bo'lsin"}), 400
    sid = scope_school_id()
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        if sid is not None and s["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab o'quvchisi"}), 403
        dup = conn.execute("SELECT 1 FROM students WHERE learn_username = ? AND school_id IS ? AND id != ?", (username, s["school_id"], student_id)).fetchone()
        if dup:
            return jsonify({"ok": False, "error": "Bu login shu maktabда boshqa o'quvchiga berilgan"}), 400
        conn.execute("UPDATE students SET learn_username = ?, learn_password_hash = ?, learn_password_plain = ? WHERE id = ?",
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
            "SELECT la.type, la.coins_awarded, la.duration_seconds, la.completed_at, l.title, l.subject "
            "FROM learning_activity la JOIN lessons l ON l.id = la.lesson_id "
            "WHERE la.student_id = ? ORDER BY la.completed_at DESC", (sid,)
        ).fetchall()
        ym = datetime.now().strftime("%Y-%m")
        learning = [{"title": a["title"], "subject": a["subject"], "type": a["type"],
                     "coins": a["coins_awarded"], "duration_seconds": a["duration_seconds"] or 0,
                     "completed_at": a["completed_at"]} for a in lacts]
        counts = {"video": 0, "audio": 0, "text": 0}
        total_dur = 0
        month_dur = 0
        for a in lacts:
            counts[a["type"]] = counts.get(a["type"], 0) + 1
            d = a["duration_seconds"] or 0
            total_dur += d
            if (a["completed_at"] or "")[:7] == ym:
                month_dur += d
        mpct = monthly_pct(conn, sid)
        # Umumiy (eng yaxshi) baho — shu oy test bo'lmasa ham baho ko'rinsin
        best_row = conn.execute("SELECT MAX(percentage) AS p FROM submissions WHERE student_id = ? AND status = 'completed'", (sid,)).fetchone()
        best_pct = best_row["p"] if best_row else None
        bd = time_breakdown(conn, sid)
        return jsonify({
            "ok": True,
            "student": {"first_name": s["first_name"], "last_name": s["last_name"],
                        "class_name": s["class_name"], "coins": s["coins"] or 0,
                        "monthly_pct": mpct, "monthly_baho": baho_from_pct(mpct),
                        "overall_pct": round(best_pct, 1) if best_pct is not None else None,
                        "overall_baho": baho_from_pct(best_pct),
                        "videos": counts["video"], "audios": counts["audio"], "texts": counts["text"],
                        "tests_count": len(tests),
                        "total_duration_seconds": bd["total_seconds"] or total_dur,
                        "month_duration_seconds": bd["month_seconds"],
                        "today_duration_seconds": bd["today_seconds"]},
            "tests": tests, "learning": learning, "daily": bd["daily"],
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
    all_classes = (class_name == "__all__")
    if not all_classes and class_name not in CLASSES:
        abort(400)
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        allowed = teacher_allowed_classes(conn)
        if not all_classes and allowed is not None and class_name not in allowed:
            abort(403)
        if all_classes:
            if allowed is not None:
                ph = ",".join("?" for _ in allowed)
                students = conn.execute(
                    "SELECT * FROM students WHERE class_name IN (" + ph + ")" + sc_ + " ORDER BY class_name, last_name, first_name",
                    list(allowed) + sp_).fetchall()
            else:
                students = conn.execute(
                    "SELECT * FROM students WHERE 1=1" + sc_ + " ORDER BY class_name, last_name, first_name", sp_).fetchall()
        else:
            students = conn.execute("SELECT * FROM students WHERE class_name = ?" + sc_ + " ORDER BY last_name, first_name", [class_name] + sp_).fetchall()
        output = io.StringIO()
        output.write("﻿")        # Excel UTF-8 uchun BOM
        output.write("sep=;\r\n")  # Excel ustunlarga to'g'ri ajratishi uchun
        w = csv.writer(output, delimiter=";", lineterminator="\r\n")
        w.writerow(["Familiya", "Ism", "Sinf", "Test", "Fan", "Kod", "Savollar",
                    "Ball", "Foiz", "Baho", "Belgilangan vaqt", "Sarflangan vaqt",
                    "Sana", "Coin", "Holat"])
        for s in students:
            subs = conn.execute("SELECT * FROM submissions WHERE student_id = ? AND status != 'in_progress' ORDER BY submitted_at", (s["id"],)).fetchall()
            if not subs:
                w.writerow([s["last_name"], s["first_name"], s["class_name"], "-", "-", "-", "-",
                            "-", "-", "-", "-", "-", "-", s["coins"] or 0, "Topshirmagan"])
            for sub in subs:
                t = conn.execute("SELECT title, subject, code, duration_minutes FROM tests WHERE id = ?", (sub["test_id"],)).fetchone()
                baho = baho_from_pct(sub["percentage"]) if sub["status"] == "completed" else None
                w.writerow([
                    s["last_name"], s["first_name"], s["class_name"],
                    t["title"] if t else "-", t["subject"] if t else "-", t["code"] if t else "-",
                    sub["total"], sub["score"], round(sub["percentage"], 1), baho if baho else "-",
                    f"{t['duration_minutes']} daq" if t else "-",
                    fmt_dur_uz(sub["duration_seconds"]),
                    sub["submitted_at"] or "-", s["coins"] or 0,
                    "XAVF (chetlashtirilgan)" if sub["status"] == "terminated" else "Topshirdi",
                ])
        return Response(
            output.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=natijalar_%s.csv" % ("hamma" if all_classes else class_name)},
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
        rows = conn.execute("SELECT id, username, password_plain, role, suspended, assigned_classes, assigned_subjects, created_at FROM teachers WHERE school_id = ? ORDER BY role, id", (sid,)).fetchall()
        total_students = conn.execute("SELECT COUNT(*) AS c FROM students WHERE school_id = ?", (sid,)).fetchone()["c"]
        out = []
        for r in rows:
            ac = [c.strip() for c in (r["assigned_classes"] or "").split(",") if c.strip()]
            if ac:
                ph = ",".join("?" for _ in ac)
                stu_count = conn.execute("SELECT COUNT(*) AS c FROM students WHERE school_id = ? AND class_name IN (" + ph + ")", [sid] + ac).fetchone()["c"]
            else:
                stu_count = total_students  # sinf biriktirilmagan = barcha o'quvchilar
            test_count = conn.execute("SELECT COUNT(*) AS c FROM tests WHERE created_by = ?", (r["id"],)).fetchone()["c"]
            out.append({"id": r["id"], "username": r["username"], "role": r["role"] or "teacher",
                        "role_label": ROLE_LABELS.get(r["role"] or "teacher", "O'qituvchi"),
                        "suspended": bool(r["suspended"]),
                        "assigned_classes": r["assigned_classes"] or "",
                        "assigned_subjects": r["assigned_subjects"] or "",
                        "password": r["password_plain"],
                        "classes_count": len(ac), "students_count": stu_count, "tests_count": test_count,
                        "is_me": r["id"] == session.get("teacher_id")})
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
    # Rol: boshqaruv (owner) va direktor zavuch ham qo'sha oladi; zavuch faqat o'qituvchi
    req_role = norm(data.get("role")) or "teacher"
    my_role = session.get("role")
    if req_role == "zavuch" and my_role not in ("owner", "director"):
        return jsonify({"ok": False, "error": "Zavuch qo'shishga faqat boshqaruv ruxsat etilgan"}), 403
    if req_role not in ("teacher", "zavuch"):
        req_role = "teacher"
    is_admin = 1 if req_role == "zavuch" else 0
    conn = get_conn()
    try:
        if conn.execute("SELECT 1 FROM teachers WHERE username = ?", (username,)).fetchone():
            return jsonify({"ok": False, "error": "Bu login band"}), 400
        conn.execute("INSERT INTO teachers (username, password_hash, password_plain, role, is_admin, school_id, created_at) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (username, generate_password_hash(password), password, req_role, is_admin, sid, now_iso()))
        conn.commit()
        return jsonify({"ok": True, "role": req_role})
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
        target_role = target["role"] or "teacher"
        my_role = session.get("role")
        # Boshqaruv (owner): o'qituvchi va zavuchni; zavuch: faqat o'qituvchini
        if my_role == "owner":
            can = target_role in ("teacher", "zavuch", "director")
        elif my_role == "zavuch":
            can = target_role == "teacher"
        else:
            can = False
        if not can:
            return jsonify({"ok": False, "error": "Bu hisobni o'chirishga ruxsatingiz yo'q"}), 403
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


@app.route("/api/teachers/<int:teacher_id>/subjects", methods=["POST"])
@role_required("owner", "zavuch")
def set_teacher_subjects(teacher_id):
    """O'qituvchiga biriktirilgan fanlarni belgilash (bo'sh = hammasi)."""
    data = request.get_json(force=True, silent=True) or {}
    subjects = data.get("subjects") or []
    sid = scope_school_id()
    conn = get_conn()
    try:
        t = conn.execute("SELECT * FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
        if not t:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        if sid is not None and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu boshqa maktab hisobi"}), 403
        valid = [s for s in subjects if s in SUBJECTS]
        asub = ",".join(valid)
        conn.execute("UPDATE teachers SET assigned_subjects = ? WHERE id = ?", (asub, teacher_id))
        conn.commit()
        return jsonify({"ok": True, "assigned_subjects": asub})
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


def _editable_teacher(conn, teacher_id):
    """Joriy foydalanuvchi login/parolini o'zgartira oladigan xodim.
    Boshqaruv (owner): o'qituvchi va zavuchni; Zavuch: faqat o'qituvchini.
    O'zini va boshqa ownerни emas. -> (teacher, None) yoki (None, error_response)."""
    t = conn.execute("SELECT * FROM teachers WHERE id = ?", (teacher_id,)).fetchone()
    if not t:
        return None, (jsonify({"ok": False, "error": "Topilmadi"}), 404)
    if teacher_id == session.get("teacher_id"):
        return None, (jsonify({"ok": False, "error": "O'zingizni bu yerdan emas, Sozlamalardan o'zgartiring"}), 400)
    sid = scope_school_id()
    if sid is not None and t["school_id"] != sid:
        return None, (jsonify({"ok": False, "error": "Bu boshqa maktab hisobi"}), 403)
    target_role = t["role"] or "teacher"
    my_role = session.get("role")
    if my_role == "owner":
        allowed = target_role in ("teacher", "zavuch", "director")
    elif my_role == "zavuch":
        allowed = target_role == "teacher"
    else:
        allowed = False
    if not allowed:
        return None, (jsonify({"ok": False, "error": "Bu hisobni o'zgartirishga ruxsatingiz yo'q"}), 403)
    return t, None


@app.route("/api/teachers/<int:teacher_id>/credentials", methods=["POST"])
@role_required("owner", "zavuch")
def admin_set_teacher_credentials(teacher_id):
    """Boshqaruv/zavuch xodimning login va/yoki parolini JORIY PAROLSIZ yangilaydi
    (xodim parolini unutса — boshqaruv tiklab beradi)."""
    data = request.get_json(force=True, silent=True) or {}
    new_user = norm(data.get("username"))
    new_pass = data.get("password") or ""
    conn = get_conn()
    try:
        t, err = _editable_teacher(conn, teacher_id)
        if err:
            return err
        if not new_user and not new_pass:
            return jsonify({"ok": False, "error": "Login yoki parol kiriting"}), 400
        if new_user and new_user != t["username"]:
            if conn.execute("SELECT 1 FROM teachers WHERE username = ? AND id != ?", (new_user, teacher_id)).fetchone():
                return jsonify({"ok": False, "error": "Bu login band"}), 400
            conn.execute("UPDATE teachers SET username = ? WHERE id = ?", (new_user, teacher_id))
        if new_pass:
            if len(new_pass) < 4:
                return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi bo'lsin"}), 400
            conn.execute("UPDATE teachers SET password_hash = ?, password_plain = ? WHERE id = ?", (generate_password_hash(new_pass), new_pass, teacher_id))
        conn.commit()
        return jsonify({"ok": True, "username": new_user or t["username"]})
    finally:
        conn.close()


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
        conn.execute("UPDATE teachers SET password_hash = ?, password_plain = ? WHERE id = ?", (generate_password_hash(password), password, teacher_id))
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


@app.route("/api/school/clear-data", methods=["POST"])
@role_required("owner", "zavuch")
def clear_school_data():
    """Maktab ma'lumotlarini TANLAB tozalaydi. Nima tozalash `targets` ro'yxatida keladi:
      tests         — barcha testlar, savollar va natijalari
      results       — barcha test natijalari (testlar qoladi)
      month_results — faqat shu oydagi natijalar (oylik baho)
      coins         — o'quvchilar coinlari 0 ga
      durations     — bilim olishда sanalgan vaqtlar 0 ga
    Tanlanmagan narsalar tegilmaydi."""
    sid = scope_school_id()
    if sid is None:
        return jsonify({"ok": False, "error": "Avval maktabga kiring"}), 400
    data = request.get_json(force=True, silent=True) or {}
    targets = set(data.get("targets") or [])
    if not targets:
        return jsonify({"ok": False, "error": "Hech narsa tanlanmadi"}), 400
    ym = datetime.now().strftime("%Y-%m")
    sub_of_school = "test_id IN (SELECT id FROM tests WHERE school_id = ?)"
    stu_of_school = "student_id IN (SELECT id FROM students WHERE school_id = ?)"
    conn = get_conn()
    try:
        report = {}
        if "all" in targets:
            # Maktab haqidagi HAMMA ma'lumot (o'qituvchi/zavuch hisoblaridan tashqari)
            report["tests_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM tests WHERE school_id = ?", (sid,)).fetchone()["c"]
            report["results_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM submissions WHERE " + sub_of_school, (sid,)).fetchone()["c"]
            report["students_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM students WHERE school_id = ?", (sid,)).fetchone()["c"]
            report["lessons_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM lessons WHERE school_id = ?", (sid,)).fetchone()["c"]
            conn.execute("DELETE FROM retake_grants WHERE " + sub_of_school, (sid,))
            conn.execute("DELETE FROM retake_grants WHERE " + stu_of_school, (sid,))
            conn.execute("DELETE FROM learning_daily WHERE " + stu_of_school, (sid,))
            conn.execute("DELETE FROM learning_activity WHERE " + stu_of_school, (sid,))
            conn.execute("DELETE FROM submissions WHERE " + stu_of_school, (sid,))
            conn.execute("DELETE FROM submissions WHERE " + sub_of_school, (sid,))
            conn.execute("DELETE FROM questions WHERE " + sub_of_school, (sid,))
            # Media fayllarni o'chiramiz
            for l in conn.execute("SELECT file_name, image_name FROM lessons WHERE school_id = ?", (sid,)).fetchall():
                for fn in (l["file_name"], l["image_name"]):
                    if fn:
                        try: os.remove(os.path.join(UPLOAD_DIR, fn))
                        except OSError: pass
            conn.execute("DELETE FROM lessons WHERE school_id = ?", (sid,))
            conn.execute("DELETE FROM tests WHERE school_id = ?", (sid,))
            conn.execute("DELETE FROM students WHERE school_id = ?", (sid,))
            conn.commit()
            return jsonify({"ok": True, "report": report, "all": True})
        if "tests" in targets:
            report["tests_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM tests WHERE school_id = ?", (sid,)).fetchone()["c"]
            report["results_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM submissions WHERE " + sub_of_school, (sid,)).fetchone()["c"]
            conn.execute("DELETE FROM retake_grants WHERE " + sub_of_school, (sid,))
            conn.execute("DELETE FROM submissions WHERE " + sub_of_school, (sid,))
            conn.execute("DELETE FROM questions WHERE " + sub_of_school, (sid,))
            conn.execute("UPDATE lessons SET related_test_id = NULL WHERE school_id = ?", (sid,))
            conn.execute("DELETE FROM tests WHERE school_id = ?", (sid,))
        else:
            if "results" in targets:
                report["results_deleted"] = conn.execute("SELECT COUNT(*) AS c FROM submissions WHERE " + sub_of_school, (sid,)).fetchone()["c"]
                conn.execute("DELETE FROM retake_grants WHERE " + sub_of_school, (sid,))
                conn.execute("DELETE FROM submissions WHERE " + sub_of_school, (sid,))
            elif "month_results" in targets:
                report["month_results_deleted"] = conn.execute(
                    "SELECT COUNT(*) AS c FROM submissions WHERE " + sub_of_school + " AND substr(started_at,1,7) = ?", (sid, ym)
                ).fetchone()["c"]
                conn.execute("DELETE FROM submissions WHERE " + sub_of_school + " AND substr(started_at,1,7) = ?", (sid, ym))
        if "coins" in targets:
            report["coins_reset"] = conn.execute("SELECT COUNT(*) AS c FROM students WHERE school_id = ? AND COALESCE(coins,0) > 0", (sid,)).fetchone()["c"]
            conn.execute("UPDATE students SET coins = 0 WHERE school_id = ?", (sid,))
            # Faoliyat tarixidagi coinlar ham 0 ga — coin hamma joydan yo'qolsin
            conn.execute("UPDATE learning_activity SET coins_awarded = 0 WHERE " + stu_of_school, (sid,))
        if "durations" in targets:
            conn.execute("UPDATE learning_activity SET duration_seconds = 0 WHERE " + stu_of_school, (sid,))
            report["durations_reset"] = True
        conn.commit()
        return jsonify({"ok": True, "report": report})
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
@app.route("/api/ranking", methods=["GET"])
@teacher_required
def ranking():
    """Barcha o'quvchilar umumiy reytingi: test + bilim olish natijalari birga."""
    conn = get_conn()
    try:
        sc_, sp_ = school_clause()
        allowed = teacher_allowed_classes(conn)
        if allowed is not None:
            ph = ",".join("?" for _ in allowed)
            students = conn.execute("SELECT * FROM students WHERE class_name IN (" + ph + ")" + sc_ + " ORDER BY class_name, last_name", list(allowed) + sp_).fetchall()
        else:
            students = conn.execute("SELECT * FROM students WHERE 1=1" + sc_ + " ORDER BY class_name, last_name", sp_).fetchall()
        lt_rows = conn.execute("SELECT class_name, COUNT(*) AS c FROM lessons WHERE 1=1" + sc_ + " GROUP BY class_name", sp_).fetchall()
        lesson_totals = {r["class_name"]: r["c"] for r in lt_rows}
        out = []
        for s in students:
            subs = conn.execute("SELECT percentage FROM submissions WHERE student_id = ? AND status = 'completed'", (s["id"],)).fetchall()
            best_pct = max([x["percentage"] for x in subs], default=None)
            mpct = monthly_pct(conn, s["id"])
            total_time = conn.execute("SELECT COALESCE(SUM(seconds),0) AS s FROM learning_daily WHERE student_id = ?", (s["id"],)).fetchone()["s"]
            done = conn.execute("SELECT COUNT(DISTINCT lesson_id) AS c FROM learning_activity WHERE student_id = ? AND completed = 1", (s["id"],)).fetchone()["c"]
            tl = lesson_totals.get(s["class_name"], 0)
            faollik = round(min(100, done / tl * 100), 0) if tl else None
            out.append({
                "id": s["id"], "first_name": s["first_name"], "last_name": s["last_name"], "class_name": s["class_name"],
                "best_pct": round(best_pct, 1) if best_pct is not None else None,
                "monthly_pct": mpct, "baho": baho_from_pct(best_pct),
                "coins": s["coins"] or 0, "total_time": total_time, "done_lessons": done, "total_lessons": tl,
                "faollik_pct": faollik, "tests_count": len(subs),
            })
        out.sort(key=lambda x: (-(x["best_pct"] if x["best_pct"] is not None else -1), -x["coins"]))
        return jsonify({"ok": True, "students": out})
    finally:
        conn.close()


@app.route("/api/learning/my-overview", methods=["GET"])
def my_overview():
    """O'quvchining o'zi uchun: sinf reytingi, umumiy reyting, haftalik faollik, oylik o'zlashtirish."""
    try:
        student_id = int(request.args.get("student_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "student_id"}), 400
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        school_id = s["school_id"]
        classmates = conn.execute("SELECT id FROM students WHERE class_name = ? AND school_id IS ? ORDER BY COALESCE(coins,0) DESC, id", (s["class_name"], school_id)).fetchall()
        class_rank = next((i + 1 for i, x in enumerate(classmates) if x["id"] == student_id), None)
        allstu = conn.execute("SELECT id FROM students WHERE school_id IS ? ORDER BY COALESCE(coins,0) DESC, id", (school_id,)).fetchall()
        overall_rank = next((i + 1 for i, x in enumerate(allstu) if x["id"] == student_id), None)
        rows = conn.execute(
            "SELECT substr(submitted_at,1,7) AS ym, AVG(percentage) AS p FROM submissions "
            "WHERE student_id = ? AND status = 'completed' GROUP BY ym ORDER BY ym DESC LIMIT 6", (student_id,)
        ).fetchall()
        monthly = [{"month": r["ym"], "pct": round(r["p"], 1)} for r in rows][::-1]
        bd = time_breakdown(conn, student_id)
        return jsonify({"ok": True,
                        "class_rank": class_rank, "class_total": len(classmates),
                        "overall_rank": overall_rank, "overall_total": len(allstu),
                        "coins": s["coins"] or 0, "monthly_pct": monthly_pct(conn, student_id),
                        "daily": bd["daily"], "monthly": monthly})
    finally:
        conn.close()


def _ranking_list(conn, school_id, class_name=None):
    """O'quvchilar reytingi: coin bo'yicha, teng bo'lsa eng yaxshi test foizi bo'yicha."""
    q = ("SELECT s.id, s.first_name, s.last_name, s.class_name, COALESCE(s.coins,0) AS coins, "
         "(SELECT MAX(percentage) FROM submissions WHERE student_id = s.id AND status = 'completed') AS best_pct "
         "FROM students s WHERE s.school_id IS ?")
    p = [school_id]
    if class_name:
        q += " AND s.class_name = ?"
        p.append(class_name)
    q += " ORDER BY coins DESC, best_pct DESC, s.last_name, s.first_name"
    out = []
    for i, r in enumerate(conn.execute(q, p).fetchall()):
        out.append({
            "rank": i + 1, "id": r["id"],
            "first_name": r["first_name"], "last_name": r["last_name"], "class_name": r["class_name"],
            "coins": r["coins"],
            "best_pct": round(r["best_pct"], 1) if r["best_pct"] is not None else None,
            "baho": baho_from_pct(r["best_pct"]),
        })
    return out


def _rankings_payload(conn, s):
    return {
        "ok": True,
        "student_id": s["id"],
        "class_name": s["class_name"],
        "class_ranking": _ranking_list(conn, s["school_id"], s["class_name"]),
        "school_ranking": _ranking_list(conn, s["school_id"]),
    }


@app.route("/api/rankings/student", methods=["GET"])
def student_rankings():
    """O'quvchining o'zi uchun: sinf reytingi va maktabdagi barcha o'quvchilar reytingi."""
    try:
        student_id = int(request.args.get("student_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "student_id"}), 400
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        return jsonify(_rankings_payload(conn, s))
    finally:
        conn.close()


@app.route("/api/parent/rankings", methods=["GET"])
def parent_rankings():
    """Ota-ona uchun: farzandi sinfi va maktabi bo'yicha reyting."""
    sid = session.get("parent_student_id")
    if not sid:
        return jsonify({"ok": False, "error": "Avval kiring"}), 401
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (sid,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "Topilmadi"}), 404
        return jsonify(_rankings_payload(conn, s))
    finally:
        conn.close()


@app.route("/api/games/reward", methods=["POST"])
def game_reward():
    """O'yinni yakunlagan o'quvchiga coin beradi (har o'yin uchun kuniga bir marta)."""
    data = request.get_json(force=True, silent=True) or {}
    student_id = data.get("student_id")
    game = norm(data.get("game"))
    if game not in GAME_KEYS:
        return jsonify({"ok": False, "error": "O'yin noto'g'ri"}), 400
    conn = get_conn()
    try:
        s = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if not s:
            return jsonify({"ok": False, "error": "O'quvchi topilmadi"}), 404
        coins = get_game_coins(s["school_id"])
        today = datetime.now().strftime("%Y-%m-%d")
        done = conn.execute("SELECT 1 FROM game_rewards WHERE student_id = ? AND game = ? AND date = ?",
                            (student_id, game, today)).fetchone()
        if done or coins <= 0:
            return jsonify({"ok": True, "already": True, "coins": 0, "total_coins": s["coins"] or 0})
        conn.execute("INSERT INTO game_rewards (student_id, game, date, coins, created_at) VALUES (?, ?, ?, ?, ?)",
                     (student_id, game, today, coins, now_iso()))
        conn.execute("UPDATE students SET coins = COALESCE(coins,0) + ? WHERE id = ?", (coins, student_id))
        conn.commit()
        total = conn.execute("SELECT coins FROM students WHERE id = ?", (student_id,)).fetchone()["coins"]
        return jsonify({"ok": True, "already": False, "coins": coins, "total_coins": total})
    finally:
        conn.close()


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


@app.route("/api/tests/<int:test_id>/import-questions", methods=["POST"])
@teacher_required
def import_questions_to_test(test_id):
    """Mavjud testga fayldan (Excel/CSV/Word/PDF) savollar qo'shadi (almashtirmaydi)."""
    import test_import
    conn = get_conn()
    try:
        t = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not t:
            return jsonify({"ok": False, "error": "Test topilmadi"}), 404
        sid = scope_school_id()
        if sid is not None and t["school_id"] != sid:
            return jsonify({"ok": False, "error": "Bu test boshqa maktabniki"}), 403
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
        max_idx = conn.execute("SELECT COALESCE(MAX(order_index),0) AS m FROM questions WHERE test_id = ?", (test_id,)).fetchone()["m"]
        for idx, q in enumerate(questions, start=max_idx + 1):
            conn.execute(
                "INSERT INTO questions (test_id, order_index, text, option_a, option_b, option_c, option_d, correct_option) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (test_id, idx, q["text"], q["option_a"], q["option_b"], q["option_c"], q["option_d"], q["correct_option"]),
            )
        conn.commit()
        total = conn.execute("SELECT COUNT(*) AS c FROM questions WHERE test_id = ?", (test_id,)).fetchone()["c"]
        return jsonify({"ok": True, "added": len(questions), "total": total})
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
            "INSERT INTO tests (title, subject, class_name, duration_minutes, code, is_active, school_id, created_by, created_at) "
            "VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
            (title, subject, class_name, duration, code, sid, session.get("teacher_id"), now_iso()),
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


_TEMPLATE_ROWS = [
    ["Savol", "A", "B", "C", "D", "To'g'ri javob"],
    ["2 + 2 = ?", "3", "4", "5", "6", "B"],
    ["O'zbekiston poytaxti?", "Samarqand", "Toshkent", "Buxoro", "Xiva", "B"],
    ["Suv formulasi?", "CO2", "O2", "H2O", "NaCl", "C"],
]


@app.route("/api/tests/import-template.xlsx")
@teacher_required
def import_template_xlsx():
    """Excel namuna fayli — ochilganda ustunlar to'g'ri joylashadi (buzilmaydi)."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Test"
    header_fill = PatternFill("solid", fgColor="6A41FF")
    for ci, val in enumerate(_TEMPLATE_ROWS[0], start=1):
        cell = ws.cell(row=1, column=ci, value=val)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    for ri, row in enumerate(_TEMPLATE_ROWS[1:], start=2):
        for ci, val in enumerate(row, start=1):
            ws.cell(row=ri, column=ci, value=val)
    widths = [34, 16, 16, 16, 16, 14]
    for ci, w in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(ci)].width = w
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name="test_namuna.xlsx")


@app.route("/api/tests/import-template.csv")
@teacher_required
def import_template():
    # Excel'ning turli mintaqaviy sozlamalarida ochilishi uchun ; (nuqta-vergul) ajratgich + BOM
    output = io.StringIO()
    output.write("﻿")
    w = csv.writer(output, delimiter=";")
    for row in _TEMPLATE_ROWS:
        w.writerow(row)
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
        conn.execute("INSERT INTO teachers (username, password_hash, password_plain, is_admin, role, school_id, created_at) "
                     "VALUES (?, ?, ?, 1, 'zavuch', ?, ?)",
                     (username, generate_password_hash(password), password, sid, now_iso()))
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


@app.route("/api/settings/work-hours", methods=["GET"])
@teacher_required
def get_work_hours_ep():
    start, end = get_work_hours()
    return jsonify({"ok": True, "start": start, "end": end})


@app.route("/api/settings/work-hours", methods=["POST"])
@role_required("owner")
def set_work_hours_ep():
    data = request.get_json(force=True, silent=True) or {}
    try:
        start = int(data.get("start"))
        end = int(data.get("end"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Soatlarni to'g'ri kiriting (0–24)"}), 400
    if not (0 <= start < end <= 24):
        return jsonify({"ok": False, "error": "Boshlanish soati tugash soatidan kichik bo'lsin (0–24)"}), 400
    set_setting("work_start", start)
    set_setting("work_end", end)
    return jsonify({"ok": True, "start": start, "end": end})


@app.route("/api/settings/game-coins", methods=["GET"])
@teacher_required
def get_game_coins_ep():
    return jsonify({"ok": True, "coins": get_game_coins(scope_school_id())})


@app.route("/api/settings/game-coins", methods=["POST"])
@role_required("owner", "zavuch")
def set_game_coins_ep():
    data = request.get_json(force=True, silent=True) or {}
    try:
        coins = int(data.get("coins"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Coin miqdorini kiriting (0–500)"}), 400
    if not (0 <= coins <= 500):
        return jsonify({"ok": False, "error": "Coin 0 dan 500 gacha bo'lsin"}), 400
    set_setting(game_coins_key(scope_school_id()), coins)
    return jsonify({"ok": True, "coins": coins})


# --------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
