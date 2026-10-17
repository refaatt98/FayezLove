const ExcelJS = require('exceljs');
const db = require('../db');

const STATUS_AR = { present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'غياب بعذر' };
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hebron' }) : '');
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Hebron' });

const courseOf = (teacherId) => db.get(`SELECT c.id, c.name, c.semester, c.university, t.full_name AS teacher
  FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.teacher_id = ? ORDER BY c.id LIMIT 1`, teacherId);

async function build(teacherId) {
  const course = await courseOf(teacherId);
  if (!course) return null;
  // تُحسب المحاضرات المنتهية فقط
  const total = (await db.get(`SELECT COUNT(*) AS n FROM lectures l JOIN attendance_sessions s ON s.lecture_id = l.id
    WHERE l.course_id = ? AND s.is_open = 0`, course.id)).n;
  const raw = await db.all(`SELECT st.full_name AS name, st.university_id AS uid,
      COUNT(*) FILTER (WHERE r.status = 'present') AS present, COUNT(*) FILTER (WHERE r.status = 'late') AS late,
      COUNT(*) FILTER (WHERE r.status = 'excused') AS excused
    FROM students st JOIN attendance_records r ON r.student_id = st.id
    JOIN attendance_sessions s ON s.id = r.session_id JOIN lectures l ON l.id = s.lecture_id
    WHERE l.course_id = ? AND s.is_open = 0 GROUP BY st.id ORDER BY st.full_name`, course.id);
  // الغياب = المحاضرات التي لا سجل فيها للطالب أو سُجّل فيها غائبًا. النسبة = الحاضر ÷ عدد المحاضرات
  const rows = raw.map((r) => ({ ...r, absent: Math.max(0, total - r.present - r.late - r.excused),
    pct: total ? Math.round((r.present / total) * 100) : 0 }));
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0;
  return { course, lectures: total, students: rows.length, avg, rows };
}

const lectureOf = (id, teacherId) => db.get(`SELECT l.id, l.number, l.started_at, l.ended_at, s.id AS sid FROM lectures l
  JOIN attendance_sessions s ON s.lecture_id = l.id JOIN courses c ON c.id = l.course_id WHERE l.id = ? AND c.teacher_id = ?`, id, teacherId);
const lectureRows = (sid) => db.all(`SELECT st.full_name AS name, st.university_id AS uid, r.status, r.checked_in_at AS at
  FROM attendance_records r JOIN students st ON st.id = r.student_id WHERE r.session_id = ?
  ORDER BY r.checked_in_at IS NULL, r.checked_in_at, st.full_name`, sid);
const rosterRows = (courseId) => db.all(`SELECT s.full_name AS name, s.university_id AS uid,
    (SELECT COUNT(*) FROM attendance_records r JOIN attendance_sessions se ON se.id = r.session_id JOIN lectures l ON l.id = se.lecture_id
     WHERE r.student_id = s.id AND l.course_id = cs.course_id AND r.status IN ('present', 'late')) AS attended
  FROM course_students cs JOIN students s ON s.id = cs.student_id WHERE cs.course_id = ? ORDER BY s.full_name`, courseId);

const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v); // منع حقن الصيغ في Excel
const HEAD = ['الجامعة', 'المادة', 'الفصل الدراسي', 'الدكتور', 'اسم الطالب', 'الرقم الجامعي', 'عدد المحاضرات', 'الحضور', 'الغياب', 'التأخير', 'الغياب بعذر', 'نسبة الحضور'];
const line = (d, r) => [d.course.university, d.course.name, d.course.semester, d.course.teacher, r.name, r.uid, d.lectures, r.present, r.absent, r.late, r.excused, r.pct + '%'];

const summarySheet = (d) => ({ name: 'الملخص', head: HEAD, rows: d.rows.map((r) => line(d, r)) });
const lectureSheet = (lec, rows) => ({ name: `محاضرة ${lec.number}`, head: ['#', 'اسم الطالب', 'الرقم الجامعي', 'الحالة', 'وقت التسجيل'],
  rows: rows.map((r, i) => [i + 1, r.name, r.uid, STATUS_AR[r.status], hm(r.at)]) });
const rosterSheet = (rows) => ({ name: 'قائمة الطلاب', head: ['#', 'اسم الطالب', 'الرقم الجامعي', 'مرات الحضور'],
  rows: rows.map((r, i) => [i + 1, r.name, r.uid, r.attended]) });

// يرسل جدولًا أو أكثر كملف Excel أو CSV (CSV يأخذ الجدول الأول فقط)
async function send(res, fmt, file, sheets) {
  const disp = `attachment; filename="${file.ascii}.${fmt}"; filename*=UTF-8''${encodeURIComponent(file.ar)}.${fmt}`;
  if (fmt === 'csv') {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const { head, rows } = sheets[0];
    const csv = '﻿' + [head, ...rows].map((l) => l.map(safe).map(q).join(',')).join('\r\n');
    return res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': disp }).send(csv);
  }
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    const h = ws.addRow(s.head); h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6B3A' } }; });
    s.rows.forEach((r) => ws.addRow(r.map(safe)));
    ws.columns.forEach((c, i) => { c.width = s.widths ? s.widths[i] || 12 : 18; });
  }
  const buf = await wb.xlsx.writeBuffer();
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': disp }).send(Buffer.from(buf));
}
const FMT = /^(csv|xlsx)$/;

