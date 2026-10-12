// يجهّز الحسابات المسموحة تلقائيًا (بلا كلمات مرور). كل مستخدم يفعّل حسابه بنفسه عبر رمز يصل لبريده.
// الحساب الأساسي (الدكتور) يملك المادة والمحاضرات؛ الحسابات الإضافية تدخل إلى لوحة الدكتور نفسها.
module.exports = (db) => {
  const lc = (s) => String(s).trim().toLowerCase();
  const primary = lc(process.env.DOCTOR_EMAIL || 'abuhijleh@najah.edu');
  const extra = (process.env.EXTRA_ALLOWED_EMAILS || 'fayezghaith123@gmail.com').split(',').map(lc).filter(Boolean);
  const allowed = [...new Set([primary, ...extra])];
  const addUser = db.prepare("INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, '')");
  db.transaction(() => {
    for (const e of allowed) addUser.run(e, e);
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(primary).id;
    if (!db.prepare('SELECT 1 FROM teachers WHERE user_id = ?').get(uid)) {
      const tid = db.prepare('INSERT INTO teachers (user_id, full_name) VALUES (?, ?)').run(uid, 'د. سائد أبو حجلة').lastInsertRowid;
      db.prepare('INSERT INTO courses (teacher_id, name, semester) VALUES (?, ?, ?)').run(tid, 'دراسات فلسطينية', 'خريف 2026');
    }
  })();
  return { primary, allowed };
};
