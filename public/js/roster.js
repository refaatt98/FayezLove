const $ = (i) => document.getElementById(i);
let all = [];
const render = () => {
  const q = $('q').value.trim().toLowerCase(), tb = $('tb');
  const rows = all.filter((s) => !q || s.name.toLowerCase().includes(q) || s.universityId.includes(q));
  tb.textContent = '';
  if (!rows.length) { const tr = tb.insertRow(), td = tr.insertCell(); td.colSpan = 5; td.className = 'empty'; td.textContent = all.length ? 'لا نتائج' : 'لا يوجد طلاب مسجّلون بعد'; return; }
  rows.forEach((s, i) => {
    const tr = tb.insertRow();
    [i + 1, s.name, s.universityId, s.attended].forEach((v) => { tr.insertCell().textContent = v; });
    const b = document.createElement('button'); b.className = 'del'; b.textContent = 'حذف';
    b.onclick = async () => {
      if (!confirm(`إزالة ${s.name} (${s.universityId}) من قائمة المادة؟ سجلات حضوره السابقة تبقى.`)) return;
      b.disabled = true;
      const r = await fetch('/api/roster/students/' + s.id, { method: 'DELETE' });
      if (r.ok) count(); else { b.disabled = false; alert('تعذّر الحذف'); }
    };
    tr.insertCell().appendChild(b);
  });
};
const count = () => fetch('/api/roster/students').then((r) => r.json()).then((d) => { all = d; $('n').textContent = d.length; render(); });
$('q').oninput = render;
$('up').onclick = async () => {
  const f = $('f').files[0]; if (!f) { $('msg').textContent = 'اختر ملفًا أولًا'; return; }
  const r = await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
  const d = await r.json().catch(() => ({}));
  $('msg').textContent = r.ok ? `تمت إضافة ${d.added} طالبًا (تم تخطي ${d.skipped} صفًا غير صالح)` : (d.error || 'فشل الرفع');
  count();
};
count();
