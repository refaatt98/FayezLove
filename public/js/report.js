// صفحة تقرير قابلة للطباعة أو الحفظ كـ PDF: ?type=lecture&id=.. | stats | roster
const $ = (i) => document.getElementById(i);
const q = new URLSearchParams(location.search);
const type = q.get('type');

function table(head, rows) {
  const tr = $('th').insertRow(); head.forEach((h) => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
  rows.forEach((r) => { const row = $('tb').insertRow(); r.forEach((v) => { row.insertCell().textContent = v; }); });
}
function header(c) {
  $('uni').textContent = c.university; $('course').textContent = `${c.name} (${c.semester})`;
  $('teacher').textContent = 'الدكتور ' + c.teacher.replace(/^د\.\s*/, '');
}
function summary(items) {
  items.forEach(([k, v]) => { const s = document.createElement('span'); s.append(k + ': '); const b = document.createElement('b'); b.textContent = v; s.append(b); $('sum').append(s); });
}

async function load() {
  if (type === 'lecture') {
    const d = await (await fetch(`/api/lectures/${encodeURIComponent(q.get('id'))}/report`)).json();
    header(d.course); $('back').href = '/lectures/' + q.get('id');
    $('title').textContent = `تقرير حضور المحاضرة ${d.number}`; document.title = `محاضرة ${d.number} — تقرير الحضور`;
    $('sub').textContent = `التاريخ: ${d.date} · من ${d.start} إلى ${d.end || '—'}`;
    const n = (s) => d.rows.filter((r) => r.status === s).length;
    summary([['المسجّلون', d.rows.length], ['حاضر', n('حاضر')], ['متأخر', n('متأخر')], ['غائب', n('غائب')], ['بعذر', n('غياب بعذر')]]);
    table(['#', 'اسم الطالب', 'الرقم الجامعي', 'الحالة', 'وقت التسجيل'], d.rows.map((r, i) => [i + 1, r.name, r.uid, r.status, r.at || '—']));
  } else if (type === 'roster') {
    const d = await (await fetch('/api/roster/report')).json();
    header(d.course); $('back').href = '/roster';
    $('title').textContent = 'قائمة طلاب المادة'; document.title = 'قائمة الطلاب';
    summary([['عدد الطلاب', d.rows.length]]);
    table(['#', 'اسم الطالب', 'الرقم الجامعي', 'مرات الحضور'], d.rows.map((r, i) => [i + 1, r.name, r.uid, r.attended]));
  } else {
    const d = await (await fetch('/api/stats')).json();
    header(d.course); $('back').href = '/stats';
    $('title').textContent = 'ملخص الحضور لكل طالب'; document.title = 'ملخص الحضور';
    summary([['عدد المحاضرات', d.lectures], ['عدد الطلاب', d.students], ['متوسط الحضور', d.avg + '%']]);
    table(['#', 'اسم الطالب', 'الرقم الجامعي', 'حضور', 'غياب', 'تأخير', 'بعذر', 'النسبة'],
      d.rows.map((r, i) => [i + 1, r.name, r.uid, r.present, r.absent, r.late, r.excused, r.pct + '%']));
  }
  $('gen').textContent = 'تاريخ التقرير: ' + new Date().toLocaleString('en-GB');
  if (q.get('print') !== '0') setTimeout(() => window.print(), 400);
}
$('print').onclick = () => window.print();
load();
