const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');

const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
const normId = (s) => String(s).trim().replace(/[٠-٩۰-۹]/g, (d) => String(AR.includes(d) ? AR.indexOf(d) : FA.indexOf(d)));
const text = (v) => (v && typeof v === 'object' ? String(v.text || v.result || '') : v == null ? '' : String(v));

module.exports = (app, auth) => {
  const courseOf = (tid) => db.prepare('SELECT id FROM courses WHERE teacher_id = ? ORDER BY id LIMIT 1').get(tid);

  app.get('/api/roster', auth('api'), (req, res) => {
    const c = courseOf(req.user.teacher_id); if (!c) return res.sendStatus(404);
    res.json({ count: db.prepare('SELECT COUNT(*) AS n FROM course_students WHERE course_id = ?').get(c.id).n });
  });

  // رفع قائمة الطلاب: ملف Excel (.xlsx) أو CSV. يُقرأ الرقم الجامعي والاسم بصرف النظر عن ترتيب الأعمدة
  app.post('/api/roster', auth('api'), express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
    const c = courseOf(req.user.teacher_id); if (!c) return res.sendStatus(404);
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
    const upsert = db.prepare('INSERT INTO students (university_id, full_name) VALUES (?, ?) ON CONFLICT(university_id) DO UPDATE SET full_name = excluded.full_name');
    const link = db.prepare('INSERT OR IGNORE INTO course_students (course_id, student_id) SELECT ?, id FROM students WHERE university_id = ?');
    db.transaction(() => {
      for (const cells of rows) {
        const id = cells.map(normId).find((x) => /^\d{4,12}$/.test(x));
        const name = cells.find((x) => x && x.length >= 3 && !/^[\d\s-]+$/.test(normId(x)));
        if (!id || !name) { skipped++; continue; }
        upsert.run(id, name.replace(/\s+/g, ' ').slice(0, 100)); link.run(c.id, id); added++;
      }
    })();
    res.json({ ok: true, added, skipped });
  });
};
