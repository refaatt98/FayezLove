const $ = (i) => document.getElementById(i);
let all = [], visible = [];
const sel = new Set();
const sync = () => {
  $('delsel').textContent = `حذف المحدد (${sel.size})`; $('delsel').disabled = !sel.size;
  const shown = visible.filter((s) => sel.has(s.id)).length;
  $('all').checked = visible.length > 0 && shown === visible.length;
  $('all').indeterminate = shown > 0 && shown < visible.length;
};
const render = () => {
  const q = $('q').value.trim().toLowerCase(), tb = $('tb');
  visible = all.filter((s) => !q || s.name.toLowerCase().includes(q) || s.universityId.includes(q));
  tb.textContent = '';
  if (!visible.length) { const tr = tb.insertRow(), td = tr.insertCell(); td.colSpan = 6; td.className = 'empty'; td.textContent = all.length ? 'لا نتائج' : 'لا يوجد طلاب مسجّلون بعد'; sync(); return; }
  visible.forEach((s, i) => {
    const tr = tb.insertRow(); tr.classList.toggle('sel', sel.has(s.id));
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.has(s.id); cb.setAttribute('aria-label', 'تحديد ' + s.name);
    cb.onchange = () => { cb.checked ? sel.add(s.id) : sel.delete(s.id); tr.classList.toggle('sel', cb.checked); sync(); };
    tr.insertCell().appendChild(cb);
    [i + 1, s.name, s.universityId, s.attended].forEach((v) => { tr.insertCell().textContent = v; });
    const b = document.createElement('button'); b.className = 'del'; b.textContent = 'حذف';
    b.onclick = () => remove([s.id], `إزالة ${s.name} (${s.universityId}) من قائمة المادة؟ سجلات حضوره السابقة تبقى.`);
    tr.insertCell().appendChild(b);
  });
  sync();
};
async function remove(ids, question) {
  if (!confirm(question)) return;
  $('delsel').disabled = true;
  const r = await fetch('/api/roster/students/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
  if (!r.ok) { alert('تعذّر الحذف'); sync(); return; }
  ids.forEach((id) => sel.delete(id)); count();
}
$('all').onchange = () => { visible.forEach((s) => ($('all').checked ? sel.add(s.id) : sel.delete(s.id))); render(); };
$('delsel').onclick = () => remove([...sel], `إزالة ${sel.size} طالبًا من قائمة المادة؟ سجلات حضورهم السابقة تبقى.`);
const count = () => fetch('/api/roster/students').then((r) => r.json()).then((d) => {
  all = d; const ids = new Set(d.map((s) => s.id)); [...sel].forEach((id) => ids.has(id) || sel.delete(id));
  $('n').textContent = d.length; render();
});
$('q').oninput = render;
$('up').onclick = async () => {
  const f = $('f').files[0]; if (!f) { $('msg').textContent = 'اختر ملفًا أولًا'; return; }
  const r = await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
  const d = await r.json().catch(() => ({}));
  $('msg').textContent = r.ok ? `تمت إضافة ${d.added} طالبًا (تم تخطي ${d.skipped} صفًا غير صالح)` : (d.error || 'فشل الرفع');
  count();
};
count();
