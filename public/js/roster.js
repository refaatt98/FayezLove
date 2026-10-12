const $ = (i) => document.getElementById(i);
const count = () => fetch('/api/roster').then((r) => r.json()).then((d) => { $('n').textContent = d.count; });
$('up').onclick = async () => {
  const f = $('f').files[0]; if (!f) { $('msg').textContent = 'اختر ملفًا أولًا'; return; }
  const r = await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
  const d = await r.json().catch(() => ({}));
  $('msg').textContent = r.ok ? `تمت إضافة ${d.added} طالبًا (تم تخطي ${d.skipped} صفًا غير صالح)` : (d.error || 'فشل الرفع');
  count();
};
count();
