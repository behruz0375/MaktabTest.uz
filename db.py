"""
Ma'lumotlar bazasi (SQLite) — MaktabTest.uz
Barcha jadvallar, ulanish va boshlang'ich ma'lumotlar shu yerda.
"""
import os
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash

# DB fayl yo'li. Render'da persistent disk uchun DATABASE_PATH env orqali beriladi.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(BASE_DIR, "data", "maktab.db")
DB_PATH = os.environ.get("DATABASE_PATH", DEFAULT_DB)

# Yuklangan fayllar (video/audio) uchun papka
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(DB_PATH), "uploads"))

# Coin mukofotlari (standart)
COIN_TEST_PER_CORRECT = 10   # har to'g'ri javob uchun
COIN_VIDEO = 25
COIN_AUDIO = 20
COIN_TEXT = 15

# Maktabda o'tiladigan 16 ta fan
SUBJECTS = [
    "Matematika", "Algebra", "Geometriya", "Ona tili", "Adabiyot",
    "Ingliz tili", "Rus tili", "Fizika", "Kimyo", "Biologiya",
    "Geografiya", "Tarix", "Informatika", "Astronomiya",
    "Iqtisod", "Jismoniy tarbiya",
]

# Sinflar: 1-A, 1-B, 2-A ... 11-A, 11-B
CLASSES = [f"{grade}-{letter}" for grade in range(1, 12) for letter in ("A", "B")]

DEFAULT_ADMIN_USER = "admin"
DEFAULT_ADMIN_PASS = "admin123"


def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_conn():
    """Har bir so'rov uchun yangi ulanish (thread-safe)."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS schools (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    class_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(first_name, last_name, class_name)
);

CREATE TABLE IF NOT EXISTS tests (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT NOT NULL,
    subject          TEXT NOT NULL,
    class_name       TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    code             TEXT NOT NULL,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id        INTEGER NOT NULL,
    order_index    INTEGER NOT NULL,
    text           TEXT NOT NULL,
    option_a       TEXT NOT NULL,
    option_b       TEXT NOT NULL,
    option_c       TEXT NOT NULL,
    option_d       TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id          INTEGER NOT NULL,
    student_id       INTEGER NOT NULL,
    token            TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'in_progress',
    score            INTEGER DEFAULT 0,
    total            INTEGER DEFAULT 0,
    correct_count    INTEGER DEFAULT 0,
    wrong_count      INTEGER DEFAULT 0,
    percentage       REAL DEFAULT 0,
    answers_json     TEXT DEFAULT '{}',
    violation_reason TEXT,
    started_at       TEXT NOT NULL,
    submitted_at     TEXT,
    duration_seconds INTEGER DEFAULT 0,
    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retake_grants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id    INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(test_id, student_id)
);

CREATE TABLE IF NOT EXISTS lessons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    subject         TEXT NOT NULL,
    class_name      TEXT NOT NULL,
    type            TEXT NOT NULL,          -- video | audio | text
    file_name       TEXT,                   -- video/audio uchun saqlangan fayl nomi
    text_content    TEXT,                   -- matn (kitob) uchun
    image_name      TEXT,                   -- matnli darsga qo'shilgan rasm
    coins_reward    INTEGER DEFAULT 20,
    related_test_id INTEGER,                -- darsdan keyingi test (ixtiyoriy)
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_activity (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL,
    lesson_id     INTEGER NOT NULL,
    type          TEXT NOT NULL,
    coins_awarded INTEGER DEFAULT 0,
    completed_at  TEXT NOT NULL,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS learning_daily (
    student_id INTEGER NOT NULL,
    date       TEXT NOT NULL,
    seconds    INTEGER DEFAULT 0,
    PRIMARY KEY (student_id, date)
);

CREATE TABLE IF NOT EXISTS game_rewards (
    student_id INTEGER NOT NULL,
    game       TEXT NOT NULL,
    date       TEXT NOT NULL,
    coins      INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (student_id, game, date)
);

CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_sub_test ON submissions(test_id);
CREATE INDEX IF NOT EXISTS idx_sub_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name);
"""


