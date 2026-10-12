const db = require('../db');
const bus = require('../bus');
const STATUSES = ['present', 'late', 'absent', 'excused'];

module.exports = (app, auth) => {
  const owned = (lectureId, teacherId) => db.prepare(
    `SELECT s.id, l.number FROM attendance_sessions s JOIN lectures l ON l.id = s.lecture_id
     JOIN courses c ON c.id = l.course_id WHERE l.id = ? AND c.teacher_id = ?`).get(lectureId, teacherId);

  app.get('/api/lectures', auth('api'), (req, res) => {
    const c = (st) => `(SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = '${st}')`;
    res.json(db.prepare(
      `SELECT l.id, l.number, l.lecture_date, l.started_at, l.ended_at, s.is_open,
        ${c('present')} AS present, ${c('late')} AS late, ${c('absent')} AS absent, ${c('excused')} AS excused
       FROM lectures l JOIN courses c ON c.id = l.course_id JOIN attendance_sessions s ON s.lecture_id = l.id
       WHERE c.teacher_id = ? ORDER BY l.number DESC`).all(req.user.teacher_id));
  });

  app.get('/api/lectures/:id/records', auth('api'), (req, res) => {
    const s = owned(req.params.id, req.user.teacher_id);
    if (!s) return res.status(404).json({ error: 'غير موجودة' });
    const rows = db.prepare(
      `SELECT r.id, st.full_name AS name, st.university_id AS universityId, r.checked_in_at AS checkedInAt, r.status
       FROM attendance_records r JOIN students st ON st.id = r.student_id
       WHERE r.session_id = ? ORDER BY r.checked_in_at IS NULL, r.checked_in_at DESC, st.full_name`).all(s.id);
    const counts = {}; rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    res.json({ number: s.number, rows, counts });
  });

  app.get('/api/lectures/:id/logs', auth('api'), (req, res) => {
    const s = owned(req.params.id, req.user.teacher_id);
    if (!s) return res.status(404).json({ error: 'غير موجودة' });
    res.json(db.prepare(
      `SELECT st.full_name AS student, g.old_status AS oldStatus, g.new_status AS newStatus, COALESCE(t.full_name, eu.email) AS editor, g.edited_at AS at
       FROM attendance_edit_logs g JOIN attendance_records r ON r.id = g.record_id JOIN students st ON st.id = r.student_id
       JOIN users eu ON eu.id = g.edited_by LEFT JOIN teachers t ON t.user_id = eu.id WHERE r.session_id = ? ORDER BY g.id DESC`).all(s.id));
  });

  app.patch('/api/records/:id', auth('api'), (req, res) => {
    const status = req.body && req.body.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
    const rec = db.prepare(
      `SELECT r.id, r.status, r.session_id FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
       JOIN lectures l ON l.id = s.lecture_id JOIN courses c ON c.id = l.course_id WHERE r.id = ? AND c.teacher_id = ?`).get(req.params.id, req.user.teacher_id);
    if (!rec) return res.status(404).json({ error: 'غير موجود' });
    if (rec.status !== status) db.transaction(() => {
      db.prepare('UPDATE attendance_records SET status = ? WHERE id = ?').run(status, rec.id);
      db.prepare('INSERT INTO attendance_edit_logs (record_id, old_status, new_status, edited_by, edited_at) VALUES (?, ?, ?, ?, ?)')
        .run(rec.id, rec.status, status, req.user.id, new Date().toISOString());
    })();
    bus.emit('change', rec.session_id);
    res.json({ ok: true });
  });

  // بثّ مباشر (SSE): الخادم يُعلِم المتصفح بوجود تغيير فيعيد جلب القائمة
  app.get('/api/lectures/:id/stream', auth('api'), (req, res) => {
    const s = owned(req.params.id, req.user.teacher_id);
    if (!s) return res.sendStatus(404);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const h = (sid) => { if (sid === s.id) res.write('data: change\n\n'); };
    bus.on('change', h);
    const hb = setInterval(() => res.write(': hb\n\n'), 25000);
    req.on('close', () => { bus.off('change', h); clearInterval(hb); });
  });
};
