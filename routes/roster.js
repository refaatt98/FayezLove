const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');

const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
const normId = (s) => String(s).trim().replace(/[٠-٩۰-۹]/g, (d) => String(AR.includes(d) ? AR.indexOf(d) : FA.indexOf(d)));
const text = (v) => (v && typeof v === 'object' ? String(v.text || v.result || '') : v == null ? '' : String(v));

module.exports = (app, auth) => {
  const courseOf = (tid) => db.get('SELECT id FROM courses WHERE teacher_id = ? ORDER BY id LIMIT 1', tid);

  app.get('/api/roster', auth('api'), async (req, res) => {
    const c = await courseOf(req.user.teacher_id); if (!c) return res.sendStatus(404);
    res.json({ count: (await db.get('SELECT COUNT(*) AS n FROM course_students WHERE course_id = ?', c.id)).n });
  });

  // عرض الطلاب المسجّلين في المادة مع عدد مرات حضورهم
  app.get('/api/roster/students', auth('api'), async (req, res) => {
    const c = await courseOf(req.user.teacher_id); if (!c) return res.sendStatus(404);
    res.json(await db.all(
      `SELECT s.id, s.full_name AS name, s.university_id AS universityId,
        (SELECT COUNT(*) FROM attendance_records r JOIN attendance_sessions se ON se.id = r.session_id JOIN lectures l ON l.id = se.lecture_id
         WHERE r.student_id = s.id AND l.course_id = cs.course_id AND r.status IN ('present', 'late')) AS attended
       FROM course_students cs JOIN students s ON s.id = cs.student_id WHERE cs.course_id = ? ORDER BY s.full_name`, c.id));
  });

  // إزالة طالب من قائمة المادة (سجلات حضوره السابقة تبقى كما هي)
  app.delete('/api/roster/students/:id', auth('api'), async (req, res) => {
    const c = await courseOf(req.user.teacher_id); if (!c) return res.sendStatus(404);
    const r = await db.run('DELETE FROM course_students WHERE course_id = ? AND student_id = ?', c.id, req.params.id);
    r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الطالب غير موجود في القائمة' });
  });

  // رفع قائمة الطلاب: ملف Excel (.xlsx) أو CSV. يُقرأ الرقم الجامعي والاسم بصرف النظر عن ترتيب الأعمدة
  app.post('/api/roster', auth('api'), express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
    const c = await courseOf(req.user.teacher_id); if (!c) return res.sendStatus(404);
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'الملف فارغ' });
    let rows = [];
    try {
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
        wb.worksheets[0].eachRow((r) => rows.push(r.values.slice(1).map(text)));
      } else {
        rows = buf.toString('utf8').replace(/^\ufeff/, '').split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((s) => s.replace(/^"|"$/g, '').trim()));
      }
    } catch { return res.status(400).json({ error: 'تعذّر قراءة الملف' }); }

    let added = 0, skipped = 0;
    const upsert = 'INSERT INTO students (university_id, full_name) VALUES (?, ?) ON CONFLICT(university_id) DO UPDATE SET full_name = excluded.full_name';
    const link = 'INSERT OR IGNORE INTO course_students (course_id, student_id) SELECT ?, id FROM students WHERE university_id = ?';
    const stmts = [];
    for (const cells of rows) {
      const id = cells.map(normId).find((x) => /^\d{4,12}$/.test(x));
      const name = cells.find((x) => x && x.length >= 3 && !/^[\d\s-]+$/.test(normId(x)));
      if (!id || !name) { skipped++; continue; }
      stmts.push([upsert, id, name.replace(/\s+/g, ' ').slice(0, 100)], [link, c.id, id]); added++;
    }
    if (stmts.length) await db.batch(stmts);
    res.json({ ok: true, added, skipped });
  });
};
