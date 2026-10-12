const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// على الاستضافة: قاعدة Turso السحابية (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN). محليًا: ملف SQLite عادي.
const remote = process.env.TURSO_DATABASE_URL;
const file = process.env.DB_PATH || 'attendance.db';
if (!remote) fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
const client = createClient(remote
  ? { url: remote, authToken: process.env.TURSO_AUTH_TOKEN }
  : { url: 'file:' + path.resolve(file) });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  semester TEXT NOT NULL,
  university TEXT NOT NULL DEFAULT 'جامعة النجاح الوطنية'
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  university_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lectures (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL,
  lecture_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  UNIQUE (course_id, number)
);
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY,
  lecture_id INTEGER NOT NULL UNIQUE REFERENCES lectures(id) ON DELETE RESTRICT,
  is_open INTEGER NOT NULL DEFAULT 1,
  closed_at TEXT
);
-- كل QR Token: عشوائي، مخزَّن كـ hash، له انتهاء، ويُلغى عند صدور الجديد
CREATE TABLE IF NOT EXISTS qr_tokens (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent','excused')),
  checked_in_at TEXT,
  UNIQUE (session_id, student_id)  -- يمنع تكرار الحضور في نفس المحاضرة
);
CREATE TABLE IF NOT EXISTS attendance_edit_logs (
  id INTEGER PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE RESTRICT,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  edited_by INTEGER NOT NULL REFERENCES users(id),
  edited_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS course_students (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  PRIMARY KEY (course_id, student_id)
);
CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- السجل دائم: لا حذف ولا تعديل
-- الاستثناء الوحيد: حذف محاضرة كاملة بطلب الدكتور (يُفعَّل مؤقتًا داخل نفس العملية)
DROP TRIGGER IF EXISTS edit_logs_no_delete;
CREATE TRIGGER edit_logs_no_delete BEFORE DELETE ON attendance_edit_logs
WHEN NOT EXISTS (SELECT 1 FROM settings WHERE key = 'allow_lecture_delete')
BEGIN SELECT RAISE(ABORT, 'edit log is immutable'); END;
CREATE TRIGGER IF NOT EXISTS edit_logs_no_update BEFORE UPDATE ON attendance_edit_logs
BEGIN SELECT RAISE(ABORT, 'edit log is immutable'); END;
`;

const plain = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
const meta = (rs) => ({ rows: plain(rs), lastInsertRowid: Number(rs.lastInsertRowid), changes: rs.rowsAffected });

const db = {
  all: async (sql, ...args) => plain(await client.execute({ sql, args })),
  get: async (sql, ...args) => (await db.all(sql, ...args))[0],
  run: async (sql, ...args) => meta(await client.execute({ sql, args })),
  // عدة أوامر كوحدة واحدة (كلها أو لا شيء)
  batch: async (stmts) => (await client.batch(stmts.map(([sql, ...args]) => ({ sql, args })), 'write')).map(meta),
  async init() {
    if (!remote) await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA foreign_keys = ON');
    await client.executeMultiple(SCHEMA);
  },
  async getSecret() {
    const v = require('crypto').randomBytes(48).toString('hex');
    await db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('jwt_secret', ?)", v);
    return (await db.get("SELECT value FROM settings WHERE key = 'jwt_secret'")).value;
  },
};
module.exports = db;
