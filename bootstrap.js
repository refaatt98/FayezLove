// الحسابان الوحيدان المسموح لهما بالتسجيل والدخول. أي بريد آخر يُرفض دائمًا.
// الحساب الأساسي (الدكتور) يملك المادة والمحاضرات؛ الحساب الثاني يدخل إلى لوحة الدكتور نفسها.
const DOCTOR = 'abuhijleh@najah.edu';
const ALLOWED = [DOCTOR, 'fayezghaith123@gmail.com'];

module.exports = async (db) => {
  await db.batch([
    ...ALLOWED.map((e) => ["INSERT INTO users (username, email, password_hash) VALUES (?, ?, '') ON CONFLICT DO NOTHING", e, e]),
    // لا تُمسّ كلمات المرور المحفوظة؛ فقط يُعطَّل أي حساب خارج القائمة
    ['UPDATE users SET active = CASE WHEN email = ANY(?::text[]) THEN 1 ELSE 0 END', ALLOWED],
  ]);
  const uid = (await db.get('SELECT id FROM users WHERE email = ?', DOCTOR)).id;
  if (!(await db.get('SELECT 1 FROM teachers WHERE user_id = ?', uid))) {
    await db.batch([
      ['INSERT INTO teachers (user_id, full_name) VALUES (?, ?)', uid, 'د. سائد أبو حجلة'],
      ["INSERT INTO courses (teacher_id, name, semester) VALUES (currval(pg_get_serial_sequence('teachers', 'id')), ?, ?)", 'دراسات فلسطينية', 'خريف 2026'],
    ]);
  }
  return { primary: DOCTOR };
};
