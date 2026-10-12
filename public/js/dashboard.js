const $ = (id) => document.getElementById(id);
let expiresAt = 0, offset = 0, lecId = null, busy = false, mounted = null;
async function load() {
  if (busy) return; busy = true;
  try {
    const d = await (await fetch('/api/lectures/current')).json();
    $('live').hidden = !d.open; $('start').hidden = !!d.open;
    if (!d.open) { lecId = null; return; }
    lecId = d.id; expiresAt = Date.parse(d.qr.expiresAt); offset = Date.parse(d.serverNow) - Date.now();
    $('qr').src = d.qr.image; $('title').textContent = 'محاضرة ' + d.number;
    if (mounted !== d.id) { mounted = d.id; mountRecords(d.id, document.querySelector('#tb tbody'), null, (c) => { $('counts').textContent = `حاضر: ${c.present || 0} · متأخر: ${c.late || 0}`; }); }
  } finally { busy = false; }
}
setInterval(() => {
  if (!lecId) return;
  const s = Math.max(0, Math.ceil((expiresAt - (Date.now() + offset)) / 1000));
  $('t').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  if (s === 0) load(); // الخادم يصدر رمزًا جديدًا ويبطل القديم
}, 500);
setInterval(load, 4000);
$('start').onclick = async () => {
  if (!confirm('هل تريد بدء تسجيل الحضور للمحاضرة؟')) return;
  await fetch('/api/lectures/start', { method: 'POST' }); load();
};
$('end').onclick = async () => {
  if (!confirm('هل أنت متأكد من إنهاء تسجيل الحضور؟')) return;
  await fetch(`/api/lectures/${lecId}/end`, { method: 'POST' }); load();
};
$('out').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login'; };
fetch('/api/me').then((r) => r.json()).then((d) => { $('who').textContent = d.name; });
load();
