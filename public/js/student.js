const token = location.pathname.split('/')[2];
const $ = (id) => document.getElementById(id);
const show = (html) => { $('f').hidden = true; $('res').hidden = false; $('res').innerHTML = html; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
$('f').addEventListener('submit', async (e) => {
  e.preventDefault(); $('err').textContent = '';
  const r = await fetch('/api/attend', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: $('n').value, universityId: $('i').value }) });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
    const t = new Date(d.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    show(`<h1 class="ok">✓ تم تسجيل حضورك بنجاح</h1><div class="card"><p>اسم الطالب:<br><b>${esc(d.name)}</b></p><p>الرقم الجامعي:<br><b>${esc(d.universityId)}</b></p><p>وقت الحضور:<br><b>${t}</b></p></div>`);
  } else if (r.status === 410) show(`<h1 class="bad">${esc(d.error)}</h1><p>${esc(d.hint || '')}</p>`);
  else if (r.status === 409) show(`<h2 class="bad">${esc(d.error)}</h2>`);
  else $('err').textContent = d.error || 'حدث خطأ، حاول مرة أخرى';
});
