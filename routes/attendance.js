const crypto = require('crypto');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const bus = require('../bus');

const TTL_MS = 3 * 60 * 1000; // عمر الرمز: 3 دقائق (يُفرض في الخادم)
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const cache = new Map(); // sessionId -> { raw, exp, image }  (الرمز الخام لا يُخزَّن في القاعدة، فقط hash)

const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
const normId = (s) => s.trim().replace(/[٠-٩۰-۹]/g, (d) => String(AR.includes(d) ? AR.indexOf(d) : FA.indexOf(d)));

async function currentQr(sessionId) {
  const c = cache.get(sessionId);
  if (c && Date.parse(c.exp) > Date.now()) return c;
  const raw = crypto.randomBytes(24).toString('base64url');
  const exp = new Date(Date.now() + TTL_MS).toISOString();
  db.transaction(() => {
    db.prepare('UPDATE qr_tokens SET revoked = 1 WHERE session_id = ? AND revoked = 0').run(sessionId); // القديم يبطل فورًا
    db.prepare('INSERT INTO qr_tokens (session_id, token_hash, expires_at) VALUES (?, ?, ?)').run(sessionId, sha(raw), exp);
  })();
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}/a/${raw}`;
  const image = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 720 });
  const entry = { raw, exp, image };
  cache.set(sessionId, entry);
  return entry;
}

module.exports = (app, auth) => {
  const openFor = (teacherId) => db.prepare(
    `SELECT l.id, l.number, l.started_at, s.id AS sid FROM lectures l
     JOIN courses c ON c.id = l.course_id JOIN attendance_sessions s ON s.lecture_id = l.id
     WHERE c.teacher_id = ? AND s.is_open = 1`).get(teacherId);

  app.post('/api/lectures/start', auth('api'), (req, res) => {
    if (openFor(req.user.teacher_id)) return res.status(409).json({ error: 'توجد محاضرة مفتوحة بالفعل' });
    const course = db.prepare('SELECT id FROM courses WHERE teacher_id = ? ORDER BY id LIMIT 1').get(req.user.teacher_id);
    if (!course) return res.status(400).json({ error: 'لا توجد مادة' });
    const now = new Date().toISOString();
    const id = db.transaction(() => {
      const n = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM lectures WHERE course_id = ?').get(course.id).n;
      const lid = db.prepare('INSERT INTO lectures (course_id, number, lecture_date, started_at) VALUES (?, ?, ?, ?)')
        .run(course.id, n, now.slice(0, 10), now).lastInsertRowid;
      db.prepare('INSERT INTO attendance_sessions (lecture_id) VALUES (?)').run(lid);
      return lid;
    })();
    res.json({ ok: true, id });
  });

  app.get('/api/lectures/current', auth('api'), async (req, res) => {
    const lec = openFor(req.user.teacher_id);
    if (!lec) return res.json({ open: false });
    const qr = await currentQr(lec.sid);
    const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM attendance_records WHERE session_id = ? GROUP BY status').all(lec.sid).map((r) => [r.status, r.n]));
    res.json({ open: true, id: lec.id, number: lec.number, startedAt: lec.started_at, counts,
      qr: { image: qr.image, expiresAt: qr.exp }, serverNow: new Date().toISOString() });
  });

  app.post('/api/lectures/:id/end', auth('api'), (req, res) => {
    const lec = openFor(req.user.teacher_id);
    if (!lec || String(lec.id) !== req.params.id) return res.status(404).json({ error: 'المحاضرة غير موجودة أو مغلقة' });
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE attendance_sessions SET is_open = 0, closed_at = ? WHERE id = ?').run(now, lec.sid);
      db.prepare('UPDATE qr_tokens SET revoked = 1 WHERE session_id = ?').run(lec.sid);
      db.prepare('UPDATE lectures SET ended_at = ? WHERE id = ?').run(now, lec.id);
      // من لم يسجّل حضوره يصبح غائبًا (من الطلاب المعروفين في النظام) ويمكن للدكتور تعديله
      db.prepare("INSERT INTO attendance_records (session_id, student_id, status) SELECT ?, cs.student_id, 'absent' FROM course_students cs WHERE cs.course_id = (SELECT course_id FROM lectures WHERE id = ?) AND cs.student_id NOT IN (SELECT student_id FROM attendance_records WHERE session_id = ?)").run(lec.sid, lec.id, lec.sid);
    })();
    cache.delete(lec.sid);
    bus.emit('change', lec.sid);
    res.json({ ok: true });
  });

  // عام: لا يحتاج حساب. كل التحققات في الخادم.
  const limiter = rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });
  app.post('/api/attend', limiter, (req, res) => {
    const { token, name, universityId } = req.body || {};
    if (![token, name, universityId].every((v) => typeof v === 'string')) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const fullName = name.trim().replace(/\s+/g, ' ');
    const uid = normId(universityId);
    if (fullName.length < 3 || fullName.length > 100) return res.status(400).json({ error: 'يرجى كتابة الاسم الكامل' });
    if (!/^[0-9A-Za-z-]{3,20}$/.test(uid)) return res.status(400).json({ error: 'الرقم الجامعي غير صالح' });

    const t = db.prepare(`SELECT t.revoked, t.expires_at, s.id AS sid, s.is_open, l.course_id, l.started_at FROM qr_tokens t
      JOIN attendance_sessions s ON s.id = t.session_id JOIN lectures l ON l.id = s.lecture_id WHERE t.token_hash = ?`).get(sha(token));
    if (!t) return res.status(410).json({ code: 'expired', error: 'انتهت صلاحية رمز الحضور', hint: 'يرجى مسح رمز QR الحالي الموجود على شاشة المحاضرة.' });
    if (!t.is_open) return res.status(410).json({ code: 'ended', error: 'انتهى تسجيل الحضور لهذه المحاضرة.' });
    if (t.revoked || Date.parse(t.expires_at) <= Date.now())
      return res.status(410).json({ code: 'expired', error: 'انتهت صلاحية رمز الحضور', hint: 'يرجى مسح رمز QR الحالي الموجود على شاشة المحاضرة.' });

    // إن وُجدت قائمة طلاب للمادة فلا يُقبل إلا الرقم المسجّل فيها
    const rosterN = db.prepare('SELECT COUNT(*) AS n FROM course_students WHERE course_id = ?').get(t.course_id).n;
    if (rosterN > 0 && !db.prepare('SELECT 1 FROM course_students cs JOIN students s ON s.id = cs.student_id WHERE cs.course_id = ? AND s.university_id = ?').get(t.course_id, uid))
      return res.status(403).json({ code: 'not_enrolled', error: 'الرقم الجامعي غير مسجّل في هذه المادة. تأكد من الرقم أو راجع الدكتور.' });
    const lateMin = Number(process.env.LATE_AFTER_MINUTES) || 0; // 0 = تعطيل التأخير التلقائي
    const status = lateMin > 0 && Date.now() - Date.parse(t.started_at) > lateMin * 60000 ? 'late' : 'present';
    const now = new Date().toISOString();
    try {
      const out = db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO students (university_id, full_name) VALUES (?, ?)').run(uid, fullName);
        db.prepare('INSERT OR IGNORE INTO course_students (course_id, student_id) SELECT ?, id FROM students WHERE university_id = ?').run(t.course_id, uid);
        const st = db.prepare('SELECT id, full_name FROM students WHERE university_id = ?').get(uid);
        db.prepare('INSERT INTO attendance_records (session_id, student_id, status, checked_in_at) VALUES (?, ?, ?, ?)').run(t.sid, st.id, status, now);
        return st;
      })();
      bus.emit('change', t.sid);
      res.json({ ok: true, name: out.full_name, universityId: uid, time: now });
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ code: 'duplicate', error: 'تم تسجيل حضورك مسبقًا في هذه المحاضرة.' });
      throw e;
    }
  });
};