module.exports = (app, auth) => {
  app.get('/api/stats', auth('api'), async (req, res) => {
    const d = await build(req.user.teacher_id);
    d ? res.json(d) : res.status(404).json({ error: 'لا توجد مادة' });
  });

  // ملخص الحضور لكل طالب
  app.get('/api/export.:fmt', auth('api'), async (req, res) => {
    if (!FMT.test(req.params.fmt)) return res.sendStatus(404);
    const d = await build(req.user.teacher_id); if (!d) return res.sendStatus(404);
    await send(res, req.params.fmt, { ascii: 'attendance-summary', ar: 'ملخص الحضور' }, [summarySheet(d)]);
  });

  // محاضرة واحدة
  app.get('/api/lectures/:id/report', auth('api'), async (req, res) => {
    const lec = await lectureOf(req.params.id, req.user.teacher_id); if (!lec) return res.sendStatus(404);
    const course = await courseOf(req.user.teacher_id);
    res.json({ course, number: lec.number, date: day(lec.started_at), start: hm(lec.started_at), end: hm(lec.ended_at),
      rows: (await lectureRows(lec.sid)).map((r) => ({ ...r, status: STATUS_AR[r.status], at: hm(r.at) })) });
  });
  app.get('/api/lectures/:id/export.:fmt', auth('api'), async (req, res) => {
    if (!FMT.test(req.params.fmt)) return res.sendStatus(404);
    const lec = await lectureOf(req.params.id, req.user.teacher_id); if (!lec) return res.sendStatus(404);
    await send(res, req.params.fmt, { ascii: `lecture-${lec.number}`, ar: `محاضرة ${lec.number}` }, [lectureSheet(lec, await lectureRows(lec.sid))]);
  });

  // قائمة الطلاب
  app.get('/api/roster/report', auth('api'), async (req, res) => {
    const course = await courseOf(req.user.teacher_id); if (!course) return res.sendStatus(404);
    res.json({ course, rows: await rosterRows(course.id) });
  });
  app.get('/api/roster/export.:fmt', auth('api'), async (req, res) => {
    if (!FMT.test(req.params.fmt)) return res.sendStatus(404);
    const course = await courseOf(req.user.teacher_id); if (!course) return res.sendStatus(404);
    await send(res, req.params.fmt, { ascii: 'students', ar: 'قائمة الطلاب' }, [rosterSheet(await rosterRows(course.id))]);
  });

  // كل شيء في ملف Excel واحد: الملخص + جدول الحضور الشامل + قائمة الطلاب + ورقة لكل محاضرة
  app.get('/api/export-all.xlsx', auth('api'), async (req, res) => {
    const d = await build(req.user.teacher_id); if (!d) return res.sendStatus(404);
    const lectures = await db.all(`SELECT l.id, l.number, l.started_at, s.id AS sid FROM lectures l JOIN attendance_sessions s ON s.lecture_id = l.id
      WHERE l.course_id = ? ORDER BY l.number`, d.course.id);
    const recs = await db.all(`SELECT r.session_id AS sid, r.status, st.id AS stid FROM attendance_records r JOIN students st ON st.id = r.student_id
      JOIN attendance_sessions s ON s.id = r.session_id JOIN lectures l ON l.id = s.lecture_id WHERE l.course_id = ?`, d.course.id);
    const people = await db.all(`SELECT DISTINCT st.id, st.full_name AS name, st.university_id AS uid FROM students st
      LEFT JOIN course_students cs ON cs.student_id = st.id AND cs.course_id = ?
      LEFT JOIN attendance_records r ON r.student_id = st.id
      WHERE cs.course_id IS NOT NULL OR r.session_id IN (SELECT s.id FROM attendance_sessions s JOIN lectures l ON l.id = s.lecture_id WHERE l.course_id = ?)
      ORDER BY name`, d.course.id, d.course.id);
    const at = new Map(recs.map((r) => [`${r.stid}:${r.sid}`, r.status]));
    const matrix = { name: 'جدول الحضور', head: ['اسم الطالب', 'الرقم الجامعي', ...lectures.map((l) => `م${l.number} (${day(l.started_at)})`), 'عدد مرات الحضور'],
      widths: [26, 14, ...lectures.map(() => 14), 16],
      rows: people.map((p) => {
        const cells = lectures.map((l) => STATUS_AR[at.get(`${p.id}:${l.sid}`)] || '—');
        return [p.name, p.uid, ...cells, cells.filter((c) => c === 'حاضر' || c === 'متأخر').length];
      }) };
    const sheets = [summarySheet(d), matrix, rosterSheet(await rosterRows(d.course.id))];
    for (const l of lectures) sheets.push(lectureSheet(l, await lectureRows(l.sid)));
    await send(res, 'xlsx', { ascii: 'attendance-full-report', ar: 'تقرير الحضور الكامل' }, sheets);
  });
};
