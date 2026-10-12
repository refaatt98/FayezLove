const ExcelJS = require('exceljs');
const db = require('../db');

function build(teacherId) {
  const course = db.prepare(`SELECT c.id, c.name, c.semester, c.university, t.full_name AS teacher
    FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.teacher_id = ? ORDER BY c.id LIMIT 1`).get(teacherId);
  if (!course) return null;
  // تُحسب المحاضرات المنتهية فقط
  const total = db.prepare(`SELECT COUNT(*) AS n FROM lectures l JOIN attendance_sessions s ON s.lecture_id = l.id
    WHERE l.course_id = ? AND s.is_open = 0`).get(course.id).n;
  const raw = db.prepare(`SELECT st.full_name AS name, st.university_id AS uid,
      SUM(r.status = 'present') AS present, SUM(r.status = 'late') AS late, SUM(r.status = 'excused') AS excused
    FROM students st JOIN attendance_records r ON r.student_id = st.id
    JOIN attendance_sessions s ON s.id = r.session_id JOIN lectures l ON l.id = s.lecture_id
    WHERE l.course_id = ? AND s.is_open = 0 GROUP BY st.id ORDER BY st.full_name`).all(course.id);
  // الغياب = المحاضرات التي لا سجل فيها للطالب أو سُجّل فيها غائبًا. النسبة = الحاضر ÷ عدد المحاضرات
  const rows = raw.map((r) => ({ ...r, absent: Math.max(0, total - r.present - r.late - r.excused),
    pct: total ? Math.round((r.present / total) * 100) : 0 }));
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0;
  return { course, lectures: total, students: rows.length, avg, rows };
}

const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v); // منع حقن الصيغ في Excel
const HEAD = ['الجامعة', 'المادة', 'الفصل الدراسي', 'الدكتور', 'اسم الطالب', 'الرقم الجامعي', 'عدد المحاضرات', 'الحضور', 'الغياب', 'التأخير', 'الغياب بعذر', 'نسبة الحضور'];
const line = (d, r) => [d.course.university, d.course.name, d.course.semester, d.course.teacher, r.name, r.uid, d.lectures, r.present, r.absent, r.late, r.excused, r.pct + '%'].map(safe);

module.exports = (app, auth) => {
  app.get('/api/stats', auth('api'), (req, res) => {
    const d = build(req.user.teacher_id);
    d ? res.json(d) : res.status(404).json({ error: 'لا توجد مادة' });
  });

  app.get('/api/export.csv', auth('api'), (req, res) => {
    const d = build(req.user.teacher_id); if (!d) return res.sendStatus(404);
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [HEAD, ...d.rows.map((r) => line(d, r))].map((l) => l.map(q).join(',')).join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="attendance.csv"' }).send(csv);
  });

  app.get('/api/export.xlsx', auth('api'), async (req, res) => {
    const d = build(req.user.teacher_id); if (!d) return res.sendStatus(404);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الحضور', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.addRow(HEAD).font = { bold: true };
    d.rows.forEach((r) => ws.addRow(line(d, r)));
    ws.columns.forEach((c) => { c.width = 18; });
    const buf = await wb.xlsx.writeBuffer();
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="attendance.xlsx"' }).send(Buffer.from(buf));
  });
};