def _ensure_column(conn, table, col, decl):
    """Mavjud jadvalga ustun qo'shadi (agar bo'lmasa) — eski bazalar uchun."""
    cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if col not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init_db():
    """Jadvallarni yaratadi, migratsiya qiladi va standart admin hisobini qo'shadi."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        # Migratsiya: students jadvaliga yangi ustunlar (coin, ota-ona logini)
        _ensure_column(conn, "students", "coins", "INTEGER DEFAULT 0")
        _ensure_column(conn, "students", "parent_username", "TEXT")
        _ensure_column(conn, "students", "parent_password_hash", "TEXT")
        _ensure_column(conn, "students", "parent_password_plain", "TEXT")
        _ensure_column(conn, "lessons", "image_name", "TEXT")
        _ensure_column(conn, "teachers", "is_admin", "INTEGER DEFAULT 0")
        # Rollar: owner (boshqaruv/egasi) > zavuch (maktab admini) > teacher
        _ensure_column(conn, "teachers", "role", "TEXT DEFAULT 'teacher'")
        # O'quvchini bloklash imkoniyati
        _ensure_column(conn, "students", "blocked", "INTEGER DEFAULT 0")
        # O'qituvchini vaqtinchalik to'xtatish (suspend)
        _ensure_column(conn, "teachers", "suspended", "INTEGER DEFAULT 0")
        # Ko'p maktab (multi-tenancy): har jadvalga school_id
        _ensure_column(conn, "teachers", "school_id", "INTEGER")
        _ensure_column(conn, "students", "school_id", "INTEGER")
        _ensure_column(conn, "tests", "school_id", "INTEGER")
        _ensure_column(conn, "lessons", "school_id", "INTEGER")
        # Maktabni vaqtinchalik to'xtatish
        _ensure_column(conn, "schools", "suspended", "INTEGER DEFAULT 0")
        # O'qituvchiga biriktirilgan sinflar (vergul bilan ajratilgan, bo'sh = hammasi)
        _ensure_column(conn, "teachers", "assigned_classes", "TEXT DEFAULT ''")
        # Bilim olishda sarflangan vaqt (soniya)
        _ensure_column(conn, "learning_activity", "duration_seconds", "INTEGER DEFAULT 0")
        # Dars tugatilganmi (heartbeat orqali vaqt yozilsa ham, coin faqat tugatganda)
        _ensure_column(conn, "learning_activity", "completed", "INTEGER DEFAULT 1")
        # Testni kim yaratgani (o'qituvchi o'z testlarini ko'radi, zavuch hammasini)
        _ensure_column(conn, "tests", "created_by", "INTEGER")
        # Dars (bilim olish) — kim qo'shgani
        _ensure_column(conn, "lessons", "created_by", "INTEGER")
        # Bilim olish uchun o'quvchi login/paroli (zavuch/boshqaruv beradi)
        _ensure_column(conn, "students", "learn_username", "TEXT")
        _ensure_column(conn, "students", "learn_password_hash", "TEXT")
        _ensure_column(conn, "students", "learn_password_plain", "TEXT")
        # Xodim (o'qituvchi/zavuch) joriy paroli — zavuch/boshqaruv ko'rishi uchun
        _ensure_column(conn, "teachers", "password_plain", "TEXT")
        # O'qituvchiga biriktirilgan fanlar (bo'sh = hammasi)
        _ensure_column(conn, "teachers", "assigned_subjects", "TEXT DEFAULT ''")
        # Test qayta topshirilganmi (bir test = bitta tarix yozuvi, yangilanadi)
        _ensure_column(conn, "submissions", "retaken", "INTEGER DEFAULT 0")
        # Standart hisob (egasi/owner) yaratamiz (agar hech kim bo'lmasa)
        cur = conn.execute("SELECT COUNT(*) AS c FROM teachers")
        if cur.fetchone()["c"] == 0:
            conn.execute(
                "INSERT INTO teachers (username, password_hash, is_admin, role, created_at) VALUES (?, ?, 1, 'owner', ?)",
                (DEFAULT_ADMIN_USER, generate_password_hash(DEFAULT_ADMIN_PASS), now_iso()),
            )
        # Rolga o'tkazish: eski director (maktabsiz, eng katta) -> owner
        conn.execute("UPDATE teachers SET role = 'owner' WHERE role = 'director' AND school_id IS NULL")
        conn.execute("UPDATE teachers SET role = 'teacher' WHERE role IS NULL")
        # Kamida bitta egasi (owner) bo'lishini ta'minlaymiz
        if conn.execute("SELECT COUNT(*) AS c FROM teachers WHERE role = 'owner'").fetchone()["c"] == 0:
            conn.execute("UPDATE teachers SET role = 'owner', is_admin = 1, school_id = NULL WHERE id = (SELECT MIN(id) FROM teachers)")
        # Eski (maktabsiz) ma'lumotlarni standart maktabga biriktiramiz
        need = (conn.execute("SELECT COUNT(*) AS c FROM students WHERE school_id IS NULL").fetchone()["c"]
                or conn.execute("SELECT COUNT(*) AS c FROM tests WHERE school_id IS NULL").fetchone()["c"]
                or conn.execute("SELECT COUNT(*) AS c FROM teachers WHERE school_id IS NULL AND role != 'owner'").fetchone()["c"])
        if need:
            row = conn.execute("SELECT id FROM schools ORDER BY id LIMIT 1").fetchone()
            if row:
                default_sid = row["id"]
            else:
                default_sid = conn.execute("INSERT INTO schools (name, created_at) VALUES (?, ?)",
                                           ("Asosiy maktab", now_iso())).lastrowid
            conn.execute("UPDATE students SET school_id = ? WHERE school_id IS NULL", (default_sid,))
            conn.execute("UPDATE tests SET school_id = ? WHERE school_id IS NULL", (default_sid,))
            conn.execute("UPDATE lessons SET school_id = ? WHERE school_id IS NULL", (default_sid,))
            conn.execute("UPDATE teachers SET school_id = ? WHERE school_id IS NULL AND role != 'owner'", (default_sid,))
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Baza tayyor: {DB_PATH}")
    print(f"Fanlar: {len(SUBJECTS)} ta")
    print(f"Sinflar: {len(CLASSES)} ta")
    print(f"Standart kirish -> login: {DEFAULT_ADMIN_USER}  parol: {DEFAULT_ADMIN_PASS}")
