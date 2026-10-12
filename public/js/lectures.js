fetch('/api/lectures').then((r) => r.json()).then((rows) => {
  const tb = document.getElementById('tb');
  for (const l of rows) {
    const tr = document.createElement('tr');
    cell(tr, 'محاضرة ' + l.number); cell(tr, new Date(l.started_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }));
    cell(tr, hm(l.started_at)); cell(tr, l.is_open ? 'مفتوحة' : hm(l.ended_at));
    cell(tr, l.present); cell(tr, l.absent); cell(tr, l.late);
    const td = document.createElement('td'), a = document.createElement('a');
    a.href = '/lectures/' + l.id; a.textContent = 'عرض الطلاب'; td.appendChild(a); tr.appendChild(td); tb.appendChild(tr);
  }
});
