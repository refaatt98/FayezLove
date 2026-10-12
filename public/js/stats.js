fetch('/api/stats').then((r) => r.json()).then((d) => {
  const $ = (i) => document.getElementById(i);
  $('uni').textContent = d.course.university; $('course').textContent = `${d.course.name} (${d.course.semester})`;
  $('teacher').textContent = 'الدكتور ' + d.course.teacher.replace(/^د\.\s*/, '');
  $('n').textContent = d.lectures; $('s').textContent = d.students; $('a').textContent = d.avg + '%';
  for (const r of d.rows) {
    const tr = document.createElement('tr');
    [r.name, r.uid, r.present, r.absent, r.late, r.excused, r.pct + '%'].forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    $('tb').appendChild(tr);
  }
});
