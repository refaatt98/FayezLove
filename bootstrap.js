// يجهّز الحسابات المسموحة تلقائيًا (بلا كلمات مرور). كل مستخدم يفعّل حسابه بنفسه عبر رمز يصل لبريده.
// الحساب الأساسي (الدكتور) يملك المادة والمحاضرات؛ الحسابات الإضافية تدخل إلى لوحة الدكتور نفسها.
module.exports = async (db) => {
  const lc = (s) => String(s).trim().toLowerCase();
  const primary = lc(process.env.DOCTOR_EMAIL || 'abuhijleh@najah.edu');
  const extra = (process.env.EXTRA_ALLOWED_EMAILS || 'fayezghaith123@gmail.com').split(',').map(lc).filter(Boolean);
  const allowed = [...new Set([primary, ...extra])];
  await db.batch(allowed.map((e) => ["INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, '')", e, e]));
  const uid = (await db.get('SELECT id FROM users WHERE email = ?', primary)).id;
  if (!(await db.get('SELECT 1 FROM teachers WHERE user_id = ?', uid))) {
    await db.batch([
      ['INSERT INTO teachers (user_id, full_name) VALUES (?, ?)', uid, 'د. سائد أبو حجلة'],
      ['INSERT INTO courses (teacher_id, name, semester) VALUES (last_insert_rowid(), ?, ?)', 'دراسات فلسطينية', 'خريف 2026'],
    ]);
  }
  return { primary, allowed };
};
