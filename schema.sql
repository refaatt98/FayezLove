-- مخطط قاعدة البيانات (PostgreSQL / Supabase). كل الجداول داخل مخطط attendance غير المكشوف لواجهة Supabase العامة.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  semester TEXT NOT NULL,
  university TEXT NOT NULL DEFAULT 'جامعة النجاح الوطنية'
);
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  university_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE TABLE IF NOT EXISTS lectures (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL,
  lecture_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  UNIQUE (course_id, number)
);
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id SERIAL PRIMARY KEY,
  lecture_id INTEGER NOT NULL UNIQUE REFERENCES lectures(id) ON DELETE RESTRICT,
  is_open INTEGER NOT NULL DEFAULT 1,
  closed_at TEXT
);
-- كل QR Token: عشوائي، مخزَّن كـ hash، له انتهاء، ويُلغى عند صدور الجديد
CREATE TABLE IF NOT EXISTS qr_tokens (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent','excused')),
  checked_in_at TEXT,
  UNIQUE (session_id, student_id)  -- يمنع تكرار الحضور في نفس المحاضرة
);
CREATE TABLE IF NOT EXISTS attendance_edit_logs (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE RESTRICT,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  edited_by INTEGER NOT NULL REFERENCES users(id),
  edited_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
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

-- السجل دائم: لا حذف ولا تعديل. الاستثناء الوحيد: حذف محاضرة كاملة بطلب الدكتور (يُفعَّل مؤقتًا داخل نفس العملية)
CREATE OR REPLACE FUNCTION edit_logs_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM settings WHERE key = 'allow_lecture_delete') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'edit log is immutable';
END $$;
DROP TRIGGER IF EXISTS edit_logs_no_delete ON attendance_edit_logs;
CREATE TRIGGER edit_logs_no_delete BEFORE DELETE ON attendance_edit_logs FOR EACH ROW EXECUTE FUNCTION edit_logs_guard();
DROP TRIGGER IF EXISTS edit_logs_no_update ON attendance_edit_logs;
CREATE TRIGGER edit_logs_no_update BEFORE UPDATE ON attendance_edit_logs FOR EACH ROW EXECUTE FUNCTION edit_logs_guard();
